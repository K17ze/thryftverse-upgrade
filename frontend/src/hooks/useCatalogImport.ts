/**
 * useCatalogImport — manages the lifecycle of a single catalog import batch.
 *
 * Fetches the batch summary + phase on mount and polls the backend while the
 * batch is in a non-terminal state. Polling cadence is 3s while in progress
 * and stops as soon as the batch reaches a terminal state. All timers and
 * in-flight requests are cleaned up on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchImportBatch,
  startImportBatch,
  cancelImportBatch,
  retryImportBatch,
  deleteBatchRawData,
  CatalogImportError,
} from '../services/catalogImportApi';
import type { BatchSummaryDTO, BatchState } from '../services/catalogImportApi';

const POLL_INTERVAL_MS = 3000;

/**
 * Batch states that will not transition further. Once a batch reaches one of
 * these states the hook stops polling — there is no work left to observe.
 */
const TERMINAL_BATCH_STATES: ReadonlySet<BatchState> = new Set<BatchState>([
  'completed',
  'cancelled',
  'failed_recoverable',
]);

export interface UseCatalogImportResult {
  batch: BatchSummaryDTO | null;
  phase: string;
  loading: boolean;
  error: string | null;
  /** Re-fetch the batch status immediately. Resets the error state. */
  refresh: () => Promise<void>;
  /** POST `/batches/:batchId/start`. */
  start: () => Promise<void>;
  /** POST `/batches/:batchId/cancel`. */
  cancel: () => Promise<void>;
  /** POST `/batches/:batchId/retry`. */
  retry: () => Promise<void>;
  /** DELETE `/batches/:batchId/raw-data`. */
  deleteRawData: () => Promise<void>;
}

export function useCatalogImport(batchId: string | null | undefined): UseCatalogImportResult {
  const [batch, setBatch] = useState<BatchSummaryDTO | null>(null);
  const [phase, setPhase] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(Boolean(batchId));
  const [error, setError] = useState<string | null>(null);

  // Refs that survive re-renders without resetting timers.
  const isMountedRef = useRef<boolean>(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const batchIdRef = useRef<string | null | undefined>(batchId);
  batchIdRef.current = batchId;

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const id = batchIdRef.current;
    if (!id) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await fetchImportBatch(id);
      if (!isMountedRef.current) return;
      setBatch(result.batch);
      setPhase(result.phase);
      setError(null);
    } catch (cause) {
      if (!isMountedRef.current) return;
      const message =
        cause instanceof CatalogImportError ? cause.message : 'Failed to load import batch.';
      setError(message);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Initial load + polling lifecycle.
  useEffect(() => {
    isMountedRef.current = true;

    if (!batchId) {
      setBatch(null);
      setPhase('');
      setLoading(false);
      setError(null);
      clearPollTimer();
      return;
    }

    setLoading(true);
    void load().finally(() => {
      if (isMountedRef.current) setLoading(false);
    });

    return () => {
      isMountedRef.current = false;
      clearPollTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  // Polling effect — re-evaluates whenever the batch state changes.
  useEffect(() => {
    clearPollTimer();
    if (!batch) return;
    if (TERMINAL_BATCH_STATES.has(batch.status)) return;

    pollTimerRef.current = setTimeout(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      clearPollTimer();
    };
  }, [batch, load, clearPollTimer]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!batchIdRef.current) return;
    setLoading(true);
    try {
      await load();
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [load]);

  const runMutation = useCallback(
    async (fn: (id: string) => Promise<void>): Promise<void> => {
      const id = batchIdRef.current;
      if (!id) return;
      setError(null);
      try {
        await fn(id);
        // Refresh immediately so the UI reflects the transition without
        // waiting for the next poll tick.
        await load();
      } catch (cause) {
        const message =
          cause instanceof CatalogImportError ? cause.message : 'Import action failed.';
        if (isMountedRef.current) setError(message);
        throw cause;
      }
    },
    [load]
  );

  const start = useCallback(async (): Promise<void> => {
    await runMutation((id) => startImportBatch(id));
  }, [runMutation]);

  const cancel = useCallback(async (): Promise<void> => {
    await runMutation((id) => cancelImportBatch(id));
  }, [runMutation]);

  const retry = useCallback(async (): Promise<void> => {
    await runMutation((id) => retryImportBatch(id));
  }, [runMutation]);

  const deleteRawData = useCallback(async (): Promise<void> => {
    await runMutation((id) => deleteBatchRawData(id));
  }, [runMutation]);

  return {
    batch,
    phase,
    loading,
    error,
    refresh,
    start,
    cancel,
    retry,
    deleteRawData,
  };
}
