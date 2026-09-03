import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { SellerTrustSummary, ListingCommerceContext } from '../../platform/product/listingDetailContract';

// ───────────────────────────────────────────────────────────────────────────
// TrustFactsSection — Zone C trust facts (max 3).
//
// Seller rating, verification, response time, dispatch time, and a buyer-
// protection fallback. Flat rows with hairline separators — no chips, no
// cards. Each row is one fact with an icon + label. Behaviour is identical
// to the previous inline IIFE.
// ───────────────────────────────────────────────────────────────────────────

export interface TrustFactsSectionProps {
  seller: SellerTrustSummary | null;
  commerce: ListingCommerceContext;
  colors: ThemeColors;
}

export function TrustFactsSection({ seller, commerce, colors }: TrustFactsSectionProps) {
  const trustRows: { icon: keyof typeof Ionicons.glyphMap; label: string; dotColor?: string }[] = [];
  // 1. Seller rating — social proof (review count/score summary)
  if (seller?.rating != null && seller.rating > 0) {
    const ratingText = seller.reviewCount != null && seller.reviewCount > 0
      ? `${seller.rating.toFixed(1)} · ${seller.reviewCount} reviews`
      : `${seller.rating.toFixed(1)}`;
    trustRows.push({
      icon: 'star-outline',
      label: ratingText,
    });
  }
  // 2. Seller verification — trust badge for verified sellers
  if (seller?.verified || seller?.verificationTier === 'seller' || seller?.verificationTier === 'id') {
    const verifyLabel = seller.verificationTier === 'seller'
      ? 'Trusted Seller'
      : seller.verificationTier === 'id'
        ? 'ID Verified'
        : 'Verified';
    trustRows.push({
      icon: 'checkmark-circle-outline',
      label: verifyLabel,
    });
  }
  // 3. Response time — "Usually responds in 2h" signal
  if (seller?.responseTimeLabel) {
    trustRows.push({
      icon: 'chatbubble-ellipses-outline',
      label: seller.responseTimeLabel,
    });
  }
  // 4. Dispatch time — when will it arrive?
  if (seller?.dispatchTimeLabel) {
    trustRows.push({
      icon: 'car-outline',
      label: seller.dispatchTimeLabel,
    });
  } else if (commerce.shippingMethod) {
    trustRows.push({
      icon: commerce.shippingPayer === 'seller' ? 'gift-outline' : 'car-outline',
      label: commerce.shippingPayer === 'seller'
        ? `Free ${commerce.shippingMethod}`
        : commerce.shippingMethod,
    });
  }
  // 5. Buyer protection fallback — when no seller rating or dispatch time
  // exists, the first viewport must still carry at least one trust signal.
  if (trustRows.length === 0 && commerce.protectionPolicy?.available) {
    trustRows.push({
      icon: 'checkmark-circle-outline',
      label: commerce.protectionPolicy.label ?? 'Buyer Protection',
    });
  }
  if (trustRows.length === 0) return null;
  const elevated = trustRows.slice(0, 3);
  return (
    <View style={styles.trustFactsSection}>
      {elevated.map((row, i) => (
        <View
          key={i}
          style={[
            styles.trustFactRow,
            i < elevated.length - 1 && { borderBottomColor: colors.borderSubtle },
          ]}
        >
          {row.dotColor ? (
            <View style={[styles.trustFactDot, { backgroundColor: row.dotColor }]} />
          ) : (
            <Ionicons name={row.icon} size={16} color={colors.textSecondary} />
          )}
          <Text style={[styles.trustFactText, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1}>
            {row.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  trustFactsSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  trustFactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    minHeight: Control.hit,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  trustFactDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: (Space.xs + 2) / 2,
    flexShrink: 0,
  },
  trustFactText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
});
