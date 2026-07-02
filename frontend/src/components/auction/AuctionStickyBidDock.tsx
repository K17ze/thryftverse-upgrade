import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
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
  disabled,
}: Props) {
  const insets = useSafeAreaInsets();

  if (variant === 'terminal') {
    return (
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, Space.sm) }]}>
        <View style={styles.terminalRow}>
          <Ionicons
            name={terminalIcon ?? 'checkmark-circle'}
            size={16}
            color={terminalAccent ?? Colors.textMuted}
          />
          <Text style={[styles.terminalText, { color: terminalAccent ?? Colors.textSecondary }]}>
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
          <Ionicons name="storefront-outline" size={16} color={Colors.brand} />
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

const styles = StyleSheet.create({
  dock: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  contextLine: {
    fontFamily: Typography.family.regular,
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Space.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: Space.md + 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  primaryText: {
    fontFamily: Typography.family.bold,
    fontSize: 15,
    color: Colors.textInverse,
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    paddingHorizontal: Space.md + 4,
    paddingVertical: Space.md + 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: Typography.family.semibold,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  terminalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
  },
  terminalText: {
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
  },
  sellerText: {
    fontFamily: Typography.family.semibold,
    fontSize: 14,
    color: Colors.textPrimary,
  },
});
