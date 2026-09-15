import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import type { Listing } from '../../services/listingsApi';
import type { Listing as CatalogListing } from '../../domain';
import type { DisplayReadyListing } from '../../services/listingMapper';
import type { SellerTrustSummary } from '../../platform/product';
import { HorizontalRail } from '../HorizontalRail';
import { ProductCard } from '../ProductCard';
import { SellerInfoCard } from '../commerce/detail';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface ItemDetailSellerSectionProps {
  /** The resolved listing (rail filter source: id + sellerId). */
  item: Listing;
  /** Resolved seller trust summary (null hides the whole section). */
  seller: SellerTrustSummary | null;
  /**
   * "More from this seller" rail items — the backend recommendation
   * section `more_from_seller`, which already filters to the seller's
   * active listings server-side. Never sourced from the local feed
   * cache (BackendDataContext.listings is a discovery slice, not a
   * per-seller truth).
   */
  railItems: DisplayReadyListing[];
  /** Whether the current user owns this listing. */
  isOwner: boolean;
  isFollowing: boolean;
  isFollowPending: boolean;
  onFollow: () => void;
  onMessage: () => void;
  onViewShop: () => void;
  onPressRailItem: (item: DisplayReadyListing, index?: number) => void;
}

/**
 * Zone E — seller row + "More from this seller" rail. Seller identity
 * sits in the second viewport (after description, before shipping).
 * This is the evidence role: source credibility immediately after the
 * item evidence, and the sole profile navigation point on the screen.
 */
export function ItemDetailSellerSection({
  seller,
  railItems,
  isOwner,
  isFollowing,
  isFollowPending,
  onFollow,
  onMessage,
  onViewShop,
  onPressRailItem,
}: ItemDetailSellerSectionProps) {
  const { colors } = useAppTheme();

  return (
    <>
      {seller && (
        <View style={[styles.sellerTrustSection, { borderTopColor: colors.borderSubtle }]}>
          <SellerInfoCard
            seller={seller}
            isOwner={isOwner}
            isFollowing={isFollowing}
            isFollowPending={isFollowPending}
            onFollow={onFollow}
            onMessage={onMessage}
            onViewShop={onViewShop}
          />
        </View>
      )}

      {/* ── More from this seller ──
          Horizontal browse rail of the seller's other active listings —
          server-filtered via the `more_from_seller` recommendation
          section. Contextual to the seller section — closes it with a
          bottom hairline. Rendered when at least one real item exists.
          Uses ProductCard inside HorizontalRail so cards match discovery
          surfaces. Distinct from the Bundle upsell discovery module in
          the tail (which incentivises multi-item purchase). */}
      {seller && railItems.length >= 1 ? (
        <View style={[styles.moreFromSellerRailWrap, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.moreFromSellerRailTitle, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={2}>
            More from {seller.username ?? 'this seller'}
          </Text>
          <HorizontalRail
            contentContainerStyle={styles.railContent}
            accessibilityLabel={`More from ${seller.username ?? 'this seller'}`}
          >
            {railItems.map((railItem, railIndex) => (
              <View key={railItem.id} style={styles.railCardWrap}>
                <ProductCard
                  item={railItem as unknown as CatalogListing}
                  onPress={() => onPressRailItem(railItem, railIndex)}
                  showSaveButton={false}
                  enableEntranceAnimation={false}
                  visualOnly
                />
              </View>
            ))}
          </HorizontalRail>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // ── Seller row ──
  // The seller row is a distinct group from the identity chapter.
  // paddingVertical Space.md (16px) gives proper breathing room for
  // avatar + name + rating + actions. The hairline top border separates
  // it from the identity chapter without adding a card surface.
  // No padding here — SellerInfoCard handles its own internal padding.
  // This avoids double-padding that would push content inward.
  sellerTrustSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent', // overridden inline with theme color
  },
  // ── More from this seller rail ──
  // Bottom hairline closes the seller section before the purchase
  // details section below — flat canvas + hairlines.
  moreFromSellerRailWrap: {
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent', // overridden inline with theme color
  },
  moreFromSellerRailTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  railContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  railCardWrap: {
    width: 160,
  },
});
