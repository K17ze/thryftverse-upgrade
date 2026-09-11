import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

export interface SellerPillarTilesProps {
  /** To-ship count — renders the attention badge on the Orders tile. */
  pendingOrdersCount: number;
  /** Optional formatted balance for the Wallet tile subtitle. */
  walletBalanceLabel?: string;
  onOpenWallet: () => void;
  onOpenOrders: () => void;
  onOpenAnalytics: () => void;
  onOpenCloset: () => void;
}

/**
 * SellerPillarTiles — 2+2 quick-access grid with visual hierarchy.
 * Top row: Wallet + Orders (primary, daily operational) — taller tiles,
 * prominent icon, one-line context subtitle.
 * Bottom row: Analytics + Closet (secondary, discovery) — compact,
 * icon + label only. Row-height asymmetry breaks the generic 4-equal grid.
 */
export const SellerPillarTiles: React.FC<SellerPillarTilesProps> = ({
  pendingOrdersCount,
  walletBalanceLabel,
  onOpenWallet,
  onOpenOrders,
  onOpenAnalytics,
  onOpenCloset,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const ordersSub = pendingOrdersCount > 0 ? `${pendingOrdersCount} to ship` : 'Up to date';

  const primaryTiles = [
    {
      id: 'wallet', icon: 'wallet' as const, label: 'Wallet',
      subtitle: walletBalanceLabel, onPress: onOpenWallet,
      iconColor: 'brand' as keyof ThemeColors,
      accessibilityLabel: walletBalanceLabel ? `Wallet, ${walletBalanceLabel}` : 'Wallet, balances and payouts',
    },
    {
      id: 'orders', icon: 'package' as const, label: 'Orders',
      subtitle: ordersSub, onPress: onOpenOrders,
      iconColor: (pendingOrdersCount > 0 ? 'warning' : 'textSecondary') as keyof ThemeColors,
      badge: pendingOrdersCount > 0 ? (pendingOrdersCount > 99 ? '99+' : `${pendingOrdersCount}`) : null,
      accessibilityLabel: pendingOrdersCount > 0 ? `Orders, ${pendingOrdersCount} to ship` : 'Orders',
    },
  ];

  const secondaryTiles = [
    { id: 'analytics', icon: 'trending' as const, label: 'Analytics', onPress: onOpenAnalytics,
      iconColor: 'textSecondary' as keyof ThemeColors, accessibilityLabel: 'Analytics, store performance' },
    { id: 'closet', icon: 'bookmark' as const, label: 'Closet', onPress: onOpenCloset,
      iconColor: 'textSecondary' as keyof ThemeColors, accessibilityLabel: 'Closet, saved pieces' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.primaryRow}>
        {primaryTiles.map((tile) => (
          <AnimatedPressable
            key={tile.id}
            style={styles.primaryTile}
            onPress={tile.onPress}
            activeOpacity={0.7}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={tile.accessibilityLabel}
          >
            <View style={styles.primaryContent}>
              <View style={styles.iconWrap}>
                <AppIcon concept={tile.icon} size={IconSize.xl} color={tile.iconColor} opticalCenter accessible={false} />
                {tile.badge != null && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText} numberOfLines={1}>{tile.badge}</Text>
                  </View>
                )}
              </View>
              <View style={styles.primaryText}>
                <Text style={styles.primaryLabel} numberOfLines={1}>{tile.label}</Text>
                {tile.subtitle ? (
                  <Text style={styles.primarySubtitle} numberOfLines={1}>{tile.subtitle}</Text>
                ) : null}
              </View>
            </View>
          </AnimatedPressable>
        ))}
      </View>
      <View style={styles.secondaryRow}>
        {secondaryTiles.map((tile) => (
          <AnimatedPressable
            key={tile.id}
            style={styles.secondaryTile}
            onPress={tile.onPress}
            activeOpacity={0.7}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={tile.accessibilityLabel}
          >
            <AppIcon concept={tile.icon} size={IconSize.md} color={tile.iconColor} opticalCenter accessible={false} />
            <Text style={styles.secondaryLabel} numberOfLines={1}>{tile.label}</Text>
          </AnimatedPressable>
        ))}
      </View>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { paddingHorizontal: Space.md, marginTop: Space.md, gap: Space.sm },
    primaryRow: { flexDirection: 'row', gap: Space.sm },
    primaryTile: {
      flex: 1, minHeight: 88, borderRadius: Radius.xl,
      backgroundColor: colors.surfaceAlt, justifyContent: 'center',
    },
    primaryContent: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md },
    iconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
    primaryText: { flex: 1, gap: 1 },
    primaryLabel: {
      fontSize: TypographyV2.caption.size, lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.semibold, color: colors.textPrimary,
    },
    primarySubtitle: {
      fontSize: TypographyV2.meta.size, lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular, letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textMuted, fontVariant: ['tabular-nums'],
    },
    badge: {
      position: 'absolute', top: -8, right: -14, minWidth: 20, height: 20,
      paddingHorizontal: Space.xs, borderRadius: Radius.full,
      backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
    },
    badgeText: {
      fontSize: TypographyV2.meta.size - 1, fontFamily: FontFamily.bold,
      color: colors.textInverse, fontVariant: ['tabular-nums'],
    },
    secondaryRow: { flexDirection: 'row', gap: Space.sm },
    secondaryTile: {
      flex: 1, minHeight: Control.hit, borderRadius: Radius.xl,
      backgroundColor: colors.surfaceAlt, flexDirection: 'row', alignItems: 'center',
      gap: Space.sm, paddingHorizontal: Space.md,
    },
    secondaryLabel: {
      fontSize: TypographyV2.caption.size, lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.semibold, color: colors.textPrimary,
    },
  });
}
