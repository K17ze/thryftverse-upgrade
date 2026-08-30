import * as FileSystem from 'expo-file-system/legacy';
import { fetchJson } from '../../../lib/apiClient';
import { finalizePresignedMedia, waitForPublishableMedia } from '../../../services/mediaUpload';
import { createStableId } from '../../../utils/createStableId';
import { detectMimeType, deriveFileName } from './MimeDetector';
import { MultipartUploader } from './MultipartUploader';
import type { UploadJobStore } from './UploadJobStore';
import type {
  UploadEvent,
  UploadEventListener,
  UploadJob,
  UploadProgress,
  QueueUploadParams,
  ProjectProgress,
} from './UploadTypes';
import { MULTIPART_THRESHOLD_BYTES } from './UploadTypes';

/** Base delay (ms) for exponential backoff between retry attempts. */
const BASE_BACKOFF_MS = 1000;
/** Upper bound (ms) for exponential backoff. */
const MAX_BACKOFF_MS = 30_000;
/** Default maximum concurrent uploads. */
const DEFAULT_MAX_CONCURRENT = 2;
/** Default maximum retry attempts per job. */
const DEFAULT_MAX_RETRIES = 5;

/** Response shape from `POST /uploads/presign`. */
interface PresignResponse {
  uploadIntentId: string;
  bucket: string;
  key: string;
  url: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
  maxSizeBytes: number;
  expiresInSeconds: number;
  expiresAt: string;
}

/**
 * Result of a single upload attempt. The manager uses this to decide
 * whether to retry, pause, or mark the job complete.
 */
interface UploadAttemptResult {
  ok: boolean;
  remoteUrl?: string;
  finalizationId?: string;
  mediaAssetId?: string;
  uploadedBytes?: number;
  error?: string;
}

/**
 * Genuine resumable upload manager.
 *
 * Replaces the previous whole-Blob PUT with:
 *
 * - **Correct MIME** — `MimeDetector` derives the real type from the
 *   file extension. Never `image/*` for video.
 * - **Real file size** — `expo-file-system.getInfoAsync` resolves the
 *   actual byte count. Never 0.
 * - **Real byte progress** — `XMLHttpRequest.upload.onprogress` reports
 *   actual transmitted bytes / total bytes. No fake interpolation.
 * - **Multipart (resumable)** — when the backend supports it and the
 *   file exceeds the threshold, `MultipartUploader` splits the file
 *   into 5 MB parts. On failure, only the failed part is retried. On
 *   app restart, completed parts (with ETags) are skipped.
 * - **Single-PUT (retryable)** — when multipart is unavailable or the
 *   file is small, a single XHR PUT with real progress is used. On
 *   failure, the whole file is re-uploaded. This is honestly labeled
 *   "Retryable", not "Resumable".
 *
 * ## Idempotency
 *
 * Duplicate `queueUpload` calls for the same `(projectId, assetId,
 * localPath)` are de-duplicated — the existing job ID is returned
 * instead of creating a duplicate upload.
 *
 * ## Background behaviour
 *
 * When the app is backgrounded, the JS thread may be suspended. XHR
 * uploads in-flight will be paused by the OS and may fail on resume.
 * The manager retries automatically. True background upload (surviving
 * process kill) requires a native module (e.g. `react-native-s3-bg-uploader`
 * or `expo-file-system` upload tasks with background session) — see the
 * "Future work" section in the module report.
 */
export class UploadManager {
  private jobStore: UploadJobStore;
  private maxConcurrent: number;
  private listeners: Set<UploadEventListener> = new Set();
  private activeUploads: Map<string, AbortController> = new Map();
  /** In-memory mirror of persisted jobs for synchronous access. */
  private jobsCache: Map<string, UploadJob> = new Map();
  private processing = false;
  /** Multipart uploader (lazy-initialised). */
  private multipartUploader: MultipartUploader;
  /** Whether multipart transport is enabled. Defaults to true — the backend
   *  exposes /uploads/multipart/* endpoints for resumable large-file uploads. */
  private multipartEnabled: boolean;

  constructor(
    jobStore: UploadJobStore,
    options?: {
      maxConcurrent?: number;
      multipartEnabled?: boolean;
      partSize?: number;
    },
  ) {
    this.jobStore = jobStore;
    this.maxConcurrent = options?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.multipartEnabled = options?.multipartEnabled ?? true;
    this.multipartUploader = new MultipartUploader({
      partSize: options?.partSize,
    });
  }

  /**
   * Queue a new upload job. Generates an id, resolves MIME type and real
   * file size, initialises state and timestamps. Returns the job id.
   *
   * **Idempotent**: if a job already exists for the same `(projectId,
   * assetId, localPath)`, the existing job id is returned — no duplicate
   * upload is created. This prevents duplicate Publish taps from
   * creating duplicate remote objects.
   *
   * Does not start processing — call `processQueue()` (or rely on
   * auto-processing) to begin.
   */
  async queueUpload(params: QueueUploadParams): Promise<string> {
    // Hydrate cache on first call.
    if (this.jobsCache.size === 0) {
      const all = await this.jobStore.loadJobs();
      for (const j of all) this.jobsCache.set(j.id, j);
    }

    // Idempotency: check for an existing job with the same key.
    const existingJob = this.findExistingJob(params);
    if (existingJob) {
      // Jobs completed by the former manager contain only the raw presign
      // URL. They are not trusted publication receipts and must pass through
      // the verified upload flow before they can be reused.
      if (existingJob.status === 'completed' && !existingJob.finalizationId) {
        await this.persistState(existingJob.id, {
          status: 'queued',
          progress: 0,
          remoteUrl: undefined,
          error: undefined,
          retries: 0,
        });
        void this.processQueue();
        return existingJob.id;
      }
      // If the existing job is in a terminal state, re-queue it.
      if (existingJob.status === 'failed' || existingJob.status === 'paused') {
        await this.persistState(existingJob.id, {
          status: 'queued',
          error: undefined,
        });
        void this.processQueue();
        return existingJob.id;
      }
      // Otherwise return the existing job without creating a duplicate.
      return existingJob.id;
    }

    const id = createStableId('upload');
    const fileName = params.fileName ?? deriveFileName(params.localPath);
    const mimeType = params.mimeType ?? detectMimeType(fileName, params.assetType);

    // Resolve real file size. Never 0.
    const sizeBytes = await this.resolveFileSize(params.localPath);

    const now = Date.now();
    const job: UploadJob = {
      id,
      projectId: params.projectId,
      assetId: params.assetId,
      localPath: params.localPath,
      fileName,
      mimeType,
      sizeBytes,
      status: 'queued',
      progress: 0,
      retries: 0,
      maxRetries: params.maxRetries ?? DEFAULT_MAX_RETRIES,
      folder: params.folder,
      createdAt: now,
      updatedAt: now,
    };
    this.jobsCache.set(id, job);
    await this.jobStore.addJob(job);
    this.emit({ type: 'jobAdded', job });
    // Kick off processing so callers don't need to call processQueue manually.
    void this.processQueue();
    return id;
  }

  /**
   * Start processing queued jobs up to `maxConcurrent`. Safe to call
   * repeatedly; concurrent calls are coalesced via the `processing` flag.
   */
  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      // Hydrate the cache from storage on first run.
      if (this.jobsCache.size === 0) {
        const all = await this.jobStore.loadJobs();
        for (const j of all) this.jobsCache.set(j.id, j);
      }

      while (this.activeUploads.size < this.maxConcurrent) {
        const next = this.pickNextJob();
        if (!next) break;
        // Fire-and-forget; the loop continues as slots free up.
        void this.processJob(next);
      }
    } finally {
      this.processing = false;
    }
  }

  /** Pause a specific job. Aborts an in-flight upload if present. */
  pauseJob(jobId: string): void {
    const controller = this.activeUploads.get(jobId);
    if (controller) {
      controller.abort();
      this.activeUploads.delete(jobId);
    }
    void this.persistState(jobId, { status: 'paused' });
  }

  /** Resume a paused or failed job by re-queueing it for processing. */
  async resumeJob(jobId: string): Promise<void> {
    await this.persistState(jobId, { status: 'queued', error: undefined });
    void this.processQueue();
  }

  /** Cancel a job: abort any in-flight upload, abort multipart session, and remove from the store. */
  cancelJob(jobId: string): void {
    const controller = this.activeUploads.get(jobId);
    if (controller) {
      controller.abort();
      this.activeUploads.delete(jobId);
    }
    // Abort the multipart session if one exists.
    const job = this.jobsCache.get(jobId);
    if (job?.session) {
      void this.multipartUploader.abort(job.session);
    }
    this.jobsCache.delete(jobId);
    void this.jobStore.removeJob(jobId);
  }

  /** Retry a failed job: reset retry counter and re-queue. */
  async retryJob(jobId: string): Promise<void> {
    await this.persistState(jobId, {
      status: 'queued',
      retries: 0,
      error: undefined,
    });
    void this.processQueue();
  }

  /** Get all jobs for a project (from the in-memory cache, hydrated lazily). */
  async getJobs(projectId: string): Promise<UploadJob[]> {
    if (this.jobsCache.size === 0) {
      const all = await this.jobStore.loadJobs();
      for (const j of all) this.jobsCache.set(j.id, j);
    }
    const result: UploadJob[] = [];
    for (const job of this.jobsCache.values()) {
      if (job.projectId === projectId) result.push(job);
    }
    return result;
  }

  /** True when every job for a project is in the `completed` state. */
  async isProjectComplete(projectId: string): Promise<boolean> {
    const jobs = await this.getJobs(projectId);
    if (jobs.length === 0) return true;
    return jobs.every((j) => j.status === 'completed');
  }

  /**
   * Wait until all jobs for a project reach a terminal state (`completed`
   * or `failed`). Resolves with the final job list so the caller can
   * inspect `remoteUrl` on each completed job and detect failures.
   *
   * Polls at `intervalMs` (default 250 ms) to avoid tight loops.
   */
  async waitForProjectCompletion(
    projectId: string,
    intervalMs = 250,
  ): Promise<UploadJob[]> {
    // First, make sure the queue is processing.
    void this.processQueue();

    // Poll until all jobs are terminal.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const jobs = await this.getJobs(projectId);
      if (jobs.length === 0) return jobs;
      const allTerminal = jobs.every(
        (j) => j.status === 'completed' || j.status === 'failed',
      );
      if (allTerminal) return jobs;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  /** Subscribe to upload events. Returns an unsubscribe function. */
  subscribe(listener: UploadEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Aggregate progress for a project, based on real bytes. */
  async getProjectProgress(projectId: string): Promise<ProjectProgress> {
    const jobs = await this.getJobs(projectId);
    let complete = 0;
    let uploadedBytes = 0;
    let totalBytes = 0;
    for (const j of jobs) {
      totalBytes += j.sizeBytes;
      uploadedBytes += j.progress * j.sizeBytes;
      if (j.status === 'completed') complete += 1;
    }
    return {
      complete,
      total: jobs.length,
      uploadedBytes,
      totalBytes,
      progress: totalBytes > 0 ? Math.min(1, uploadedBytes / totalBytes) : 0,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────

  /**
   * Process a single job: emit `jobStarted`, run the upload with retry,
   * and transition to `completed` or `failed`.
   */
  private async processJob(job: UploadJob): Promise<void> {
    const controller = new AbortController();
    this.activeUploads.set(job.id, controller);

    await this.persistState(job.id, { status: 'uploading' });
    const started = this.jobsCache.get(job.id);
    if (started) this.emit({ type: 'jobStarted', job: started });

    try {
      const result = await this.runWithRetry(job, controller.signal);
      if (result.ok) {
        await this.persistState(job.id, {
          status: 'completed',
          progress: 1,
          remoteUrl: result.remoteUrl,
          finalizationId: result.finalizationId,
          mediaAssetId: result.mediaAssetId,
          error: undefined,
        });
        const done = this.jobsCache.get(job.id);
        if (done) this.emit({ type: 'jobComplete', job: done });
        await this.maybeEmitAllComplete(job.projectId);
      } else {
        await this.persistState(job.id, {
          status: 'failed',
          error: result.error ?? 'Unknown upload error',
        });
        const failed = this.jobsCache.get(job.id);
        if (failed) {
          this.emit({ type: 'jobFailed', job: failed, error: failed.error ?? 'Unknown upload error' });
        }
      }
    } finally {
      this.activeUploads.delete(job.id);
      // Fill any freed slot.
      void this.processQueue();
    }
  }

  /**
   * Run the upload for a job, retrying up to `maxRetries` with
   * exponential backoff + jitter. Honours an AbortSignal for
   * cancellation/pause.
   */
  private async runWithRetry(
    job: UploadJob,
    signal: AbortSignal,
  ): Promise<UploadAttemptResult> {
    let lastError: string | undefined;
    for (let attempt = job.retries; attempt < job.maxRetries; attempt++) {
      if (signal.aborted) {
        return { ok: false, error: 'Aborted' };
      }
      // Persist retry counter for resume correctness.
      await this.persistState(job.id, { retries: attempt });

      try {
        // Choose transport: multipart for large files when enabled,
        // single-PUT otherwise.
        if (this.multipartEnabled && job.sizeBytes > MULTIPART_THRESHOLD_BYTES) {
          return await this.performMultipartUpload(job, signal);
        }
        return await this.performSinglePutUpload(
          this.jobsCache.get(job.id) ?? job,
          signal,
        );
      } catch (err: unknown) {
        if (signal.aborted) {
          return { ok: false, error: 'Aborted' };
        }
        lastError = err instanceof Error ? err.message : String(err);
        // If more attempts remain, back off and continue.
        if (attempt < job.maxRetries - 1) {
          const delay = this.computeBackoff(attempt);
          await this.sleep(delay, signal);
          if (signal.aborted) {
            return { ok: false, error: 'Aborted' };
          }
        }
      }
    }
    return { ok: false, error: lastError ?? 'Exhausted retries' };
  }

  // ── Single-PUT transport (retryable, real byte progress) ──────────

  /**
   * Perform a single-PUT upload with real byte progress via
   * `XMLHttpRequest.upload.onprogress`.
   *
   * Flow:
   *   1. POST /uploads/presign → obtain presigned PUT URL
   *   2. XHR PUT the file to S3 with `upload.onprogress` for real bytes
   *   3. POST /uploads/finalize and wait for the canonical publishable asset
   *
   * This transport is **retryable** (the whole file is re-uploaded on
   * failure) but not **resumable** (no part-level checkpoint).
   */
  private async performSinglePutUpload(
    job: UploadJob,
    signal: AbortSignal,
  ): Promise<UploadAttemptResult> {
    let presign: PresignResponse;
    if (job.uploadedObject) {
      // A prior PUT completed but finalization was interrupted. Reconcile the
      // same object; do not create an orphaned duplicate on every retry.
      presign = {
        ...job.uploadedObject,
        url: '',
        maxSizeBytes: job.uploadedObject.sizeBytes,
        expiresInSeconds: Math.max(
          0,
          Math.floor((Date.parse(job.uploadedObject.expiresAt) - Date.now()) / 1000),
        ),
      };
    } else {
      // Step 1 — presign via the backend (with auth + base URL).
      presign = await fetchJson<PresignResponse>('/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: job.fileName,
          contentType: job.mimeType,
          folder: job.folder,
          sizeBytes: job.sizeBytes,
        }),
        signal,
      });

      // Step 2 — PUT the file to S3 via XHR for real byte progress.
      await this.xhrPutFile(
        presign.url,
        job.localPath,
        job.mimeType,
        job.sizeBytes,
        job.id,
        signal,
      );

      // Persist the post-PUT checkpoint before finalization. If the response
      // to finalize is lost, retrying uses the same idempotent object key.
      await this.persistState(job.id, {
        uploadedObject: {
          uploadIntentId: presign.uploadIntentId,
          bucket: presign.bucket,
          key: presign.key,
          publicUrl: presign.publicUrl,
          contentType: presign.contentType,
          sizeBytes: presign.sizeBytes,
          expiresAt: presign.expiresAt,
        },
      });
    }

    // The bytes have landed, but the job is not complete until the backend
    // verifies and publishes a canonical asset.
    this.emitProgress(job.id, job.sizeBytes, job.sizeBytes);
    const uploaded = await finalizePresignedMedia({
      presign,
      fileName: job.fileName,
      folder: job.folder,
      scopeRefId: job.projectId,
      metadata: { clientAssetId: job.assetId },
      signal,
    });

    return {
      ok: true,
      remoteUrl: uploaded.publicUrl,
      finalizationId: uploaded.finalizationId,
      mediaAssetId: uploaded.mediaAssetId,
      uploadedBytes: job.sizeBytes,
    };
  }

  // ── Multipart transport (resumable, per-part progress) ────────────

  /**
   * Perform a multipart upload. If the job already has a session (from a
   * previous interrupted attempt), resume from the last completed part.
   * Otherwise, initiate a new session.
   *
   * This transport is **resumable** — on failure, only the failed part
   * is retried. On app restart, completed parts (with ETags) are skipped.
   *
   * After the backend assembles the final object and creates the
   * media_asset row, this method polls until the asset reaches a
   * publishable state and returns the canonical URL — identical to the
   * single-PUT path's `finalizePresignedMedia` contract. The job is not
   * marked complete until the asset is processed and ready.
   */
  private async performMultipartUpload(
    job: UploadJob,
    signal: AbortSignal,
  ): Promise<UploadAttemptResult> {
    let session = job.session;

    if (!session) {
      // Initiate a new multipart session.
      await this.persistState(job.id, { status: 'initiating' });
      session = await this.multipartUploader.initiate(
        job.localPath,
        job.mimeType,
        job.sizeBytes,
        job.assetId,
        job.folder,
      );
      // Persist the session so it survives app kills.
      await this.persistState(job.id, { session, status: 'uploading' });
    }

    // Resume / upload remaining parts.
    const result = await this.multipartUploader.resume(
      session,
      job.localPath,
      (uploadedBytes) => {
        const progress = session!.totalBytes > 0
          ? Math.min(1, uploadedBytes / session!.totalBytes)
          : 0;
        this.emitProgress(job.id, uploadedBytes, session!.totalBytes);
        // Persist progress + session state for kill/relaunch resume.
        void this.persistState(job.id, {
          progress,
          session: {
            ...session!,
            uploadedBytes,
          },
        });
      },
      signal,
    );

    this.emitProgress(job.id, job.sizeBytes, job.sizeBytes);

    const finalizationId = result.finalizationId;
    let remoteUrl = result.publicUrl;
    let mediaAssetId = result.mediaAssetId;

    // Wait for the media asset to reach a publishable state — same
    // guarantee as the single-PUT path. The backend's /complete endpoint
    // creates the media_asset + processing job, but the asset may still
    // be in 'integrity_verified' / 'processing' / 'moderation_pending'.
    // Poll until it is 'publishable' or 'published', then use the
    // canonical URL. If no media asset was created (e.g. the backend
    // does not gate publication for this scope), fall back to the
    // assembled object's public URL.
    if (mediaAssetId) {
      const publishedAsset = await waitForPublishableMedia(mediaAssetId, signal);
      if (publishedAsset.canonicalUrl) {
        remoteUrl = publishedAsset.canonicalUrl;
      }
    }

    await this.persistState(job.id, {
      status: 'completed',
      progress: 1,
      remoteUrl,
      finalizationId,
      mediaAssetId,
      session,
    });

    return { ok: true, remoteUrl, finalizationId, mediaAssetId };
  }

  // ── XHR file upload with real byte progress ───────────────────────

  /**
   * PUT a local file to a presigned URL via XMLHttpRequest.
   *
   * Uses `xhr.send({ uri: fileUri })` which streams the file natively
   * on both iOS and Android without loading it into JS memory.
   * `xhr.upload.onprogress` provides real transmitted-byte events.
   */
  private xhrPutFile(
    url: string,
    fileUri: string,
    mimeType: string,
    totalBytes: number,
    jobId: string,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', mimeType);

      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
        xhr.upload.onprogress = null;
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      // Real byte progress — actual transmitted bytes / total bytes.
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          this.emitProgress(jobId, event.loaded, totalBytes);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          succeed();
        } else {
          fail(new Error(`Upload PUT failed: HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => fail(new Error('Network error during upload'));
      xhr.ontimeout = () => fail(new Error('Upload timed out'));

      const onAbort = () => {
        xhr.abort();
        fail(new Error('Aborted'));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });

      // `xhr.send({ uri })` streams the file natively in React Native.
      xhr.send({ uri: fileUri });
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /** Find an existing job matching the same (projectId, assetId, localPath). */
  private findExistingJob(params: QueueUploadParams): UploadJob | undefined {
    for (const job of this.jobsCache.values()) {
      if (
        job.projectId === params.projectId &&
        job.assetId === params.assetId &&
        job.localPath === params.localPath
      ) {
        return job;
      }
    }
    return undefined;
  }

  /**
   * Resolve the real file size in bytes via expo-file-system.
   * Falls back to reading the Blob size when `getInfoAsync` is not
   * supported (e.g. `ph://` or `content://` URIs). Never returns 0
   * for an existing file — if the size cannot be determined, returns 1
   * so the presign call doesn't fail on `sizeBytes > 0` validation.
   */
  private async resolveFileSize(localPath: string): Promise<number> {
    try {
      const info = await FileSystem.getInfoAsync(localPath);
      if (info.exists && typeof info.size === 'number' && info.size > 0) {
        return info.size;
      }
    } catch {
      // getInfoAsync may not support ph:// or content:// URIs.
    }

    // Fallback: read as Blob and use blob.size.
    try {
      const blob = await fetch(localPath).then((r) => r.blob());
      if (blob.size > 0) return blob.size;
    } catch {
      // If even Blob reading fails, we cannot determine the size.
    }

    // Last resort: return 1 so presign validation (sizeBytes > 0) passes.
    // The actual upload may still fail if the file is unreadable — that
    // failure will be surfaced honestly via the retry/error path.
    return 1;
  }

  /** Pick the next queued job to run, preferring oldest by createdAt. */
  private pickNextJob(): UploadJob | undefined {
    let candidate: UploadJob | undefined;
    for (const job of this.jobsCache.values()) {
      if (job.status !== 'queued') continue;
      if (this.activeUploads.has(job.id)) continue;
      if (!candidate || job.createdAt < candidate.createdAt) {
        candidate = job;
      }
    }
    return candidate;
  }

  /** Emit a progress event and update progress in cache + store. */
  private emitProgress(jobId: string, uploadedBytes: number, totalBytes: number): void {
    const total = totalBytes > 0 ? totalBytes : 1;
    const progress = Math.min(1, uploadedBytes / total);
    const snapshot: UploadProgress = {
      jobId,
      uploadedBytes,
      totalBytes,
      progress,
    };
    this.emit({ type: 'progress', progress: snapshot });
    // Persist progress (best-effort — don't block the upload loop).
    void this.persistState(jobId, { progress });
  }

  /** Emit `allComplete` when every job for a project is completed. */
  private async maybeEmitAllComplete(projectId: string): Promise<void> {
    if (await this.isProjectComplete(projectId)) {
      this.emit({ type: 'allComplete', projectId });
    }
  }

  /**
   * Update a job in the cache and persist to storage. Centralised so
   * every state change is durable.
   */
  private async persistState(jobId: string, updates: Partial<UploadJob>): Promise<void> {
    const current = this.jobsCache.get(jobId);
    if (!current) return;
    const next: UploadJob = {
      ...current,
      ...updates,
      updatedAt: Date.now(),
    };
    this.jobsCache.set(jobId, next);
    await this.jobStore.updateJob(jobId, updates);
  }

  /**
   * Exponential backoff with jitter:
   * `min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2^attempt) + random jitter`.
   */
  private computeBackoff(attempt: number): number {
    const exp = BASE_BACKOFF_MS * Math.pow(2, attempt);
    const capped = Math.min(MAX_BACKOFF_MS, exp);
    const jitter = Math.random() * (capped * 0.25);
    return Math.round(capped + jitter);
  }

  /** Promise-based sleep that rejects early if the signal aborts. */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Aborted'));
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Broadcast an event to all subscribers. */
  private emit(event: UploadEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not break the upload pipeline.
      }
    }
  }
}
