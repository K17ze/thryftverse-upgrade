import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';
import { Colors } from '../../constants/colors';
import { Space, Typography, Radius } from '../../theme/designTokens';
import { SupportedCurrencyCode } from '../../constants/currencies';
import { CurrencyDisplayMode } from '../../utils/currency';
import type { ListingApiItem } from '../../services/listingsApi';

const TEXT = Colors.textPrimary;
const SECONDARY = Colors.textSecondary;
const MUTED = Colors.textMuted;

type PriceFormatter = (
  fiatAmount: number,
  sourceCurrency?: SupportedCurrencyCode,
  options?: { displayMode?: CurrencyDisplayMode; fiatFractionDigits?: number }
) => string;

interface ProfileShopTileProps {
  item: ListingApiItem;
  isSold: boolean;
  onPress: () => void;
  formatPrice: PriceFormatter;
  cardWidth: number;
  cardHeight: number;
}

/**
 * Shop tile — 4:5 portrait, price/brand/size·condition hierarchy.
 * Sold treatment: quiet lower-edge marker, not aggressive all-caps stamp.
 * The garment stays readable; sold inventory feels historical, not disabled.
 */
const ProfileShopTile = React.memo(function ProfileShopTile({
  item,
  isSold,
  onPress,
  formatPrice,
  cardWidth,
  cardHeight,
}: ProfileShopTileProps) {
  const showSold = isSold || item.status === 'sold';
  return (
    <AnimatedPressable
      style={[styles.gridCard, { width: cardWidth, marginBottom: Space.md }]}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open listing ${item.title}`}
      accessibilityHint="Opens listing details"
    >
      <SharedTransitionView
        style={[styles.gridImageWrap, { width: cardWidth, height: cardHeight }]}
        sharedTransitionTag={`image-${item.id}-0`}
      >
        <CachedImage
          uri={item.images?.[0] ?? item.imageUrl ?? ''}
          style={styles.gridImage}
          containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.sm }}
          contentFit="cover"
        />
        {/* Quiet lower-edge sold marker — image stays readable */}
        {showSold ? (
          <View style={styles.soldOverlay}>
            <View style={styles.soldMarker}>
              <Text style={styles.soldText}>Sold</Text>
            </View>
          </View>
        ) : null}
      </SharedTransitionView>
      <Text style={styles.gridPrice} numberOfLines={1}>
        {formatPrice(item.priceGbp, 'GBP', { displayMode: 'fiat' })}
      </Text>
      {item.brand ? <Text style={styles.gridBrand} numberOfLines={1}>{item.brand}</Text> : null}
      {(item.size || item.condition) ? (
        <Text style={styles.gridMeta} numberOfLines={1}>
          {[item.size, item.condition].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  gridCard: {},
  gridImageWrap: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  gridImage: { width: '100%', height: '100%' },
  // Quiet lower-edge sold overlay — gradient-like fade from bottom
  soldOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 36,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  soldMarker: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  soldText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  gridPrice: { fontSize: 14, fontFamily: Typography.family.bold, color: TEXT, marginTop: 6 },
  gridBrand: { fontSize: 12, fontFamily: Typography.family.regular, color: SECONDARY, marginTop: 1 },
  gridMeta: { fontSize: 11, fontFamily: Typography.family.regular, color: MUTED, marginTop: 1 },
});

export { ProfileShopTile };
