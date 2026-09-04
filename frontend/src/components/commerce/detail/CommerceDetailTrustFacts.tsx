import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppIcon } from '../../common/AppIcon';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { FontFamily } from '../../../theme/designTokens';
import type { IoniconsGlyphName } from '../../../theme/iconTokens';
import type { SellerTrustSummary, ListingCommerceContext } from '../../../platform/product';

export interface CommerceDetailTrustFactsProps {
  seller: SellerTrustSummary | null | undefined;
  commerce: ListingCommerceContext;
  /** Maximum rows to render (default 3). */
  maxRows?: number;
}

interface TrustRow {
  icon: IoniconsGlyphName;
  label: string;
}

function deriveTrustRows(
  seller: SellerTrustSummary | null | undefined,
  commerce: ListingCommerceContext,
): TrustRow[] {
  const trustRows: TrustRow[] = [];

  if (seller?.rating != null && seller.rating > 0) {
    const ratingText =
      seller.reviewCount != null && seller.reviewCount > 0
        ? `${seller.rating.toFixed(1)} · ${seller.reviewCount} reviews`
        : `${seller.rating.toFixed(1)}`;
    trustRows.push({
      icon: 'star-outline',
      label: ratingText,
    });
  }

  if (seller?.verified || seller?.verificationTier === 'seller' || seller?.verificationTier === 'id') {
    const verifyLabel =
      seller.verificationTier === 'seller'
        ? 'Trusted Seller'
        : seller.verificationTier === 'id'
          ? 'ID Verified'
          : 'Verified';
    trustRows.push({
      icon: 'checkmark-circle-outline',
      label: verifyLabel,
    });
  }

  if (seller?.responseTimeLabel) {
    trustRows.push({
      icon: 'chatbubble-ellipses-outline',
      label: seller.responseTimeLabel,
    });
  }

  if (seller?.dispatchTimeLabel) {
    trustRows.push({
      icon: 'car-outline',
      label: seller.dispatchTimeLabel,
    });
  } else if (commerce.shippingMethod) {
    trustRows.push({
      icon: commerce.shippingPayer === 'seller' ? 'gift-outline' : 'car-outline',
      label:
        commerce.shippingPayer === 'seller'
          ? `Free ${commerce.shippingMethod}`
          : commerce.shippingMethod,
    });
  }

  if (trustRows.length === 0 && commerce.protectionPolicy?.available) {
    trustRows.push({
      icon: 'checkmark-circle-outline',
      label: commerce.protectionPolicy.label ?? 'Buyer Protection',
    });
  }

  return trustRows;
}

export function CommerceDetailTrustFacts({
  seller,
  commerce,
  maxRows = 3,
}: CommerceDetailTrustFactsProps) {
  const { colors } = useAppTheme();

  const rows = useMemo(() => deriveTrustRows(seller, commerce), [seller, commerce]);
  if (rows.length === 0) return null;

  const elevated = rows.slice(0, maxRows);

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
          <AppIcon name={row.icon} size={16} color={colors.textSecondary} />
          <Text
            style={[styles.trustFactText, { color: colors.textSecondary }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1}
          >
            {row.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Trust facts ──
  // Flat vertical list of icon + label rows, separated by hairlines.
  // Flat canvas + hairlines are the default utility structure.
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
  trustFactText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
});
