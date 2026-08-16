/**
 * SpeedCurveTypes — variable speed ramping model for the Poster composer.
 *
 * A speed curve maps a normalized position within a clip (0.0 → 1.0) to a
 * playback speed multiplier (0.25x → 4.0x). This enables precise, dynamic
 * speed ramping along a customizable curve — matching Instagram Edits'
 * speed curve feature (August 2026).
 *
 * The curve is defined by an ordered list of control points plus an easing
 * mode that governs interpolation between adjacent points:
 *   - linear  : straight-line interpolation
 *   - smooth  : ease-in-out (smoothstep) interpolation
 *   - hold    : step function — keeps the previous point's speed until the next
 *
 * Design references:
 *   - AGENTS.md §17: easing vocabulary; `hold` is the step equivalent.
 *   - The renderer samples the curve via `sampleSpeedAtPosition` to compute
 *     the instantaneous speed at any timeline position.
 */

export interface SpeedPoint {
  id: string;
  /** Position in the clip, 0.0 to 1.0 */
  position: number;
  /** Speed multiplier at this point, 0.25 to 4.0 (0.01 allowed for freeze) */
  speed: number;
}

export type SpeedCurveEasing = 'linear' | 'smooth' | 'hold';

export interface SpeedCurve {
  points: SpeedPoint[];
  /** Easing between points: 'linear' | 'smooth' | 'hold' */
  easing: SpeedCurveEasing;
}

/** Minimum/maximum speed multiplier bounds. */
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4.0;
/** Near-zero speed used by the freeze-frame preset (not a true 0 to avoid div-by-zero). */
export const FREEZE_SPEED = 0.01;

export const SPEED_CURVE_PRESETS: Array<{ id: string; name: string; curve: SpeedCurve }> = [
  {
    id: 'constant',
    name: 'Constant',
    curve: {
      points: [
        { id: 'p0', position: 0, speed: 1 },
        { id: 'p1', position: 1, speed: 1 },
      ],
      easing: 'linear',
    },
  },
  {
    id: 'slow-mo',
    name: 'Slow Motion',
    curve: {
      points: [
        { id: 'p0', position: 0, speed: 1 },
        { id: 'p1', position: 0.3, speed: 0.5 },
        { id: 'p2', position: 0.7, speed: 0.5 },
        { id: 'p3', position: 1, speed: 1 },
      ],
      easing: 'smooth',
    },
  },
  {
    id: 'ramp-up',
    name: 'Ramp Up',
    curve: {
      points: [
        { id: 'p0', position: 0, speed: 0.5 },
        { id: 'p1', position: 1, speed: 2 },
      ],
      easing: 'smooth',
    },
  },
  {
    id: 'ramp-down',
    name: 'Ramp Down',
    curve: {
      points: [
        { id: 'p0', position: 0, speed: 2 },
        { id: 'p1', position: 1, speed: 0.5 },
      ],
      easing: 'smooth',
    },
  },
  {
    id: 'freeze',
    name: 'Freeze Frame',
    curve: {
      points: [
        { id: 'p0', position: 0, speed: 1 },
        { id: 'p1', position: 0.4, speed: FREEZE_SPEED },
        { id: 'p2', position: 0.6, speed: FREEZE_SPEED },
        { id: 'p3', position: 1, speed: 1 },
      ],
      easing: 'hold',
    },
  },
  {
    id: 'bounce',
    name: 'Bounce',
    curve: {
      points: [
        { id: 'p0', position: 0, speed: 1 },
        { id: 'p1', position: 0.25, speed: 2 },
        { id: 'p2', position: 0.5, speed: 0.5 },
        { id: 'p3', position: 0.75, speed: 2 },
        { id: 'p4', position: 1, speed: 1 },
      ],
      easing: 'smooth',
    },
  },
];

/** Default constant curve (1x throughout). */
export const DEFAULT_SPEED_CURVE: SpeedCurve = SPEED_CURVE_PRESETS[0].curve;

/** Clamp a speed value to the valid range. */
export function clampSpeed(speed: number): number {
  return Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed));
}

/** Clamp a position value to 0–1. */
export function clampPosition(position: number): number {
  return Math.max(0, Math.min(1, position));
}

/**
 * Interpolate speed at a given position using the curve.
 *
 * @param curve  The speed curve (points + easing).
 * @param position  Normalized position in the clip (0–1). Clamped internally.
 * @returns Speed multiplier at the given position.
 */
export function sampleSpeedAtPosition(curve: SpeedCurve, position: number): number {
  // Clamp position to 0-1
  const pos = clampPosition(position);
  const points = curve.points;
  if (points.length === 0) return 1;
  if (points.length === 1) return points[0].speed;

  // Ensure points are sorted by position for interpolation.
  const sorted = points.length > 1 && points[0].position > points[points.length - 1].position
    ? [...points].sort((a, b) => a.position - b.position)
    : points;

  // Find surrounding points
  let before = sorted[0];
  let after = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (pos >= sorted[i].position && pos <= sorted[i + 1].position) {
      before = sorted[i];
      after = sorted[i + 1];
      break;
    }
  }

  if (curve.easing === 'hold') return before.speed;

  const t = (pos - before.position) / Math.max(0.001, after.position - before.position);
  if (curve.easing === 'linear') {
    return before.speed + (after.speed - before.speed) * t;
  }
  // smooth: ease-in-out (smoothstep)
  const smoothT = t * t * (3 - 2 * t);
  return before.speed + (after.speed - before.speed) * smoothT;
}

/**
 * Compute the effective (average) speed of a curve by numerical integration.
 * Used to derive a single `speed` value for timeline duration calculations.
 */
export function averageSpeed(curve: SpeedCurve, samples = 100): number {
  if (curve.points.length === 0) return 1;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    sum += sampleSpeedAtPosition(curve, i / (samples - 1));
  }
  return sum / samples;
}
