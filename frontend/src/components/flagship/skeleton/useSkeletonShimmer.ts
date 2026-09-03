import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

/**
 * useSkeletonShimmer — returns an animated style for a subtle opacity pulse
 * used by skeleton placeholders.
 *
 * 2026 research (August):
 *   - Shimmer only when motion helps comprehension — not as decoration.
 *   - Dark mode: shimmer can feel loud — use a more subtle pulse.
 *   - Low-end devices: shimmer can cause frame drops — callers can disable.
 *   - Reduced motion: collapse to a static placeholder (no animation).
 *
 * The pulse is an opacity oscillation (not a gradient sweep) so it is cheap
 * to animate on low-end devices and reads as a gentle "still loading" breath
 * rather than a decorative sweep.
 *
 * Duration: 1200ms, infinite loop.
 *   - Light mode: opacity 0.3 → 0.5 → 0.3
 *   - Dark mode:  opacity 0.15 → 0.25 → 0.15 (subtler — dark shimmer feels loud)
 *
 * The returned animated style sets `opacity` on the shimmer overlay View.
 * When reduced motion is enabled, the overlay is not rendered (callers should
 * branch on the returned `enabled` flag).
 *
 * @param disable  Force-disable the shimmer (e.g. on low-end devices).
 * @returns `{ shimmerStyle, enabled }` — apply `shimmerStyle` to the overlay
 *          View; render the overlay only when `enabled` is true.
 */
export function useSkeletonShimmer(disable = false) {
  const { isDark } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const enabled = !reducedMotion && !disable;

  // Dark mode uses a subtler pulse band so the shimmer does not feel loud.
  const minOpacity = isDark ? 0.15 : 0.3;
  const maxOpacity = isDark ? 0.25 : 0.5;

  const opacity = useSharedValue(minOpacity);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(opacity);
      opacity.value = minOpacity;
      return;
    }

    // 1200ms infinite pulse — gentle "still loading" breath.
    opacity.value = withRepeat(
      withSequence(
        withTiming(maxOpacity, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(minOpacity, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [enabled, opacity, minOpacity, maxOpacity]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return { shimmerStyle, enabled };
}
