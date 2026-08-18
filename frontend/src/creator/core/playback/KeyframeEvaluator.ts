/**
 * KeyframeEvaluator — evaluates keyframe tracks at a given time.
 *
 * Given a set of keyframes for a (layerId, property) pair and a time offset,
 * this module finds the surrounding keyframes, interpolates using the easing
 * curve, and returns the interpolated value.
 *
 * Easing functions implemented:
 *   - linear       : constant velocity
 *   - ease-in      : quadratic acceleration (slow start)
 *   - ease-out     : quadratic deceleration (slow end)
 *   - ease-in-out  : quadratic acceleration then deceleration
 *   - spring       : damped harmonic oscillation (underdamped)
 *
 * Design references:
 *   - KeyframeTypes.ts: KeyframeProperty, KeyframeEasing, Keyframe
 *   - React Native Easing module: quad, cubic, elastic patterns
 *   - iOS CASpringAnimation: damped harmonic oscillator closed-form solution
 *   - atelier83/timeline: per-segment easing applied to the segment leaving
 *     the keyframe
 *   - AGENTS.md §17: `spring` is reserved for spatial continuity
 *     (position/scale)
 */
import type { Keyframe, KeyframeProperty, KeyframeEasing } from '../../poster/keyframes/KeyframeTypes';

// ── Easing functions ────────────────────────────────────────────────
// Each takes a normalized time t (0..1) and returns an eased time (0..1).
// The eased time is then used for linear interpolation between values.

/** Linear: t' = t */
function easeLinear(t: number): number {
  return t;
}

/** Ease-in (quad): t' = t² — accelerates from rest */
function easeInQuad(t: number): number {
  return t * t;
}

/** Ease-out (quad): t' = t * (2 - t) — decelerates to rest */
function easeOutQuad(t: number): number {
  return t * (2 - t);
}

/** Ease-in-out (quad): t' = 2t² for t < 0.5, else -1 + (4 - 2t)t */
function easeInOutQuad(t: number): number {
  if (t < 0.5) {
    return 2 * t * t;
  }
  return -1 + (4 - 2 * t) * t;
}

/**
 * Spring (damped harmonic oscillation, underdamped).
 *
 * Models a damped spring with configurable stiffness, damping, and mass.
 * The closed-form solution for an underdamped harmonic oscillator is:
 *
 *   x(t) = 1 - e^(-ζω₀t) * (cos(ω_d·t) + (ζω₀/ω_d)·sin(ω_d·t))
 *
 * where:
 *   ω₀ = sqrt(k/m)        — natural frequency
 *   ζ  = c / (2·sqrt(k·m)) — damping ratio
 *   ω_d = ω₀·sqrt(1 - ζ²) — damped frequency
 *
 * We use default spring parameters that produce a natural, slightly bouncy
 * motion (matching AGENTS.md §27.3 `entrance` config: damping 22, stiffness
 * 180, mass 1.0).
 *
 * @param t      Normalized time (0..1) within the keyframe segment.
 * @param config Optional spring parameters (stiffness, damping, mass).
 */
function easeSpring(
  t: number,
  config: { stiffness?: number; damping?: number; mass?: number } = {},
): number {
  const stiffness = config.stiffness ?? 180;
  const damping = config.damping ?? 22;
  const mass = config.mass ?? 1.0;

  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  // Critically damped or overdamped: no oscillation, smooth approach
  if (zeta >= 1) {
    // Critically damped: x(t) = 1 - (1 + ω₀t)e^(-ω₀t)
    return 1 - (1 + omega0 * t) * Math.exp(-omega0 * t);
  }

  // Underdamped: oscillating approach
  const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
  const env = Math.exp(-zeta * omega0 * t);
  const cosTerm = Math.cos(omegaD * t);
  const sinTerm = (zeta * omega0 / omegaD) * Math.sin(omegaD * t);
  return 1 - env * (cosTerm + sinTerm);
}

/**
 * Apply an easing function to a normalized time value.
 */
function applyEasing(
  easing: KeyframeEasing,
  t: number,
): number {
  switch (easing) {
    case 'linear':
      return easeLinear(t);
    case 'ease-in':
      return easeInQuad(t);
    case 'ease-out':
      return easeOutQuad(t);
    case 'ease-in-out':
      return easeInOutQuad(t);
    case 'spring':
      return easeSpring(t);
    default:
      return easeLinear(t);
  }
}

// ── Keyframe evaluation ─────────────────────────────────────────────

/**
 * Evaluate a keyframe track at a given time.
 *
 * @param keyframes  The keyframes for a single (layerId, property) track.
 *                   Must be sorted by timeMs (ascending). If unsorted, they
 *                   are sorted internally.
 * @param timeMs     The time offset from the start of the layer's timeline.
 * @param property   The property being animated (used for type safety).
 * @returns The interpolated value, or `null` if no keyframes apply (e.g.
 *          empty array, or time is before the first keyframe).
 */
export function evaluateKeyframes(
  keyframes: Keyframe[],
  timeMs: number,
  property: KeyframeProperty,
): number | null {
  if (!keyframes || keyframes.length === 0) return null;

  // Filter to only keyframes for this property (defensive — callers should
  // pre-filter, but this ensures correctness if a mixed array is passed).
  const track = keyframes.filter((k) => k.property === property);
  if (track.length === 0) return null;

  // Sort by time (ascending) — defensive against unsorted input
  const sorted = track.length > 1 && track[0].timeMs > track[track.length - 1].timeMs
    ? [...track].sort((a, b) => a.timeMs - b.timeMs)
    : track;

  // Before the first keyframe: return null (no animation yet)
  if (timeMs <= sorted[0].timeMs) {
    return sorted[0].value;
  }

  // After the last keyframe: hold the last value
  const last = sorted[sorted.length - 1];
  if (timeMs >= last.timeMs) {
    return last.value;
  }

  // Find the surrounding keyframes
  let before = sorted[0];
  let after = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (timeMs >= sorted[i].timeMs && timeMs <= sorted[i + 1].timeMs) {
      before = sorted[i];
      after = sorted[i + 1];
      break;
    }
  }

  // If before and after are the same keyframe (shouldn't happen, but guard)
  if (before.id === after.id) {
    return before.value;
  }

  // Normalize time within the segment [before.timeMs, after.timeMs]
  const segmentDuration = after.timeMs - before.timeMs;
  if (segmentDuration <= 0) {
    return before.value;
  }
  const t = (timeMs - before.timeMs) / segmentDuration;

  // Apply the easing curve of the *outgoing* keyframe (the `after` keyframe's
  // easing describes the interpolation from `before` to `after`).
  const easedT = applyEasing(after.easing, Math.max(0, Math.min(1, t)));

  // Linear interpolation between the two values using the eased time
  return before.value + (after.value - before.value) * easedT;
}

/**
 * Evaluate all keyframe properties for a layer at a given time.
 *
 * Returns an object with the interpolated values for each property that has
 * keyframes. Properties without keyframes are absent from the result.
 *
 * @param keyframes  All keyframes for the layer (may span multiple properties).
 * @param timeMs     The time offset from the start of the layer's timeline.
 */
export function evaluateAllKeyframes(
  keyframes: Keyframe[],
  timeMs: number,
): Partial<Record<KeyframeProperty, number>> {
  if (!keyframes || keyframes.length === 0) return {};

  const properties: KeyframeProperty[] = ['position', 'scale', 'rotation', 'opacity'];
  const result: Partial<Record<KeyframeProperty, number>> = {};

  for (const prop of properties) {
    const value = evaluateKeyframes(keyframes, timeMs, prop);
    if (value !== null) {
      result[prop] = value;
    }
  }

  return result;
}

// ── Easing function exports (for testing / external use) ────────────

export {
  easeLinear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeSpring,
  applyEasing,
};
