/**
 * GlowSurface — Ambient glow effect behind key UI elements
 * Creates a soft brand-colored halo that elevates CTAs, featured cards, and hero content
 *
 * Usage:
 *   <GlowSurface intensity={0.15}>
 *     <AppButton title="Buy Now" />
 *   </GlowSurface>
 */

import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
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

interface GlowSurfaceProps {
  children: React.ReactNode;
  /** Glow color (default brand color) */
  color?: string;
  /** Glow intensity 0-1 (default 0.12) */
  intensity?: number;
  /** Glow size factor (default 1.0) */
  spread?: number;
  /** Whether the glow should pulse/breathe */
  animated?: boolean;
  /** Pulse speed in seconds (default 3) */
  pulseSpeed?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function GlowSurface({
  children,
  color = Colors.brand,
  intensity = 0.12,
  spread = 1.0,
  animated = true,
  pulseSpeed = 3,
  style,
  contentStyle,
}: GlowSurfaceProps) {
  const pulse = useSharedValue(0);

  React.useEffect(() => {
    if (animated) {
      pulse.value = withRepeat(
        withTiming(1, {
          duration: pulseSpeed * 1000,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      );
    }
  }, [pulse, animated, pulseSpeed]);

  const glowStyle = useAnimatedStyle(() => {
    const breathe = animated
      ? interpolate(pulse.value, [0, 1], [0.85, 1.15])
      : 1;

    return {
      opacity: intensity * breathe,
      transform: [{ scale: spread * breathe }],
    };
  });

  return (
    <View style={[styles.container, style]}>
      {/* Glow layer behind */}
      <Reanimated.View
        style={[
          StyleSheet.absoluteFill,
          styles.glowLayer,
          glowStyle,
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[
            color,
            `${color}00`, // transparent version of the color
          ]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Reanimated.View>

      {/* Content on top */}
      <View style={[styles.content, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

/**
 * GlowOrb — A standalone floating glow ball for empty states, loading screens
 */
export function GlowOrb({
  color = Colors.brand,
  size = 200,
  intensity = 0.15,
  style,
}: {
  color?: string;
  size?: number;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useSharedValue(0);

  React.useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 4000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
  }, [pulse]);

  const orbStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [0.9, 1.1]);
    return {
      transform: [{ scale }],
      opacity: intensity,
    };
  });

  return (
    <Reanimated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        orbStyle,
        style,
      ]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    zIndex: 0,
    borderRadius: 999,
    // Create a soft radial glow effect
    overflow: 'hidden',
  },
  content: {
    zIndex: 1,
  },
});
