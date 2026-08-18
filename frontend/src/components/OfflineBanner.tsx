/**
 * OfflineBanner — shared offline indicator for data-heavy surfaces.
 *
 * Subscribes to NetInfo via `useConnectivity` and renders a quiet banner
 * when the device is offline. Does not block interaction — cached data
 * may still be visible. Follows AGENTS.md §14: "offline" state must be
 * designed, not just a blank screen.
 *
 * Variants:
 *  - default: full-width banner with icon + message + optional retry
 *  - compact: inline pill-style banner for tighter surfaces
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useConnectivity } from '../hooks/useConnectivity';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { AnimatedPressable } from './AnimatedPressable';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../theme/motionTokens';

export interface OfflineBannerProps {
  /** Override the message text */
  message?: string;
  /** Called when user taps the retry/sync action */
  onRetry?: () => void;
  /** Compact variant for inline use */
  compact?: boolean;
}

const DEFAULT_MESSAGE = 'You are offline. Showing cached content.';

export function OfflineBanner({
  message,
  onRetry,
  compact = false,
}: OfflineBannerProps) {
  const { colors } = useAppTheme();
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();

  const opacityStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { opacity: isOffline ? 1 : 0 };
    }
    return {
      opacity: withTiming(isOffline ? 1 : 0, {
        duration: Motion.duration.normal,
        easing: Easing.out(Easing.ease),
      }),
    };
  }, [isOffline, reducedMotion]);

  if (!isOffline) return null;

  const text = message ?? DEFAULT_MESSAGE;

  if (compact) {
    return (
      <Reanimated.View
        style={[
          styles.compact,
          {
            backgroundColor: colors.warningSubtle,
            borderColor: colors.warningBorder,
          },
          opacityStyle,
        ]}
        accessibilityRole="alert"
        accessibilityLabel={text}
      >
        <Ionicons name="cloud-offline-outline" size={13} color={colors.warning} />
        <Text
          style={[styles.compactText, { color: colors.warning }]}
          numberOfLines={1}
        >
          Offline
        </Text>
        {onRetry ? (
          <AnimatedPressable
            onPress={onRetry}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Retry"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.retryText, { color: colors.warning }]}>
              Retry
            </Text>
          </AnimatedPressable>
        ) : null}
      </Reanimated.View>
    );
  }

  return (
    <Reanimated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.warningSubtle,
          borderTopColor: colors.warningBorder,
          borderBottomColor: colors.warningBorder,
        },
        opacityStyle,
      ]}
      accessibilityRole="alert"
      accessibilityLabel={text}
    >
      <Ionicons name="cloud-offline-outline" size={15} color={colors.warning} />
      <Text
        style={[styles.text, { color: colors.textSecondary }]}
        numberOfLines={2}
      >
        {text}
      </Text>
      {onRetry ? (
        <AnimatedPressable
          onPress={onRetry}
          activeOpacity={0.7}
          scaleValue={0.95}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Retry"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.retryBtn}
        >
          <Text style={[styles.retryText, { color: colors.warning }]}>
            Retry
          </Text>
        </AnimatedPressable>
      ) : null}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
  },
  retryBtn: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  retryText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.label.letterSpacing,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  compactText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.label.letterSpacing,
  },
});
