import { useMemo } from 'react';
import { Motion, REDUCED_SPRING, REDUCED_TIMING } from '../theme/motionTokens';
import { useReducedMotion } from './useReducedMotion';

/**
 * Returns motion configs adjusted for the user's reduced-motion preference.
 *
 * When reduced motion is enabled (iOS Settings → Accessibility → Motion →
 * Reduce Motion, or Android equivalent), all durations collapse to 0 and
 * springs become critically damped so elements settle instantly without
 * visible travel (AGENTS.md §17, §27.2).
 *
 * The returned `spring` object always has the same named configs
 * (`tap`, `press`, `entrance`, …) so callers can destructure or index
 * without branching on the reduced-motion state.
 *
 * Standardized transitions (audit §Motion architecture):
 *   - FadeInDown for list items  → `transitions.listItem`
 *   - slide for sheets           → `transitions.sheet`
 *   - spring for interactive feedback → `spring.*`
 */
export function useMotionConfig() {
  const reducedMotion = useReducedMotion();

  return useMemo(() => {
    const spring = reducedMotion
      ? {
          tap: REDUCED_SPRING,
          press: REDUCED_SPRING,
          settle: REDUCED_SPRING,
          sheet: REDUCED_SPRING,
          entrance: REDUCED_SPRING,
          reorder: REDUCED_SPRING,
          lift: REDUCED_SPRING,
          success: REDUCED_SPRING,
          sharedElement: REDUCED_SPRING,
          urgency: REDUCED_SPRING,
          indicator: REDUCED_SPRING,
          glide: REDUCED_SPRING,
        }
      : Motion.spring;

    // Transitions collapse to instant (duration 0) under reduced motion,
    // but keep their easing so callers that branch on duration still get a
    // valid config. Travel values are zeroed so nothing visibly moves.
    const transitions = reducedMotion
      ? {
          listItem: { ...Motion.transitions.listItem, duration: 0, translateY: 0 },
          sheet: { ...Motion.transitions.sheet, duration: 0, translateY: 0 },
          tabSwitch: { ...Motion.transitions.tabSwitch, duration: 0, translateX: 0 },
          crossfade: { ...Motion.transitions.crossfade, duration: 0 },
          mediaLoad: { ...Motion.transitions.mediaLoad, duration: 0 },
        }
      : Motion.transitions;

    return {
      duration: reducedMotion
        ? { ...Motion.duration, touch: 0, fast: 0, normal: 0, slow: 0, slower: 0, crawl: 0 }
        : Motion.duration,
      spring,
      transitions,
      stagger: reducedMotion
        ? { fast: 0, normal: 0, slow: 0, maxItems: 0 }
        : Motion.stagger,
      gestures: Motion.gestures,
      // Timing config for withTiming calls — instant when reduced motion is on.
      timing: REDUCED_TIMING,
      // Convenience: true when full motion is allowed. Use to gate decorative
      // animation (shimmer, parallax) without branching on duration === 0.
      isEnabled: !reducedMotion,
      isReducedMotion: reducedMotion,
    };
  }, [reducedMotion]);
}
