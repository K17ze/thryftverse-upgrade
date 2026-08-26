/**
 * Genuine Resumable Upload System — type definitions.
 *
 * These types describe durable, resumable upload jobs for the creator
 * department. A job represents a single local media file that must be
 * delivered to a remote object store before a project can be published.
 *
 * Jobs persist across app restarts (via AsyncStorage) so that interrupted
 * uploads can be resumed at the last completed part instead of restarting
 * from byte zero.
 *
 * ## Transport
 *
 * Two transports are supported:
 *
 * 1. **Single-PUT with real byte progress** (active today). Uses
 *    `XMLHttpRequest.upload.onprogress` to report actual transmitted bytes
 *    against the existing `/uploads/presign` backend endpoint. This is
 *    truthfully **retryable** (the whole file is re-uploaded on failure)
 *    but not **resumable** (no part-level checkpoint).
 *
 * 2. **S3 multipart upload** (active). Splits the file into 5 MB+ parts,
 *    uploads each part to its own presigned URL, and completes by sending
 *    the ETag list to the backend which assembles the final S3 object and
 *    creates an `upload_finalizations` record. This is truthfully
 *    **resumable** — on failure, only the failed part is retried; on app
 *    restart, completed parts are skipped.
 *
 * The active transport is chosen by `UploadManager` based on file size
 * and backend capability. See `MultipartUploader` for the backend
 * endpoint contract that must be implemented to activate multipart.
 */

// ── Multipart session types ─────────────────────────────────────────

/**
 * A single part within an S3 multipart upload session.
 *
 * `partNumber` is 1-based per the S3 multipart protocol. `startByte` and
 * `endByte` are inclusive byte offsets within the local file. `etag` is
 * set by S3 after a successful part upload and is required to complete
 * the multipart upload.
 */
export type UploadPart = {
  partNumber: number; // 1-based
  startByte: number;
  endByte: number;
  sizeBytes: number;
  etag?: string; // from S3
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  retries: number;
};

/**
 * A durable S3 multipart upload session. Persisted as part of `UploadJob`
 * so that completed parts survive app kills and can be skipped on resume.
 */
export type UploadSession = {
  uploadId: string; // S3 multipart upload ID
  key: string; // S3 object key
  /** Backend session ID — used in the /uploads/multipart/:id/* path. */
  sessionId?: string;
  /** Cached presigned part URLs from the initiate response. Stored as a
   *  plain object (not Map) so it survives JSON serialisation in AsyncStorage. */
  presignedUrls?: Record<number, string>;
  parts: UploadPart[];
  totalBytes: number;
  uploadedBytes: number;
  initiatedAt: number;
  expiresAt: number; // signed URL expiration (epoch ms)
  mimeType: string;
  assetId: string;
  /** Set by `complete()` — the backend's finalization record ID. */
  finalizationId?: string;
};

// ── Job types ───────────────────────────────────────────────────────

/** Lifecycle states for a single upload job. */
export type UploadJobStatus =
  | 'queued'
  | 'initiating'
  | 'uploading'
  | 'paused'
  | 'completed'
  | 'failed';

/**
 * A durable upload job record. Only metadata + session state is persisted
 * — never the media payload itself, which remains on disk at `localPath`.
 */
export type UploadJob = {
  id: string;
  projectId: string;
  assetId: string;
  /** Local file URI (file://, ph://, content://, etc.). */
  localPath: string;
  fileName: string;
  /** Correctly derived MIME type — never `image/*` for video. */
  mimeType: string;
  /** Real file size in bytes, resolved via expo-file-system. Never 0. */
  sizeBytes: number;
  /** Multipart session state. Present only for multipart uploads. */
  session?: UploadSession;
  status: UploadJobStatus;
  /** Completion fraction 0–1 based on actual transmitted bytes. */
  progress: number;
  /** Resolved remote URL once the upload has been finalised. */
  remoteUrl?: string;
  /** Backend evidence that the object-store PUT was verified. Jobs created
   *  by the older manager do not have these fields and must be re-queued. */
  finalizationId?: string;
  mediaAssetId?: string;
  /** A successfully PUT object awaiting idempotent finalization. Persisting
   *  this checkpoint prevents a dropped finalize response from creating a
   *  second object on retry. */
  uploadedObject?: {
    uploadIntentId: string;
    bucket: string;
    key: string;
    publicUrl: string;
    contentType: string;
    sizeBytes: number;
    expiresAt: string;
  };
  error?: string;
  retries: number;
  maxRetries: number;
  /** Folder/scope passed to the upload endpoint (e.g. "looks", "posters"). */
  folder: string;
  createdAt: number;
  updatedAt: number;
};

/** Progress snapshot for a single job. */
export interface UploadProgress {
  jobId: string;
  uploadedBytes: number;
  totalBytes: number;
  /** Completion fraction in the range 0–1 based on real bytes. */
  progress: number;
}

/** Listener invoked when an upload event occurs. */
export type UploadEventListener = (event: UploadEvent) => void;

/** Discriminated union of all events emitted by the upload manager. */
export type UploadEvent =
  | { type: 'jobAdded'; job: UploadJob }
  | { type: 'jobStarted'; job: UploadJob }
  | { type: 'progress'; progress: UploadProgress }
  | { type: 'jobComplete'; job: UploadJob }
  | { type: 'jobFailed'; job: UploadJob; error: string }
  | { type: 'allComplete'; projectId: string };

/**
 * Parameters accepted by `UploadManager.queueUpload`. Fields that the
 * manager owns (`id`, `retries`, `progress`, `status`, timestamps,
 * `sizeBytes`, `mimeType`) are intentionally omitted — the manager
 * resolves `mimeType` and `sizeBytes` from the local file.
 */
export type QueueUploadParams = {
  projectId: string;
  assetId: string;
  /** Local file URI. */
  localPath: string;
  /** Optional file name; derived from `localPath` if omitted. */
  fileName?: string;
  /** Optional MIME hint; detected from extension if omitted. */
  mimeType?: string;
  /** Optional asset-type hint ("image" | "video" | "audio") for MIME fallback. */
  assetType?: string;
  folder: string;
  maxRetries?: number;
};

/** Aggregate progress for a project's upload jobs. */
export interface ProjectProgress {
  complete: number;
  total: number;
  uploadedBytes: number;
  totalBytes: number;
  /** Aggregate completion fraction 0–1 based on real bytes. */
  progress: number;
}

// ── Constants ───────────────────────────────────────────────────────

/** Minimum part size for S3 multipart upload (5 MB). */
export const DEFAULT_PART_SIZE = 5 * 1024 * 1024; // 5 MB

/** Files below this threshold use single-PUT even when multipart is available. */
export const MULTIPART_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10 MB
