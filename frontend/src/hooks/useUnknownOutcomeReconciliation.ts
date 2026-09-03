/**
 * Generic unknown-outcome reconciliation for money mutations.
 *
 * When a money mutation (offer, payout, bid) is submitted but the response
 * is lost (network timeout, app killed), the outcome is ambiguous — the
 * server may have committed the mutation or may not have. Telling the user
 * "it failed" invites an unsafe retry that could create a duplicate. Telling
 * the user "it succeeded" without verification is dishonest.
 *
 * The correct UX is:
 *   1. Show an "unknown_outcome" state — "We are checking your request."
 *   2. Poll the backend's lookup-by-idempotency-key endpoint.
 *   3. If the mutation is found → treat as succeeded.
 *   4. If the mutation is not found after a grace period → treat as
 *      safe_to_retry (the user may resubmit).
 *   5. If the lookup endpoint is transiently unavailable → keep polling
 *      up to a maximum, then surface a "check your account later" state.
 *
 * This hook encapsulates that polling loop so every money-mutation screen
 * gets the same reconciliation behaviour without duplicating the logic.
 *
 * ## Usage
 *
 * ```ts
 * const { reconcile, isReconciling } = useUnknownOutcomeReconciliation();
 *
 * // In the catch block of a money mutation:
 * if (isNetworkError && idempotencyKey) {
 *   setStage('unknown_outcome');
 *   const result = await reconcile({
 *     lookup: () => lookupOfferByIdempotencyKey(idempotencyKey),
 *     onAcknowledged: (offer) => { /* handle success *\/ },
 *     onSafeToRetry: () => { /* reset to form *\/ },
 *     shouldContinue: () => isMountedRef.current,
 *   });
 * }
 * ```
 */

import { useCallback, useRef, useState } from 'react';

/** Maximum number of poll attempts before giving up. */
const MAX_POLL_ATTEMPTS = 8;

/** Base delay between polls (ms). Doubles each attempt (exponential backoff). */
const BASE_POLL_INTERVAL_MS = 1_500;

/** Maximum delay between polls (ms). */
const MAX_POLL_INTERVAL_MS = 10_000;

/** Result of a single lookup call. */
export type LookupResult<T> =
  | { status: 'acknowledged'; value: T }
  | { status: 'safe_to_retry' }
  | { status: 'processing' };

/** Final reconciliation outcome. */
export type ReconciliationOutcome<T> =
  | { outcome: 'acknowledged'; value: T }
  | { outcome: 'safe_to_retry' }
  | { outcome: 'unresolved' };

function wait(ms: number, shouldContinue: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(true);
    }, ms);
    // If the caller signals stop, resolve early with false so the loop
    // can break without waiting.
    const interval = setInterval(() => {
      if (!shouldContinue()) {
        clearTimeout(timer);
        clearInterval(interval);
        resolve(false);
      }
    }, 200);
  });
}

/**
 * Hook for unknown-outcome reconciliation polling.
 *
 * Returns a `reconcile` function that polls a lookup endpoint and a
 * `isReconciling` flag for UI state.
 */
export function useUnknownOutcomeReconciliation() {
  const [isReconciling, setIsReconciling] = useState(false);
  const activeReconciliationRef = useRef(false);

  const reconcile = useCallback(async <T,>(
    options: {
      /** The lookup function to call on each poll. */
      lookup: () => Promise<LookupResult<T>>;
      /** Called when the mutation is confirmed to exist. */
      onAcknowledged?: (value: T) => void;
      /** Called when the mutation is confirmed to not exist (safe to retry). */
      onSafeToRetry?: () => void;
      /** Called when the grace period expires without resolution. */
      onUnresolved?: () => void;
      /** Returns false to abort the polling loop (e.g. component unmounted). */
      shouldContinue: () => boolean;
    },
  ): Promise<ReconciliationOutcome<T>> => {
    // Prevent concurrent reconciliation loops for the same screen.
    if (activeReconciliationRef.current) {
      return { outcome: 'unresolved' };
    }
    activeReconciliationRef.current = true;
    setIsReconciling(true);

    try {
      let delayMs = BASE_POLL_INTERVAL_MS;

      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        if (!options.shouldContinue()) {
          return { outcome: 'unresolved' };
        }

        // Wait before polling (skip on first attempt for immediate check).
        if (attempt > 0) {
          const waited = await wait(delayMs, options.shouldContinue);
          if (!waited) {
            return { outcome: 'unresolved' };
          }
          delayMs = Math.min(delayMs * 2, MAX_POLL_INTERVAL_MS);
        }

        if (!options.shouldContinue()) {
          return { outcome: 'unresolved' };
        }

        let result: LookupResult<T>;
        try {
          result = await options.lookup();
        } catch {
          // Network error during lookup — treat as 'processing' and retry.
          continue;
        }

        if (result.status === 'acknowledged') {
          options.onAcknowledged?.(result.value);
          return { outcome: 'acknowledged', value: result.value };
        }

        if (result.status === 'safe_to_retry') {
          // On the first attempt, a 404 is conclusive — the mutation
          // was not committed. On later attempts, it's still conclusive
          // because the idempotency key check is deterministic.
          options.onSafeToRetry?.();
          return { outcome: 'safe_to_retry' };
        }

        // 'processing' — the server returned a transient error or the
        // mutation is still being committed. Keep polling.
      }

      // Exhausted all attempts without resolution.
      options.onUnresolved?.();
      return { outcome: 'unresolved' };
    } finally {
      activeReconciliationRef.current = false;
      setIsReconciling(false);
    }
  }, []);

  return { reconcile, isReconciling };
}
