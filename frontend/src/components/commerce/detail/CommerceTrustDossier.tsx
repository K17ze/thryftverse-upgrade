import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { Space, Control } from '../../../theme/designTokens';
import { FontFamily } from '../../../theme/fontFamily';
import { TypographyV2 } from '../../../theme/typography.v2';
import { CommerceDetailSellerRow } from './CommerceDetailSellerRow';
import { formatShortDate } from '../../../utils/dateFormat';
import type { SellerTrustSummary, ListingCommerceContext } from '../../../platform/product/listingDetailContract';

/**
 * First-viewport seller trust dossier.
 *
 * Composes the rich seller row (avatar, name, verification, stats)
 * with the inline trust-facts IIFE that follows it — seller rating,
 * verification, response time, dispatch time, and buyer protection
 * fallback. Up to three facts are elevated as flat hairline-separated
 * rows. This is the buyer's trust signal: who is selling this item,
 * rendered display-only in the first viewport.
 */
export interface CommerceTrustDossierProps {
  seller: SellerTrustSummary | null;
  sellerStatsLine: string | undefined;
  sellerVerified: boolean;
  commerce: ListingCommerceContext;
}

export function CommerceTrustDossier({
  seller,
  sellerStatsLine,
  sellerVerified,
  commerce,
}: CommerceTrustDossierProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      {/* ── First-viewport seller trust row (display-only) ──
          Seller identity + verification badge + stats line appears
          after the price/identity chapter. This is the buyer's trust
          signal — who is selling this item. Display-only — no onPress.
          The full SellerInfoCard (with Follow / Message / View shop
          actions and the "More from this seller" rail) lives in Zone
          E below and is the sole profile navigation point. */}
      {seller ? (
        <View style={[styles.firstViewportSellerRow, { borderBottomColor: colors.borderSubtle }]}>
          <CommerceDetailSellerRow
            variant="rich"
            avatarUri={seller.avatar ?? undefined}
            name={seller.username}
            verified={sellerVerified}
            statsLine={sellerStatsLine}
            ratingLine={
              seller?.rating != null && seller.rating > 0
                ? (seller.reviewCount != null && seller.reviewCount > 0
                  ? `${seller.rating.toFixed(1)} · ${seller.reviewCount} reviews`
                  : `${seller.rating.toFixed(1)}`)
                : undefined
            }
            locationLine={seller?.location ?? undefined}
          />
        </View>
      ) : null}

      {/* ── Zone C — Trust facts (max 3) ──
          Seller rating and dispatch time — the facts a buyer needs
          to decide whether to keep reading. Condition is already
          shown in the attribute row above, so it is not repeated
          here. Full commerce details (protection, returns,
          authenticity) live in the Shipping & returns section below.
          Flat rows with hairline separators — no chips, no cards.
          Each row is one fact with an icon + label, separated by
          hairlines for clear scanning. */}
      {(() => {
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
        // 4. Delivery — when will it arrive? Combines the seller's
        // dispatch promise with the server-provided estimated delivery
        // window into a single row: two truthful facts, one line. When
        // only the estimate exists it still earns the row — delivery
        // timing is a first-viewport decision fact.
        const deliveryWindow = (() => {
          const start = commerce.estimatedDeliveryStart
            ? formatShortDate(commerce.estimatedDeliveryStart)
            : '';
          const end = commerce.estimatedDeliveryEnd
            ? formatShortDate(commerce.estimatedDeliveryEnd)
            : '';
          if (start && end) return `${start}–${end}`;
          return start || end || null;
        })();
        const deliveryEstimate = deliveryWindow ? `Est. ${deliveryWindow}` : null;
        if (seller?.dispatchTimeLabel) {
          trustRows.push({
            icon: 'car-outline',
            label: [seller.dispatchTimeLabel, deliveryEstimate].filter(Boolean).join(' · '),
          });
        } else if (commerce.shippingMethod) {
          trustRows.push({
            icon: commerce.shippingPayer === 'seller' ? 'gift-outline' : 'car-outline',
            label: [
              commerce.shippingPayer === 'seller'
                ? `Free ${commerce.shippingMethod}`
                : commerce.shippingMethod,
              deliveryEstimate,
            ].filter(Boolean).join(' · '),
          });
        } else if (deliveryEstimate) {
          trustRows.push({
            icon: 'car-outline',
            label: `Est. delivery ${deliveryWindow}`,
          });
        }
        // 5. Buyer protection fallback — per research doc M1: when no
        // seller rating or dispatch time exists, the first viewport
        // must still carry at least one trust signal. For a
        // stranger-to-stranger marketplace, buyer protection / escrow
        // is the baseline trust guarantee.
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
                <Text style={[styles.trustFactText, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                  {row.label}
                </Text>
              </View>
            ))}
          </View>
        );
      })()}
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  // ── First-viewport seller trust row ──
  // Sits on the flat canvas right after the media stage, before the
  // price identity chapter. Horizontal padding matches the identity
  // rhythm; no card surface — hairline-only separation per surface
  // budget. The row itself carries its own vertical padding.
  firstViewportSellerRow: {
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent', // overridden inline with theme color
  },
  // ── Trust facts (flat rows with hairline separators) ──
  // Flat rows, no chips, no cards. Each row is one fact with icon +
  // label, separated by hairlines. Flat canvas + hairlines are the
  // default utility structure.
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
    borderBottomColor: 'transparent', // overridden inline with theme color
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
