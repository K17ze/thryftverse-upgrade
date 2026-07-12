import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import type { Listing } from '../../data/mockData';
import { CachedImage } from '../CachedImage';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';

export interface BundleUpsellRowProps {
  /** Items from the same seller (typically more_from_seller recommendations) */
  items: Listing[];
  /** Current listing ID to exclude from display */
  currentListingId: string;
  /** Whether shipping is seller-paid (determines if bundle savings message shows) */
  shippingPayer?: 'buyer' | 'seller' | null;
  /** Press handler for a bundle item */
  onPressItem: (item: Listing) => void;
  /** Seller ID for bundle bag navigation */
  sellerId?: string;
  /** Seller display name for bundle bag navigation */
  sellerName?: string;
  /** Navigation handler for opening the bundle bag */
  onOpenBundleBag?: (sellerId: string, sellerName?: string) => void;
}

/**
 * Bundle upsell row — shows items from the same seller with a "bundle and save"
 * message. Only renders when there are 2+ items from the same seller, making the
 * shipping savings claim truthful (combining shipments from one seller).
 *
 * Visual language matches ProductCommerceSummary — surface card, semibold
 * section title, Ionicons, rounded thumbnails with press feedback.
 */
function BundleUpsellRowComponent({
  items,
  currentListingId,
  shippingPayer,
  onPressItem,
  sellerId,
  sellerName,
  onOpenBundleBag,
}: BundleUpsellRowProps) {
  const { formatFromFiat, displayMode } = useFormattedPrice();

  const bundleItems = items
    .filter((i) => i.id !== currentListingId && !i.isSold)
    .slice(0, 4);

  if (bundleItems.length < 2) return null;

  const showShippingMessage = shippingPayer === 'buyer';
  const bundleTotal = bundleItems.reduce((sum, i) => sum + i.price, 0);
  const formattedBundleTotal = formatFromFiat(bundleTotal, 'GBP', { displayMode });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="cube" size={16} color={Colors.brand} />
          <Text style={styles.sectionTitle}>Bundle and save</Text>
        </View>
        <View style={styles.bundleCountBadge}>
          <Text style={styles.bundleCountText}>
            {bundleItems.length} more from this seller
          </Text>
        </View>
      </View>

      <Text style={styles.subtitle} numberOfLines={2}>
        {showShippingMessage
          ? 'Buy 2+ from this seller — combined shipping saves you more'
          : 'Add more from this seller to build a bundle'}
      </Text>

      <View style={styles.thumbRow}>
        {bundleItems.map((bundleItem) => {
          const formattedPrice = formatFromFiat(bundleItem.price, 'GBP', { displayMode });
          return (
            <Pressable
              key={bundleItem.id}
              style={({ pressed }) => [
                styles.thumb,
                pressed && styles.thumbPressed,
              ]}
              onPress={() => onPressItem(bundleItem)}
              accessibilityRole="button"
              accessibilityLabel={`View ${bundleItem.title} from same seller`}
            >
              <View style={styles.thumbImageWrap}>
                <CachedImage
                  uri={bundleItem.images?.[0]}
                  style={styles.thumbImage}
                  contentFit="cover"
                />
                {!bundleItem.images?.[0] ? (
                  <View style={styles.thumbFallback}>
                    <Ionicons name="shirt-outline" size={20} color={Colors.textMuted} />
                  </View>
                ) : null}
              </View>
              <Text style={styles.thumbPrice} numberOfLines={1}>
                {formattedPrice}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Bundle total</Text>
        <Text style={styles.totalValue}>{formattedBundleTotal}</Text>
      </View>

      {onOpenBundleBag && sellerId && (
        <Pressable
          style={({ pressed }) => [styles.createBundleBtn, pressed && styles.createBundleBtnPressed]}
          onPress={() => onOpenBundleBag(sellerId, sellerName)}
          accessibilityRole="button"
          accessibilityLabel="Open bundle bag to select items and checkout"
        >
          <Ionicons name="bag-add-outline" size={16} color={Colors.brand} />
          <Text style={styles.createBundleBtnText}>Create bundle</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.brand} />
        </Pressable>
      )}
    </View>
  );
}

export const BundleUpsellRow = memo(BundleUpsellRowComponent);

const styles = StyleSheet.create({
  container: {
    marginTop: Space.sm,
    marginHorizontal: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  bundleCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.brand}12`,
  },
  bundleCountText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: 16,
    marginBottom: Space.sm,
  },
  thumbRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  thumb: {
    width: 72,
  },
  thumbPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  thumbImageWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    marginBottom: 6,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPrice: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  totalValue: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  createBundleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: `${Colors.brand}40`,
    backgroundColor: `${Colors.brand}08`,
  },
  createBundleBtnPressed: {
    opacity: 0.7,
  },
  createBundleBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
});
