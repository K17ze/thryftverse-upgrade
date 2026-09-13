/**
 * LiveBadge — the single "LIVE" marker for live-shopping surfaces.
 *
 * A small danger-tinted status mark with a gently pulsing dot. The pulse is
 * suppressed under Reduce Motion. Renders only the state the backend reports
 * — callers must not mount it for sessions that are not live.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export function LivePulse({ size = 8, color }: { size?: number; color: string }) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [reducedMotion, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Reanimated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
}

export function LiveBadge({ compact = false, label = 'LIVE' }: { compact?: boolean; label?: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.badge,
        compact && styles.badgeCompact,
        { backgroundColor: colors.danger },
      ]}
      accessible={false}
    >
      <LivePulse size={compact ? 6 : 8} color={colors.scrimTextPrimary} />
      <Text style={[styles.text, compact && styles.textCompact, { color: colors.scrimTextPrimary }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  badgeCompact: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    gap: Space.xs / 2 + 1,
  },
  text: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
  },
  textCompact: {
    fontSize: TypographyV2.meta.size - 2,
    letterSpacing: 0.4,
  },
});
