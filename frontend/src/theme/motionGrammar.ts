/**
 * Motion Grammar Specification — Thryftverse
 *
 * The canonical motion contract defining three duration families, easing
 * curves, a single spring family, and one reduced-motion policy.
 *
 * This is the production motion specification. Every animated surface must
 * map to one of the three duration families. If a motion does not fit a
 * family, it is decorative and should be removed (AGENTS.md §17).
 *
 * ── Duration families ──────────────────────────────────────────────────
 *
 *   quick      (160ms) — press feedback, toggle, small state changes.
 *   standard   (240ms) — sheet transitions, list reordering, content swap.
 *   deliberate (360ms) — screen transitions, hero animations, large moves.
 *
 * No other durations are permitted. No bespoke spring constants per screen.
 *
 * ── Easing curves ──────────────────────────────────────────────────────
 *
 *   easeOut   — standard deceleration for most transitions (entries).
 *   easeInOut — bidirectional transitions (toggles, morphs, crossfades).
 *   spring    — gesture-driven interactions (tension/friction, one family).
 *
 * ── Reduced-motion policy ──────────────────────────────────────────────
 *
 *   All animations collapse to 0ms (instant). Opacity transitions → 0ms.
 *   Transform transitions → 0ms. Only layout updates remain — no animation.
 *   Springs collapse to critically-damped (no visible travel).
 *
 * ── Production specification fields ────────────────────────────────────
 *
 *   Every animation in the app should be able to declare:
 *     trigger, property, duration/spring family, interruption behavior,
 *     reduced-motion replacement, accessibility announcement.
 *
 * @see MOTION_GRAMMAR.md for the full documented spec.
 */
import { Easing, type EasingFunction } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ── Duration families ───────────────────────────────────────────────────────
// Three canonical families. No other durations are permitted.

export const MotionDuration = {
  /** 160ms — press feedback, toggle, small state changes. */
  quick: 160,
  /** 240ms — sheet transitions, list reordering, content swap. */
  standard: 240,
  /** 360ms — screen transitions, hero animations, large content moves. */
  deliberate: 360,
  /** 0ms — reduced-motion replacement for all families. */
  instant: 0,
} as const;

export type MotionDurationFamily = keyof typeof MotionDuration;

// ── Easing curves ───────────────────────────────────────────────────────────

export const MotionEasing = {
  /** Standard deceleration for most transitions (entries, arrivals). */
  easeOut: Easing.out(Easing.cubic),
  /** Bidirectional transitions (toggles, morphs, crossfades). */
  easeInOut: Easing.inOut(Easing.cubic),
} as const satisfies Record<string, EasingFunction>;

// ── Spring family ───────────────────────────────────────────────────────────
// One spring family for gesture-driven interactions. No bespoke springs
// per screen (AGENTS.md §17). Uses tension/friction model.

export const MotionSpring = {
  /** Gesture-driven interactions — snappy, controlled, minimal overshoot. */
  spring: { tension: 230, friction: 26, mass: 1 },
  /** Reduced-motion spring — critically damped, no visible travel. */
  reduced: { tension: 1000, friction: 100, mass: 1 },
} as const;

// ── Reduced-motion replacements ─────────────────────────────────────────────

export const ReducedMotion = {
  /** All animations → 0ms duration (instant). */
  duration: 0,
  /** Opacity transitions → 0ms. */
  opacity: 0,
  /** Transform transitions → 0ms. */
  transform: 0,
  /** Only keep layout updates — no animation. */
  layoutOnly: true,
} as const;

// ── useMotion hook ──────────────────────────────────────────────────────────

export interface MotionConfig {
  /** Resolved duration in ms (0 when reduced motion is enabled). */
  duration: number;
  /** Easing function for timing-based animations. */
  easing: EasingFunction;
  /** Spring config for gesture-driven interactions. */
  spring: typeof MotionSpring.spring | typeof MotionSpring.reduced;
  /** True when full motion is allowed (reduced motion is off). */
  isEnabled: boolean;
  /** True when reduced motion is enabled. */
  isReducedMotion: boolean;
}

/**
 * Returns the appropriate duration, easing, and spring config based on the
 * user's reduced-motion preference.
 *
 * When reduced motion is enabled, all durations collapse to 0ms, springs
 * become critically damped, and no visible travel occurs. Only layout
 * updates remain (AGENTS.md §17, §27.2).
 *
 * @example
 *   const { duration, easing } = useMotion();
 *   opacity.value = withTiming(1, { duration, easing });
 *
 *   const { spring } = useMotion();
 *   scale.value = withSpring(0.97, spring);
 */
export function useMotion(): MotionConfig {
  const reducedMotion = useReducedMotion();

  return {
    duration: reducedMotion ? MotionDuration.instant : MotionDuration.standard,
    easing: MotionEasing.easeOut,
    spring: reducedMotion ? MotionSpring.reduced : MotionSpring.spring,
    isEnabled: !reducedMotion,
    isReducedMotion: reducedMotion,
  };
}

// ── useAnimatedTransition helper ────────────────────────────────────────────

export interface AnimatedTransitionConfig {
  /** Duration in ms for the transition (0 when reduced motion is on). */
  duration: number;
  /** Easing function for the transition. */
  easing: EasingFunction;
}

/**
 * Returns a transition config (duration + easing) for the specified duration
 * family, adjusted for the user's reduced-motion preference.
 *
 * Under reduced motion, all families collapse to 0ms (instant) — only layout
 * updates remain, no animation.
 *
 * @example
 *   const transition = useAnimatedTransition('standard');
 *   opacity.value = withTiming(1, transition);
 *
 *   const quick = useAnimatedTransition('quick');
 *   scale.value = withTiming(0.97, quick);
 */
export function useAnimatedTransition(
  family: MotionDurationFamily = 'standard',
): AnimatedTransitionConfig {
  const reducedMotion = useReducedMotion();

  return {
    duration: reducedMotion ? MotionDuration.instant : MotionDuration[family],
    easing: MotionEasing.easeOut,
  };
}
