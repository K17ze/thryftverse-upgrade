/**
 * useExtractionCandidates — manages the extraction run lifecycle for a
 * single import item from the review UI.
 *
 * Responsibilities:
 * - Fetch the latest extraction run (if any) on mount.
 * - Trigger a new run when the seller requests extraction.
 * - Poll for run completion while job_state is queued/running.
 * - Expose candidates grouped by field, with the top-ranked candidate
 *   per field ready for accept/reject/edit.
 * - Apply field decisions and refresh the item after each decision.
 *
 * Design (per AGENTS.md anti-AI policy):
 * - The hook does NOT auto-trigger extraction. The seller explicitly
 *   requests it — extraction is advisory, not a magic wand.
 * - Candidates are evidence, not facts. The UI shows them as suggestions
 *   with calibrated confidence and source module, never as "AI-filled"
 *   values.
 * - Honest outcomes are surfaced: unavailable_no_model shows "extraction
 *   unavailable", source_missing shows "no photo to extract from",
 *   partial shows "some fields extracted". No false success.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  triggerExtractionRun,
  fetchLatestExtractionRun,
  applyFieldDecision,
  applyBulkFieldDecisions,
  CatalogImportError,
  type ExtractionRunDTO,
  type FieldCandidateDTO,
  type FieldDecisionKind,
  type BulkFieldDecisionResult,
} from '../services/catalogImportApi';

export interface UseExtractionCandidatesResult {
  run: ExtractionRunDTO | null;
  loading: boolean;
  triggering: boolean;
  deciding: boolean;
  error: string | null;
  /** True when extraction is available (a model is registered). */
  isAvailable: boolean;
  /** True when the run is in progress (queued or running). */
  isRunning: boolean;
  /** True when the run produced no usable candidates. */
  isEmpty: boolean;
  /** Candidates grouped by field name, top-ranked first. */
  candidatesByField: Record<string, FieldCandidateDTO[]>;
  /** The top candidate for a field, or null. */
  topCandidateFor: (fieldName: string) => FieldCandidateDTO | null;
  /** Trigger a new extraction run. */
  triggerExtraction: () => Promise<void>;
  /** Apply a single field decision. */
  decide: (
    fieldName: string,
    decision: FieldDecisionKind,
    baseFieldRevision: string,
    finalValue?: unknown,
    candidateId?: string,
  ) => Promise<void>;
  /** Apply multiple field decisions at once. */
  decideBulk: (
    baseFieldRevision: string,
    decisions: Array<{
      fieldName: string;
      decision: FieldDecisionKind;
      finalValue?: unknown;
      candidateId?: string;
    }>,
  ) => Promise<BulkFieldDecisionResult>;
  /** Refresh the run from the server. */
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // ~2 minutes

export function useExtractionCandidates(
  itemId: string | null | undefined,
): UseExtractionCandidatesResult {
  const [run, setRun] = useState<ExtractionRunDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(itemId));
  const [triggering, setTriggering] = useState<boolean>(false);
  const [deciding, setDeciding] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const itemIdRef = useRef<string | null | undefined>(itemId);
  itemIdRef.current = itemId;
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptsRef = useRef<number>(0);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadRun = useCallback(async (): Promise<ExtractionRunDTO | null> => {
    const id = itemIdRef.current;
    if (!id) return null;
    try {
      const result = await fetchLatestExtractionRun(id);
      return result;
    } catch (cause) {
      const message =
        cause instanceof CatalogImportError ? cause.message : 'Failed to load extraction.';
      if (isMountedRef.current) setError(message);
      return null;
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const id = itemIdRef.current;
    if (!id) {
      setRun(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await loadRun();
      if (!isMountedRef.current) return;
      setRun(result);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [loadRun]);

  // A run is pollable if it's in a non-terminal, non-superseded state.
  // Includes 'retry_wait' — a run waiting for retry is still in progress.
  const isPollable = useCallback(
    (jobState: string | null | undefined): boolean => {
      return jobState === 'queued' || jobState === 'running' || jobState === 'retry_wait';
    },
    [],
  );

  // Poll while the run is queued, running, or retry_wait.
  const pollUntilTerminal = useCallback(async (): Promise<void> => {
    clearPollTimer();
    const id = itemIdRef.current;
    if (!id) return;

    pollAttemptsRef.current += 1;
    if (pollAttemptsRef.current > MAX_POLL_ATTEMPTS) {
      if (isMountedRef.current) {
        setError('Extraction is taking longer than expected. You can continue reviewing manually.');
      }
      return;
    }

    const result = await loadRun();
    if (!isMountedRef.current) return;

    if (result && isPollable(result.jobState)) {
      setRun(result);
      pollTimerRef.current = setTimeout(() => {
        void pollUntilTerminal();
      }, POLL_INTERVAL_MS);
    } else {
      setRun(result);
    }
  }, [clearPollTimer, loadRun, isPollable]);

  // Initial load. Reset poll state on item change to avoid carrying over
  // the previous item's poll attempts.
  useEffect(() => {
    isMountedRef.current = true;
    pollAttemptsRef.current = 0;
    clearPollTimer();
    setRun(null);
    void refresh();
    return () => {
      isMountedRef.current = false;
      clearPollTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Start polling if the loaded run is pollable. This effect is the single
  // polling entry point — triggerExtraction does NOT call pollUntilTerminal
  // directly to avoid a double-poll race.
  useEffect(() => {
    if (run && isPollable(run.jobState)) {
      pollAttemptsRef.current = 0;
      void pollUntilTerminal();
    }
    return () => clearPollTimer();
  }, [run?.jobState, pollUntilTerminal, clearPollTimer, isPollable]);

  const triggerExtraction = useCallback(async (): Promise<void> => {
    const id = itemIdRef.current;
    if (!id || triggering) return;
    setTriggering(true);
    setError(null);
    try {
      await triggerExtractionRun(id);
      // Reload to get the new run. The polling useEffect will start
      // polling automatically when run.jobState changes — we do NOT
      // call pollUntilTerminal here to avoid a double-poll race.
      pollAttemptsRef.current = 0;
      const result = await loadRun();
      if (!isMountedRef.current) return;
      setRun(result);
    } catch (cause) {
      if (!isMountedRef.current) return;
      const message =
        cause instanceof CatalogImportError ? cause.message : 'Couldn’t start extraction.';
      setError(message);
    } finally {
      if (isMountedRef.current) setTriggering(false);
    }
  }, [triggering, loadRun, pollUntilTerminal]);

  const decide = useCallback(
    async (
      fieldName: string,
      decision: FieldDecisionKind,
      baseFieldRevision: string,
      finalValue?: unknown,
      candidateId?: string,
    ): Promise<void> => {
      const id = itemIdRef.current;
      if (!id || !run || deciding) return;
      setDeciding(true);
      setError(null);
      try {
        await applyFieldDecision(id, {
          runId: run.id,
          candidateId,
          fieldName,
          decision,
          finalValue,
          baseFieldRevision,
        });
        if (!isMountedRef.current) return;
        // Refresh the run to reflect the decision.
        await refresh();
      } catch (cause) {
        if (!isMountedRef.current) return;
        const message =
          cause instanceof CatalogImportError ? cause.message : 'Couldn’t save your decision.';
        setError(message);
      } finally {
        if (isMountedRef.current) setDeciding(false);
      }
    },
    [run, deciding, refresh],
  );

  const decideBulk = useCallback(
    async (
      baseFieldRevision: string,
      decisions: Array<{
        fieldName: string;
        decision: FieldDecisionKind;
        finalValue?: unknown;
        candidateId?: string;
      }>,
    ): Promise<BulkFieldDecisionResult> => {
      const id = itemIdRef.current;
      if (!id || !run) {
        return { applied: 0, rejected: 0, conflicts: [] };
      }
      setDeciding(true);
      setError(null);
      try {
        const result = await applyBulkFieldDecisions(id, {
          baseFieldRevision,
          decisions: decisions.map((d) => ({
            runId: run.id,
            candidateId: d.candidateId,
            fieldName: d.fieldName,
            decision: d.decision,
            finalValue: d.finalValue,
          })),
        });
        if (!isMountedRef.current) return result;
        await refresh();
        return result;
      } catch (cause) {
        if (!isMountedRef.current) {
          return { applied: 0, rejected: 0, conflicts: [] };
        }
        const message =
          cause instanceof CatalogImportError ? cause.message : 'Couldn’t save your decisions.';
        setError(message);
        return { applied: 0, rejected: 0, conflicts: [] };
      } finally {
        if (isMountedRef.current) setDeciding(false);
      }
    },
    [run, refresh],
  );

  // ── Derived state ──────────────────────────────────────────────────────
  const isAvailable = run?.outcome !== 'unavailable_no_model';
  const isRunning = isPollable(run?.jobState);
  const isEmpty = run?.isEmpty ?? false;

  const candidatesByField = run?.candidates.reduce<Record<string, FieldCandidateDTO[]>>(
    (acc, c) => {
      if (c.abstained) return acc; // Skip abstained candidates.
      if (!acc[c.fieldName]) acc[c.fieldName] = [];
      acc[c.fieldName].push(c);
      return acc;
    },
    {},
  ) ?? {};

  const topCandidateFor = useCallback(
    (fieldName: string): FieldCandidateDTO | null => {
      const list = candidatesByField[fieldName];
      if (!list || list.length === 0) return null;
      return list[0];
    },
    [candidatesByField],
  );

  return {
    run,
    loading,
    triggering,
    deciding,
    error,
    isAvailable,
    isRunning,
    isEmpty,
    candidatesByField,
    topCandidateFor,
    triggerExtraction,
    decide,
    decideBulk,
    refresh,
  };
}
