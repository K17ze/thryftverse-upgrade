import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { Space, Control } from '../../../theme/designTokens';
import { FontFamily } from '../../../theme/fontFamily';
import { TypographyV2 } from '../../../theme/typography.v2';
import { formatShortDate } from '../../../utils/dateFormat';
import type { SellerTrustSummary, ListingCommerceContext } from '../../../platform/product/listingDetailContract';

/**
 * First-viewport seller trust dossier.
 *
 * Renders the inline trust-facts only — seller rating, response time,
 * dispatch time, and buyer protection fallback — as flat hairline-
 * separated rows. Seller identity is deliberately NOT repeated here:
 * the navigable SellerInfoCard in Zone E is the sole profile entry
 * point, and a second avatar/name row read as a duplicated link.
 */
export interface CommerceTrustDossierProps {
  seller: SellerTrustSummary | null;
  commerce: ListingCommerceContext;
}

export function CommerceTrustDossier({
  seller,
  commerce,
}: CommerceTrustDossierProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <>

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
        // 0. Seller away — holiday mode pauses the shop; checkout and
        // offers are rejected server-side while it is on. The return date
        // is rendered only when the seller published one — never derived
        // from handling-time estimates. Normal dispatch/delivery claims
        // are suppressed while paused: quoting them would be untruthful.
        const sellerAway = seller?.holidayMode === true;
        if (sellerAway) {
          const backOn = seller?.holidayModeUntil
            ? formatShortDate(seller.holidayModeUntil)
            : null;
          trustRows.push({
            icon: 'sunny-outline',
            label: backOn
              ? `Seller away — back ${backOn}`
              : seller?.awayMessage || 'Seller away — shop paused',
          });
        }
        // 2. Seller rating — the trust signal the removed identity row
        // used to carry; kept as a fact row so the first viewport still
        // shows reputation without duplicating the Zone E seller card.
        if (seller?.rating != null && seller.rating > 0) {
          trustRows.push({
            icon: 'star',
            label:
              seller.reviewCount != null && seller.reviewCount > 0
                ? `${seller.rating.toFixed(1)} · ${seller.reviewCount} reviews`
                : `${seller.rating.toFixed(1)} seller rating`,
          });
        }
        // 3. Response time — "Usually responds in 2h" signal. Gated on
        // real measured hours: the backend infers responseTimeLabel from
        // response-rate bands when avgResponseHours is null, and that
        // inferred label is not a measured response time — do not render it.
        if (seller?.responseTimeLabel && seller.avgResponseHours != null) {
          trustRows.push({
            icon: 'chatbubble-ellipses-outline',
            label: seller.responseTimeLabel,
          });
        }
        // 4. Delivery — when will it arrive? Only the seller's dispatch
        // promise or the emitted shipping method qualify; the contract's
        // estimatedDeliveryStart/End fields are dead (never emitted by the
        // PDP endpoint), so no delivery window is fabricated here.
        if (sellerAway) {
          // Suppress the dispatch/delivery row — see note above.
        } else if (seller?.dispatchTimeLabel) {
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
                <Text style={[styles.trustFactText, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
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
