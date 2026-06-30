import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import type { ListingEngagementSummary } from '../../platform/product';

export interface ProductIdentitySummaryProps {
  brand?: string;
  title: string;
  price: string;
  originalPrice?: string | null;
  hasDiscount?: boolean;
  protectionTotal?: string | null;
  engagement?: ListingEngagementSummary;
}

export function ProductIdentitySummary({
  brand,
  title,
  price,
  originalPrice,
  hasDiscount,
  protectionTotal,
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
        <Text style={styles.price}>{price}</Text>
        {hasDiscount && originalPrice ? (
          <Text style={styles.originalPrice}>{originalPrice}</Text>
        ) : null}
      </View>

      {protectionTotal ? (
        <Text style={styles.protectionTotal}>
          {protectionTotal} with Buyer Protection
        </Text>
      ) : null}

      {engagementParts.length > 0 ? (
        <Text style={styles.engagementText}>{engagementParts.join(' · ')}</Text>
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
  },
  price: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
  },
  originalPrice: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  protectionTotal: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: Space.xs,
  },
  engagementText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: Space.xs,
  },
});
