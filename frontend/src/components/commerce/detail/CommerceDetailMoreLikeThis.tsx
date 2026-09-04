import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, FontFamily, AspectRatio, PressScale, Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import { CachedImage } from '../../CachedImage';
import { ImageEmptyGraphic } from '../../ImageEmptyGraphic';
import { CommerceDetailSection } from './CommerceDetailSection';
import { DEFAULT_CURRENCY_CODE } from '../../../constants/currencies';
import type { Listing } from '../../../services/listingsApi';

export interface CommerceDetailMoreLikeThisProps {
  /** Candidate listings to filter for visual similarity. */
  items: Listing[];
  /** The currently viewed listing — used for exclusion and heading context. */
  currentItem: Listing;
  /** Called when a discovery card is tapped. */
  onPressItem: (item: Listing) => void;
}

/**
 * Render a 2-column discovery grid of visually similar listings.
 * Returns `null` when fewer than 2 candidates remain after filtering.
 */
export function CommerceDetailMoreLikeThis({
  items,
  currentItem,
  onPressItem,
}: CommerceDetailMoreLikeThisProps): React.ReactElement | null {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();

  const visualSimilar = useMemo(
    () =>
      items
        .filter(
          (l) =>
            l.id !== currentItem.id &&
            !l.isSold &&
            (l.category === currentItem.category || l.brand === currentItem.brand)
        )
        .slice(0, 4),
    [items, currentItem.id, currentItem.category, currentItem.brand]
  );

  if (visualSimilar.length < 2) return null;

  const discoveryLabel = currentItem.brand
    ? `More from ${currentItem.brand}`
    : currentItem.category
    ? `More ${currentItem.category.toLowerCase()}`
    : 'More like this';

  return (
    <CommerceDetailSection label={discoveryLabel} divider variant="discovery">
      <View style={styles.moreLikeThisGrid}>
        {visualSimilar.map((simItem) => {
          const simPriceFormatted =
            simItem.price != null
              ? formatFromFiat(simItem.price, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })
              : null;
          return (
            <Pressable
              key={simItem.id}
              style={({ pressed }) => [styles.moreLikeThisCard, pressed && styles.pressed]}
              onPress={() => onPressItem(simItem)}
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
              accessibilityRole="button"
              accessibilityLabel={`View ${simItem.title ?? 'item'}${simPriceFormatted ? `, ${simPriceFormatted}` : ''}${simItem.brand ? `, ${simItem.brand}` : ''}`}
            >
              {simItem.images?.[0] ? (
                <CachedImage
                  uri={simItem.images[0]}
                  style={styles.moreLikeThisImage}
                  contentFit="cover"
                />
              ) : (
                <ImageEmptyGraphic
                  icon="shirt-outline"
                  style={styles.moreLikeThisImage}
                />
              )}
              <Text
                style={[styles.moreLikeThisTitle, { color: colors.textPrimary }]}
                numberOfLines={2}
                maxFontSizeMultiplier={2}
              >
                {simItem.title ?? 'Listing'}
              </Text>
              {(simItem.brand || simItem.condition) && (
                <Text
                  style={[styles.moreLikeThisMeta, { color: colors.textMuted }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1}
                >
                  {[simItem.brand, simItem.condition].filter(Boolean).join(' · ')}
                </Text>
              )}
              <Text
                style={[styles.moreLikeThisPrice, { color: colors.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                maxFontSizeMultiplier={2}
              >
                {simPriceFormatted}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </CommerceDetailSection>
  );
}

const styles = StyleSheet.create({
  moreLikeThisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  moreLikeThisCard: {
    flex: 1,
    minWidth: '47%',
    maxWidth: '49%',
    gap: Space.xs,
  },
  moreLikeThisImage: {
    width: '100%',
    aspectRatio: AspectRatio.portrait,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLikeThisPrice: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
    marginTop: Space.xs / 2,
  },
  moreLikeThisTitle: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
  },
  moreLikeThisMeta: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: PressScale.gentle }],
  },
});
