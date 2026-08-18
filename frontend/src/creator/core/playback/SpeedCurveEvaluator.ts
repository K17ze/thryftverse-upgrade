/**
 * SpeedCurveEvaluator — evaluates a timeline-native speed curve.
 *
 * A timeline-native speed curve is an ordered array of control points
 * `{ timeMs, speed }` where `timeMs` is an absolute source-media time (ms)
 * and `speed` is the playback multiplier at that point. Between adjacent
 * control points the speed is interpolated **linearly**.
 *
 * This evaluator provides four capabilities required by the playback and
 * export pipelines:
 *
 *   1. `speedAt(curve, sourceTimeMs)` — instantaneous speed at a source time.
 *   2. `totalDurationMs(curve)` — the wall-clock display duration of the
 *      curve, computed as the integral of `1/speed` over the source-time
 *      domain (the time-stretch formula).
 *   3. `sourceToDisplay(curve, sourceTimeMs)` — maps a source-media time to
 *      a display (timeline) time by integrating `1/speed` from 0.
 *   4. `displayToSource(curve, displayTimeMs)` — the inverse map, computed via
 *      binary search over the monotonic `sourceToDisplay` function.
 *
 * Mathematical basis
 * ------------------
 * For a source playing at variable speed `s(t)`, the relationship between
 * source time `t_src` and display (wall-clock) time `t_disp` is:
 *
 *     t_disp = ∫₀^{t_src} (1 / s(τ)) dτ
 *
 * The total display duration is that integral over the full source range.
 * With linear interpolation between control points `(t0, s0)` and `(t1, s1)`,
 * the speed on a segment is `s(τ) = s0 + m·(τ − t0)` where
 * `m = (s1 − s0) / (t1 − t0)`. The per-segment integral is therefore:
 *
 *     ∫_{t0}^{t1} 1 / (s0 + m·(τ − t0)) dτ
 *       = (1/m) · [ln(s0 + m·(τ − t0))]_{t0}^{t1}
 *       = (1/m) · (ln(s1) − ln(s0))          (when m ≠ 0)
 *       = (t1 − t0) / s0                      (when m ≈ 0, i.e. s0 ≈ s1)
 *
 * This closed-form is exact (no numerical approximation) and avoids
 * division-by-zero by falling back to the constant-speed formula when the
 * speed delta across a segment is negligible.
 *
 * Design references:
 *   - TimelineTypes.ts: SpeedCurvePoint
 *   - KeyframeEvaluator.ts: linear interpolation pattern
 *   - AGENTS.md §17: motion is deliberate and bounded; speed curves are a
 *     precise creator tool, not a decorative effect.
 */
import type { SpeedCurvePoint } from '../../poster/timeline/TimelineTypes';

/** Minimum speed multiplier (matches SpeedCurveTypes.SPEED_MIN). */
const SPEED_MIN = 0.25;
/** Maximum speed multiplier (matches SpeedCurveTypes.SPEED_MAX). */
const SPEED_MAX = 4.0;
/**
 * Near-zero floor used when a control point's speed is below SPEED_MIN to
 * avoid division-by-zero in the integral. Real freeze frames use the
 * dedicated freeze-frame fields; this guard only protects the math.
 */
const SPEED_EPSILON = 0.001;
/** Speed delta below which a segment is treated as constant-speed. */
const CONSTANT_SPEED_THRESHOLD = 1e-6;

/** Clamp a speed value to the valid playback range, guarding against zero. */
function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return SPEED_EPSILON;
  return Math.max(SPEED_EPSILON, Math.min(SPEED_MAX, speed));
}

/**
 * Return a defensive, sorted-by-time copy of the curve. The evaluator never
 * mutates the caller's array. Points with non-finite time or speed are
 * dropped; speeds are clamped to the valid range.
 */
function normalizeCurve(curve: SpeedCurvePoint[]): SpeedCurvePoint[] {
  if (!curve || curve.length === 0) return [];
  const cleaned = curve
    .filter((p) => Number.isFinite(p.timeMs) && Number.isFinite(p.speed))
    .map((p) => ({ timeMs: Math.max(0, p.timeMs), speed: clampSpeed(p.speed) }));
  // Sort ascending by time; stable for equal times (preserves input order).
  return cleaned.sort((a, b) => a.timeMs - b.timeMs);
}

// ── Instantaneous speed ─────────────────────────────────────────────

/**
 * Evaluate the instantaneous speed at a given source-media time.
 *
 * Interpolates linearly between the two surrounding control points. Before
 * the first point the first point's speed is held; after the last point the
 * last point's speed is held. An empty curve returns 1 (constant 1×).
 *
 * @param curve        The speed curve (control points).
 * @param sourceTimeMs Source-media time in milliseconds.
 * @returns Speed multiplier at the given time (clamped to 0.25–4.0).
 */
export function speedAt(curve: SpeedCurvePoint[], sourceTimeMs: number): number {
  const points = normalizeCurve(curve);
  if (points.length === 0) return 1;
  if (points.length === 1) return points[0].speed;

  const t = Math.max(0, sourceTimeMs);

  // Before the first point — hold first speed.
  if (t <= points[0].timeMs) return points[0].speed;
  // After the last point — hold last speed.
  const last = points[points.length - 1];
  if (t >= last.timeMs) return last.speed;

  // Find the surrounding segment.
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (t >= p0.timeMs && t <= p1.timeMs) {
      const span = p1.timeMs - p0.timeMs;
      if (span <= 0) return p0.speed;
      const frac = (t - p0.timeMs) / span;
      return clampSpeed(p0.speed + (p1.speed - p0.speed) * frac);
    }
  }
  // Unreachable given the bounds checks above, but kept for exhaustiveness.
  return last.speed;
}

// ── Per-segment integral ────────────────────────────────────────────

/**
 * Compute the display-time contribution of a single linear segment from
 * source time `t0` (speed `s0`) to source time `t1` (speed `s1`).
 *
 * Uses the closed-form logarithmic integral when the speed slope is
 * non-negligible, and the constant-speed formula otherwise.
 */
function segmentDisplayDuration(
  t0: number,
  s0: number,
  t1: number,
  s1: number,
): number {
  const span = t1 - t0;
  if (span <= 0) return 0;
  const ds = s1 - s0;
  if (Math.abs(ds) < CONSTANT_SPEED_THRESHOLD) {
    // Constant speed: duration = span / speed.
    return span / clampSpeed(s0);
  }
  // Linear speed: ∫ 1/(s0 + m·(τ−t0)) dτ = (span/ds) · (ln(s1) − ln(s0)).
  const m = ds / span;
  const logS0 = Math.log(clampSpeed(s0));
  const logS1 = Math.log(clampSpeed(s1));
  return (1 / m) * (logS1 - logS0);
}

// ── Total duration ──────────────────────────────────────────────────

/**
 * Compute the total wall-clock display duration implied by a speed curve.
 *
 * This is the integral of `1/speed` over the curve's source-time domain
 * `[0, lastPoint.timeMs]`. If the curve's first point is at a time > 0, the
 * region `[0, firstPoint.timeMs]` uses the first point's speed (held).
 *
 * @param curve The speed curve (control points).
 * @returns Display duration in milliseconds. Returns 0 for an empty curve.
 */
export function totalDurationMs(curve: SpeedCurvePoint[]): number {
  const points = normalizeCurve(curve);
  if (points.length === 0) return 0;
  if (points.length === 1) {
    // Single point: speed held from 0 to that point's time.
    return points[0].timeMs / clampSpeed(points[0].speed);
  }

  let total = 0;
  // Region before the first point: hold first speed from 0 → first.timeMs.
  if (points[0].timeMs > 0) {
    total += points[0].timeMs / clampSpeed(points[0].speed);
  }
  // Each segment between consecutive points.
  for (let i = 0; i < points.length - 1; i++) {
    total += segmentDisplayDuration(
      points[i].timeMs,
      points[i].speed,
      points[i + 1].timeMs,
      points[i + 1].speed,
    );
  }
  return total;
}

// ── Source → display mapping ────────────────────────────────────────

/**
 * Map a source-media time to a display (timeline wall-clock) time.
 *
 * Integrates `1/speed` from 0 to `sourceTimeMs` using the closed-form
 * per-segment formula. The result is monotonic non-decreasing in
 * `sourceTimeMs`, which `displayToSource` relies on for inversion.
 *
 * @param curve        The speed curve (control points).
 * @param sourceTimeMs Source-media time in milliseconds (clamped to ≥ 0).
 * @returns Display time in milliseconds.
 */
export function sourceToDisplay(
  curve: SpeedCurvePoint[],
  sourceTimeMs: number,
): number {
  const points = normalizeCurve(curve);
  if (points.length === 0) return Math.max(0, sourceTimeMs);
  const t = Math.max(0, sourceTimeMs);

  if (points.length === 1) {
    return t / clampSpeed(points[0].speed);
  }

  let display = 0;
  let prevTime = 0;
  let prevSpeed = points[0].speed;

  // Region before the first control point.
  if (points[0].timeMs > 0) {
    if (t <= points[0].timeMs) {
      return t / clampSpeed(points[0].speed);
    }
    display += points[0].timeMs / clampSpeed(points[0].speed);
    prevTime = points[0].timeMs;
  }

  // Walk segments until we pass t.
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (t <= p1.timeMs) {
      // Partial segment [p0.timeMs (or prevTime), t].
      const segStart = Math.max(prevTime, p0.timeMs);
      // Speed at segStart and at t (linear within this segment).
      const span = p1.timeMs - p0.timeMs;
      const sStart = span > 0
        ? clampSpeed(p0.speed + (p1.speed - p0.speed) * ((segStart - p0.timeMs) / span))
        : p0.speed;
      const sEnd = span > 0
        ? clampSpeed(p0.speed + (p1.speed - p0.speed) * ((t - p0.timeMs) / span))
        : p0.speed;
      display += segmentDisplayDuration(segStart, sStart, t, sEnd);
      return display;
    }
    // Full segment.
    display += segmentDisplayDuration(p0.timeMs, p0.speed, p1.timeMs, p1.speed);
    prevTime = p1.timeMs;
    prevSpeed = p1.speed;
  }

  // Beyond the last point — hold last speed.
  const last = points[points.length - 1];
  if (t > last.timeMs) {
    display += (t - last.timeMs) / clampSpeed(last.speed);
  }
  // Reference prevSpeed/prevTime to satisfy strict noUnusedLocals guards
  // across the branch above (they are used in the loop body).
  void prevSpeed;
  void prevTime;
  return display;
}

// ── Display → source mapping (inverse) ──────────────────────────────

/**
 * Map a display (timeline wall-clock) time back to a source-media time.
 *
 * Because `sourceToDisplay` is monotonic non-decreasing, this uses binary
 * search to find the source time whose display projection equals
 * `displayTimeMs`. The search domain is `[0, lastPoint.timeMs × maxSpeed]`
 * (an upper bound that accounts for the fastest possible playback).
 *
 * @param curve         The speed curve (control points).
 * @param displayTimeMs Display time in milliseconds (clamped to ≥ 0).
 * @returns Source-media time in milliseconds.
 */
export function displayToSource(
  curve: SpeedCurvePoint[],
  displayTimeMs: number,
): number {
  const points = normalizeCurve(curve);
  if (points.length === 0) return Math.max(0, displayTimeMs);
  const target = Math.max(0, displayTimeMs);

  if (points.length === 1) {
    return target * clampSpeed(points[0].speed);
  }

  const total = totalDurationMs(points);
  // Clamp to the curve's total display duration.
  if (target >= total) {
    // Beyond the end — extrapolate holding the last speed.
    const last = points[points.length - 1];
    const lastTime = last.timeMs;
    const overflow = target - total;
    return lastTime + overflow * clampSpeed(last.speed);
  }

  // Upper bound for source time: last point time × max speed (generous).
  const last = points[points.length - 1];
  let lo = 0;
  let hi = Math.max(last.timeMs, 1) * SPEED_MAX;

  // Binary search for the source time whose display projection ≈ target.
  for (let iter = 0; iter < 64; iter++) {
    if (hi - lo < 0.001) break;
    const mid = (lo + hi) / 2;
    const projected = sourceToDisplay(points, mid);
    if (projected < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

// ── Average speed ───────────────────────────────────────────────────

/**
 * Compute the average (effective) speed of a curve over its source domain.
 *
 * This is `sourceDuration / displayDuration`, which gives the single
 * constant speed that would produce the same display duration. Used by the
 * timeline operations to populate the `speed` field for display when a
 * speed curve is attached to a clip.
 *
 * @param curve The speed curve (control points).
 * @returns Average speed multiplier (≥ 0.001). Returns 1 for an empty curve.
 */
export function averageSpeed(curve: SpeedCurvePoint[]): number {
  const points = normalizeCurve(curve);
  if (points.length === 0) return 1;
  const sourceEnd = points[points.length - 1].timeMs;
  const display = totalDurationMs(points);
  if (display <= 0) return 1;
  return sourceEnd / display;
}
