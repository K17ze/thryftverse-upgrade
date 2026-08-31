import React, { useState, useCallback, memo } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { LookTagApiItem } from '../../services/looksApi';
import type { ProductReferenceKind } from '../../platform/product/openProductDetail';

/** A look tag with optional hydrated product fields (title, price, image, etc). */
export type HydratedLookTag = LookTagApiItem & {
  title?: string;
  price?: number;
  image?: string;
  images?: string[];
  isSold?: boolean;
  assetId?: string;
  referenceKind?: ProductReferenceKind;
};

export interface LookHotspotsProps {
  tags: HydratedLookTag[];
  onTagTap: (tag: HydratedLookTag) => void;
  /** Price formatter — receives the fiat amount and currency code. */
  formatPrice?: (price: number, currencyCode?: string) => string;
  currencyCode: string;
}

const TOOLTIP_WIDTH = 220;

function getTooltipPlacementStyle(x: number, y: number) {
  const horizontalStyle: { left?: number; right?: number } = {};
  if (x < 0.3) {
    horizontalStyle.left = -Space.xs;
  } else if (x > 0.7) {
    horizontalStyle.right = -Space.xs;
  } else {
    horizontalStyle.left = -(TOOLTIP_WIDTH / 2) + Control.hit / 2;
  }

  const verticalStyle: { top?: number; bottom?: number } = {};
  if (y > 0.8) {
    verticalStyle.bottom = Space.lg + 4;
  } else {
    verticalStyle.top = Space.lg + 4;
  }

  return { ...horizontalStyle, ...verticalStyle };
}

/**
 * Interactive product hotspots overlaid on the look media.
 * Has its own activeTagId state so tapping a hotspot doesn't
 * re-render the parent FlashList header (CreatorCanvas, LookSocialActions).
 */
function LookHotspotsImpl({
  tags,
  onTagTap,
  formatPrice,
  currencyCode }: LookHotspotsProps) {
  const { colors } = useAppTheme();
  const styles = useHotspotStyles(colors);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);

  const handlePress = useCallback(
    (tag: HydratedLookTag) => {
      setActiveTagId(tag.id);
      onTagTap(tag);
    },
    [onTagTap],
  );

  if (tags.length === 0) return null;

  return (
    <>
      {tags.map((tag) => {
        const isActive = activeTagId === tag.id;
        const tagImage = tag.image ?? tag.images?.[0];
        const tagTitle = tag.title ?? tag.label;
        const placement = getTooltipPlacementStyle(tag.x, tag.y);
        return (
          <Pressable
            key={tag.id}
            style={[styles.hotspotWrap, { left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }]}
            onPress={() => handlePress(tag)}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel={`Tagged item: ${tagTitle || 'product'}`}
            accessibilityHint="Opens a product preview before viewing details"
          >
            <View style={styles.hotspotHalo} />
            <View style={[styles.hotspotDot, isActive && styles.hotspotDotActive]} />
            {isActive && tagImage && tagTitle && (
              <View style={[styles.tagTooltip, placement]}>
                <ExpoImage
                  source={{ uri: tagImage }}
                  style={styles.tagTooltipImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={tagImage}
                />
                <View style={styles.tagTooltipText}>
                  <Text style={styles.tagTooltipTitle} numberOfLines={1}>{tagTitle}</Text>
                  {tag.isSold ? (
                    <Text style={styles.tagTooltipSold}>Sold</Text>
                  ) : typeof tag.price === 'number' && formatPrice ? (
                    <Text style={styles.tagTooltipPrice}>{formatPrice(tag.price, currencyCode)}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.scrimTextSecondary} aria-hidden={true} />
              </View>
            )}
          </Pressable>
        );
      })}
    </>
  );
}

export const LookHotspots = memo(LookHotspotsImpl);

const useHotspotStyles = (colors: ThemeColors) => {
  return StyleSheet.create({
    hotspotWrap: {
      position: 'absolute',
      width: Control.hit,
      height: Control.hit,
      marginLeft: -(Space.lg - 2),
      marginTop: -(Space.lg - 2),
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 3 },
    hotspotHalo: {
      position: 'absolute',
      width: Space.xl - Space.xs,
      height: Space.xl - Space.xs,
      borderRadius: Radius.xl,
      backgroundColor: colors.overlay },
    hotspotDot: {
      width: Space.sm + Space.xs,
      height: Space.sm + Space.xs,
      borderRadius: Radius.md,
      backgroundColor: colors.scrimTextPrimary,
      borderWidth: Stroke.emphasis,
      borderColor: colors.overlay },
    hotspotDotActive: {
      backgroundColor: colors.brand,
      borderColor: colors.scrimTextPrimary },
    tagTooltip: {
      position: 'absolute',
      width: TOOLTIP_WIDTH,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      backgroundColor: colors.overlay,
      borderRadius: Radius.lg,
      padding: Space.sm },
    tagTooltipImg: { width: Space.xl + 4, height: Space.xl + 4, borderRadius: Radius.md, backgroundColor: colors.surfaceAlt },
    tagTooltipText: { flex: 1, gap: Space.xxs },
    tagTooltipTitle: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.scrimTextPrimary },
    tagTooltipPrice: { fontSize: TypographyV2.meta.size - 1, fontFamily: TypographyV2.meta.fontFamily, color: colors.scrimTextSecondary },
    tagTooltipSold: { fontSize: TypographyV2.meta.size - 1, fontFamily: TypographyV2.meta.fontFamily, color: colors.danger } });
};
