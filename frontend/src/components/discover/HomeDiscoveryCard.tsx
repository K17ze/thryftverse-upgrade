/**
 * HomeDiscoveryCard — Phase 5 visual commerce tile for the Home feed
 *
 * Layout (standard two-column commerce tile):
 *   ┌─────────────────┐
 *   │                 │
 *   │      MEDIA      │
 *   │             ♡   │  save glyph (22pt icon, 44pt transparent hit area)
 *   └─────────────────┘
 *   Acne Studios scarf     ← identity (14sp, medium, max 2 lines)
 *   £86  £110              ← price (15sp, semibold, tabular figures)
 *   Price dropped          ← optional context (12sp, secondary)
 *
 * Design decisions (doc 05 + doc 46):
 *   - Price goes BELOW media for standard commerce tiles — no gradient
 *     scrim, price always legible, card is recognizably commerce.
 *   - Save glyph: small visible heart icon (22pt) with 44pt transparent
 *     hit area over media top-right. No giant white disk.
 *   - Identity: 14sp, max 2 lines (prefer 1), medium weight.
 *   - Price: 15sp, semibold, tabular figures.
 *   - Context: 12sp, secondary color, max ONE fact.
 *   - Video tiles keep overlay price (editorial role).
 *
 * Preserves all existing functionality:
 *   - Double-tap to save (DoubleTapHeart)
 *   - Single-tap save via heart glyph
 *   - Long press preview
 *   - Shared element transitions
 *   - Video autoplay management
 *   - Press feedback (AnimatedPressable)
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { SharedTransitionView } from '../SharedTransitionView';
import { DoubleTapHeart } from '../DoubleTapHeart';
import { MediaPreview as CanonicalMediaPreview } from '../MediaPreview';
import { useStore } from '../../store/useStore';
import { useHaptic } from '../../hooks/useHaptic';
import { ProductAnalytics } from '../../platform/product/productAnalytics';
import { Space, FontFamily, Radius, Type } from '../../theme/designTokens';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import type { HomeDiscoveryItemVM } from '../../presentation/homeDiscoveryViewModel';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormatPriceFn = (...args: any[]) => string;

interface HomeDiscoveryCardProps {
  item: HomeDiscoveryItemVM;
  tileWidth: number;
  formatPrice: FormatPriceFn;
  onPress: (routeId: string | undefined) => void;
  onLongPress: (item: HomeDiscoveryItemVM) => void;
  /** Viewability-driven playback: only the most-visible video plays. */
  shouldPlay?: boolean;
}

export const HomeDiscoveryCard = React.memo(function HomeDiscoveryCard({
  item,
  tileWidth,
  formatPrice,
  onPress,
  onLongPress,
  shouldPlay = false,
}: HomeDiscoveryCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const toggleWishlist = useStore((state) => state.toggleWishlist);
  const haptic = useHaptic();

  const sharedTag = item.media.kind === 'image' && item.routeId
    ? `image-${item.routeId}-0`
    : undefined;

  const mediaHeight = Math.round(tileWidth * item.aspectRatio);

  const handleDoubleTapLike = React.useCallback(() => {
    if (item.routeId) {
      toggleWishlist(item.routeId);
      ProductAnalytics.itemSave(item.routeId);
      haptic.success();
    }
  }, [item.routeId, toggleWishlist, haptic]);

  const handleSavePress = React.useCallback(() => {
    if (item.routeId) {
      toggleWishlist(item.routeId);
      ProductAnalytics.itemSave(item.routeId);
      haptic.light();
    }
  }, [item.routeId, toggleWishlist, haptic]);

  // Video tiles keep overlay price (editorial role) — price is a secondary
  // signal over ambient video media. Standard image tiles put price below
  // media where it is always legible without a scrim.
  const useOverlayPrice = item.isVideo;

  const formattedPrice = formatPrice(
    item.price.currentMinor / 100,
    item.price.currency,
    { displayMode: 'fiat' },
  );
  const formattedOriginalPrice = item.price.originalMinor
    ? formatPrice(item.price.originalMinor / 100, item.price.currency, {
        displayMode: 'fiat',
      })
    : null;

  const accessibilityLabel = [
    item.identity.primary,
    formattedPrice,
    item.price.originalMinor ? `was ${formattedOriginalPrice}` : '',
    item.context?.text ?? '',
    item.likes > 10 ? `${item.likes} likes` : '',
    item.saved ? 'saved' : '',
  ]
    .filter(Boolean)
    .join(', ');

  // Social proof: show likes count only for items with significant
  // engagement (> 10 likes) to avoid noise on low-engagement tiles.
  // 2026 research: subtle social proof below price drives discovery
  // engagement without cluttering the tile.
  const showLikes = item.likes > 10;
  const likesLabel = showLikes
    ? item.likes > 999
      ? `${(item.likes / 1000).toFixed(1)}k likes`
      : `${item.likes} likes`
    : null;

  return (
    <View style={[styles.card, { width: tileWidth }]}>
      <AnimatedPressable
        style={styles.pressable}
        onPress={() => onPress(item.routeId)}
        onLongPress={() => onLongPress(item)}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityHint="Opens item details. Long press to preview this listing"
      >
        {/* ── Media section ── */}
        <View style={[styles.mediaWrap, { height: mediaHeight }]}>
          <DoubleTapHeart
            isLiked={item.saved}
            onLike={handleDoubleTapLike}
          >
            <SharedTransitionView
              style={styles.sharedMedia}
              sharedTransitionTag={sharedTag}
            >
              {item.media.uri ? (
                <CanonicalMediaPreview
                  uri={item.media.uri}
                  posterUri={item.media.posterUri}
                  style={styles.media}
                  shouldPlay={shouldPlay}
                  contentFit="cover"
                  focalPoint={item.media.focalPoint}
                  isVisible
                  showPlayBadge
                  downscaleWidth={Math.round(tileWidth)}
                />
              ) : (
                <View style={styles.mediaPlaceholder}>
                  {getCategoryPlaceholderTint(item.category, colors) ? (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: getCategoryPlaceholderTint(item.category, colors) }]} />
                  ) : null}
                  <Text style={styles.mediaPlaceholderText} numberOfLines={1}>
                    {getCategoryPlaceholderLabel(item.category, item.identity.primary)}
                  </Text>
                </View>
              )}
            </SharedTransitionView>
          </DoubleTapHeart>

          {/* Save glyph — 44pt transparent hit area, 22pt visible icon */}
          <Pressable
            onPress={handleSavePress}
            style={styles.saveButton}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityLabel={item.saved ? 'Unsave item' : 'Save item'}
            accessibilityRole="button"
          >
            <Ionicons
              name={item.saved ? 'heart' : 'heart-outline'}
              size={22}
              color={item.saved ? colors.danger : colors.scrimTextPrimary}
              style={styles.saveGlyph}
            />
          </Pressable>

          {/* Overlay price for video tiles (editorial role) */}
          {useOverlayPrice && (
            <>
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.62)']}
                style={styles.bottomScrim}
                pointerEvents="none"
              />
              <View style={styles.overlayPriceWrap} pointerEvents="none">
                <Text style={styles.overlayPriceText} numberOfLines={1}>
                  {formattedPrice}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ── Identity + price below media (standard commerce tile) ── */}
        {!useOverlayPrice && (
          <View style={styles.meta}>
            <Text
              style={styles.identity}
              numberOfLines={2}
            >
              {item.identity.primary}
            </Text>
            <View style={styles.priceRow}>
              <Text style={styles.price} numberOfLines={1}>
                {formattedPrice}
              </Text>
              {formattedOriginalPrice && (
                <Text style={styles.priceOriginal} numberOfLines={1}>
                  {formattedOriginalPrice}
                </Text>
              )}
            </View>
            {item.context && (
              <Text style={styles.contextText} numberOfLines={1}>
                {item.context.text}
              </Text>
            )}
            {likesLabel && (
              <View style={styles.likesRow} pointerEvents="none">
                <Ionicons name="heart" size={10} color={colors.textMuted} />
                <Text style={styles.likesText} numberOfLines={1}>
                  {likesLabel}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Overlay price tiles still show identity below for commerce readability */}
        {useOverlayPrice && (
          <View style={styles.meta}>
            <Text
              style={styles.identity}
              numberOfLines={1}
            >
              {item.identity.primary}
            </Text>
            {item.context && (
              <Text style={styles.contextText} numberOfLines={1}>
                {item.context.text}
              </Text>
            )}
            {likesLabel && (
              <View style={styles.likesRow} pointerEvents="none">
                <Ionicons name="heart" size={10} color={colors.textMuted} />
                <Text style={styles.likesText} numberOfLines={1}>
                  {likesLabel}
                </Text>
              </View>
            )}
          </View>
        )}
      </AnimatedPressable>
    </View>
  );
});

// ── Category placeholder helpers ───────────────────────────────────────────

/** Returns a subtle category-tinted background using existing *Subtle tokens,
 *  or undefined for the default cool-grey surfaceAlt. */
function getCategoryPlaceholderTint(category: string | undefined, colors: ThemeColors): string | undefined {
  const normalized = category?.toLowerCase() ?? '';
  if (normalized.includes('bag')) return colors.warningSubtle;   // warm beige tint
  if (normalized.includes('shoe')) return colors.brandSubtle;    // neutral brand tint
  return undefined; // watches/jewellery/apparel → cool grey (surfaceAlt)
}

/** Returns the category label or brand initial for the placeholder's
 *  typographic treatment. Prefers brand initial when available. */
function getCategoryPlaceholderLabel(category: string | undefined, brand?: string): string {
  if (brand && brand.length > 0) {
    return brand.charAt(0).toUpperCase();
  }
  const normalized = category?.toLowerCase() ?? '';
  if (normalized.includes('shoe')) return 'Footwear';
  if (normalized.includes('bag')) return 'Bags';
  if (normalized.includes('jewel')) return 'Jewellery';
  if (normalized.includes('watch')) return 'Watches';
  return category ?? 'ThryftVerse';
}

// ── Styles ────────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.background,
    },
    pressable: {
      width: '100%',
    },
    mediaWrap: {
      position: 'relative',
      borderRadius: RadiusRoleValue.mediaThumbnail,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    sharedMedia: {
      ...StyleSheet.absoluteFill,
    },
    media: {
      width: '100%',
      height: '100%',
    },
    mediaPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    mediaPlaceholderText: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      fontFamily: FontFamily.medium,
      color: colors.textMuted,
      letterSpacing: Type.meta.letterSpacing,
    },
    // Save glyph: 44pt transparent hit area, 22pt visible icon, top-right
    saveButton: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs,
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      zIndex: 5,
    },
    saveGlyph: {
      textShadowColor: colors.shadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    // ── Below-media metadata ──
    meta: {
      paddingTop: Space.xs + 1,
      paddingHorizontal: Space.xxs,
    },
    // Identity: 14sp, medium weight, max 2 lines
    identity: {
      fontSize: 14,
      lineHeight: 19,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
      letterSpacing: -0.15,
    } as TextStyle,
    // Price row: current price + optional strikethrough original
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.xs,
      marginTop: Space.xxs,
    },
    // Price: 15sp, semibold, tabular figures
    price: {
      fontSize: 15,
      lineHeight: 20,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.1,
    } as TextStyle,
    priceOriginal: {
      fontSize: 13,
      lineHeight: 18,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      textDecorationLine: 'line-through',
      fontVariant: ['tabular-nums'],
    } as TextStyle,
    // Context: 12sp, secondary color, max one fact
    contextText: {
      fontSize: 12,
      lineHeight: 16,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      marginTop: Space.xxs,
    } as TextStyle,
    // Social proof: subtle likes row — 12sp muted with small heart glyph.
    // Only shown when likes > 10 to avoid noise on low-engagement tiles.
    likesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: Space.xxs,
    },
    likesText: {
      fontSize: 12,
      lineHeight: 16,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    } as TextStyle,
    // ── Overlay price (video tiles only) ──
    bottomScrim: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 40,
    },
    overlayPriceWrap: {
      position: 'absolute',
      bottom: Space.sm - 2,
      left: Space.xs + 1,
      right: Space.xs + 1,
    },
    overlayPriceText: {
      fontSize: 15,
      lineHeight: 20,
      fontFamily: FontFamily.semibold,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.1,
      color: colors.scrimTextPrimary,
      textShadowColor: colors.shadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    } as TextStyle,
  });

export default HomeDiscoveryCard;
