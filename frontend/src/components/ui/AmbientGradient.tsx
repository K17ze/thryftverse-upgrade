/**
 * AmbientGradient — Slowly shifting animated gradient backgrounds
 * Creates atmospheric mood lighting for auth screens, empty states, success screens
 *
 * Usage:
 *   <AmbientGradient colors={[Colors.brand, Colors.surface]} speed={0.3}>
 *     <AuthForm />
 *   </AmbientGradient>
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Colors } from '../../constants/colors';

interface AmbientGradientProps {
  children?: React.ReactNode;
  /** Primary brand color */
  primaryColor?: string;
  /** Secondary muted color */
  secondaryColor?: string;
  /** Background base color */
  baseColor?: string;
  /** Animation cycle duration in seconds (default 12) */
  speed?: number;
  /** Gradient opacity 0-1 (default 0.35) */
  intensity?: number;
  /** Extra style for the container */
  style?: StyleProp<ViewStyle>;
  /** Style for the inner content wrapper */
  contentStyle?: StyleProp<ViewStyle>;
  /** If true, adds a noise texture overlay for premium feel */
  noiseOverlay?: boolean;
}

export function AmbientGradient({
  children,
  primaryColor = Colors.brand,
  secondaryColor = Colors.surfaceAlt,
  baseColor = Colors.background,
  speed = 12,
  intensity = 0.35,
  style,
  contentStyle,
  noiseOverlay = true,
}: AmbientGradientProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: speed * 1000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
  }, [progress, speed]);

  const animatedStyle = useAnimatedStyle(() => {
    const phase = progress.value;

    // Create a breathing, shifting gradient effect
    // We move the gradient center in a gentle orbit
    const centerX = interpolate(phase, [0, 1], [0.2, 0.8]);
    const centerY = interpolate(phase, [0, 1], [0.3, 0.7]);

    return {
      opacity: intensity,
      transform: [
        { scale: 1.4 }, // Oversized so rotation doesn't show edges
        {
          rotate: `${interpolate(phase, [0, 1], [0, 25])}deg`,
        },
      ],
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    const phase = progress.value;
    return {
      opacity: interpolate(phase, [0, 0.5, 1], [0.15, 0.25, 0.15]),
      transform: [
        { scale: 1.2 },
        {
          translateX: interpolate(phase, [0, 1], [-30, 30]),
        },
        {
          translateY: interpolate(phase, [0, 1], [-20, 20]),
        },
      ],
    };
  });

  return (
    <View style={[styles.container, { backgroundColor: baseColor }, style]}>
      {/* Base ambient gradient layer */}
      <Reanimated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={[
            primaryColor,
            secondaryColor,
            baseColor,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Reanimated.View>

      {/* Secondary glow orb for depth */}
      <Reanimated.View
        style={[
          StyleSheet.absoluteFill,
          glowStyle,
          { alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <View
          style={[
            styles.glowOrb,
            { backgroundColor: primaryColor },
          ]}
        />
      </Reanimated.View>

      {/* Noise texture overlay for premium film-grain feel */}
      {noiseOverlay && (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.noiseOverlay,
          ]}
          pointerEvents="none"
        />
      )}

      {/* Content */}
      <View style={[styles.content, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

/**
 * AmbientGradientMesh — More complex 4-color mesh gradient approximation
 * Uses two overlapping animated gradients for a richer, more luxurious feel
 */
export function AmbientGradientMesh({
  children,
  colors,
  speed = 15,
  style,
  contentStyle,
}: {
  children?: React.ReactNode;
  colors?: [string, string, string, string];
  speed?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const meshColors = colors ?? [
    Colors.brand,
    Colors.surfaceAlt,
    Colors.surface,
    Colors.background,
  ];

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: speed * 1000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
  }, [progress, speed]);

  const layer1Style = useAnimatedStyle(() => {
    const phase = progress.value;
    return {
      opacity: 0.5,
      transform: [
        { scale: 1.5 },
        { rotate: `${interpolate(phase, [0, 1], [0, 30])}deg` },
        {
          translateX: interpolate(phase, [0, 1], [-40, 40]),
        },
      ],
    };
  });

  const layer2Style = useAnimatedStyle(() => {
    const phase = 1 - progress.value;
    return {
      opacity: 0.4,
      transform: [
        { scale: 1.5 },
        { rotate: `${interpolate(phase, [0, 1], [180, 210])}deg` },
        {
          translateX: interpolate(phase, [0, 1], [-40, 40]),
        },
      ],
    };
  });

  return (
    <View style={[styles.container, { backgroundColor: meshColors[3] }, style]}>
      {/* Layer 1 */}
      <Reanimated.View style={[StyleSheet.absoluteFill, layer1Style]}>
        <LinearGradient
          colors={[meshColors[0], meshColors[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Reanimated.View>

      {/* Layer 2 — inverted direction */}
      <Reanimated.View style={[StyleSheet.absoluteFill, layer2Style]}>
        <LinearGradient
          colors={[meshColors[2], meshColors[0]]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Reanimated.View>

      <View style={[styles.content, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  content: {
    flex: 1,
    zIndex: 10,
  },
  glowOrb: {
    width: 400,
    height: 400,
    borderRadius: 200,
    opacity: 0.2,
  },
  noiseOverlay: {
    // Subtle dot pattern for film grain feel
    backgroundColor: 'rgba(0,0,0,0.02)',
    opacity: 0.5,
  },
});
