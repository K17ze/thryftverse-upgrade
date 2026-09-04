import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Space, FontFamily, AspectRatio } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { Listing } from '../../services/listingsApi';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { CachedImage } from '../CachedImage';
import { ImageEmptyGraphic } from '../ImageEmptyGraphic';
import { CommerceDetailSection } from '../commerce/detail';

// ───────────────────────────────────────────────────────────────────────────
// MoreLikeThisGrid — visual-similar grid by category/brand (below fold).
//
// Contextual heading: prefer brand when available, fall back to category,
// then to the generic label. Only rendered when there are at least 2 real
// matches. Behaviour is identical to the previous inline IIFE.
// ───────────────────────────────────────────────────────────────────────────

export interface MoreLikeThisGridProps {
  backendListings: Listing[];
  item: Listing;
  formatFromFiat: (amount: number, currency?: string, options?: { displayMode?: string }) => string;
  onPressItem: (recItem: Listing, sectionKey?: string) => void;
  colors: ThemeColors;
}

export function MoreLikeThisGrid({
  backendListings,
  item,
  formatFromFiat,
  onPressItem,
  colors,
}: MoreLikeThisGridProps) {
  
  const visualSimilar = backendListings
    .filter((l) =>
      l.id !== item.id &&
      !l.isSold &&
      (l.category === item.category || l.brand === item.brand)
    )
    .slice(0, 4);
  if (visualSimilar.length < 2) return null;

  const discoveryLabel = item.brand
    ? `More from ${item.brand}`
    : item.category
    ? `More ${item.category.toLowerCase()}`
    : 'More like this';

  return (
    <CommerceDetailSection label={discoveryLabel} divider variant="discovery">
      <View style={styles.moreLikeThisGrid}>
        {visualSimilar.map((simItem) => {
          const simPriceFormatted = simItem.price != null
            ? formatFromFiat(simItem.price, 'GBP', { displayMode: 'fiat' })
            : null;
          return (
            <Pressable
              key={simItem.id}
              style={({ pressed }) => [styles.moreLikeThisCard, pressed && styles.pressed]}
              onPress={() => onPressItem(simItem, 'similar_items')}
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
                <Text style={[styles.moreLikeThisMeta, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1}>
                  {[simItem.brand, simItem.condition].filter(Boolean).join(' · ')}
                </Text>
              )}
              <Text style={[styles.moreLikeThisPrice, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={2}>
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
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
