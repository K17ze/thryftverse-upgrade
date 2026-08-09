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
 * Tap-to-focus animated reticle.
 *
 * Springs in from scale 0→1 with a bouncy entrance, transitions the ring
 * colour from blue (#4A90D9, focusing) to green (#4ADE80, locked) after
 * 600ms, then fades out after 1.5s.
 *
 * All spring configs come from `useMotionConfig` — no hardcoded values.
 * Respects reduced-motion (springs become critically damped, durations 0).
 */
export function FocusReticle({ focusPoint, size = DEFAULT_SIZE, onDismiss }: FocusReticleProps) {
  const { spring } = useMotionConfig();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const focusAnim = useSharedValue(0);
  const focusLockAnim = useSharedValue(0); // 0 = focusing (blue), 1 = locked (green)

  // ── Spring scale (0→1) with bouncy entrance ──
  const reticleStyle = useAnimatedStyle(() => {
    const scale = interpolate(focusAnim.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: focusAnim.value,
      transform: [{ scale }],
    };
  });

  // ── Ring colour: blue while focusing → green when locked ──
  // Focus-specific feedback colours interpolated in RGB. The theme has no
  // `info`/`accent` token that maps to these bright feedback hues (success is
  // #215634, too dark to read on the dark camera preview), so the literal
  // blue (#4A90D9 → focusing) and green (#4ADE80 → locked) are retained as
  // purpose-built focus-feedback colours.
  const reticleProps = useAnimatedProps(() => {
    const lockProgress = interpolate(focusLockAnim.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    const r = Math.round(74 + (74 - 74) * lockProgress); // 74→74
    const g = Math.round(144 + (222 - 144) * lockProgress); // 144→222
    const b = Math.round(217 + (128 - 217) * lockProgress); // 217→128
    return {
      stroke: `rgb(${r},${g},${b})`,
    };
  });

  // ── Trigger animation lifecycle whenever focusPoint changes ──
  useEffect(() => {
    if (!focusPoint) return;

    haptic.light(); // light impact on focus

    // Entrance: 0→1 with bouncy spring
    focusAnim.value = 0;
    focusLockAnim.value = 0; // start as blue (focusing)
    focusAnim.value = withSpring(1, spring.lift);

    // After 600ms, transition to locked (green)
    focusLockAnim.value = withDelay(600, withSpring(1, spring.success));

    // Auto-dismiss after 1.5s with fade
    focusAnim.value = withDelay(
      1500,
      withTiming(0, { duration: reducedMotion ? 0 : 300, easing: Easing.in(Easing.cubic) }),
    );

    const timeout = setTimeout(() => {
      onDismiss?.();
      focusLockAnim.value = 0;
    }, reducedMotion ? 0 : 1900);

    return () => clearTimeout(timeout);
  }, [focusPoint, haptic, reducedMotion, spring, focusAnim, focusLockAnim, onDismiss]);

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
