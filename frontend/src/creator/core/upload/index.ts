/**
 * Genuine Resumable Upload System — barrel exports.
 *
 * Provides a durable upload job system with real byte progress, correct
 * MIME detection, retryable single-PUT transport, and resumable S3
 * multipart transport (ready, awaiting backend endpoints).
 */

export { UploadJobStore } from './UploadJobStore';
export { UploadManager } from './UploadManager';
export { MultipartUploader } from './MultipartUploader';
export { detectMimeType, deriveFileName } from './MimeDetector';
export { useUploadManager } from './useUploadManager';
export type {
  UploadJob,
  UploadJobStatus,
  UploadPart,
  UploadSession,
  UploadProgress,
  UploadEvent,
  UploadEventListener,
  QueueUploadParams,
  ProjectProgress,
} from './UploadTypes';
export { DEFAULT_PART_SIZE, MULTIPART_THRESHOLD_BYTES } from './UploadTypes';
export type { QueueParams, UseUploadManagerResult } from './useUploadManager';
export type { MultipartUploaderOptions, MultipartCompleteResult } from './MultipartUploader';
