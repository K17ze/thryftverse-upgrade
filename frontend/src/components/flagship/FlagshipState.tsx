import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type } from '../../theme/designTokens';
import { Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

export interface FlagshipStateProps {
  variant: 'loading' | 'empty' | 'error' | 'offline' | 'unavailable';
  title?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

const DEFAULT_TITLES: Record<string, string> = {
  loading: 'Loading...',
  empty: 'Nothing here',
  error: 'Something went wrong',
  offline: 'You are offline',
  unavailable: 'Not available',
};

const DEFAULT_SUBTITLES: Record<string, string> = {
  loading: 'Please wait a moment.',
  empty: 'When content appears, you will see it here.',
  error: 'We could not load this. Tap below to try again.',
  offline: 'Check your connection and try again.',
  unavailable: 'This feature is not available right now.',
};

const DEFAULT_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  loading: 'sync-outline',
  empty: 'cube-outline',
  error: 'alert-circle-outline',
  offline: 'cloud-offline-outline',
  unavailable: 'lock-closed-outline',
};

export function FlagshipState({
  variant,
  title,
  subtitle,
  actionLabel,
  onAction,
  icon,
}: FlagshipStateProps) {
  const { colors } = useAppTheme();

  if (variant === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          {title ?? DEFAULT_TITLES.loading}
        </Text>
      </View>
    );
  }

  const effectiveIcon = icon ?? DEFAULT_ICONS[variant];

  return (
    <View style={styles.center}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name={effectiveIcon as any} size={28} color={colors.textMuted} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {title ?? DEFAULT_TITLES[variant]}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {subtitle ?? DEFAULT_SUBTITLES[variant]}
      </Text>
      {actionLabel && onAction && (
        <AnimatedPressable
          onPress={onAction}
          scaleValue={0.96}
          hapticFeedback="light"
          style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
        >
          <Text style={[styles.actionText, { color: colors.textPrimary }]}>{actionLabel}</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
    paddingHorizontal: Space.md,
  },
  loadingText: {
    marginTop: Space.sm,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
    marginBottom: Space.xs,
  },
  subtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
    marginBottom: Space.md,
  },
  actionBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm + 4,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  actionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
});