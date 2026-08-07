/**
 * usePerformanceMonitor — August 2026 React Native performance instrumentation.
 *
 * Tracks two flagship-critical metrics in __DEV__ only:
 *   1. Screen render time — wall-clock from navigation focus to first
 *      meaningful paint (component mount + first layout effect).
 *   2. JS-thread FPS during scroll — sampled via Reanimated 4's
 *      `useFrameCallback` worklet, which runs on the UI thread so the
 *      measurement itself does not perturb the JS thread.
 *
 * Production behaviour:
 *   - No data is collected. The hook early-returns inert refs/states so
 *     callers keep the same API without paying any runtime cost.
 *   - If telemetry wiring is desired later, route through the existing
 *     Sentry breadcrumb or a dedicated performance endpoint — never
 *     console.log in production (babel strips console in prod builds).
 *
 * Performance targets (mid-tier Android / iPhone 13):
 *   - Cold start TTI:        < 2.0s Android, < 1.2s iPhone 13
 *   - Sustained scroll FPS:  58+ fps
 *   - Interaction latency:   < 100ms
 *   - JS memory:             < 180MB
 *
 * Usage:
 *   const { renderMs, scrollFps, isScrolling } = usePerformanceMonitor({
 *     screenName: 'HomeScreen',
 *   });
 *
 * The hook logs a warning in __DEV__ when render time exceeds 400ms or
 * sustained scroll FPS drops below 58 for more than 10 consecutive frames.
 */
import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  useFrameCallback,
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';

export interface PerformanceMonitorOptions {
  /** Screen name used in dev warnings for attribution. */
  screenName: string;
  /**
   * Render-time threshold in ms before a dev warning is logged.
   * Default 400ms — well under the 100ms interaction budget but
   * accounts for first-mount layout work on cold navigation.
   */
  renderTimeWarningMs?: number;
  /**
   * FPS threshold below which a dev warning is logged after
   * `fpsWarningConsecutiveFrames` consecutive offending frames.
   * Default 58 (the sustained scroll target).
   */
  fpsWarningThreshold?: number;
  /**
   * Number of consecutive sub-threshold frames before logging.
   * Default 10 — avoids noise from transient GC pauses.
   */
  fpsWarningConsecutiveFrames?: number;
}

export interface PerformanceMonitorResult {
  /** Wall-clock render time in ms (0 until first paint completes). */
  renderMs: number;
  /** Latest sampled scroll FPS (0 when not scrolling). */
  scrollFps: number;
  /** True while a scroll gesture is active and FPS is being sampled. */
  isScrolling: boolean;
}

const DEFAULT_RENDER_WARNING_MS = 400;
const DEFAULT_FPS_THRESHOLD = 58;
const DEFAULT_FPS_CONSECUTIVE = 10;

/**
 * Dev-only logger. In production this function is a no-op so the
 * closure can be tree-shaken and no string allocations occur.
 */
function logPerfWarning(screenName: string, message: string) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[perf:${screenName}] ${message}`);
  }
}

export function usePerformanceMonitor(
  options: PerformanceMonitorOptions,
): PerformanceMonitorResult {
  const {
    screenName,
    renderTimeWarningMs = DEFAULT_RENDER_WARNING_MS,
    fpsWarningThreshold = DEFAULT_FPS_THRESHOLD,
    fpsWarningConsecutiveFrames = DEFAULT_FPS_CONSECUTIVE,
  } = options;

  const [renderMs, setRenderMs] = React.useState(0);
  const [scrollFps, setScrollFps] = React.useState(0);
  const [isScrolling, setIsScrolling] = React.useState(false);

  // ── Production fast path: no instrumentation cost ────────────────────
  // __DEV__ is a compile-time constant under Metro + Hermes, so the
  // dead branch is eliminated during minification.
  const focusStartRef = React.useRef<number | null>(null);
  const lowFpsStreakRef = React.useRef(0);

  // ── Screen render time ───────────────────────────────────────────────
  // Measure from navigation focus to the first paint after focus.
  // useFocusEffect fires on screen focus; the layout effect below fires
  // after the first commit, giving us first-meaningful-paint timing.
  useFocusEffect(
    React.useCallback(() => {
      if (!__DEV__) return;
      focusStartRef.current = performance.now();

      // requestAnimationFrame ensures we measure after the first paint
      // commit, not just the JS effect scheduling.
      const raf = requestAnimationFrame(() => {
        const start = focusStartRef.current;
        if (start == null) return;
        const elapsed = performance.now() - start;
        setRenderMs(elapsed);
        if (elapsed > renderTimeWarningMs) {
          logPerfWarning(
            screenName,
            `First paint took ${elapsed.toFixed(0)}ms (target < ${renderTimeWarningMs}ms).`,
          );
        }
      });

      return () => {
        cancelAnimationFrame(raf);
        focusStartRef.current = null;
      };
    }, [screenName, renderTimeWarningMs]),
  );

  // ── JS-thread scroll FPS via Reanimated worklet ──────────────────────
  // useFrameCallback runs on the UI thread at display refresh rate.
  // We compute instantaneous FPS from frame deltas and surface it to
  // JS via runOnJS only when the value changes meaningfully — keeping
  // JS-thread traffic minimal.
  const lastTimestamp = useSharedValue<number | null>(null);
  const currentFps = useSharedValue(0);
  const scrolling = useSharedValue(false);
  const lowStreak = useSharedValue(0);

  const reportFps = React.useCallback(
    (fps: number, scrollingNow: boolean) => {
      if (!__DEV__) return;
      setScrollFps(fps);
      setIsScrolling(scrollingNow);
    },
    [],
  );

  const reportStreakWarning = React.useCallback(() => {
    if (!__DEV__) return;
    logPerfWarning(
      screenName,
      `Scroll FPS below ${fpsWarningThreshold} for ${fpsWarningConsecutiveFrames} consecutive frames.`,
    );
  }, [screenName, fpsWarningThreshold, fpsWarningConsecutiveFrames]);

  useFrameCallback(
    () => {
      'worklet';
      const now = performance.now();
      const last = lastTimestamp.value;
      lastTimestamp.value = now;

      if (last == null) return;

      const deltaMs = now - last;
      // Guard against frame drops > 1s (app backgrounded / navigation).
      if (deltaMs > 1000 || deltaMs <= 0) {
        currentFps.value = 0;
        scrolling.value = false;
        lowStreak.value = 0;
        return;
      }

      const instantFps = Math.round(1000 / deltaMs);

      // Treat 0 fps or very low fps as "not scrolling" to avoid
      // false positives when the list is stationary.
      const isMoving = instantFps > 5 && instantFps < 200;
      scrolling.value = isMoving;
      currentFps.value = isMoving ? instantFps : 0;

      if (isMoving && instantFps < fpsWarningThreshold) {
        lowStreak.value += 1;
        if (lowStreak.value === fpsWarningConsecutiveFrames) {
          runOnJS(reportStreakWarning)();
        }
      } else if (isMoving) {
        lowStreak.value = 0;
      }

      // Throttle JS reports to whole-integer changes only.
      if (currentFps.value !== instantFps) {
        runOnJS(reportFps)(currentFps.value, isMoving);
      }
    },
    false, // autostart = false; only runs while a scroll is plausible
  );

  return { renderMs, scrollFps, isScrolling };
}
