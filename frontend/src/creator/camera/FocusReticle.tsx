import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withSpring,
  withTiming,
  withDelay,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// Animated SVG circle for focus reticle color transition
const ReanimatedCircle = Reanimated.createAnimatedComponent(SvgCircle);

const DEFAULT_SIZE = 70;

export interface FocusReticleProps {
  /** The screen-space point where the reticle should appear. When non-null,
   *  the reticle springs in (0→1), transitions from blue→green after 600ms,
   *  then fades out after 1.5s and calls `onDismiss`. */
  focusPoint: { x: number; y: number } | null;
  /** Reticle diameter in pixels (default 70). */
  size?: number;
  /** Called after the dismiss animation completes — parent should clear
   *  `focusPoint` to unmount the reticle. */
  onDismiss?: () => void;
}

/**
 * Tap-to-focus visual indicator (truthful — no AE/AF lock claim).
 *
 * Springs in from scale 0→1 with a bouncy entrance, holds briefly to
 * confirm the tap was registered, then fades out after ~1.2s. The ring
 * stays a single neutral-white colour — it does NOT transition to green
 * or show "AE/AF LOCK" because Expo Camera's public surface does not
 * expose arbitrary point focus/lock. The native camera continues to use
 * its own continuous autofocus.
 *
 * All spring configs come from `useMotionConfig` — no hardcoded values.
 * Respects reduced-motion (springs become critically damped, durations 0).
 */
export function FocusReticle({ focusPoint, size = DEFAULT_SIZE, onDismiss }: FocusReticleProps) {
  const { spring } = useMotionConfig();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const focusAnim = useSharedValue(0);

  // ── Spring scale (0→1) with bouncy entrance ──
  const reticleStyle = useAnimatedStyle(() => {
    const scale = interpolate(focusAnim.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: focusAnim.value,
      transform: [{ scale }],
    };
  });

  // ── Ring colour: steady white — tap registered, no lock claim ──
  const reticleProps = useAnimatedProps(() => ({
    stroke: 'rgba(255,255,255,0.9)',
  }));

  // ── Trigger animation lifecycle whenever focusPoint changes ──
  useEffect(() => {
    if (!focusPoint) return;

    haptic.light(); // light impact on tap

    // Entrance: 0→1 with bouncy spring
    focusAnim.value = 0;
    focusAnim.value = withSpring(1, spring.lift);

    // Auto-dismiss after 1.2s with fade
    focusAnim.value = withDelay(
      1200,
      withTiming(0, { duration: reducedMotion ? 0 : 300, easing: Easing.in(Easing.cubic) }),
    );

    const timeout = setTimeout(() => {
      onDismiss?.();
    }, reducedMotion ? 0 : 1600);

    return () => clearTimeout(timeout);
  }, [focusPoint, haptic, reducedMotion, spring, focusAnim, onDismiss]);

  if (!focusPoint) return null;

  return (
    <Reanimated.View
      style={[
        styles.reticle,
        {
          left: focusPoint.x - size / 2,
          top: focusPoint.y - size / 2,
          width: size,
          height: size,
        },
        reticleStyle,
      ]}
      pointerEvents="none"
    >
      <Svg width={size} height={size}>
        <ReanimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 4}
          strokeWidth={2}
          fill="none"
          animatedProps={reticleProps}
        />
        {/* Crosshair dot — camera overlay, always high contrast on dark preview */}
        <SvgCircle cx={size / 2} cy={size / 2} r={2} fill="#fff" fillOpacity={0.8} />
      </Svg>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  reticle: {
    position: 'absolute',
    pointerEvents: 'none',
  },
});
