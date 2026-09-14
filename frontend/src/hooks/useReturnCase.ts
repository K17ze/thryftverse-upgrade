import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getOrderReturnCase } from '../services/returnsApi';
import type { ReturnCase, ReturnCaseEvent } from '../services/returnsApi';

export interface UseReturnCaseResult {
  returnCase: ReturnCase | null;
  events: ReturnCaseEvent[];
  /** True only for the first load — subsequent refreshes are silent. */
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Fetches the active return case for an order. A 404 (no case) maps to
 * `returnCase: null` — that is a valid state, not an error. Other failures
 * keep the last known case so a transient error doesn't blank the card.
 */
export function useReturnCase(orderId: string | undefined): UseReturnCaseResult {
  const [returnCase, setReturnCase] = useState<ReturnCase | null>(null);
  const [events, setEvents] = useState<ReturnCaseEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!orderId) {
      setIsLoading(false);
      return;
    }
    try {
      const result = await getOrderReturnCase(orderId);
      if (!isMountedRef.current) return;
      setReturnCase(result?.returnCase ?? null);
      setEvents(result?.events ?? []);
    } catch {
      // Keep the last known state on transient failures.
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    setIsLoading(true);
    void refresh();
  }, [refresh]);

  // Refetch when the screen regains focus so seller-side updates (label
  // issued, decision made) surface without a manual refresh.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { returnCase, events, isLoading, refresh };
}
