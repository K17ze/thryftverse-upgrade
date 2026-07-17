import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { FlagshipEmptyGraphic } from '../flagship';

export type CoOwnStateVariant =
  | 'loading'
  | 'empty'
  | 'error'
  | 'offline'
  | 'unavailable'
  | 'stale'
  | 'halted'
  | 'restricted'
  | 'thin';

export interface CoOwnStateCanvasProps {
  variant: CoOwnStateVariant;
  title?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  emptyGraphicVariant?: 'bag' | 'box' | 'search' | 'chat' | 'image';
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** For stale: the timestamp of the last reliable data. */
  staleTimestamp?: string;
  /** For halted: the reason for the halt. */
  haltReason?: string;
  /** For restricted: the reason for the restriction. */
  restrictedReason?: string;
  children?: React.ReactNode;
}

const DEFAULTS: Record<CoOwnStateVariant, { title: string; subtitle: string; icon: string; graphic: 'bag' | 'box' | 'search' | 'chat' | 'image' }> = {
  loading: { title: 'Loading', subtitle: 'Preparing the marketplace…', icon: 'sync-outline', graphic: 'bag' },
  empty: { title: 'Nothing here yet', subtitle: 'When items appear, you will find them here.', icon: 'cube-outline', graphic: 'bag' },
  error: { title: 'Could not load', subtitle: 'Tap below to try again.', icon: 'alert-circle-outline', graphic: 'box' },
  offline: { title: 'You are offline', subtitle: 'Check your connection and try again.', icon: 'cloud-offline-outline', graphic: 'search' },
  unavailable: { title: 'Not available', subtitle: 'This feature is not available right now.', icon: 'lock-closed-outline', graphic: 'image' },
  stale: { title: 'Data stale', subtitle: 'Showing the last reliable data. Reconnecting…', icon: 'time-outline', graphic: 'search' },
  halted: { title: 'Trading halted', subtitle: 'Trading is temporarily suspended.', icon: 'pause-circle-outline', graphic: 'box' },
  restricted: { title: 'Not eligible in your region', subtitle: 'This instrument is not available for trading in your jurisdiction.', icon: 'lock-closed-outline', graphic: 'image' },
  thin: { title: 'Thin market', subtitle: 'No active orders on one side. Use limit orders or request a quote.', icon: 'water-outline', graphic: 'search' },
};

export function CoOwnStateCanvas({
  variant,
  title,
  subtitle,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  emptyGraphicVariant,
  icon,
  staleTimestamp,
  haltReason,
  restrictedReason,
  children,
}: CoOwnStateCanvasProps) {
  const { colors } = useAppTheme();
  const defaults = DEFAULTS[variant];

  // Build context-aware subtitle for exchange states
  let resolvedSubtitle = subtitle ?? defaults.subtitle;
  if (!subtitle) {
    if (variant === 'stale' && staleTimestamp) {
      resolvedSubtitle = `Last reliable data: ${staleTimestamp}. Reconnecting…`;
    } else if (variant === 'halted' && haltReason) {
      resolvedSubtitle = `Trading halted: ${haltReason}`;
    } else if (variant === 'restricted' && restrictedReason) {
      resolvedSubtitle = restrictedReason;
    }
  }

  if (variant === 'loading') {
    return (
      <View style={styles.center}>
        <View style={styles.skeletonGraphic} />
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonSubtitle} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          {title ?? defaults.title}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <FlagshipEmptyGraphic
        variant={emptyGraphicVariant ?? defaults.graphic}
        size={140}
        color={colors.brand}
      />
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {title ?? defaults.title}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {resolvedSubtitle}
      </Text>
      {children}
      <View style={styles.actionRow}>
        {actionLabel && onAction && (
          <AnimatedPressable
            onPress={onAction}
            scaleValue={0.97}
            hapticFeedback="light"
            style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text style={[styles.primaryBtnText, { color: colors.background }]}>{actionLabel}</Text>
          </AnimatedPressable>
        )}
        {secondaryActionLabel && onSecondaryAction && (
          <AnimatedPressable
            onPress={onSecondaryAction}
            scaleValue={0.97}
            hapticFeedback="light"
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={secondaryActionLabel}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>{secondaryActionLabel}</Text>
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xxl,
    paddingHorizontal: Space.lg,
  },
  loadingText: {
    marginTop: Space.md,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  // Skeleton placeholders (match final layout geometry)
  skeletonGraphic: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  skeletonTitle: {
    width: 140,
    height: 18,
    borderRadius: 4,
    marginTop: Space.md,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  skeletonSubtitle: {
    width: 200,
    height: 14,
    borderRadius: 4,
    marginTop: Space.xs,
    backgroundColor: 'rgba(128,128,128,0.10)',
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
    marginBottom: Space.lg,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
  },
  primaryBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm + 4,
    borderRadius: Radius.lg,
  },
  primaryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  secondaryBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm + 4,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
});
