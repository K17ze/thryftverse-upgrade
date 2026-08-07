import { Motion } from '../theme/motionTokens';
import { useReducedMotion } from './useReducedMotion';

/**
 * Critically-damped spring — settles instantly with no visible travel.
 * Used for every spring config when reduced motion is enabled.
 */
const REDUCED_SPRING = { damping: 100, stiffness: 1000, mass: 1.0 } as const;

/**
 * Returns motion configs adjusted for the user's reduced-motion preference.
 *
 * When reduced motion is enabled (iOS Settings → Accessibility → Motion →
 * Reduce Motion, or Android equivalent), all durations collapse to 0 and
 * springs become critically damped so elements settle instantly without
 * visible travel.
 *
 * The returned `spring` object always has the same named configs
 * (`tap`, `press`, `entrance`, …) so callers can destructure or index
 * without branching on the reduced-motion state.
 */
export function useMotionConfig() {
  const reducedMotion = useReducedMotion();

  const spring = reducedMotion
    ? {
        tap: REDUCED_SPRING,
        press: REDUCED_SPRING,
        entrance: REDUCED_SPRING,
        lift: REDUCED_SPRING,
        success: REDUCED_SPRING,
        sharedElement: REDUCED_SPRING,
      }
    : Motion.spring;

  return {
    duration: reducedMotion ? 0 : Motion.duration,
    spring,
    stagger: reducedMotion ? { fast: 0, normal: 0, slow: 0 } : Motion.stagger,
    isEnabled: !reducedMotion,
  };
}
