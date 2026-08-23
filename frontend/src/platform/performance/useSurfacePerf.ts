/**
 * useSurfacePerf — React hook that wraps the ThryftPerformance native module
 * for component-level surface instrumentation.
 *
 * On mount, the hook starts a surface measurement and marks the first frame.
 * It exposes a `markInteractive` callback that the component calls once it is
 * actually interactive (e.g. after the primary list has rendered its items
 * and the first input handler is attached). When the native module is not
 * linked, the hook no-ops so components can use it unconditionally.
 *
 * @example
 * ```tsx
 * function HomeFeedScreen() {
 *   const { markInteractive } = useSurfacePerf('HomeFeed');
 *   // Call markInteractive() once the feed is interactive.
 * }
 * ```
 */

import { useCallback, useEffect, useRef } from 'react';
import { getPerformanceModule } from './index';
import type { PerfMetric, SurfaceName } from './ThryftPerformance';

export interface UseSurfacePerfResult {
  /** Mark the surface as interactive. Safe to call multiple times. */
  markInteractive: () => void;
  /** Mark that the camera preview became ready (Camera surface only). */
  markCameraReady: () => void;
  /** Read the finalised metrics for this surface session. */
  getMetrics: () => Promise<PerfMetric>;
  /** The session ID assigned by the native module (null until assigned). */
  sessionId: string | null;
}

/**
 * Start a surface measurement on mount and expose interaction markers.
 *
 * @param surface The product surface being instrumented.
 * @returns Markers and the session ID for the current surface session.
 */
export function useSurfacePerf(surface: SurfaceName): UseSurfacePerfResult {
  const sessionIdRef = useRef<string | null>(null);
  const interactiveMarkedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const perf = getPerformanceModule();

    (async () => {
      try {
        const sessionId = await perf.startSurfaceMeasurement(surface);
        if (cancelled) return;
        sessionIdRef.current = sessionId;
        await perf.markFirstFrame(sessionId);
      } catch {
        // Best-effort instrumentation — never crash the surface.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [surface]);

  const markInteractive = useCallback(() => {
    if (interactiveMarkedRef.current) return;
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    interactiveMarkedRef.current = true;
    const perf = getPerformanceModule();
    void perf.markInteractive(sessionId).catch(() => {
      // Best-effort.
    });
  }, []);

  const markCameraReady = useCallback(() => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    const perf = getPerformanceModule();
    void perf.markCameraReady(sessionId).catch(() => {
      // Best-effort.
    });
  }, []);

  const getMetrics = useCallback(async (): Promise<PerfMetric> => {
    const sessionId = sessionIdRef.current;
    const perf = getPerformanceModule();
    if (!sessionId) {
      return {
        surface,
        ttffMs: 0,
        ttiMs: 0,
        fidMs: 0,
        fidType: '',
        timestamp: Date.now(),
        sessionId: '',
      };
    }
    try {
      return await perf.getMetrics(sessionId);
    } catch {
      return {
        surface,
        ttffMs: 0,
        ttiMs: 0,
        fidMs: 0,
        fidType: '',
        timestamp: Date.now(),
        sessionId,
      };
    }
  }, [surface]);

  return {
    markInteractive,
    markCameraReady,
    getMetrics,
    sessionId: sessionIdRef.current,
  };
}
