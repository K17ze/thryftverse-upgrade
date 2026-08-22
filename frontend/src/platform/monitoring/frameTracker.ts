/**
 * JS-thread frame-time tracking and slow/frozen-frame reporting.
 *
 * Sentry's `enableNativeFramesTracking` already attaches slow/frozen-frame
 * measurements to *root* spans created by the SDK's own integrations (screen
 * loads, interactions). This module adds complementary, continuous JS-thread
 * frame-time surveillance that runs independently of any single transaction:
 *
 *  - A `requestAnimationFrame` loop samples the wall-clock delta between
 *    successive frames. A delta > 16ms is a "slow" frame (dropped from a
 *    60fps budget); a delta > 50ms is a "frozen" frame (visible hitch).
 *  - Frame deltas are retained in a rolling 1-second window so a rolling
 *    frame rate and P50/P90/P99 frame times can be computed at any moment.
 *  - Frozen frames are reported as Sentry breadcrumbs in real time (throttled
 *    to avoid breadcrumb flooding during sustained jank).
 *  - Every 30 seconds an aggregate breadcrumb is emitted with the windowed
 *    frame-rate and P50/P90/P99 frame times, giving Sentry a periodic
 *    heartbeat of JS-thread health across the session.
 *
 * Why `requestAnimationFrame` rather than Reanimated's `useFrameCallback`:
 * `useFrameCallback` is a React hook and so can only run inside a component.
 * Frame surveillance must outlive any single screen, so a module-level rAF
 * loop is the correct primitive. rAF fires once per display refresh on the JS
 * thread, so its inter-frame delta is an accurate proxy for JS-thread frame
 * time. (True UI-thread frame time is already captured by Sentry's native
 * frames tracking; this module focuses on the JS thread, which is where
 * application jank originates.)
 *
 * All Sentry calls are guarded by `isSentryAvailable()` and wrapped in
 * try/catch so observability never crashes the app.
 */

import { Sentry, isSentryAvailable } from './sentry';

/** Frame is considered "slow" when it exceeds a 60fps budget (16.67ms). */
const SLOW_FRAME_MS = 16;
/** Frame is considered "frozen" when it exceeds 50ms (visible hitch). */
const FROZEN_FRAME_MS = 50;
/** Rolling window length for frame-rate computation. */
const ROLLING_WINDOW_MS = 1000;
/** Interval between aggregate frame-stats breadcrumbs. */
const REPORT_INTERVAL_MS = 30_000;
/** Minimum gap between real-time frozen-frame breadcrumbs (throttle). */
const FROZEN_BREADCRUMB_THROTTLE_MS = 5_000;

interface FrameSample {
  /** Frame delta in milliseconds. */
  delta: number;
  /** Wall-clock timestamp (performance.now()) of the frame. */
  time: number;
}

let initialized = false;
let rafId: number | null = null;
let reportTimer: ReturnType<typeof setInterval> | null = null;
let lastFrameTime: number | null = null;

/** Frame deltas within the rolling window. */
let windowSamples: FrameSample[] = [];
/** Cumulative slow-frame count since the last aggregate report. */
let slowFrameCount = 0;
/** Cumulative frozen-frame count since the last aggregate report. */
let frozenFrameCount = 0;
/** Total frames observed since the last aggregate report. */
let totalFrameCount = 0;
/** Timestamp of the last real-time frozen-frame breadcrumb (throttle). */
let lastFrozenBreadcrumbTime = 0;

/**
 * Compute the percentile (0–100) of a sorted numeric array using linear
 * interpolation. Returns `0` for an empty array so callers never divide by
 * zero.
 */
function percentile(sorted: readonly number[], pct: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

/**
 * Add a Sentry breadcrumb. No-op when Sentry is unavailable. Used for both
 * real-time frozen-frame alerts and the periodic aggregate report.
 */
function addBreadcrumb(category: string, message: string, data: Record<string, number | string>): void {
  if (!isSentryAvailable()) return;
  try {
    const fn = (Sentry as Record<string, unknown>).addBreadcrumb;
    if (typeof fn === 'function') {
      (fn as (bc: Record<string, unknown>) => void)({
        category,
        type: 'info',
        level: 'info',
        message,
        data,
      });
    }
  } catch {
    // Observability must never crash the app.
  }
}

/**
 * The per-frame callback. Computes the delta from the previous frame, records
 * it in the rolling window, classifies it as slow/frozen, and emits a
 * throttled breadcrumb for frozen frames.
 */
function onFrame(): void {
  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const last = lastFrameTime;
  lastFrameTime = now;

  if (last == null) return;

  const delta = now - last;
  // Ignore absurd deltas (app backgrounded, debugger paused, first sample).
  if (delta <= 0 || delta > 5_000) return;

  windowSamples.push({ delta, time: now });
  // Trim the rolling window to the last ROLLING_WINDOW_MS.
  const cutoff = now - ROLLING_WINDOW_MS;
  while (windowSamples.length > 0 && windowSamples[0].time < cutoff) {
    windowSamples.shift();
  }

  totalFrameCount += 1;
  if (delta > FROZEN_FRAME_MS) {
    frozenFrameCount += 1;
    if (now - lastFrozenBreadcrumbTime >= FROZEN_BREADCRUMB_THROTTLE_MS) {
      lastFrozenBreadcrumbTime = now;
      addBreadcrumb('frame.frozen', `Frozen frame: ${delta.toFixed(1)}ms`, {
        delta_ms: Number(delta.toFixed(1)),
        threshold_ms: FROZEN_FRAME_MS,
      });
    }
  } else if (delta > SLOW_FRAME_MS) {
    slowFrameCount += 1;
  }
}

/**
 * Emit the periodic aggregate frame-stats breadcrumb with rolling frame rate
 * and P50/P90/P99 frame times, then reset the cumulative counters.
 */
function reportAggregate(): void {
  const samples = windowSamples;
  if (samples.length === 0) return;

  const deltas = samples.map((s) => s.delta).sort((a, b) => a - b);
  const rollingFps = Math.round((samples.length / ROLLING_WINDOW_MS) * 1000);
  const p50 = percentile(deltas, 50);
  const p90 = percentile(deltas, 90);
  const p99 = percentile(deltas, 99);

  addBreadcrumb('frame.stats', `Frame stats: ${rollingFps}fps (P50 ${p50.toFixed(1)}ms / P90 ${p90.toFixed(1)}ms / P99 ${p99.toFixed(1)}ms)`, {
    rolling_fps: rollingFps,
    p50_ms: Number(p50.toFixed(1)),
    p90_ms: Number(p90.toFixed(1)),
    p99_ms: Number(p99.toFixed(1)),
    slow_frames: slowFrameCount,
    frozen_frames: frozenFrameCount,
    total_frames: totalFrameCount,
    window_ms: ROLLING_WINDOW_MS,
  });

  // Reset cumulative counters for the next reporting interval.
  slowFrameCount = 0;
  frozenFrameCount = 0;
  totalFrameCount = 0;
}

/**
 * Initialise JS-thread frame-time tracking. Safe to call multiple times —
 * only the first call starts the rAF loop and the 30s aggregate timer; later
 * calls are no-ops. Call `stopFrameTracking()` to tear down.
 *
 * The loop runs regardless of whether Sentry is available so the rolling
 * window stays warm; breadcrumbs are simply dropped when Sentry is absent.
 * This keeps frame stats accurate if Sentry is initialised later in the
 * session.
 */
export function initFrameTracking(): void {
  if (initialized) return;
  initialized = true;

  lastFrameTime = null;
  windowSamples = [];
  slowFrameCount = 0;
  frozenFrameCount = 0;
  totalFrameCount = 0;
  lastFrozenBreadcrumbTime = 0;

  const scheduleFrame =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : undefined;

  if (scheduleFrame) {
    const loop = () => {
      onFrame();
      rafId = scheduleFrame(loop);
    };
    rafId = scheduleFrame(loop);
  }

  reportTimer = setInterval(reportAggregate, REPORT_INTERVAL_MS);
}

/**
 * Stop frame tracking and release the rAF loop and interval timer. Safe to
 * call when tracking was never initialised or already stopped.
 */
export function stopFrameTracking(): void {
  if (rafId != null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (reportTimer != null) {
    clearInterval(reportTimer);
    reportTimer = null;
  }
  initialized = false;
  lastFrameTime = null;
  windowSamples = [];
}

/**
 * Whether frame tracking is currently running.
 */
export function isFrameTrackingActive(): boolean {
  return initialized;
}

/** Snapshot of frame statistics at a point in time. */
export interface FrameStatsSnapshot {
  /** Rolling JS-thread FPS over the last 1-second window. */
  rollingFps: number;
  /** Cumulative slow-frame count since the last aggregate report. */
  slowFrameCount: number;
  /** Cumulative frozen-frame count since the last aggregate report. */
  frozenFrameCount: number;
  /** Total frames observed since the last aggregate report. */
  totalFrameCount: number;
}

/**
 * Return the current frame statistics snapshot without resetting counters.
 *
 * Reads the rolling 1-second window and cumulative slow/frozen/total counts.
 * Use this to capture a point-in-time measurement (e.g. frame drops during a
 * screen's first 2 seconds) without disrupting the continuous tracking loop.
 */
export function getFrameStats(): FrameStatsSnapshot {
  const samples = windowSamples;
  const rollingFps =
    samples.length > 0
      ? Math.round((samples.length / ROLLING_WINDOW_MS) * 1000)
      : 0;
  return {
    rollingFps,
    slowFrameCount,
    frozenFrameCount,
    totalFrameCount,
  };
}

/**
 * Reset the cumulative slow/frozen/total frame counters without stopping the
 * tracking loop. Use this to start a fresh measurement window (e.g. when a
 * new screen mounts) so counts reflect only the current measurement period.
 */
export function resetFrameCounters(): void {
  slowFrameCount = 0;
  frozenFrameCount = 0;
  totalFrameCount = 0;
}
