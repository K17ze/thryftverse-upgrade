import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { type ThemeColors } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';
import { Space, FontFamily, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

// Non-blocking progress overlay — shown during order creation / payment setup
// Keeps the checkout context visible while communicating progress (§14).
export function CheckoutProgressOverlay({
  label,
  colors,
}: {
  label: string;
  colors: ThemeColors;
}) {
  const reducedMotion = useReducedMotion();
  const progressX = useSharedValue(-1);

  useEffect(() => {
    if (reducedMotion) return;
    progressX.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Motion.duration.crawl, easing: Easing.inOut(Easing.ease) }),
        withTiming(-1, { duration: 0 }),
      ),
      -1,
      false,
    );
    return () => {
      progressX.value = -1;
    };
  }, [progressX, reducedMotion]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progressX.value * 100 }],
  }));

  return (
    <View
      pointerEvents="none"
      style={[
        progressOverlayStyles.overlay,
        { backgroundColor: colors.overlay, borderColor: colors.border, shadowColor: colors.shadow },
      ]}
      accessibilityLabel={label}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={progressOverlayStyles.row}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={[progressOverlayStyles.label, { color: colors.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {/* Subtle indeterminate progress bar */}
      <View style={[progressOverlayStyles.track, { backgroundColor: colors.border }]}>
        <Reanimated.View
          style={[
            progressOverlayStyles.fill,
            { backgroundColor: colors.brand },
            reducedMotion ? undefined : barStyle,
          ]}
        />
      </View>
    </View>
  );
}

const progressOverlayStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 60,
    left: Space.md,
    right: Space.md,
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: Stroke.hairline,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    shadowColor: 'transparent',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  label: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
  },
  track: {
    height: Space.xs - 1,
    borderRadius: RadiusRoleValue.pillAvatar,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '-40%',
    width: '40%',
    borderRadius: RadiusRoleValue.pillAvatar,
  },
});
