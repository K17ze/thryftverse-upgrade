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
  type TextStyle } from 'react-native';
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
import { Space, FontFamily, Radius, Control, GlyphShadow } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import type { HomeDiscoveryItemVM } from '../../presentation/homeDiscoveryViewModel';

// Large display glyph — not a typographic token. The brand monogram initial
// IS the artwork, not a label, so it uses a display glyph size.
const DISCOVERY_CARD_GLYPH_SIZE = 36;

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
  shouldPlay = false }: HomeDiscoveryCardProps) {
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
        displayMode: 'fiat' })
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
                  {(() => {
                    const label = getCategoryPlaceholderLabel(item.category, item.identity.primary);
                    // Brand initial → large confident monogram (art-directed,
                    // not a tiny label). Category name → quieter but still
                    // confident. The object is the label (AGENTS.md §4).
                    if (label.length === 1) {
                      return (
                        <Text style={styles.mediaPlaceholderMonogram} numberOfLines={1}>
                          {label}
                        </Text>
                      );
                    }
                    return (
                      <Text style={styles.mediaPlaceholderText} numberOfLines={1}>
                        {label}
                      </Text>
                    );
                  })()}
                </View>
              )}
            </SharedTransitionView>
          </DoubleTapHeart>

          {/* Save glyph — 44pt transparent hit area, 22pt visible icon */}
          <Pressable
            onPress={handleSavePress}
            style={styles.saveButton}
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
                colors={['transparent', colors.mediaOverlayScrim]}
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
      backgroundColor: colors.background },
    pressable: {
      width: '100%' },
    mediaWrap: {
      position: 'relative',
      borderRadius: RadiusRoleValue.mediaThumbnail,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt },
    sharedMedia: {
      ...StyleSheet.absoluteFill },
    media: {
      width: '100%',
      height: '100%' },
    mediaPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden' },
    // Category label: 13sp, medium, letter-spaced — quiet but confident.
    mediaPlaceholderText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.medium,
      color: colors.textMuted,
      letterSpacing: 0.3 } as TextStyle,
    // Brand monogram: 36sp, light weight, low opacity — art-directed
    // typographic treatment. The initial IS the artwork, not a label.
    mediaPlaceholderMonogram: {
      fontSize: DISCOVERY_CARD_GLYPH_SIZE,
      lineHeight: 40,
      fontFamily: FontFamily.light,
      color: colors.textMuted,
      opacity: 0.5,
      letterSpacing: -0.5 } as TextStyle,
    // Save glyph: 44pt transparent hit area, 22pt visible icon, top-right
    saveButton: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs,
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      zIndex: 5 },
    saveGlyph: {
      ...GlyphShadow.glyph,
      textShadowColor: colors.shadow },
    // ── Below-media metadata ──
    meta: {
      paddingTop: Space.xs + 1,
      paddingHorizontal: Space.xxs },
    // Identity: 14sp, medium weight, max 2 lines
    identity: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.body.letterSpacing } as TextStyle,
    // Price row: current price + optional strikethrough original
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.xs,
      marginTop: Space.xxs },
    // Price: 15sp, semibold, tabular figures
    price: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: TypographyV2.bodyStrong.letterSpacing } as TextStyle,
    priceOriginal: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      textDecorationLine: 'line-through',
      fontVariant: ['tabular-nums'] } as TextStyle,
    // Context: 12sp, secondary color, max one fact
    contextText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      marginTop: Space.xxs } as TextStyle,
    // Social proof: subtle likes row — 12sp muted with small heart glyph.
    // Only shown when likes > 10 to avoid noise on low-engagement tiles.
    likesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: Space.xxs },
    likesText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'] } as TextStyle,
    // ── Overlay price (video tiles only) ──
    bottomScrim: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 40 },
    overlayPriceWrap: {
      position: 'absolute',
      bottom: Space.sm - 2,
      left: Space.xs + 1,
      right: Space.xs + 1 },
    overlayPriceText: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: FontFamily.semibold,
      fontVariant: ['tabular-nums'],
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      color: colors.scrimTextPrimary,
      ...GlyphShadow.glyph,
      textShadowColor: colors.shadow } as TextStyle });

export default HomeDiscoveryCard;
