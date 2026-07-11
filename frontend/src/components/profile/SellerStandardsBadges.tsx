import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import {
  SellerBadgeType,
  SellerBadgeInfo,
  SELLER_BADGES,
  deriveSellerBadges,
  SellerTrustSummary,
} from '../../platform/product';

interface BadgeChipProps {
  badge: SellerBadgeInfo;
  size?: 'sm' | 'md';
}

function BadgeChip({ badge, size = 'md' }: BadgeChipProps) {
  const isSm = size === 'sm';
  return (
    <View style={[styles.chip, isSm && styles.chipSm]}>
      <Ionicons
        name={badge.icon as keyof typeof Ionicons.glyphMap}
        size={isSm ? 11 : 13}
        color={Colors.brand}
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
  limit,
}: SellerStandardsBadgesProps) {
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
        return <BadgeChip key={type} badge={badge} size={size} />;
      })}
    </View>
  );
}

export { deriveSellerBadges, SELLER_BADGES };
export type { SellerBadgeType, SellerBadgeInfo };

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Space.xs,
  },
  containerCenter: {
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: `${Colors.brand}10`,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${Colors.brand}30`,
  },
  chipSm: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 3,
  },
  chipText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    letterSpacing: 0.1,
  },
  chipTextSm: {
    fontSize: 10,
  },
});
