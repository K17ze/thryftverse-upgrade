/**
 * Persistent upload manager — type definitions.
 *
 * These types describe durable upload jobs for the creator department.
 * A job represents a single local media file that must be delivered to a
 * remote object store before a project can be published. Jobs persist
 * across app restarts (via AsyncStorage) so that interrupted uploads can
 * be resumed instead of failing the whole publish flow.
 */

/** Lifecycle states for a single upload job. */
export type UploadJobState =
  | 'queued'
  | 'uploading'
  | 'paused'
  | 'failed'
  | 'complete';

/**
 * A durable upload job record. Only metadata is persisted — never the
 * media payload itself, which remains on disk at `localUri`.
 */
export interface UploadJob {
  id: string;
  projectId: string;
  assetId: string;
  localUri: string;
  /** S3-style key for idempotency: `{projectId}/{assetId}/{contentHash}`. */
  remoteKey?: string;
  bytesTotal?: number;
  bytesSent: number;
  attempt: number;
  maxAttempts: number;
  state: UploadJobState;
  lastError?: string;
  /** Resolved remote URL once the upload has been finalised. */
  remoteUrl?: string;
  /** MIME type inferred from the local asset, used for the upload request. */
  contentType?: string;
  /** Folder/scope passed to the upload endpoint (e.g. "looks", "posters"). */
  folder?: string;
  createdAt: string;
  updatedAt: string;
}

/** Progress snapshot for a single job. */
export interface UploadProgress {
  jobId: string;
  bytesSent: number;
  bytesTotal?: number;
  /** Completion fraction in the range 0–1. */
  percent: number;
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
 * manager owns (`id`, `attempt`, `bytesSent`, `state`, timestamps) are
 * intentionally omitted.
 */
export type QueueUploadParams = Omit<
  UploadJob,
  'id' | 'attempt' | 'bytesSent' | 'state' | 'createdAt' | 'updatedAt'
>;

/** Aggregate progress for a project's upload jobs. */
export interface ProjectProgress {
  complete: number;
  total: number;
  bytesSent: number;
  bytesTotal: number;
}
