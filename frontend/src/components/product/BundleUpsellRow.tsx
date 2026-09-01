import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { Listing } from '../../domain';
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
 * Per AGENTS.md §4 (surface budget): flat canvas with hairline separator —
 * no card surface, no background fill, no border radius. Spacing and a
 * hairline top border delineate this section from the one above.
 */
function BundleUpsellRowComponent({
  items,
  currentListingId,
  shippingPayer,
  onPressItem,
  sellerId,
  sellerName,
  onOpenBundleBag }: BundleUpsellRowProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat, displayMode, currencyCode } = useFormattedPrice();

  const bundleItems = items
    .filter((i) => i.id !== currentListingId && !i.isSold)
    .slice(0, 4);

  if (bundleItems.length < 2) return null;

  const showShippingMessage = shippingPayer === 'buyer';
  const bundleTotal = bundleItems.reduce((sum, i) => sum + i.price, 0);
  const formattedBundleTotal = formatFromFiat(bundleTotal, currencyCode, { displayMode });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="layers-outline" size={16} color={colors.brand} />
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
          const formattedPrice = formatFromFiat(bundleItem.price, currencyCode, { displayMode });
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
                    <Ionicons name="shirt-outline" size={20} color={colors.textMuted} />
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
          <Ionicons name="bag-add-outline" size={16} color={colors.brand} />
          <Text style={styles.createBundleBtnText}>Create bundle</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.brand} />
        </Pressable>
      )}
    </View>
  );
}

export const BundleUpsellRow = memo(BundleUpsellRowComponent);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    marginTop: Space.sm,
    marginHorizontal: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  sectionTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    letterSpacing: 0.2 },
  bundleCountBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: colors.brandSubtle },
  bundleCountText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    lineHeight: 16,
    marginBottom: Space.sm },
  thumbRow: {
    flexDirection: 'row',
    gap: Space.sm },
  thumb: {
    width: 72 },
  thumbPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }] },
  thumbImageWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
    marginBottom: 6,
    overflow: 'hidden' },
  thumbImage: {
    width: '100%',
    height: '100%' },
  thumbFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center' },
  thumbPrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary,
    textAlign: 'center' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  totalLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  totalValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary },
  createBundleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.brandSubtle },
  createBundleBtnPressed: {
    opacity: 0.7 },
  createBundleBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.brand } });
}
