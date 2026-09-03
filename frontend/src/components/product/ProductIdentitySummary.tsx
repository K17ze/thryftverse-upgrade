import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
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
  engagement }: ProductIdentitySummaryProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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
          <Ionicons name="people-outline" size={13} color={colors.brand} />
          <Text style={styles.interestText} numberOfLines={1}>
            {interestCount} people are interested
          </Text>
          {showWatching ? (
            <View style={styles.watchingBadge}>
              <Ionicons name="eye" size={10} color={colors.danger} />
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm },
  brand: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    marginBottom: Space.xs },
  title: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary,
    lineHeight: TypographyV2.screenTitle.lineHeight + 2,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    marginBottom: Space.sm },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
    minWidth: 0 },
  price: {
    fontSize: TypographyV2.priceHero.size,
    fontFamily: TypographyV2.priceHero.fontFamily,
    color: colors.textPrimary,
    letterSpacing: -0.6,
    flexShrink: 1,
    minWidth: 0 },
  originalPrice: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
    flexShrink: 0 },
  dropBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: colors.danger,
    flexShrink: 0 },
  dropBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextPrimary,
    letterSpacing: 0.2 },
  interestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.xs },
  interestText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    flexShrink: 1 },
  watchingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.full,
    backgroundColor: colors.dangerSubtle,
    flexShrink: 0 },
  watchingText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger },
  protectionTotal: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.xs },
  izeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.1 },
  engagementText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.xs } });
}
