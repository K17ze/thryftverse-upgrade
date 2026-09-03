import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';

interface Props {
  /** Primary action label */
  primaryLabel: string;
  /** Primary action handler */
  onPrimary: () => void;
  /** Primary action loading state */
  primaryLoading?: boolean;
  /** Secondary action label (Buy Now) */
  secondaryLabel?: string;
  /** Secondary action handler */
  onSecondary?: () => void;
  /** Context line shown above the primary action (e.g. "Minimum bid £45") */
  contextLine?: string;
  /** Variant: bidder, seller, terminal */
  variant?: 'bidder' | 'seller' | 'terminal';
  /** Terminal message (for ended auctions) */
  terminalMessage?: string;
  /** Terminal icon */
  terminalIcon?: keyof typeof Ionicons.glyphMap;
  /** Terminal accent color */
  terminalAccent?: string;
  /** Disabled state */
  disabled?: boolean;
}

export function AuctionStickyBidDock({
  primaryLabel,
  onPrimary,
  primaryLoading,
  secondaryLabel,
  onSecondary,
  contextLine,
  variant = 'bidder',
  terminalMessage,
  terminalIcon,
  terminalAccent,
  disabled }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  if (variant === 'terminal') {
    return (
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, Space.sm) }]}>
        <View style={styles.terminalRow}>
          <Ionicons
            name={terminalIcon ?? 'checkmark-circle'}
            size={16}
            color={terminalAccent ?? colors.textMuted}
          />
          <Text style={[styles.terminalText, { color: terminalAccent ?? colors.textSecondary }]}>
            {terminalMessage ?? 'Auction ended'}
          </Text>
        </View>
      </View>
    );
  }

  if (variant === 'seller') {
    return (
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, Space.sm) }]}>
        <View style={styles.sellerRow}>
          <Ionicons name="storefront-outline" size={16} color={colors.brand} />
          <Text style={styles.sellerText}>{terminalMessage ?? 'Your auction'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, Space.sm) }]}>
      {contextLine && (
        <Text style={styles.contextLine} numberOfLines={1}>{contextLine}</Text>
      )}
      <View style={styles.actionRow}>
        <AnimatedPressable
          style={[styles.primaryBtn, disabled && styles.btnDisabled]}
          scaleValue={0.97}
          onPress={disabled ? undefined : onPrimary}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          disabled={disabled}
        >
          {primaryLoading ? (
            <Text style={styles.primaryText}>Submitting…</Text>
          ) : (
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          )}
        </AnimatedPressable>
        {secondaryLabel && onSecondary && (
          <AnimatedPressable
            style={styles.secondaryBtn}
            scaleValue={0.97}
            onPress={onSecondary}
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
          >
            <Text style={styles.secondaryText} numberOfLines={1}>{secondaryLabel}</Text>
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  dock: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  contextLine: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: Space.xs },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm },
  primaryBtn: {
    flex: 1,
    paddingVertical: Space.md + 2,
    borderRadius: Radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center' },
  btnDisabled: {
    opacity: 0.4 },
  primaryText: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.bodyStrong.size,
    color: colors.textInverse,
    letterSpacing: 0.2 },
  secondaryBtn: {
    paddingHorizontal: Space.md + 4,
    paddingVertical: Space.md + 2,
    borderRadius: Radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center' },
  secondaryText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size,
    color: colors.textPrimary },
  terminalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md },
  terminalText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md },
  sellerText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary } });
