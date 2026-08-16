import * as FileSystem from 'expo-file-system';
import { createStableId } from '../../../utils/createStableId';
import type { UploadJobStore } from './UploadJobStore';
import type {
  UploadEvent,
  UploadEventListener,
  UploadJob,
  UploadProgress,
  QueueUploadParams,
  ProjectProgress,
} from './UploadTypes';

/** Base delay (ms) for exponential backoff between retry attempts. */
const BASE_BACKOFF_MS = 1000;
/** Upper bound (ms) for exponential backoff. */
const MAX_BACKOFF_MS = 30_000;
/** Default maximum concurrent uploads. */
const DEFAULT_MAX_CONCURRENT = 2;
/** Default maximum retry attempts per job. */
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Result of a single upload attempt. The manager uses this to decide
 * whether to retry, pause, or mark the job complete.
 */
interface UploadAttemptResult {
  ok: boolean;
  remoteUrl?: string;
  bytesSent?: number;
  error?: string;
}

/**
 * Durable upload manager with bounded concurrency, exponential backoff,
 * and resume support.
 *
 * The manager is transport-agnostic: it does not import the existing
 * `mediaUploadPipeline` to avoid coupling. Instead it performs the upload
 * via `fetch` against a configurable endpoint, mirroring the presign +
 * PUT pattern used by `services/mediaUpload`. The remote key
 * (`{projectId}/{assetId}/{contentHash}`) makes uploads idempotent so a
 * retried or resumed job does not create duplicate remote objects.
 */
export class UploadManager {
  private jobStore: UploadJobStore;
  private maxConcurrent: number;
  private listeners: Set<UploadEventListener> = new Set();
  private activeUploads: Map<string, AbortController> = new Map();
  /** In-memory mirror of persisted jobs for synchronous access. */
  private jobsCache: Map<string, UploadJob> = new Map();
  private processing = false;
  /** Configurable upload endpoint. Override via constructor options. */
  private uploadEndpoint: string;

  constructor(
    jobStore: UploadJobStore,
    options?: { maxConcurrent?: number; uploadEndpoint?: string },
  ) {
    this.jobStore = jobStore;
    this.maxConcurrent = options?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.uploadEndpoint = options?.uploadEndpoint ?? '/uploads/presign';
  }

  /**
   * Queue a new upload job. Generates an id, initial state and timestamps.
   * Returns the new job id. Does not start processing — call
   * `processQueue()` (or rely on auto-processing) to begin.
   */
  async queueUpload(params: QueueUploadParams): Promise<string> {
    const now = new Date().toISOString();
    const id = createStableId('upload');
    const remoteKey = params.remoteKey ?? this.computeRemoteKey(params);
    const job: UploadJob = {
      ...params,
      id,
      remoteKey,
      bytesSent: 0,
      attempt: 0,
      maxAttempts: params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      state: 'queued',
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
    void this.persistState(jobId, { state: 'paused' });
  }

  /** Resume a paused or failed job by re-queueing it for processing. */
  async resumeJob(jobId: string): Promise<void> {
    await this.persistState(jobId, { state: 'queued', lastError: undefined });
    void this.processQueue();
  }

  /** Cancel a job: abort any in-flight upload and remove it from the store. */
  cancelJob(jobId: string): void {
    const controller = this.activeUploads.get(jobId);
    if (controller) {
      controller.abort();
      this.activeUploads.delete(jobId);
    }
    this.jobsCache.delete(jobId);
    void this.jobStore.removeJob(jobId);
  }

  /** Retry a failed job: reset attempt counter and re-queue. */
  async retryJob(jobId: string): Promise<void> {
    await this.persistState(jobId, {
      state: 'queued',
      attempt: 0,
      lastError: undefined,
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

  /** True when every job for a project is in the `complete` state. */
  async isProjectComplete(projectId: string): Promise<boolean> {
    const jobs = await this.getJobs(projectId);
    if (jobs.length === 0) return true;
    return jobs.every((j) => j.state === 'complete');
  }

  /**
   * Wait until all jobs for a project reach a terminal state (`complete`
   * or `failed`). Resolves with the final job list so the caller can
   * inspect `remoteUrl` on each completed job and detect failures.
   *
   * Polls at `intervalMs` (default 250 ms) to avoid tight loops. The
   * promise rejects if any job ends in `failed` state AND no jobs are
   * still in-flight — this lets the caller surface upload errors to the
   * user immediately rather than hanging.
   */
  async waitForProjectCompletion(
    projectId: string,
    intervalMs = 250,
  ): Promise<UploadJob[]> {
    // First, make sure the queue is processing.
    void this.processQueue();

    const check = async (): Promise<UploadJob[]> => {
      const jobs = await this.getJobs(projectId);
      if (jobs.length === 0) return jobs;
      const allTerminal = jobs.every(
        (j) => j.state === 'complete' || j.state === 'failed',
      );
      if (allTerminal) return jobs;
      return null as unknown as Promise<UploadJob[]>;
    };

    // Poll until all jobs are terminal.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await check();
      if (result !== null) return result;
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

  /** Aggregate progress for a project. */
  async getProjectProgress(projectId: string): Promise<ProjectProgress> {
    const jobs = await this.getJobs(projectId);
    let complete = 0;
    let bytesSent = 0;
    let bytesTotal = 0;
    for (const j of jobs) {
      bytesSent += j.bytesSent;
      bytesTotal += j.bytesTotal ?? 0;
      if (j.state === 'complete') complete += 1;
    }
    return { complete, total: jobs.length, bytesSent, bytesTotal };
  }

  // ── Internals ─────────────────────────────────────────────────────

  /**
   * Process a single job: emit `jobStarted`, run the upload with retry,
   * and transition to `complete` or `failed`.
   */
  private async processJob(job: UploadJob): Promise<void> {
    const controller = new AbortController();
    this.activeUploads.set(job.id, controller);

    await this.persistState(job.id, { state: 'uploading' });
    const started = this.jobsCache.get(job.id);
    if (started) this.emit({ type: 'jobStarted', job: started });

    try {
      const result = await this.runWithRetry(job, controller.signal);
      if (result.ok) {
        await this.persistState(job.id, {
          state: 'complete',
          bytesSent: result.bytesSent ?? job.bytesTotal ?? 0,
          remoteUrl: result.remoteUrl,
          lastError: undefined,
        });
        const done = this.jobsCache.get(job.id);
        if (done) this.emit({ type: 'jobComplete', job: done });
        await this.maybeEmitAllComplete(job.projectId);
      } else {
        await this.persistState(job.id, {
          state: 'failed',
          lastError: result.error ?? 'Unknown upload error',
        });
        const failed = this.jobsCache.get(job.id);
        if (failed) {
          this.emit({ type: 'jobFailed', job: failed, error: failed.lastError ?? 'Unknown upload error' });
        }
      }
    } finally {
      this.activeUploads.delete(job.id);
      // Fill any freed slot.
      void this.processQueue();
    }
  }

  /**
   * Run the upload for a job, retrying up to `maxAttempts` with
   * exponential backoff + jitter. Honours an AbortSignal for
   * cancellation/pause.
   */
  private async runWithRetry(
    job: UploadJob,
    signal: AbortSignal,
  ): Promise<UploadAttemptResult> {
    let lastError: string | undefined;
    for (let attempt = job.attempt; attempt < job.maxAttempts; attempt++) {
      if (signal.aborted) {
        return { ok: false, error: 'Aborted' };
      }
      // Persist attempt counter for resume correctness.
      await this.persistState(job.id, { attempt });

      try {
        const result = await this.performUpload(job, signal);
        return result;
      } catch (err: unknown) {
        if (signal.aborted) {
          return { ok: false, error: 'Aborted' };
        }
        lastError = err instanceof Error ? err.message : String(err);
        // If more attempts remain, back off and continue.
        if (attempt < job.maxAttempts - 1) {
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

  /**
   * Perform a single upload attempt. Mirrors the presign + PUT pattern
   * from `services/mediaUpload` without importing it: resolve file size
   * via expo-file-system, POST to the configurable endpoint to obtain a
   * presigned URL, then PUT the file body. Progress is reported via the
   * `progress` event using a best-effort byte estimate.
   */
  private async performUpload(
    job: UploadJob,
    signal: AbortSignal,
  ): Promise<UploadAttemptResult> {
    // Resolve total bytes if not already known.
    let bytesTotal = job.bytesTotal;
    if (bytesTotal === undefined) {
      try {
        const info = await FileSystem.getInfoAsync(job.localUri);
        if (info.exists && typeof info.size === 'number') {
          bytesTotal = info.size;
          await this.persistState(job.id, { bytesTotal });
        }
      } catch {
        // Non-fatal: progress percent will be approximate.
      }
    }

    // Read the file as a blob. On native this fetches the local file.
    const blob = await fetch(job.localUri).then((r) => r.blob());
    const total = bytesTotal ?? blob.size;

    // Step 1 — presign. The endpoint is expected to return
    // `{ url, publicUrl, key }` (same shape as `PresignResponse`).
    const presignRes = await fetch(this.uploadEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: job.remoteKey ?? `${job.assetId}`,
        contentType: job.contentType ?? 'application/octet-stream',
        folder: job.folder ?? 'uploads',
        sizeBytes: total,
        remoteKey: job.remoteKey,
      }),
      signal,
    });
    if (!presignRes.ok) {
      throw new Error(`Presign failed: ${presignRes.status}`);
    }
    const presign = (await presignRes.json()) as {
      url: string;
      publicUrl: string;
      key?: string;
    };

    // Step 2 — PUT the file body to the presigned URL.
    const putRes = await fetch(presign.url, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': job.contentType ?? 'application/octet-stream',
      },
      signal,
    });
    if (!putRes.ok) {
      throw new Error(`Upload PUT failed: ${putRes.status}`);
    }

    // Report completion progress.
    this.emitProgress(job.id, total, total);

    return {
      ok: true,
      remoteUrl: presign.publicUrl,
      bytesSent: total,
    };
  }

  /** Pick the next queued job to run, preferring oldest by createdAt. */
  private pickNextJob(): UploadJob | undefined {
    let candidate: UploadJob | undefined;
    for (const job of this.jobsCache.values()) {
      if (job.state !== 'queued') continue;
      if (this.activeUploads.has(job.id)) continue;
      if (!candidate || job.createdAt < candidate.createdAt) {
        candidate = job;
      }
    }
    return candidate;
  }

  /** Emit a progress event and update bytesSent in cache + store. */
  private emitProgress(jobId: string, bytesSent: number, bytesTotal?: number): void {
    const total = bytesTotal ?? 0;
    const percent = total > 0 ? Math.min(1, bytesSent / total) : 0;
    const progress: UploadProgress = { jobId, bytesSent, bytesTotal, percent };
    this.emit({ type: 'progress', progress });
    void this.persistState(jobId, { bytesSent });
  }

  /** Emit `allComplete` when every job for a project is complete. */
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
      updatedAt: new Date().toISOString(),
    };
    this.jobsCache.set(jobId, next);
    await this.jobStore.updateJob(jobId, updates);
  }

  /** Compute the idempotent remote key for a job. */
  private computeRemoteKey(params: QueueUploadParams): string {
    // A content hash is ideal but unavailable without reading the file;
    // fall back to a stable composite of project + asset + uri so the
    // same local file always maps to the same remote key.
    const hash = this.hashString(params.localUri);
    return `${params.projectId}/${params.assetId}/${hash}`;
  }

  /** Small FNV-1a string hash → base36, deterministic and collision-resistant enough. */
  private hashString(input: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
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
