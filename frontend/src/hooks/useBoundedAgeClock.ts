import { useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * useBoundedAgeClock — a lightweight periodic re-render trigger for
 * freshness/age displays.
 *
 * Problem (U66): when freshness is computed with `Date.now()` inside a
 * `useMemo`, the age label freezes because the memo only re-evaluates
 * when its dependencies change.  Without a periodic re-render the user
 * sees a stale "12s ago" that never advances.
 *
 * Solution: this hook returns a monotonically increasing `tick` value
 * that updates on a bounded interval.  Components that display age
 * consume `tick` as a dependency so their age computation re-runs on
 * every tick.
 *
 * Bounded: the interval stops once the observed timestamp exceeds
 * `maxAgeMs` (default 24h).  This prevents an unbounded timer running
 * forever for assets that haven't traded in days — the age label is
 * already "Xd ago" and won't meaningfully change for another day.
 *
 * Foreground/reconnect invalidation: when the app returns to the
 * foreground (AppState 'active'), the clock immediately emits a fresh
 * tick and restarts the interval so the age label is correct the
 * moment the user looks at the screen, not 30s later.
 *
 * Usage:
 *   const tick = useBoundedAgeClock(lastTradeTimestampMs);
 *   const ageSeconds = lastTradeTimestampMs
 *     ? (Date.now() - lastTradeTimestampMs) / 1000
 *     : null;
 *   // ageSeconds recomputes on every tick because the component re-renders
 *
 * @param observedAtMs  Epoch milliseconds of the observation whose age
 *                     is being displayed.  `null` when no observation
 *                     exists yet (the clock stays idle).
 * @param intervalMs   Tick interval.  Default 30 000 (30s) — coarse
 *                     enough for "12s ago" / "3m ago" labels without
 *                     burning battery.
 * @param maxAgeMs     Age beyond which the clock stops ticking.
 *                     Default 86 400 000 (24h).
 * @returns A `tick` number that changes on every interval and on every
 *          foreground return.  Consume it as a dependency or render-time
 *          value to trigger age recomputation.
 */
export function useBoundedAgeClock(
  observedAtMs: number | null,
  intervalMs: number = 30_000,
  maxAgeMs: number = 86_400_000,
): number {
  const [tick, setTick] = useState(0);
  const observedRef = useRef(observedAtMs);
  observedRef.current = observedAtMs;

  useEffect(() => {
    if (observedAtMs == null) return;

    // If the observation is already older than the bound, emit one tick
    // so the initial render is correct, then go idle.
    const ageMs = Date.now() - observedAtMs;
    if (ageMs > maxAgeMs) {
      setTick((t) => t + 1);
      return;
    }

    const id = setInterval(() => {
      const currentAge = Date.now() - (observedRef.current ?? 0);
      setTick((t) => t + 1);
      if (currentAge > maxAgeMs) {
        clearInterval(id);
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [observedAtMs, intervalMs, maxAgeMs]);

  // Foreground revalidation — emit an immediate tick when the app
  // returns to the foreground so the age label is correct instantly.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        setTick((t) => t + 1);
      }
    });
    return () => subscription?.remove();
  }, []);

  return tick;
}
