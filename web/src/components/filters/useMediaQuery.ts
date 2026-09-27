import { useCallback, useSyncExternalStore } from 'react';

/**
 * useMediaQuery — reactive media-query truth via useSyncExternalStore
 * (same mechanism as useResultColumns): the snapshot corrects during the
 * hydration commit, so breakpoint-gated chrome never flashes the wrong
 * variant and resize crossings are observed, not polled.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false, // server snapshot — corrected before first paint
  );
}
