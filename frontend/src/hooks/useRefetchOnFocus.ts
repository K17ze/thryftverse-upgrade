import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

const REFETCH_DEBOUNCE_MS = 5_000;

/**
 * Refetches a single React Query on screen focus. Designed for critical
 * screens (Inbox, Orders, Wallet, Auctions, Cart) where stale data is
 * unacceptable after the user returns to the screen.
 *
 * Behaviour:
 *  - Fires `queryClient.refetchQueries({ queryKey })` when the screen gains focus.
 *  - Debounced: won't refetch more than once per 5 seconds per query key.
 *  - Non-blocking: refetch is fire-and-forget (`.catch(() => {})`).
 *  - `enabled` defaults to `true`; pass `false` to suspend refetching
 *    (e.g. when the device is offline).
 *
 * @param queryKey - The React Query key to refetch on focus.
 * @param enabled  - Whether refetch-on-focus is active (default `true`).
 */
export function useRefetchOnFocus(queryKey: QueryKey, enabled: boolean = true) {
  const queryClient = useQueryClient();
  const lastRefetchRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      const now = Date.now();
      if (now - lastRefetchRef.current < REFETCH_DEBOUNCE_MS) return;
      lastRefetchRef.current = now;

      queryClient
        .refetchQueries({ queryKey })
        .catch(() => {});
    }, [queryClient, queryKey, enabled]),
  );
}

/**
 * Refetches multiple React Queries on screen focus. Useful for screens that
 * depend on several data sources (e.g. Wallet showing balance + activity).
 *
 * Shares the same debounce, non-blocking, and `enabled` semantics as
 * `useRefetchOnFocus`. The debounce is shared across all keys so a single
 * focus event triggers at most one batched refetch per 5 seconds.
 *
 * @param queryKeys - The React Query keys to refetch on focus.
 * @param enabled   - Whether refetch-on-focus is active (default `true`).
 */
export function useRefetchOnFocusMultiple(queryKeys: QueryKey[], enabled: boolean = true) {
  const queryClient = useQueryClient();
  const lastRefetchRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      const now = Date.now();
      if (now - lastRefetchRef.current < REFETCH_DEBOUNCE_MS) return;
      lastRefetchRef.current = now;

      for (const queryKey of queryKeys) {
        queryClient
          .refetchQueries({ queryKey })
          .catch(() => {});
      }
    }, [queryClient, queryKeys, enabled]),
  );
}
