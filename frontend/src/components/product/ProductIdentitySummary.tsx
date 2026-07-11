import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import type { ListingEngagementSummary } from '../../platform/product';

export interface ProductIdentitySummaryProps {
  brand?: string;
  title: string;
  price: string;
  originalPrice?: string | null;
  hasDiscount?: boolean;
  /** Percentage discount (0-100). When provided, shows a price-drop badge. */
  discountPercent?: number | null;
  protectionTotal?: string | null;
  izeText?: string | null;
  engagement?: ListingEngagementSummary;
}

export function ProductIdentitySummary({
  brand,
  title,
  price,
  originalPrice,
  hasDiscount,
  discountPercent,
  protectionTotal,
  izeText,
  engagement,
}: ProductIdentitySummaryProps) {
  const engagementParts: string[] = [];
  if (engagement?.likes && engagement.likes > 0) {
    engagementParts.push(`${engagement.likes} like${engagement.likes > 1 ? 's' : ''}`);
  }
  if (engagement?.views && engagement.views > 0) {
    engagementParts.push(`${engagement.views} view${engagement.views > 1 ? 's' : ''}`);
  }
  if (engagement?.saves && engagement.saves > 0) {
    engagementParts.push(`${engagement.saves} save${engagement.saves > 1 ? 's' : ''}`);
  }

  // "N people interested" — uses likes as the interest signal (Vinted/eBay pattern)
  const interestCount = (engagement?.likes ?? 0) + (engagement?.saves ?? 0);
  const showInterestSignal = interestCount >= 5;
  const watcherCount = engagement?.saves ?? 0;
  const showWatching = watcherCount >= 1;

  const showDropBadge = hasDiscount && discountPercent != null && discountPercent > 0;

  return (
    <View style={styles.container}>
      {brand ? (
        <Text style={styles.brand} numberOfLines={1}>
          {brand}
        </Text>
      ) : null}

      <Text style={styles.title} numberOfLines={3}>
        {title}
      </Text>

      <View style={styles.priceRow}>
        <Text style={styles.price} numberOfLines={1}>{price}</Text>
        {hasDiscount && originalPrice ? (
          <Text style={styles.originalPrice} numberOfLines={1}>{originalPrice}</Text>
        ) : null}
        {showDropBadge ? (
          <View style={styles.dropBadge}>
            <Text style={styles.dropBadgeText}>-{Math.round(discountPercent!)}%</Text>
          </View>
        ) : null}
      </View>

      {izeText ? (
        <Text style={styles.izeText} numberOfLines={1}>{izeText}</Text>
      ) : null}

      {protectionTotal ? (
        <Text style={styles.protectionTotal} numberOfLines={2}>
          {protectionTotal} with Buyer Protection
        </Text>
      ) : null}

      {showInterestSignal ? (
        <View style={styles.interestRow}>
          <Ionicons name="people-outline" size={13} color={Colors.brand} />
          <Text style={styles.interestText} numberOfLines={1}>
            {interestCount} people are interested
          </Text>
          {showWatching ? (
            <View style={styles.watchingBadge}>
              <Ionicons name="eye" size={10} color={Colors.danger} />
              <Text style={styles.watchingText} numberOfLines={1}>
                {watcherCount} watching
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {engagementParts.length > 0 && !showInterestSignal ? (
        <Text style={styles.engagementText} numberOfLines={1}>{engagementParts.join(' · ')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  brand: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginBottom: Space.xs,
  },
  title: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    lineHeight: 28,
    letterSpacing: -0.4,
    marginBottom: Space.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
    minWidth: 0,
  },
  price: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
    flexShrink: 1,
    minWidth: 0,
  },
  originalPrice: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
    flexShrink: 0,
  },
  dropBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.danger,
    flexShrink: 0,
  },
  dropBadgeText: {
    fontSize: 11,
    fontFamily: Typography.family.bold,
    color: '#fff',
    letterSpacing: 0.2,
  },
  interestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Space.xs,
  },
  interestText: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  watchingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.danger}12`,
    flexShrink: 0,
  },
  watchingText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
  },
  protectionTotal: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: Space.xs,
  },
  izeText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  engagementText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: Space.xs,
  },
});
