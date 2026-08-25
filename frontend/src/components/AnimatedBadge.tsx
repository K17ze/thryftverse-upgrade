import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../theme/motionTokens';
import { Typography, Space } from '../theme/designTokens';

interface AnimatedBadgeProps {
  count: number;
  size?: number;
}

export function AnimatedBadge({ count, size = 18 }: AnimatedBadgeProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (count > 0) {
      if (reducedMotion) {
        // Reduced motion: collapse scale travel to zero — keep opacity
        // state-change communication (§2.5).
        scale.value = 1;
      } else {
        // Quick scale pop then settle — timing-based, no bounce
        scale.value = withSequence(
          withTiming(1.3, { duration: Motion.duration.fast }),
          withTiming(1, { duration: Motion.duration.normal })
        );
      }
    } else {
      // Shrink out if 0 — under reduced motion, collapse to instant
      scale.value = withTiming(0, { duration: reducedMotion ? 0 : Motion.duration.normal });
    }
  }, [count, reducedMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value === 0 ? 0 : 1,
  }));

  if (count === 0) {
    // Rely on opacity/scale to hide it completely when count is 0
    // Don't log or access scale.value synchronously on JS thread
  }

  return (
    <Reanimated.View style={[
      styles.badge,
      { minWidth: size, height: size, borderRadius: size / 2 },
      animatedStyle
    ]}>
      <Text style={[styles.text, { fontSize: size * 0.6 }]}>
        {count > 99 ? '99+' : count}
      </Text>
    </Reanimated.View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  badge: {
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
    position: 'absolute',
    top: -4,
    right: -4,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  text: {
    color: colors.surfaceElevated,
    fontFamily: Typography.family.bold,
    includeFontPadding: false,
    textAlign: 'center',
  },
});