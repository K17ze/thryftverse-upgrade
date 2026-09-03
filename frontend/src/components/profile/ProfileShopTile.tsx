import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, IconGrammar, GlyphShadow } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
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
 * Pinned/featured listings show a small pin glyph in the top-left corner.
 */
const ProfileShopTile = React.memo(function ProfileShopTile({
  item,
  isSold,
  onPress,
  formatPrice,
  cardWidth,
  cardHeight }: ProfileShopTileProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const showSold = isSold || item.status === 'sold';
  const imageUri = item.images?.[0] ?? item.imageUrl ?? '';
  const hasImage = imageUri.length > 0;
  const isFeatured = item.featured === true;
  return (
    <AnimatedPressable
      style={[styles.gridCard, { width: cardWidth, marginBottom: Space.sm }]}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open listing ${item.title}${isFeatured ? ', pinned' : ''}`}
      accessibilityHint="Opens listing details"
    >
      <SharedTransitionView
        style={[styles.gridImageWrap, { width: cardWidth, height: cardHeight }]}
        sharedTransitionTag={`image-${item.id}-0`}
      >
        {hasImage ? (
          <CachedImage
            uri={imageUri}
            style={styles.gridImage}
            containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.sm }}
            contentFit="cover"
            downscaleWidth={cardWidth}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="shirt-outline" size={IconGrammar.metadata} color={colors.textMuted} />
          </View>
        )}
        {/* Pinned/featured indicator — small pin glyph, top-left corner */}
        {isFeatured ? (
          <View style={styles.pinnedBadge} pointerEvents="none">
            <Ionicons name="pin" size={11} color={colors.scrimTextPrimary} />
          </View>
        ) : null}
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
    position: 'relative' },
  gridImage: { width: '100%', height: '100%' },
  // Restrained placeholder for listings with no image — surfaceAlt fill with a
  // category glyph. Never a broken-image tile; never a grey card shell that
  // competes with real media tiles in the grid (M7).
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt },
  // Pinned/featured indicator — small dark pill with pin glyph, top-left.
  // Subtle scrim backing for legibility over any image.
  pinnedBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' },
  // Real short fade from bottom — no hard translucent rectangle
  soldFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 44 },
  soldLabelWrap: {
    position: 'absolute',
    bottom: 6,
    left: Space.sm },
  soldText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.2,
    ...GlyphShadow.label,
    textShadowColor: colors.shadow },
  gridPrice: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textPrimary, marginTop: Space.xs + 1, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  gridBrand: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textSecondary, marginTop: 1 } });
}

export { ProfileShopTile };
