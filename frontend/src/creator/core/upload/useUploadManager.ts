import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UploadJobStore } from './UploadJobStore';
import { UploadManager } from './UploadManager';
import type { QueueUploadParams, UploadJob, UploadEventListener, ProjectProgress } from './UploadTypes';

/**
 * Shared singleton store + manager. Created once per JS runtime so that
 * all components subscribing via `useUploadManager` observe the same
 * job state and the same bounded-concurrency queue.
 */
let sharedStore: UploadJobStore | null = null;
let sharedManager: UploadManager | null = null;

export function getSharedManager(): UploadManager {
  if (!sharedStore) sharedStore = new UploadJobStore();
  if (!sharedManager) sharedManager = new UploadManager(sharedStore);
  return sharedManager;
}

export async function resumeCreatorUploads(): Promise<void> {
  await getSharedManager().resumePendingJobs();
}

/** Parameters accepted by the hook's `queueUpload`. */
export type QueueParams = QueueUploadParams;

export interface UseUploadManagerResult {
  jobs: UploadJob[];
  isUploading: boolean;
  /** True when any job is in the server-confirmation phase. */
  isConfirming: boolean;
  /** True when any job has stalled (no progress for an extended period). */
  isStalled: boolean;
  /**
   * Aggregate completion fraction 0–1 across the project's jobs, based
   * on **real transmitted bytes** (not job count). This is the truthful
   * progress value — no fake interpolation.
   */
  progress: number;
  /** Total bytes across all jobs for the active project. */
  totalBytes: number;
  /** Total uploaded bytes across all jobs for the active project. */
  uploadedBytes: number;
  queueUpload: (params: QueueParams) => Promise<string>;
  pauseJob: (jobId: string) => void;
  resumeJob: (jobId: string) => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
  isProjectComplete: boolean;
  /**
   * Wait until all jobs for the active project reach a terminal state
   * (`completed` or `failed`). Resolves with the final job list so the
   * caller can inspect `remoteUrl` on each completed job.
   */
  waitForCompletion: () => Promise<UploadJob[]>;
  /** Aggregate progress snapshot for the active project. */
  projectProgress: ProjectProgress;
  /** Remove all completed/failed jobs for the active project from storage. */
  clearProjectJobs: () => Promise<void>;
}

/**
 * React hook that exposes upload state for a project.
 *
 * Subscribes to the shared `UploadManager` and re-renders on any event.
 * When `projectId` is provided, `jobs` and `progress` are filtered to
 * that project; otherwise all jobs are surfaced.
 *
 * Progress is computed from **real bytes**: `sum(progress * sizeBytes) /
 * sum(sizeBytes)`. No fake interpolation, no stage percentages.
 */
export function useUploadManager(projectId?: string): UseUploadManagerResult {
  const manager = getSharedManager();
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [tick, setTick] = useState(0);
  const tickRef = useRef(0);
  const lastUpdateRef = useRef(0);

  // Re-render on any event. We bump a counter rather than threading
  // per-event updates so the hook stays simple and resilient.
  //
  // Progress events fire on every XHR byte tick — dozens of times per
  // second for a fast connection. Re-rendering on each one swamps the
  // React reconciler and the UI thread. Throttle to ~10 fps (100ms) so
  // the progress bar still feels smooth without burning the JS thread.
  const forceUpdate = useCallback(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current >= 100) {
      lastUpdateRef.current = now;
      tickRef.current += 1;
      setTick(tickRef.current);
    }
  }, []);

  useEffect(() => {
    const listener: UploadEventListener = () => forceUpdate();
    const unsubscribe = manager.subscribe(listener);
    // Seed initial job list from the store.
    void (async () => {
      if (projectId) {
        setJobs(await manager.getJobs(projectId));
      } else {
        // Whole-store snapshot via a project-agnostic query.
        const store = sharedStore!;
        const all = await store.loadJobs();
        setJobs(all);
      }
    })();
    return unsubscribe;
  }, [manager, projectId, forceUpdate]);

  // Refresh the job snapshot whenever we re-render (post-event).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snapshot = projectId
        ? await manager.getJobs(projectId)
        : await (sharedStore!.loadJobs());
      if (!cancelled) setJobs(snapshot);
    })();
    return () => {
      cancelled = true;
    };
  }, [manager, projectId, tick]);

  const filteredJobs = useMemo(() => jobs, [jobs]);

  const isUploading = useMemo(
    () =>
      filteredJobs.some(
        (j) =>
          j.status === 'uploading' ||
          j.status === 'queued' ||
          j.status === 'initiating' ||
          j.status === 'confirming' ||
          j.status === 'stalled',
      ),
    [filteredJobs],
  );

  /** True when any job is in the server-confirmation phase. */
  const isConfirming = useMemo(
    () => filteredJobs.some((j) => j.status === 'confirming'),
    [filteredJobs],
  );
  /** True when any job has stalled (no progress for an extended period). */
  const isStalled = useMemo(
    () => filteredJobs.some((j) => j.status === 'stalled'),
    [filteredJobs],
  );

  // Real byte progress: sum(progress * sizeBytes) / sum(sizeBytes).
  const { progress, totalBytes, uploadedBytes } = useMemo(() => {
    if (filteredJobs.length === 0) {
      return { progress: 0, totalBytes: 0, uploadedBytes: 0 };
    }
    let total = 0;
    let uploaded = 0;
    for (const j of filteredJobs) {
      total += j.sizeBytes;
      uploaded += j.progress * j.sizeBytes;
    }
    return {
      progress: total > 0 ? Math.min(1, uploaded / total) : 0,
      totalBytes: total,
      uploadedBytes: uploaded,
    };
  }, [filteredJobs]);

  const projectProgress = useMemo<ProjectProgress>(
    () => ({
      complete: filteredJobs.filter((j) => j.status === 'completed').length,
      total: filteredJobs.length,
      uploadedBytes,
      totalBytes,
      progress,
    }),
    [filteredJobs, uploadedBytes, totalBytes, progress],
  );

  const isProjectComplete = useMemo(
    () =>
      filteredJobs.length > 0 &&
      filteredJobs.every((j) => j.status === 'completed'),
    [filteredJobs],
  );

  const queueUpload = useCallback(
    (params: QueueParams) => manager.queueUpload(params),
    [manager],
  );
  const pauseJob = useCallback((jobId: string) => manager.pauseJob(jobId), [manager]);
  const resumeJob = useCallback(
    (jobId: string) => manager.resumeJob(jobId),
    [manager],
  );
  const cancelJob = useCallback((jobId: string) => manager.cancelJob(jobId), [manager]);
  const retryJob = useCallback((jobId: string) => manager.retryJob(jobId), [manager]);

  const waitForCompletion = useCallback(
    () => manager.waitForProjectCompletion(projectId ?? ''),
    [manager, projectId],
  );

  const clearProjectJobs = useCallback(
    () => manager.clearProjectJobs(projectId ?? ''),
    [manager, projectId],
  );

  // Memoize the return value so the object reference is stable across
  // re-renders when no underlying values have changed. Without this,
  // consumers that include `uploadManager` in useCallback/useEffect
  // dependency arrays would see a new reference on every render, causing
  // those callbacks/effects to re-run unnecessarily — a common source of
  // infinite update loops.
  return useMemo(
    () => ({
      jobs: filteredJobs,
      isUploading,
      isConfirming,
      isStalled,
      progress,
      totalBytes,
      uploadedBytes,
      queueUpload,
      pauseJob,
      resumeJob,
      cancelJob,
      retryJob,
      isProjectComplete,
      waitForCompletion,
      projectProgress,
      clearProjectJobs,
    }),
    [
      filteredJobs,
      isUploading,
      isConfirming,
      isStalled,
      progress,
      totalBytes,
      uploadedBytes,
      queueUpload,
      pauseJob,
      resumeJob,
      cancelJob,
      retryJob,
      isProjectComplete,
      waitForCompletion,
      projectProgress,
      clearProjectJobs,
    ],
  );
}
