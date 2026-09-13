import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { useBackendData } from '../../context/BackendDataContext';
import type { Listing } from '../../services/listingsApi';
import type { Listing as CatalogListing } from '../../domain';
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
  /** Whether the current user owns this listing. */
  isOwner: boolean;
  isFollowing: boolean;
  isFollowPending: boolean;
  onFollow: () => void;
  onMessage: () => void;
  onViewShop: () => void;
  onPressRailItem: (item: Listing) => void;
}

/**
 * Zone E — seller row + "More from this seller" rail. Seller identity
 * sits in the second viewport (after description, before shipping).
 * This is the evidence role: source credibility immediately after the
 * item evidence, and the sole profile navigation point on the screen.
 */
export function ItemDetailSellerSection({
  item,
  seller,
  isOwner,
  isFollowing,
  isFollowPending,
  onFollow,
  onMessage,
  onViewShop,
  onPressRailItem,
}: ItemDetailSellerSectionProps) {
  const { colors } = useAppTheme();
  const { listings: backendListings } = useBackendData();

  // "More from this seller" browse rail — other live listings from the
  // same seller, capped at 6.
  const railItems: Listing[] = useMemo(
    () =>
      item
        ? backendListings
            .filter(
              (l) =>
                l.id !== item.id &&
                !l.isSold &&
                item.sellerId != null &&
                l.sellerId === item.sellerId,
            )
            .slice(0, 6)
        : [],
    [backendListings, item?.id, item?.sellerId],
  );

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
          Horizontal browse rail of other live listings from the same
          seller. Contextual to the seller section — closes it with a
          bottom hairline. Only rendered when there are at least 2 real
          items. Uses ProductCard inside HorizontalRail so cards match
          discovery surfaces. Distinct from the Bundle upsell discovery
          module in the tail (which incentivises multi-item purchase). */}
      {seller && railItems.length >= 2 ? (
        <View style={[styles.moreFromSellerRailWrap, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.moreFromSellerRailTitle, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={2}>
            More from {seller.username ?? 'this seller'}
          </Text>
          <HorizontalRail
            contentContainerStyle={styles.railContent}
            accessibilityLabel={`More from ${seller.username ?? 'this seller'}`}
          >
            {railItems.map((railItem) => (
              <View key={railItem.id} style={styles.railCardWrap}>
                <ProductCard
                  item={railItem as unknown as CatalogListing}
                  onPress={() => onPressRailItem(railItem)}
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
