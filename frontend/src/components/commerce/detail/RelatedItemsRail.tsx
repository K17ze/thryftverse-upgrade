/**
 * RelatedItemsRail — horizontal "You may also like" rail for the product page.
 *
 * Reuses the FlashList horizontal-rail pattern from `RecommendationRail`
 * but with a portrait 3:4 card geometry (2026 Poshmark standard) and an
 * explicit loading (skeleton) + empty state per AGENTS.md §14.
 *
 * Per AGENTS.md §4: cards use the media/field radius (Radius.lg) — the
 * one permitted non-avatar radius for this rail. No nested card surfaces.
 * Per AGENTS.md §16: FlashList virtualization, stable keys.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { Space, Radius, Type, Typography, AspectRatio, Control } from '../../../theme/designTokens';
import { CachedImage } from '../../CachedImage';
import { ImageEmptyGraphic } from '../../ImageEmptyGraphic';
import { SkeletonLoader } from '../../SkeletonLoader';
import { AnimatedPressable } from '../../AnimatedPressable';
import { PressPresets } from '../../../hooks/usePremiumPressFeedback';
import { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import type { Listing } from '../../../services/listingsApi';
import { DEFAULT_CURRENCY_CODE } from '../../../constants/currencies';

export interface RelatedItemsRailProps {
  items: Listing[];
  /** When true, render skeleton placeholder cards. */
  loading?: boolean;
  /** Navigate to a filtered browse screen. */
  onSeeAll?: () => void;
  onPressItem: (item: Listing) => void;
  /** Optional override for the section header. */
  headerLabel?: string;
}

const SKELETON_COUNT = 4;

export function RelatedItemsRail({
  items,
  loading = false,
  onSeeAll,
  onPressItem,
  headerLabel = 'More like this',
}: RelatedItemsRailProps) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { formatFromFiat } = useFormattedPrice();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Portrait card width: ~40% of screen, capped so 2.5 cards are visible.
  const cardWidth = Math.min(160, (screenWidth - Space.md * 2) * 0.42);
  const cardImageHeight = Math.round(cardWidth / AspectRatio.portrait);

  const renderItem = useCallback(
    ({ item }: { item: Listing }) => {
      const imageUri = item.images?.[0];
      const formattedPrice = item.price != null
        ? formatFromFiat(item.price, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })
        : 'Price unavailable';
      return (
        <AnimatedPressable
          style={[styles.card, { width: cardWidth }]}
          onPress={() => onPressItem(item)}
          {...PressPresets.card}
          accessibilityLabel={`${item.title ?? 'Item'}, ${formattedPrice}`}
          accessibilityRole="button"
        >
          <View style={[styles.cardImageWrap, { width: cardWidth, height: cardImageHeight }]}>
            {imageUri ? (
              <CachedImage
                uri={imageUri}
                style={styles.cardImage}
                containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.lg }}
                contentFit="cover"
                downscaleWidth={Math.round(cardWidth)}
              />
            ) : (
              <ImageEmptyGraphic
                icon="shirt-outline"
                style={[styles.cardImage, { borderRadius: Radius.lg }]}
              />
            )}
            {item.isSold ? (
              <View style={styles.soldBadge}>
                <Text style={styles.soldText}>SOLD</Text>
              </View>
            ) : null}
          </View>
          {item.brand ? (
            <Text style={styles.cardBrand} numberOfLines={1}>
              {item.brand}
            </Text>
          ) : null}
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title ?? 'Untitled item'}
          </Text>
          <Text style={styles.cardPrice} numberOfLines={1}>{formattedPrice}</Text>
        </AnimatedPressable>
      );
    },
    [cardWidth, cardImageHeight, formatFromFiat, onPressItem, styles],
  );

  // ── Loading state: skeleton cards ──
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{headerLabel}</Text>
        </View>
        <View style={styles.skeletonRow}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <View key={i} style={[styles.card, { width: cardWidth }]}>
              <SkeletonLoader
                width={cardWidth}
                height={cardImageHeight}
                borderRadius={Radius.lg}
              />
              <View style={styles.skeletonTextGap}>
                <SkeletonLoader width={cardWidth * 0.6} height={12} borderRadius={Radius.sm} />
                <SkeletonLoader width={cardWidth * 0.9} height={14} borderRadius={Radius.sm} />
                <SkeletonLoader width={cardWidth * 0.4} height={14} borderRadius={Radius.sm} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Empty state ──
  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{headerLabel}</Text>
        </View>
        <View style={styles.emptyWrap}>
          <Ionicons name="grid-outline" size={20} color={colors.textMuted} />
          <Text style={styles.emptyText}>No related items</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{headerLabel}</Text>
        {onSeeAll && items.length > 2 ? (
          <Pressable
            onPress={onSeeAll}
            hitSlop={8}
            style={({ pressed }) => [styles.seeAllHitTarget, pressed && { opacity: 0.6 }]}
            accessibilityLabel={`See all ${headerLabel.toLowerCase()}`}
            accessibilityRole="button"
          >
            <View style={styles.seeAllRow}>
              <Text style={styles.seeAll}>See all</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </Pressable>
        ) : null}
      </View>
      <FlashList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ width: Space.sm }} />}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingTop: Space.lg,
      paddingBottom: Space.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      marginBottom: Space.sm,
    },
    title: {
      fontSize: Type.subtitle.size,
      lineHeight: Type.subtitle.lineHeight,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    seeAllRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    seeAllHitTarget: {
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    seeAll: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
    },
    listContent: {
      paddingHorizontal: Space.md,
    },
    card: {
      gap: Space.xs,
    },
    cardImageWrap: {
      position: 'relative',
    },
    cardImage: {
      width: '100%',
      height: '100%',
    },
    soldBadge: {
      position: 'absolute',
      top: Space.xs,
      left: Space.xs,
      backgroundColor: colors.overlay,
      paddingHorizontal: Space.xs + 1,
      paddingVertical: Space.xs / 2,
      borderRadius: Radius.sm,
    },
    soldText: {
      color: colors.textInverse,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.bold,
      letterSpacing: 0.5,
    },
    cardBrand: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      letterSpacing: 0.1,
      textTransform: 'uppercase',
    },
    cardTitle: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
    },
    cardPrice: {
      fontSize: Type.bodyStrong.size,
      lineHeight: Type.bodyStrong.lineHeight,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      marginTop: 2,
    },
    skeletonRow: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingHorizontal: Space.md,
    },
    skeletonTextGap: {
      gap: Space.xs,
      marginTop: Space.xs,
    },
    emptyWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.lg,
    },
    emptyText: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
  });
}
