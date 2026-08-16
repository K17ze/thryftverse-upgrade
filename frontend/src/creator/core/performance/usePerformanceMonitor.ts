/**
 * usePerformanceMonitor — creator-specific performance monitoring hook.
 *
 * Starts frame profiling on mount, returns current metrics, and optionally
 * fires a haptic alert when FPS drops below a configurable threshold.
 *
 * The hook uses Reanimated's `useFrameCallback` to measure real UI-thread
 * frame deltas (the worklet runs on the UI thread at display refresh rate).
 * JS-thread frame deltas are measured via `requestAnimationFrame` on the
 * JS thread. Both are recorded into the shared `FrameProfiler` singleton.
 *
 * Per AGENTS.md §11: all metrics are real measurements — no estimates.
 *
 * Usage:
 *   const metrics = usePerformanceMonitor({
 *     enabled: __DEV__,
 *     fpsAlertThreshold: 45,
 *   });
 */

import React from 'react';
import {
  useFrameCallback,
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { FrameProfiler, type FrameMetrics } from './FrameProfiler';

// ── Types ──────────────────────────────────────────────────────────────

export interface UsePerformanceMonitorOptions {
  /** Whether profiling is active. Default: __DEV__ only. */
  enabled?: boolean;
  /**
   * FPS threshold below which a haptic warning fires.
   * Set to 0 to disable. Default: 0 (disabled).
   */
  fpsAlertThreshold?: number;
  /**
   * Number of consecutive sub-threshold frames before the haptic fires.
   * Default: 30 (≈0.5s at 60fps) — avoids noise from transient drops.
   */
  alertConsecutiveFrames?: number;
  /**
   * Haptic callback fired when the alert threshold is breached.
   * Defaults to a light haptic via the shared haptics module.
   */
  onAlert?: () => void;
  /**
   * Update interval for the returned metrics (ms). The hook polls the
   * profiler at this rate to avoid React re-renders on every frame.
   * Default: 500ms (2Hz).
   */
  updateIntervalMs?: number;
}

export interface UsePerformanceMonitorResult {
  /** Current rolling metrics from the profiler. */
  metrics: FrameMetrics;
}

// ── Defaults ───────────────────────────────────────────────────────────

const DEFAULT_FPS_ALERT_THRESHOLD = 0;
const DEFAULT_ALERT_CONSECUTIVE = 30;
const DEFAULT_UPDATE_INTERVAL = 500;

// ── Hook ───────────────────────────────────────────────────────────────

export function usePerformanceMonitor(
  options: UsePerformanceMonitorOptions = {},
): UsePerformanceMonitorResult {
  const {
    enabled = __DEV__,
    fpsAlertThreshold = DEFAULT_FPS_ALERT_THRESHOLD,
    alertConsecutiveFrames = DEFAULT_ALERT_CONSECUTIVE,
    onAlert,
    updateIntervalMs = DEFAULT_UPDATE_INTERVAL,
  } = options;

  const profiler = FrameProfiler.getInstance();
  const [metrics, setMetrics] = React.useState<FrameMetrics>(profiler.getMetrics());

  // ── Enable / disable profiling on mount / unmount ───────────────────
  React.useEffect(() => {
    if (!enabled) return;
    profiler.setEnabled(true);
    profiler.reset();

    return () => {
      profiler.setEnabled(false);
      profiler.reset();
    };
  }, [enabled, profiler]);

  // ── Poll metrics at a fixed rate ────────────────────────────────────
  React.useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      setMetrics(profiler.getMetrics());
    }, updateIntervalMs);

    return () => clearInterval(interval);
  }, [enabled, profiler, updateIntervalMs]);

  // ── UI-thread frame timing via Reanimated worklet ───────────────────
  // The worklet runs on the UI thread at display refresh rate. We compute
  // the delta between successive frames and bridge it to JS via runOnJS
  // so the profiler (which lives on the JS thread) can record it.
  const lastUITimestamp = useSharedValue<number | null>(null);
  const lowFpsStreak = useSharedValue(0);

  // Stable callback for recording UI-thread frames on the JS thread.
  const recordUIFrame = React.useCallback(
    (deltaMs: number) => {
      profiler.recordUIThreadFrame(deltaMs);
    },
    [profiler],
  );

  // Stable callback for the haptic alert.
  const fireAlert = React.useCallback(() => {
    if (onAlert) {
      onAlert();
    } else {
      // Default: light haptic. Import lazily to avoid a hard dependency
      // on the haptics module in case it's not available in test contexts.
      try {
        const { triggerHaptic, HapticType } = require('../../../utils/haptics') as {
          triggerHaptic: (t: string) => Promise<void>;
          HapticType: { WARNING: string };
        };
        triggerHaptic(HapticType.WARNING as string).catch(() => {});
      } catch {
        // Haptics not available — silent fallback
      }
    }
  }, [onAlert]);

  // Only activate the frame callback when enabled and threshold > 0
  const activateCallback = enabled;
  const needAlert = fpsAlertThreshold > 0;

  useFrameCallback(
    () => {
      'worklet';
      if (!activateCallback) return;

      const now = performance.now();
      const last = lastUITimestamp.value;
      lastUITimestamp.value = now;

      if (last == null) return;

      const deltaMs = now - last;
      // Ignore gaps > 1s (app backgrounded / navigation transitions)
      if (deltaMs > 1000 || deltaMs <= 0) {
        lowFpsStreak.value = 0;
        return;
      }

      // Bridge to JS thread for recording
      runOnJS(recordUIFrame)(deltaMs);

      // Alert logic: count consecutive sub-threshold frames
      if (needAlert) {
        const instantFps = 1000 / deltaMs;
        if (instantFps < fpsAlertThreshold) {
          lowFpsStreak.value += 1;
          if (lowFpsStreak.value === alertConsecutiveFrames) {
            runOnJS(fireAlert)();
          }
        } else {
          lowFpsStreak.value = 0;
        }
      }
    },
    activateCallback, // autostart — only runs when enabled
  );

  // ── JS-thread frame timing via requestAnimationFrame ────────────────
  React.useEffect(() => {
    if (!enabled) return;

    let rafId: number;
    let lastJS: number | null = null;

    const tick = () => {
      const now = performance.now();
      if (lastJS != null) {
        const deltaMs = now - lastJS;
        if (deltaMs > 0 && deltaMs < 1000) {
          profiler.recordJSThreadFrame(deltaMs);
        }
      }
      lastJS = now;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [enabled, profiler]);

  return { metrics };
}
