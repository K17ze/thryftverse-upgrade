/**
 * ClosetMediaMosaic — media-first 3-column grid with 3:4 portrait thumbnails.
 *
 * Designed for the Closet/Saved/Wishlist surfaces where the user is
 * re-scanning items they have already saved. The information hierarchy
 * differs from discovery: media dominates, price is a compact overlay,
 * and chrome recedes. This is a purpose-built tile (AGENTS.md §7) — the
 * shared ProductCard carries full discovery metadata that would be
 * cramped at 3-column width.
 *
 * Preserves all functionality of the previous MasonryGrid usage:
 *  - navigation to ItemDetail
 *  - save/bookmark toggle (showSaveButton)
 *  - sold state overlay
 *  - price-drop signal
 *  - price formatting
 *  - haptic feedback + reduced-motion fallback
 */
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { ImageEmptyGraphic } from '../ImageEmptyGraphic';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import type { Listing } from '../../domain';
import { filterImageUris } from '../../utils/media';
import {
  Space,
  Radius,
  AspectRatio,
  PressScale,
  Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

const NUM_COLUMNS = 3;
const GRID_GAP = Space.sm;
const GRID_PADDING = Space.md;

interface ClosetMediaMosaicProps {
  items: Listing[];
  onPressItem: (item: Listing) => void;
  /** When true, shows a bookmark toggle overlay (Saved tab). */
  showSaveButton?: boolean;
  /** When true, shows a heart toggle overlay (Wishlist tab). */
  showWishlistButton?: boolean;
}

export function ClosetMediaMosaic({
  items,
  onPressItem,
  showSaveButton = false,
  showWishlistButton = false }: ClosetMediaMosaicProps) {
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const tileW =
    (SCREEN_W - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
  const tileH = tileW / AspectRatio.portrait;
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Distribute items across columns using a shortest-height assignment so
  // the mosaic stays visually balanced without a true masonry height
  // calculation (all tiles share the same 3:4 height, so round-robin
  // produces a clean grid).
  const columns: Listing[][] = Array.from({ length: NUM_COLUMNS }, () => []);
  items.forEach((item, i) => {
    columns[i % NUM_COLUMNS].push(item);
  });

  return (
    <View style={styles.grid}>
      {columns.map((colItems, colIdx) => (
        <View key={colIdx} style={styles.column}>
          {colItems.map((item, idx) => (
            <ClosetMediaTile
              key={item.id}
              item={item}
              index={colIdx + idx * NUM_COLUMNS}
              tileWidth={tileW}
              tileHeight={tileH}
              onPress={() => onPressItem(item)}
              showSaveButton={showSaveButton}
              showWishlistButton={showWishlistButton}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// ============================================================================
// ClosetMediaTile — single 3:4 portrait media tile
// ============================================================================
interface TileProps {
  item: Listing;
  index: number;
  tileWidth: number;
  tileHeight: number;
  onPress: () => void;
  showSaveButton?: boolean;
  showWishlistButton?: boolean;
}

const ClosetMediaTile = React.memo(function ClosetMediaTile({
  item,
  index,
  tileWidth,
  tileHeight,
  onPress,
  showSaveButton = false,
  showWishlistButton = false }: TileProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat, currencyCode } = useFormattedPrice();

  const isFav = useStore((state) => state.isWishlisted(item.id));
  const toggleFav = useStore((state) => state.toggleWishlist);
  const isSaved = useStore((state) => state.isSavedProduct(item.id));
  const toggleSaved = useStore((state) => state.toggleSavedProduct);

  const [imageFailed, setImageFailed] = useState(false);

  const usableImages = filterImageUris(item.images ?? []);
  const primaryImage = usableImages[0] ?? '';
  const hasUsableImage = primaryImage.length > 0;
  const showPlaceholder = !hasUsableImage || imageFailed;

  const hasPriceDrop =
    typeof item.originalPrice === 'number' && item.originalPrice > item.price;
  const isSold = item.isSold === true;

  const handleToggleSave = useCallback(
    (e: any) => {
      e?.stopPropagation?.();
      haptic.light();
      toggleSaved(item.id);
      show(isSaved ? 'Removed from saved' : 'Added to saved', 'info');
    },
    [haptic, toggleSaved, item.id, isSaved, show],
  );

  const handleToggleFav = useCallback(
    (e: any) => {
      e?.stopPropagation?.();
      haptic.light();
      toggleFav(item.id);
      if (!isFav) {
        haptic.success();
        show('Added to wishlist', 'success');
      }
    },
    [haptic, toggleFav, item.id, isFav, show],
  );

  return (
    <View style={[styles.tileWrap, { width: tileWidth }]}>
      <AnimatedPressable
        onPress={onPress}
        style={styles.tile}
        activeOpacity={0.9}
        scaleValue={PressScale.gentle}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${formatFromFiat(item.price, currencyCode, { displayMode: 'fiat' })}${item.brand ? `, ${item.brand}` : ''}${isSold ? ', Sold' : ''}`}
        accessibilityHint="Opens item details"
      >
        {/* Media — 3:4 portrait, full bleed */}
        {showPlaceholder ? (
          <ImageEmptyGraphic
            icon="shirt-outline"
            style={[styles.image, { width: tileWidth, height: tileHeight }]}
          />
        ) : (
          <CachedImage
            uri={primaryImage}
            style={[styles.image, { width: tileWidth, height: tileHeight }]}
            contentFit="cover"
            transition={300}
            sharedTransitionTag={`image-${item.id}-0`}
            onError={() => setImageFailed(true)}
          />
        )}

        {/* Sold scrim — preserves sold-state legibility without hiding media */}
        {isSold ? (
          <>
            <View style={styles.soldScrim} />
            <Text style={styles.soldLabel}>Sold</Text>
          </>
        ) : null}

        {/* Price-drop badge — compact, top-left, only when on sale & not sold */}
        {!isSold && hasPriceDrop ? (
          <View style={styles.priceDropBadge}>
            <Ionicons name="pricetag" size={9} color={colors.scrimTextPrimary} />
            <Text style={styles.priceDropText}>
              -{Math.round(((item.originalPrice! - item.price) / item.originalPrice!) * 100)}%
            </Text>
          </View>
        ) : null}

        {/* Save / wishlist toggle — top-right, transparent hit area with
            text-shadow legibility (no circular chrome per AGENTS.md §4) */}
        {(showSaveButton || showWishlistButton) && !isSold ? (
          <View style={styles.toggleRow}>
            {showWishlistButton ? (
              <AnimatedPressable
                onPress={handleToggleFav}
                style={styles.toggleHit}
                activeOpacity={0.7}
                scaleValue={PressScale.icon}
                accessibilityRole="button"
                accessibilityLabel={isFav ? 'Remove from wishlist' : 'Add to wishlist'}
                accessibilityState={{ selected: isFav }}
              >
                <Ionicons
                  name={isFav ? 'heart' : 'heart-outline'}
                  size={18}
                  color={isFav ? colors.danger : colors.scrimTextPrimary}
                  style={styles.toggleGlyph}
                />
              </AnimatedPressable>
            ) : null}
            {showSaveButton ? (
              <AnimatedPressable
                onPress={handleToggleSave}
                style={styles.toggleHit}
                activeOpacity={0.7}
                scaleValue={PressScale.icon}
                accessibilityRole="button"
                accessibilityLabel={isSaved ? 'Remove from saved' : 'Add to saved'}
                accessibilityState={{ selected: isSaved }}
              >
                <Ionicons
                  name={isSaved ? 'bookmark' : 'bookmark-outline'}
                  size={18}
                  color={isSaved ? colors.brand : colors.scrimTextPrimary}
                  style={styles.toggleGlyph}
                />
              </AnimatedPressable>
            ) : null}
          </View>
        ) : null}

        {/* Bottom gradient + price overlay — media-first, price as secondary signal */}
        {!isSold ? (
          <>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)']}
              style={styles.bottomScrim}
              pointerEvents="none"
            />
            <View style={styles.priceOverlay} pointerEvents="none">
              {item.brand ? (
                <Text style={styles.brandText} numberOfLines={1}>
                  {item.brand}
                </Text>
              ) : null}
              <Text style={styles.priceText} numberOfLines={1}>
                {formatFromFiat(item.price, currencyCode, { displayMode: 'fiat' })}
              </Text>
            </View>
          </>
        ) : null}
      </AnimatedPressable>
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      paddingHorizontal: GRID_PADDING,
      gap: GRID_GAP },
    column: {
      flex: 1,
      gap: GRID_GAP },
    tileWrap: {
      // width is set inline per tile
    },
    tile: {
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
      position: 'relative' },
    image: {
      borderRadius: Radius.lg },
    // Sold state
    soldScrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center' },
    soldLabel: {
      position: 'absolute',
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextPrimary,
      letterSpacing: 1,
      textTransform: 'uppercase',
      top: '50%',
      marginTop: -8,
      alignSelf: 'center' },
    // Price-drop badge
    priceDropBadge: {
      position: 'absolute',
      top: Space.xs,
      left: Space.xs,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: Space.xs + 1,
      paddingVertical: 2,
      borderRadius: Radius.sm,
      backgroundColor: colors.danger },
    priceDropText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextPrimary,
      letterSpacing: 0.2 },
    // Toggle row
    toggleRow: {
      position: 'absolute',
      top: 0,
      right: 0,
      flexDirection: 'row',
      gap: 0 },
    toggleHit: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center' },
    toggleGlyph: {
      textShadowColor: colors.overlay,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4 },
    // Bottom price overlay
    bottomScrim: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 48 },
    priceOverlay: {
      position: 'absolute',
      bottom: Space.xs,
      left: Space.xs + 1,
      right: Space.xs + 1 },
    // Brand label — recognition cue above price. In a closet the user is
    // re-scanning known items; brand is the fastest recognition signal.
    brandText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextPrimary,
      letterSpacing: 0.1,
      textShadowColor: colors.overlay,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
      marginBottom: 1 },
    priceText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextPrimary,
      letterSpacing: 0.1,
      textShadowColor: colors.overlay,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3 } });
