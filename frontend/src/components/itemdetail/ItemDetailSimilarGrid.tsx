import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { ImageEmptyGraphic } from '../ImageEmptyGraphic';
import type { Listing } from '../../services/listingsApi';
import type { Listing as CatalogListing } from '../../domain';
import {
  isRecommendationLook,
  type RecommendationSection,
} from '../../platform/product';
import { CommerceDetailSection } from '../commerce/detail';
import { Space, FontFamily, AspectRatio } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { DEFAULT_CURRENCY_CODE } from '../../constants/currencies';
import type { useFormattedPrice } from '../../hooks/useFormattedPrice';

type FormatFromFiat = ReturnType<typeof useFormattedPrice>['formatFromFiat'];

export interface ItemDetailSimilarGridProps {
  /** Recommendation sections from GET /listings/:id/recommendations. */
  sections: RecommendationSection[];
  /** Listing brand/category — feed the fallback discovery label. */
  itemBrand: string | null | undefined;
  itemCategory: string | null | undefined;
  formatFromFiat: FormatFromFiat;
  onPressItem: (item: Listing, sectionKey?: string) => void;
}

/**
 * "More like this" — backend-driven recommendations. Uses the
 * similar_style section, falling back to same_brand. Per 2026 PDP
 * research: shown only when >=3 items are available; hidden silently
 * when fewer.
 */
export function ItemDetailSimilarGrid({
  sections,
  itemBrand,
  itemCategory,
  formatFromFiat,
  onPressItem,
}: ItemDetailSimilarGridProps) {
  const { colors } = useAppTheme();

  const similarSection = sections.find((s) => s.key === 'similar_style')
    ?? sections.find((s) => s.key === 'same_brand');
  if (!similarSection || similarSection.items.length < 3) return null;
  const similarItems = similarSection.items
    .filter((i): i is CatalogListing => !isRecommendationLook(i))
    .slice(0, 6) as unknown as Listing[];
  if (similarItems.length < 3) return null;
  const discoveryLabel = similarSection.title || (itemBrand
    ? `More from ${itemBrand}`
    : itemCategory
    ? `More ${itemCategory.toLowerCase()}`
    : 'More like this');

  return (
    <CommerceDetailSection label={discoveryLabel} divider variant="discovery">
      <View style={styles.moreLikeThisGrid}>
        {similarItems.map((simItem) => {
          const simPriceFormatted = simItem.price != null
            ? formatFromFiat(simItem.price, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })
            : null;
          return (
            <AnimatedPressable
              key={simItem.id}
              style={styles.moreLikeThisCard}
              scaleValue={0.98}
              hapticFeedback="light"
              onPress={() => onPressItem(simItem, similarSection.key)}
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
              accessibilityRole="button"
              accessibilityLabel={`View ${simItem.title}${simPriceFormatted ? `, ${simPriceFormatted}` : ''}${simItem.brand ? `, ${simItem.brand}` : ''}`}
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
              <Text style={[styles.moreLikeThisTitle, { color: colors.textPrimary }]} numberOfLines={2} maxFontSizeMultiplier={2}>
                {simItem.title}
              </Text>
              {(simItem.brand || simItem.condition) && (
                <Text style={[styles.moreLikeThisMeta, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={2}>
                  {[simItem.brand, simItem.condition].filter(Boolean).join(' · ')}
                </Text>
              )}
              <Text style={[styles.moreLikeThisPrice, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={2}>
                {simPriceFormatted}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </CommerceDetailSection>
  );
}

const styles = StyleSheet.create({
  // ── More like this grid ──
  // Discovery density: at least two meaningful media objects.
  // 2-column grid with gap Space.sm (8px) between cards.
  // Card internal gap 4px for text breathing room below image.
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
    borderRadius: RadiusRoleValue.mediaThumbnail,
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
});
