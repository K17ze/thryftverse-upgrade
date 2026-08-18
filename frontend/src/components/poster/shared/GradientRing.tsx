import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { useAppTheme } from '../../../theme/ThemeContext';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useMotionConfig } from '../../../hooks/useMotionConfig';

/**
 * Props for {@link GradientRing}.
 */
export interface GradientRingProps {
  /** Whether the ring is shown in its active/selected state. */
  isActive: boolean;
  /** Optional fixed ring size. When omitted the ring wraps its children. */
  size?: number;
  /** Gradient colors. Defaults to brand gold tones derived from the active theme. */
  colors?: readonly [string, string, ...string[]];
  /** Gradient color locations (0–1), one per color. */
  locations?: readonly [number, number, ...number[]];
  /** Ring thickness in px. Default 2 — matches Instagram's refined avatar ring. */
  strokeWidth?: number;
  /** Corner radius of the ring. Defaults to a circle (999) when `size` is set,
   *  otherwise a rounded rectangle (8) that wraps content. */
  borderRadius?: number;
  /** Gradient start point. Default top-left. */
  start?: { x: number; y: number };
  /** Gradient end point. Default bottom-right. */
  end?: { x: number; y: number };
  /** Extra style applied to the outer ring container. */
  style?: ViewStyle;
  /** Content rendered inside the ring. */
  children?: React.ReactNode;
}

/**
 * Shared gradient ring active indicator.
 *
 * Replaces the copy-pasted LinearGradient + spring-animated opacity pattern
 * used across LayoutPicker, TemplatePicker, PosterHighlightsRail,
 * CreativeToolbar and CreatorToolDock.
 *
 * The ring fades in/out via a Reanimated spring driven by `isActive`. When the
 * user has Reduce Motion enabled the opacity changes instantly (the spring
 * config from `useMotionConfig` is already critically damped, but we also short
 * circuit to a direct assignment for zero-latency updates).
 *
 * Default colors are brand gold tones sourced from the active theme
 * (`antiqueGold` + a lighter highlight), so the ring stays on-brand across
 * light/dark modes without hard-coded hex values.
 */
export function GradientRing({
  isActive,
  size,
  colors,
  locations,
  strokeWidth = 2,
  borderRadius,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  style,
  children,
}: GradientRingProps) {
  const { colors: themeColors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();

  // Brand gold tones — derived from the theme so light/dark stay on-brand.
  // antiqueGold is the saturated base; a lighter tint forms the highlight stop.
  const defaultColors = React.useMemo(
    () => [themeColors.antiqueGold, themeColors.warning, themeColors.antiqueGold] as const,
    [themeColors.antiqueGold, themeColors.warning],
  );
  const resolvedColors = colors ?? defaultColors;

  // Resolved corner radius: circle for fixed-size rings, soft rect otherwise.
  const resolvedBorderRadius = borderRadius ?? (size != null ? 999 : 8);

  // Spring-animated opacity — fades the ring in/out with the active state.
  const ringOpacity = useSharedValue(isActive ? 1 : 0);

  React.useEffect(() => {
    if (reducedMotion) {
      // Instant update — no visible travel.
      ringOpacity.value = isActive ? 1 : 0;
    } else {
      ringOpacity.value = withSpring(isActive ? 1 : 0, spring.tap);
    }
  }, [isActive, reducedMotion, spring.tap, ringOpacity]);

  const ringStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: ringOpacity.value,
    };
  });

  // The ring is an absolutely-positioned gradient with `strokeWidth` padding,
  // so the visible gradient band forms a border around the content.
  const ringSizeStyle: ViewStyle | undefined =
    size != null ? { width: size, height: size } : undefined;

  return (
    <View style={[styles.container, ringSizeStyle, style]}>
      <Reanimated.View
        style={[
          styles.ring,
          {
            padding: strokeWidth,
            borderRadius: resolvedBorderRadius,
          },
          ringSizeStyle,
          ringStyle,
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={resolvedColors}
          locations={locations}
          start={start}
          end={end}
          style={StyleSheet.absoluteFill}
        />
      </Reanimated.View>
      <View
        style={[
          styles.content,
          {
            borderRadius: Math.max(0, resolvedBorderRadius - strokeWidth),
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  ring: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
});

export default GradientRing;
