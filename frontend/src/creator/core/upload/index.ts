/**
 * Persistent upload manager — barrel exports.
 *
 * Provides a durable upload job system with retry, resume, and bounded
 * concurrency for the creator department. Additive to the existing
 * `mediaUploadPipeline`; does not modify it.
 */
export { UploadJobStore } from './UploadJobStore';
export { UploadManager } from './UploadManager';
export { useUploadManager } from './useUploadManager';
export type {
  UploadJob,
  UploadJobState,
  UploadProgress,
  UploadEvent,
  UploadEventListener,
  QueueUploadParams,
  ProjectProgress,
} from './UploadTypes';
export type { QueueParams, UseUploadManagerResult } from './useUploadManager';
