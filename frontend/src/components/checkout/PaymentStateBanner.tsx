import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { type ThemeColors } from '../../theme/ThemeContext';
import { Motion } from '../../theme/motionTokens';
import { Space, FontFamily, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { type CheckoutStage } from '../../utils/checkoutFlow';

// PaymentStateBanner — canonical payment state component (§14, audit P0).
// Replaces the generic ActivityIndicator with a state-specific banner that
// has a colored accent bar, a bounded-pulse dot (not spinner) for active
// states, and state-specific icons for failed/pending/unknown states.
export function PaymentStateBanner({
  stage,
  label,
  colors,
  reducedMotion,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  stage: CheckoutStage;
  label: string;
  colors: ThemeColors;
  reducedMotion: boolean;
  /** Optional recovery action rendered under the label (e.g. "Check payment
   *  status" for unknown_outcome). Rendered only when both are provided. */
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  const dotOpacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion || stage === 'idle') return;
    if (stage === 'creating_order' || stage === 'opening_payment' || stage === 'authenticating' || stage === 'awaiting_payment') {
      // Bounded pulse: three calm beats, then the dot holds at full opacity.
      // The charter prohibits indefinite decorative pulsing; a finite
      // sequence still communicates "in progress" without a perpetual
      // heartbeat (audit F15).
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: Motion.duration.slower, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: Motion.duration.slower, easing: Easing.inOut(Easing.ease) }),
        ),
        3,
        false,
      );
    }
    return () => {
      dotOpacity.value = 1;
    };
  }, [dotOpacity, reducedMotion, stage]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  const config = useMemo(() => {
    switch (stage) {
      case 'creating_order':
      case 'opening_payment':
      case 'authenticating':
      case 'awaiting_payment':
        return {
          accentColor: colors.brand,
          icon: null as React.ReactNode,
          showDot: true,
        };
      case 'payment_succeeded':
        return {
          accentColor: colors.success,
          icon: <Ionicons name="checkmark-circle" size={16} color={colors.success} aria-hidden={true} />,
          showDot: false,
        };
      case 'payment_failed':
        return {
          accentColor: colors.danger,
          icon: <Ionicons name="alert-circle" size={16} color={colors.danger} aria-hidden={true} />,
          showDot: false,
        };
      case 'payment_pending':
        return {
          accentColor: colors.textMuted,
          icon: <Ionicons name="time-outline" size={16} color={colors.textMuted} aria-hidden={true} />,
          showDot: false,
        };
      case 'unknown_outcome':
        // Reconciling state — the server may have committed the payment, so
        // this must read as "checking", visually distinct from pending
        // (muted/time) and failed (danger/alert). Static icon only: no
        // pulsing dot, so the user can read the recovery message without
        // motion competing for attention (audit F11/F15).
        return {
          accentColor: colors.warning,
          icon: <Ionicons name="sync-outline" size={16} color={colors.warning} aria-hidden={true} />,
          showDot: false,
        };
      default:
        return {
          accentColor: colors.brand,
          icon: null as React.ReactNode,
          showDot: false,
        };
    }
  }, [stage, colors]);

  return (
    <View
      style={[
        paymentBannerStyles.container,
        {
          // TODO: Replace runtime config.accentColor hex-alpha with theme token when color source is staticized
          backgroundColor: `${config.accentColor}0A`,
          borderColor: `${config.accentColor}20`,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={[paymentBannerStyles.accentBar, { backgroundColor: config.accentColor }]} />
      <View style={paymentBannerStyles.content}>
        {config.showDot ? (
          <Reanimated.View
            style={[paymentBannerStyles.dot, { backgroundColor: config.accentColor }, reducedMotion ? undefined : dotStyle]}
          />
        ) : (
          config.icon
        )}
        <View style={paymentBannerStyles.textBlock}>
          <Text
            style={[
              paymentBannerStyles.label,
              {
                color:
                  stage === 'payment_failed'
                    ? colors.danger
                    : stage === 'payment_succeeded'
                      ? colors.success
                      : stage === 'unknown_outcome'
                        ? colors.textPrimary
                        : colors.textSecondary,
              },
            ]}
            // unknown_outcome carries a longer recovery instruction the user
            // must read in full — never truncate it.
            numberOfLines={stage === 'unknown_outcome' ? undefined : 2}
          >
            {label}
          </Text>
          {actionLabel && onAction ? (
            <Pressable
              onPress={onAction}
              disabled={actionDisabled}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              style={({ pressed }) => [
                paymentBannerStyles.action,
                (pressed || actionDisabled) && { opacity: 0.6 },
              ]}
            >
              <Text style={[paymentBannerStyles.actionText, { color: config.accentColor }]}>
                {actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const paymentBannerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.hairline,
    overflow: 'hidden',
    marginTop: Space.sm,
  },
  accentBar: {
    width: 3,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: RadiusRoleValue.pillAvatar,
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: Space.xs,
  },
  label: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
  },
  action: {
    alignSelf: 'flex-start',
  },
  actionText: {
    fontSize: TypographyV2.captionElevated.size,
    lineHeight: TypographyV2.captionElevated.lineHeight,
    fontFamily: FontFamily.semibold,
  },
});
