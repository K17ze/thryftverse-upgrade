/**
 * useMoodboardImport — tray of device-media import jobs for the moodboard
 * editor.
 *
 * Owns the job lifecycle (queued → preparing → uploading → finalizing →
 * added | failed), caps concurrency at two uploads, holds jobs in 'queued'
 * while offline and auto-resumes when connectivity returns. The board
 * refresh is kept decoupled via the `onItemAdded` callback so the hook
 * never reaches into board state directly.
 *
 * Truthful UI (AGENTS.md §11): a job is marked 'added' only after the
 * server accepts the item; failures stay in the tray as 'failed' until
 * retried or dismissed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useConnectivity } from '../../hooks/useConnectivity';
import { useHaptic } from '../../hooks/useHaptic';
import { createStableId } from '../../utils/createStableId';
import {
  importMoodboardAsset,
  type MoodboardImportStage } from '../../services/moodboardImportService';
import type { MoodboardItem } from '../../services/moodboardApi';
import type { SelectedAsset } from '../../creator/tools/MediaBrowser/mediaBrowserTypes';

export type MoodboardImportJobStage = MoodboardImportStage | 'queued' | 'failed';

export interface MoodboardImportJob {
  id: string;
  asset: SelectedAsset;
  stage: MoodboardImportJobStage;
  error?: string;
}

export interface MoodboardImportController {
  jobs: MoodboardImportJob[];
  /** Enqueue picked assets — jobs start immediately unless offline. */
  enqueue: (assets: SelectedAsset[]) => void;
  /** Re-run a failed job. */
  retry: (jobId: string) => void;
  /** Remove a job from the tray. */
  dismiss: (jobId: string) => void;
}

export interface UseMoodboardImportArgs {
  /** Board the imported items belong to — '' until the board exists. */
  moodboardId: string;
  /** Called after each item lands on the board — receives the placed item
   *  so callers (board reconcile, undo history) can use it. */
  onItemAdded?: (item: MoodboardItem | null) => void | Promise<void>;
}

const MAX_CONCURRENT_IMPORTS = 2;
/** How long a completed job stays visible before leaving the tray. */
const ADDED_DISMISS_MS = 1800;

export function useMoodboardImport({
  moodboardId,
  onItemAdded,
}: UseMoodboardImportArgs): MoodboardImportController {
  const { isOffline } = useConnectivity();
  const haptic = useHaptic();

  const [jobs, setJobs] = useState<MoodboardImportJob[]>([]);
  // jobsRef mirrors jobs so the async scheduler never reads stale state.
  const jobsRef = useRef<MoodboardImportJob[]>([]);
  const runningRef = useRef(0);
  const isOfflineRef = useRef(isOffline);
  const moodboardIdRef = useRef(moodboardId);
  const onItemAddedRef = useRef(onItemAdded);
  const dismissTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // pump↔runJob reference each other; the ref breaks the declaration cycle
  // while always pointing at the latest committed pump.
  const pumpRef = useRef<() => void>(() => {});

  isOfflineRef.current = isOffline;
  moodboardIdRef.current = moodboardId;
  onItemAddedRef.current = onItemAdded;

  const updateJobs = useCallback(
    (updater: (prev: MoodboardImportJob[]) => MoodboardImportJob[]) => {
      jobsRef.current = updater(jobsRef.current);
      setJobs(jobsRef.current);
    },
    [],
  );

  const patchJob = useCallback(
    (jobId: string, patch: Partial<MoodboardImportJob>) => {
      updateJobs((prev) =>
        prev.map((job) => (job.id === jobId ? { ...job, ...patch } : job)),
      );
    },
    [updateJobs],
  );

  // A completed job lingers briefly so the user sees 'Added', then leaves.
  const scheduleDismiss = useCallback((jobId: string) => {
    const timer = setTimeout(() => {
      dismissTimersRef.current.delete(jobId);
      jobsRef.current = jobsRef.current.filter((job) => job.id !== jobId);
      setJobs(jobsRef.current);
    }, ADDED_DISMISS_MS);
    dismissTimersRef.current.set(jobId, timer);
  }, []);

  const runJob = useCallback(
    async (jobId: string) => {
      const job = jobsRef.current.find((j) => j.id === jobId);
      try {
        if (!job) return;
        if (!moodboardIdRef.current) {
          throw new Error('The moodboard is not ready yet.');
        }
        const item = await importMoodboardAsset(moodboardIdRef.current, job.asset, (stage) => {
          patchJob(jobId, { stage });
        });
        patchJob(jobId, { stage: 'added', error: undefined });
        void onItemAddedRef.current?.(item);
        haptic.success();
        scheduleDismiss(jobId);
      } catch (error) {
        patchJob(jobId, {
          stage: 'failed',
          error: error instanceof Error ? error.message : 'Import failed.',
        });
        haptic.error();
      } finally {
        runningRef.current = Math.max(0, runningRef.current - 1);
        pumpRef.current();
      }
    },
    [patchJob, scheduleDismiss, haptic],
  );

  const pump = useCallback(() => {
    // Offline: jobs stay 'queued' — the reconnect effect re-pumps.
    if (isOfflineRef.current) return;
    for (const job of jobsRef.current) {
      if (runningRef.current >= MAX_CONCURRENT_IMPORTS) break;
      if (job.stage !== 'queued') continue;
      // Mark the job before starting so a second pump pass can't double-run it.
      patchJob(job.id, { stage: 'preparing', error: undefined });
      runningRef.current += 1;
      void runJob(job.id);
    }
  }, [patchJob, runJob]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  // Auto-resume queued jobs when connectivity returns.
  useEffect(() => {
    if (!isOffline) {
      pump();
    }
  }, [isOffline, pump]);

  // Clear pending auto-dismiss timers on unmount.
  useEffect(() => {
    const timers = dismissTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const enqueue = useCallback(
    (assets: SelectedAsset[]) => {
      if (!assets || assets.length === 0) return;
      const fresh: MoodboardImportJob[] = assets
        .filter(
          (asset) =>
            !!asset &&
            !!asset.uri &&
            (asset.mediaType === 'image' || asset.mediaType === 'video'),
        )
        .map((asset) => ({
          id: createStableId('import'),
          asset,
          stage: 'queued' as const,
        }));
      if (fresh.length === 0) return;
      updateJobs((prev) => [...prev, ...fresh]);
      pump();
    },
    [updateJobs, pump],
  );

  const retry = useCallback(
    (jobId: string) => {
      const job = jobsRef.current.find((j) => j.id === jobId);
      if (!job || job.stage !== 'failed') return;
      patchJob(jobId, { stage: 'queued', error: undefined });
      pump();
    },
    [patchJob, pump],
  );

  const dismiss = useCallback(
    (jobId: string) => {
      const timer = dismissTimersRef.current.get(jobId);
      if (timer) {
        clearTimeout(timer);
        dismissTimersRef.current.delete(jobId);
      }
      updateJobs((prev) => prev.filter((job) => job.id !== jobId));
    },
    [updateJobs],
  );

  return { jobs, enqueue, retry, dismiss };
}
