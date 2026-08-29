import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  SellerBadgeType,
  SellerBadgeInfo,
  SELLER_BADGES,
  deriveSellerBadges,
  SellerTrustSummary } from '../../platform/product';

interface BadgeChipProps {
  badge: SellerBadgeInfo;
  size?: 'sm' | 'md';
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function BadgeChip({ badge, size = 'md', colors, styles }: BadgeChipProps) {
  const isSm = size === 'sm';
  return (
    <View style={[styles.chip, isSm && styles.chipSm]}>
      <Ionicons
        name={badge.icon as keyof typeof Ionicons.glyphMap}
        size={isSm ? 11 : 13}
        color={colors.brand}
      />
      <Text style={[styles.chipText, isSm && styles.chipTextSm]} numberOfLines={1}>
        {badge.label}
      </Text>
    </View>
  );
}

export interface SellerStandardsBadgesProps {
  sellerTrust: SellerTrustSummary | null;
  size?: 'sm' | 'md';
  align?: 'left' | 'center';
  /** Optionally limit the number of badges shown */
  limit?: number;
}

/**
 * Displays seller standards badges derived from trust metrics.
 * Badges are truthfully earned — only shown when criteria are met.
 */
export function SellerStandardsBadges({
  sellerTrust,
  size = 'md',
  align = 'left',
  limit }: SellerStandardsBadgesProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const earnedBadges = React.useMemo(
    () => deriveSellerBadges(sellerTrust),
    [sellerTrust],
  );

  if (earnedBadges.length === 0) return null;

  const badgesToShow = limit ? earnedBadges.slice(0, limit) : earnedBadges;

  return (
    <View style={[styles.container, align === 'center' && styles.containerCenter]}>
      {badgesToShow.map((type) => {
        const badge = SELLER_BADGES[type];
        if (!badge) return null;
        return <BadgeChip key={type} badge={badge} size={size} colors={colors} styles={styles} />;
      })}
    </View>
  );
}

export { deriveSellerBadges, SELLER_BADGES };
export type { SellerBadgeType, SellerBadgeInfo };

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Space.xs },
  containerCenter: {
    justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs / 2 + 1,
    backgroundColor: colors.brandSubtle,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandBorder },
  chipSm: {
    paddingHorizontal: Space.xs + 3,
    paddingVertical: Space.xs / 2 - 1,
    gap: Space.xs / 2 - 1 },
  chipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand,
    letterSpacing: 0.1 },
  chipTextSm: {
    fontSize: 10 } });
}
