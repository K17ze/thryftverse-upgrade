import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';
import { SupportedCurrencyCode } from '../../constants/currencies';
import { CurrencyDisplayMode } from '../../utils/currency';
import type { ListingApiItem } from '../../services/listingsApi';

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
 * Shop tile — 3:4 portrait, price/brand hierarchy.
 * Sold treatment: quiet lower-edge marker, not aggressive all-caps stamp.
 * The garment stays readable; sold inventory feels historical, not disabled.
 * 3-column density: price + brand only, size/condition omitted for scannability.
 */
const ProfileShopTile = React.memo(function ProfileShopTile({
  item,
  isSold,
  onPress,
  formatPrice,
  cardWidth,
  cardHeight,
}: ProfileShopTileProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const showSold = isSold || item.status === 'sold';
  return (
    <AnimatedPressable
      style={[styles.gridCard, { width: cardWidth, marginBottom: Space.sm }]}
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
        {/* Quiet lower-edge sold marker — real short fade, image stays readable */}
        {showSold ? (
          <>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.45)']}
              style={styles.soldFade}
              pointerEvents="none"
            />
            <View style={styles.soldLabelWrap}>
              <Text style={styles.soldText}>Sold</Text>
            </View>
          </>
        ) : null}
      </SharedTransitionView>
      <Text style={styles.gridPrice} numberOfLines={1}>
        {formatPrice(item.priceGbp, 'GBP', { displayMode: 'fiat' })}
      </Text>
      {/* Brand when available, otherwise listing title — never price-only */}
      {item.brand ? (
        <Text style={styles.gridBrand} numberOfLines={1}>{item.brand}</Text>
      ) : (
        <Text style={styles.gridBrand} numberOfLines={1}>{item.title}</Text>
      )}
    </AnimatedPressable>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  gridCard: {},
  gridImageWrap: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  gridImage: { width: '100%', height: '100%' },
  // Real short fade from bottom — no hard translucent rectangle
  soldFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 44,
  },
  soldLabelWrap: {
    position: 'absolute',
    bottom: 6,
    left: 8,
  },
  soldText: {
    color: '#fff',
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  gridPrice: { fontSize: Type.captionElevated.size, fontFamily: Typography.family.bold, color: colors.textPrimary, marginTop: Space.xs + 1, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  gridBrand: { fontSize: Type.meta.size, fontFamily: Typography.family.regular, color: colors.textSecondary, marginTop: 1 },
  });
}

export { ProfileShopTile };
