import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

export interface SellerPillarTilesProps {
  /** To-ship count — renders the attention badge on the Orders tile. */
  pendingOrdersCount: number;
  onOpenWallet: () => void;
  onOpenOrders: () => void;
  onOpenAnalytics: () => void;
  onOpenCloset: () => void;
}

const TILE_ICON = IconSize.lg;

/**
 * SellerPillarTiles — the eBay-style quick-access row: one rounded icon
 * tile per pillar (Wallet, Orders, Analytics, Closet) at the top of the
 * hub, with the content modules below. Orders carries the attention badge
 * when work is waiting; the other tiles stay clean.
 */
export const SellerPillarTiles: React.FC<SellerPillarTilesProps> = ({
  pendingOrdersCount,
  onOpenWallet,
  onOpenOrders,
  onOpenAnalytics,
  onOpenCloset,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  const tiles = [
    {
      id: 'wallet',
      icon: 'wallet' as const,
      label: 'Wallet',
      onPress: onOpenWallet,
      iconColor: 'brand' as keyof ThemeColors,
      accessibilityLabel: 'Wallet, balances and payouts',
    },
    {
      id: 'orders',
      icon: 'package' as const,
      label: 'Orders',
      onPress: onOpenOrders,
      iconColor: (pendingOrdersCount > 0 ? 'danger' : 'textPrimary') as keyof ThemeColors,
      badge: pendingOrdersCount > 0 ? (pendingOrdersCount > 99 ? '99+' : `${pendingOrdersCount}`) : null,
      accessibilityLabel:
        pendingOrdersCount > 0
          ? `Orders, ${pendingOrdersCount} to ship`
          : 'Orders',
    },
    {
      id: 'analytics',
      icon: 'trending' as const,
      label: 'Analytics',
      onPress: onOpenAnalytics,
      iconColor: 'textPrimary' as keyof ThemeColors,
      accessibilityLabel: 'Analytics, store performance',
    },
    {
      id: 'closet',
      icon: 'bookmark' as const,
      label: 'Closet',
      onPress: onOpenCloset,
      iconColor: 'textPrimary' as keyof ThemeColors,
      accessibilityLabel: 'Closet, saved pieces',
    },
  ];

  return (
    <View style={styles.container}>
      {tiles.map((tile) => (
        <AnimatedPressable
          key={tile.id}
          style={styles.tile}
          onPress={tile.onPress}
          activeOpacity={0.7}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={tile.accessibilityLabel}
        >
          <View style={styles.iconWrap}>
            <AppIcon concept={tile.icon} size={TILE_ICON} color={tile.iconColor} opticalCenter accessible={false} />
            {tile.badge != null && (
              <View style={styles.badge}>
                <Text style={styles.badgeText} numberOfLines={1}>
                  {tile.badge}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.tileLabel} numberOfLines={1}>
            {tile.label}
          </Text>
        </AnimatedPressable>
      ))}
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      marginTop: Space.md,
    },
    tile: {
      flex: 1,
      height: 84,
      // Matches the money panel (Radius.xl): one panel grammar per viewport.
      borderRadius: Radius.xl,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
    },
    iconWrap: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: -8,
      right: -14,
      minWidth: 20,
      height: 20,
      paddingHorizontal: Space.xs,
      borderRadius: Radius.full,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: FontFamily.bold,
      color: colors.textInverse,
      fontVariant: ['tabular-nums'],
    },
    tileLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
  });
}
