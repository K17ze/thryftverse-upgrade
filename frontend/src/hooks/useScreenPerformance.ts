/**
 * useScreenPerformance — per-screen production performance telemetry hook.
 *
 * Wraps a screen to measure four flagship-critical metrics:
 *   1. Time to first render (TTFR) — wall-clock from hook mount to the
 *      `onReady()` callback, which the screen calls when its primary
 *      content is ready for interaction.
 *   2. Frame drops during the first 2 seconds — slow + frozen frames
 *      counted via the shared `frameTracker` rAF loop.
 *   3. JS-thread FPS — rolling FPS at the end of the 2-second window.
 *   4. Screen transition duration — wall-clock from mount to first paint
 *      (measured via `requestAnimationFrame` after mount).
 *
 * Telemetry routing:
 *   - __DEV__: metrics are logged to the console for immediate feedback.
 *   - Production (1% sample): metrics are sent to PostHog as a
 *     `screen_performance` event with `screen_load_time`,
 *     `frame_drop_count`, `js_thread_fps`, and `transition_duration`
 *     properties. The sampling decision is made once per session in
 *     `performanceMonitor.ts`.
 *
 * Usage:
 * ```tsx
 * function ProductDetailScreen() {
 *   const { onReady } = useScreenPerformance('ProductDetailScreen');
 *   // ... fetch data, render content ...
 *   useEffect(() => { onReady(); }, [data]);
 *   return <Content />;
 * }
 * ```
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  getFrameStats,
  resetFrameCounters,
  initFrameTracking,
} from '../platform/monitoring/frameTracker';
import {
  reportScreenPerformance,
  isPerformanceSamplingEnabled,
} from '../platform/monitoring/performanceMonitor';

/** Measurement window after mount — frame drops are counted during this period. */
const MEASUREMENT_WINDOW_MS = 2000;

export interface UseScreenPerformanceResult {
  /** Call when the screen's primary content is ready for interaction. */
  onReady: () => void;
}

/**
 * Track per-screen performance metrics and route them to PostHog (production)
 * or console (dev).
 *
 * @param screenName  Screen/route name for telemetry attribution.
 * @returns `{ onReady }` — call `onReady()` when content is ready.
 */
export function useScreenPerformance(
  screenName: string,
): UseScreenPerformanceResult {
  const mountTimeRef = useRef<number>(0);
  const firstPaintTimeRef = useRef<number>(0);
  const readyRef = useRef(false);

  useEffect(() => {
    const now =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    mountTimeRef.current = now;
    readyRef.current = false;

    if (isPerformanceSamplingEnabled()) {
      initFrameTracking();
      resetFrameCounters();
    }

    const raf = requestAnimationFrame(() => {
      firstPaintTimeRef.current =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
    });

    const measurementTimer = setTimeout(() => {
      if (!readyRef.current) {
        const stats = getFrameStats();
        reportScreenPerformance(screenName, {
          screen_load_time:
            (typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : Date.now()) - mountTimeRef.current,
          frame_drop_count: stats.slowFrameCount + stats.frozenFrameCount,
          js_thread_fps: stats.rollingFps,
          transition_duration: firstPaintTimeRef.current - mountTimeRef.current,
        });
      }
    }, MEASUREMENT_WINDOW_MS);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(measurementTimer);
    };
  }, [screenName]);

  const onReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;

    const now =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    const stats = getFrameStats();
    reportScreenPerformance(screenName, {
      screen_load_time: now - mountTimeRef.current,
      frame_drop_count: stats.slowFrameCount + stats.frozenFrameCount,
      js_thread_fps: stats.rollingFps,
      transition_duration: firstPaintTimeRef.current - mountTimeRef.current,
    });
  }, [screenName]);

  return { onReady };
}
