/**
 * ProductCard V2 — stable, image-first marketplace card.
 * Geometry is reserved before media loads to prevent masonry reflow.
 */

import React, { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { AnimatedPressable } from './AnimatedPressable';
import { CachedImage } from './CachedImage';
import { AnimatedHeart } from './AnimatedHeart';
import { ImageEmptyGraphic } from './ImageEmptyGraphic';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import type { Listing } from '../domain';
import { isVideoUri, getCategoryFocalPoint, FACE_FOCAL_POINT } from '../utils/media';
import { StaggeredItem } from './StaggeredGridEntrance';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { resolveListingMediaAspectRatio } from '../utils/listingMediaGeometry';
import { computeSustainabilityScore } from '../utils/sustainabilityScore';
import { SustainabilityBadge } from './product/SustainabilityBadge';
import type { DiscoveryListingSummary } from '../contracts/DiscoveryListingSummary';

import { Space, Radius, Control, Type, Typography } from '../theme/designTokens';
import { synthesizeListingIdentity } from '../services/listingMapper';
// A URI is only usable when it is a non-blank string. Backend rows can surface
// `''`, `null`, or whitespace-only strings; treat all of these as "no media"
// so the premium placeholder renders instead of a broken image.
function isUsableUri(uri: unknown): uri is string {
  return typeof uri === 'string' && uri.trim().length > 0;
}

interface ProductCardV2Props {
  item: Listing;
  onPress: () => void;
  index?: number;
  showSaveButton?: boolean;
  visualOnly?: boolean;
  /** Width divided by height. Use API media metadata when available. */
  mediaAspectRatio?: number;
  /** Enable staggered entrance animation (default true) */
  enableEntranceAnimation?: boolean;
  onPressSeller?: () => void;
  onMessageSeller?: () => void;
  /**
   * Image resolution policy: target display width in pixels for CDN
   * downscaling. Pass the pixel width of the card so grid thumbnails
   * do not download full-resolution images.
   * (LIST_RENDERING_POLICY.md §5.1 / audit §Caching/prefetch)
   */
  downscaleWidth?: number;
  /**
   * TestID for Maestro/automation semantic selectors. When provided,
   * passes through to the underlying Pressable so Maestro flows can
   * tapOn by id instead of brittle coordinate taps (P0.6).
   */
  testID?: string;
}

function ProductCardV2Base({
  item,
  onPress,
  index = 0,
  showSaveButton = false,
  visualOnly = false,
  mediaAspectRatio,
  enableEntranceAnimation = true,
  onPressSeller,
  downscaleWidth,
  testID,
  // `onMessageSeller` remains in the interface so existing callers
  // (SearchScreen, PinterestMasonryGrid) keep type-checking, but the
  // chat action is intentionally not rendered on the card — messaging
  // belongs on the product detail page, not the discovery surface.
}: ProductCardV2Props) {
  const isFav = useStore((state) => state.isWishlisted(item.id));
  const toggleFav = useStore((state) => state.toggleWishlist);
  const isSaved = useStore((state) => state.isSavedProduct(item.id));
  const toggleSaved = useStore((state) => state.toggleSavedProduct);
  const { show } = useToast();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const reducedMotionEnabled = useReducedMotion();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [imageFailed, setImageFailed] = useState(false);
  const aspectRatio = mediaAspectRatio ?? resolveListingMediaAspectRatio(item);
  // Filter to only usable URIs so empty-string backend sentinels never reach
  // the image layer or the "multiple media" badge.
  const usableImages = (item.images ?? []).filter(isUsableUri);
  const primaryImage = usableImages[0] ?? '';
  const hasUsableImage = primaryImage.length > 0;
  const hasVideo = usableImages.some((uri) => isVideoUri(uri));
  const hasMultiple = usableImages.length > 1;
  const showPlaceholder = !hasUsableImage || imageFailed;
  const sellerUsername = item.seller?.username ?? item.sellerId ?? null;
  const sellerAvatar = item.seller?.avatar ?? null;
  const sellerVerified = item.seller?.verified === true;

  // Identity synthesis (Phase 5 WP7): brand + title, or clean title,
  // or category-based fallback. Used for the accessibility label so
  // screen readers announce a coherent identity. Never shows
  // "Unknown brand/size" — brandless listings use the clean title.
  const identityLine = React.useMemo(
    () => synthesizeListingIdentity(item),
    [item],
  );

  // Sustainability — only surface A/B grades on the card to avoid visual
  // noise on lower-impact items. Computed client-side from listing data.
  const sustainabilityScore = React.useMemo(
    () =>
      computeSustainabilityScore({
        condition: item.condition,
        category: item.category,
        subcategory: item.subcategory,
        brand: item.brand,
        sellerLocation: item.seller?.location ?? null,
      }),
    [item.condition, item.category, item.subcategory, item.brand, item.seller?.location],
  );
  const showSustainabilityChip =
    !item.isSold && (sustainabilityScore.grade === 'A' || sustainabilityScore.grade === 'B');

  const handleToggleFav = () => {
    haptic.light();
    toggleFav(item.id);
    if (!isFav) {
      haptic.success();
      show('Added to wishlist', 'success');
    }
  };

  const handleToggleSave = () => {
    haptic.light();
    toggleSaved(item.id);
    show(isSaved ? 'Removed from saved' : 'Added to saved', 'info');
  };

  const hasPriceDrop = typeof item.originalPrice === 'number' && item.originalPrice > item.price;
  const priceDropPercent = hasPriceDrop
    ? Math.round(((item.originalPrice! - item.price) / item.originalPrice!) * 100)
    : 0;

  // Condition badge — color-coded status pill overlaid on the preview.
  //   New with tags → green (colors.success)
  //   Used (very good / good / satisfactory) → dark gray scrim
  //   Sold → dark gray scrim with a "Sold" label
  // Badge backgrounds are always dark, so the label uses a fixed white
  // ink instead of a theme text token (which would render black-on-dark
  // in dark mode). Width is auto so longer conditions still fit at 20pt.
  const conditionBadge = (() => {
    if (item.isSold) {
      return { label: 'Sold', bg: 'rgba(0,0,0,0.6)' };
    }
    if (!item.condition) return null;
    const isNew = item.condition === 'New with tags';
    return {
      label: isNew ? 'New' : item.condition,
      bg: isNew ? colors.success : 'rgba(0,0,0,0.55)',
    };
  })();

  const cardContent = (
    <View style={[styles.container, item.isSold && styles.soldContainer]}>
      {/* Image - Full bleed, subtle radius for modern feel */}
      <AnimatedPressable
        onPress={onPress}
        style={styles.imageWrap}
        hapticFeedback="light"
        accessibilityRole="none"
        accessibilityLabel={`${identityLine}, ${formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}${item.condition ? `, ${item.condition}` : ''}${item.isSold ? ', Sold' : ''}`}
        accessibilityHint="Opens item details"
        testID={testID}
      >
        {showPlaceholder ? (
          // Premium placeholder — matches Thryftverse visual language via
          // ImageEmptyGraphic (gradient + geometric texture + icon ring).
          // Falls back to the 4:5 editorial ratio so the masonry never collapses.
          <ImageEmptyGraphic
            icon="shirt-outline"
            style={[styles.image, { aspectRatio }]}
          />
        ) : (
          <CachedImage
            uri={primaryImage}
            style={[styles.image, { aspectRatio }]}
            contentFit="cover"
            transition={300}
            focalPoint={getCategoryFocalPoint(item.category)}
            onError={() => setImageFailed(true)}
            downscaleWidth={downscaleWidth}
          />
        )}

        {/* Sold state — gray scrim over the preview + a centered "Sold"
            label. The whole card is additionally dimmed via the container
            opacity (styles.soldContainer) so sold items recede visually
            without hiding the media. The color-coded condition badge
            below also flips to a gray "Sold" pill for at-a-glance status. */}
        {item.isSold ? (
          <>
            <View style={styles.soldOverlay} />
            <Text style={styles.soldLabelCenter}>Sold</Text>
          </>
        ) : null}

        {/* Badge cascade — priority: price drop > sold > condition > sustainability.
            Top-left corner is mutually exclusive: a price reduction is the
            stronger deal signal, so it wins over the eco chip. Both are
            suppressed once the item is sold. */}
        {!item.isSold && hasPriceDrop ? (
          <View style={styles.priceDropBadge}>
            <Text style={styles.conditionText}>-{priceDropPercent}%</Text>
          </View>
        ) : !item.isSold && showSustainabilityChip ? (
          <View style={styles.sustainabilityChipWrap}>
            <SustainabilityBadge
              score={sustainabilityScore}
              variant="compact"
              onMedia
            />
          </View>
        ) : null}

        {/* Condition badge — lower-left, color-coded (green = New,
            dark = Used / Sold). Small 20pt pill so it never dominates
            the media; auto width keeps longer conditions legible. */}
        {conditionBadge ? (
          <View style={[styles.conditionBadge, { backgroundColor: conditionBadge.bg }]}>
            <Text style={styles.conditionText}>{conditionBadge.label}</Text>
          </View>
        ) : null}

        {/* Media indicator — upper-right. Video gets a dedicated play
            glyph in a small dark circle; multiple photos keep the
            existing stack icon. Only one indicator ever shows. */}
        {hasVideo ? (
          <View style={styles.videoIndicator}>
            <Ionicons name="play" size={16} color="#FFFFFF" />
          </View>
        ) : hasMultiple ? (
          <View style={styles.mediaBadge}>
            <Ionicons name="images" size={13} color="#FFFFFF" />
          </View>
        ) : null}

        {/* Favorite button — transparent hit targets with text-shadow scrim
            per AGENTS.md: separate hit area from visible shape. No decorative
            circular chrome; the glyph legibility comes from the shadow. */}
        <View style={styles.actionButtonsRow}>
          {showSaveButton ? (
            <AnimatedPressable
              style={styles.actionHitTarget}
              onPress={handleToggleSave}
              hapticFeedback="light"
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={isSaved ? 'Remove from saved' : 'Save item'}
              accessibilityHint="Toggles this product in your saved page"
              accessibilityState={{ checked: isSaved }}
            >
              <Ionicons
                name={isSaved ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={isSaved ? colors.brand : colors.textInverse}
                style={styles.actionGlyph}
              />
            </AnimatedPressable>
          ) : null}
          <View style={styles.actionHitTarget}>
            <AnimatedHeart
              isActive={isFav}
              onToggle={handleToggleFav}
              size={21}
              activeColor={colors.danger}
              inactiveColor={colors.textInverse}
            />
          </View>
        </View>
      </AnimatedPressable>

      {/* Info — Product tile metadata budget (audit §02 / PRODUCT_TILE_METADATA_BUDGET):
            media + title/brand (one restrained line) + price + one state marker.
            No stacking of price + old price + discount + likes + size + seller +
            badge + shipping + AI reason + availability. The -X% badge on the
            media is the single deal signal; the original price, likes count,
            and size are available on the PDP, not on every discovery tile.
            Identity synthesis (Phase 5 WP7): brand + title, or clean title,
            or category-based fallback. Never shows "Unknown brand/size". */}
      {!visualOnly && (
        <View style={styles.info}>
          {/* Brand eyebrow — only when brand is present. Brandless listings
              (valid per category policy) show the clean title without a
              misleading "Unknown brand" label. */}
          {item.brand ? (
            <Text style={styles.brandEyebrow} numberOfLines={1}>{item.brand}</Text>
          ) : null}
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceHero}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Text>
          </View>
          {sellerUsername ? (
            <View style={styles.sellerRow}>
              <AnimatedPressable
                style={styles.sellerIdentity}
                onPress={onPressSeller}
                disabled={!onPressSeller}
                accessible={Boolean(onPressSeller)}
                accessibilityRole="button"
                accessibilityLabel={`Open @${sellerUsername}'s profile`}
              >
              {sellerAvatar ? (
                <CachedImage
                  uri={sellerAvatar}
                  style={styles.sellerAvatar}
                  contentFit="cover"
                  focalPoint={FACE_FOCAL_POINT}
                  downscaleWidth={64}
                />
              ) : (
                // Premium compact seller placeholder — keeps alignment and
                // avoids awkward whitespace when avatar is missing.
                <View style={styles.sellerAvatarPlaceholder}>
                  <Ionicons name="person" size={14} color={colors.textMuted} />
                </View>
              )}
              <Text style={styles.sellerName} numberOfLines={1}>@{sellerUsername}</Text>
              {sellerVerified ? (
                <Ionicons
                  name="checkmark-circle-outline"
                  size={11}
                  color={colors.success}
                  style={styles.sellerVerifiedIcon}
                  accessibilityLabel="Verified seller"
                />
              ) : null}
              </AnimatedPressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );

  if (!enableEntranceAnimation || reducedMotionEnabled) {
    return cardContent;
  }

  return (
    <StaggeredItem index={index} animation="fade" staggerMs={40}>
      {cardContent}
    </StaggeredItem>
  );
}

export const ProductCardV2 = React.memo(ProductCardV2Base);

// ============================================================================
// MASONRY GRID
// ============================================================================
//
// CANONICAL STRATEGY (audit §02 — one masonry implementation):
//   1. Virtualized feeds (HomeScreen): FlashList numColumns=2 — the single
//      virtualized masonry path for long feeds.
//   2. Non-virtualized masonry (Browse, Search, CategoryDetail, VisualSearch,
//      CollectionDetail, Closet, ExploreCollection): PinterestMasonryGrid
//      in components/discover/PinterestMasonryGrid.tsx — the single
//      non-virtualized masonry path.
//
// This `MasonryGrid` export is kept for backward compatibility with existing
// callers (CollectionDetail, Closet, ExploreCollection). New screens should
// import PinterestMasonryGrid instead. Do not add new callers of this export.

interface MasonryGridProps {
  items: Listing[];
  onPressItem: (item: Listing) => void;
  numColumns?: number;
  showSaveButton?: boolean;
  visualOnly?: boolean;
}

export function MasonryGrid({ items, onPressItem, numColumns = 2, showSaveButton = false, visualOnly = false }: MasonryGridProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  // True masonry: assign each item to the shortest column for visual balance
  const columns: { item: Listing; originalIndex: number }[][] = Array.from({ length: numColumns }, () => []);
  const heights = Array.from({ length: numColumns }, () => 0);

  items.forEach((item, index) => {
    const aspect = resolveListingMediaAspectRatio(item);
    const imgHeight = 160 / aspect; // approximate; actual width varies
    const infoHeight = visualOnly ? 0 : 88; // title + price + seller row (no likes/size)
    const itemHeight = imgHeight + infoHeight + 12;

    let shortestCol = 0;
    let shortestHeight = heights[0];
    for (let c = 1; c < numColumns; c++) {
      if (heights[c] < shortestHeight) {
        shortestCol = c;
        shortestHeight = heights[c];
      }
    }

    columns[shortestCol].push({ item, originalIndex: index });
    heights[shortestCol] += itemHeight;
  });

  return (
    <View style={styles.grid}>
      {columns.map((columnItems, colIndex) => (
        <View key={colIndex} style={styles.column}>
          {columnItems.map(({ item, originalIndex }) => (
            <ProductCardV2
              key={item.id}
              item={item}
              onPress={() => onPressItem(item)}
              index={originalIndex}
              showSaveButton={showSaveButton}
              visualOnly={visualOnly}
              mediaAspectRatio={resolveListingMediaAspectRatio(item)}
              enableEntranceAnimation={true}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: {
    flex: 1,
  },
  // Sold items recede without hiding the media — a gentle 0.7 opacity
  // across the whole card communicates "no longer available" while the
  // preview stays recognisable.
  soldContainer: {
    opacity: 0.7,
  },

  // Image - Pinterest/Depop tight editorial feel. No shadow, minimal radius.
  // Art direction (AGENTS.md §15 — media storytelling):
  //  - Media is the primary visual anchor; chrome recedes.
  //  - No decorative border or shadow on the media itself.
  //  - borderRadius 12pt (Radius.lg) — within the media/field radius budget.
  //  - backgroundColor is a placeholder tone only (surfaceAlt), never chrome.
  //  - No gradient overlay on the card — price sits BELOW the media in the
  //    info section, not over it. Gradients are used ONLY when text
  //    readability over media requires it (see CommerceMediaStage scrims).
  //  - Focal points preserved via contentFit="cover" + getCategoryFocalPoint.
  //  - Aspect ratios vary per-listing (resolveListingMediaAspectRatio) so
  //    the masonry feed has honest editorial rhythm, not uniform tiles.
  imageWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  image: {
    width: '100%',
  },

  // Sold — gray scrim over the preview + a centered "Sold" label.
  // Combined with soldContainer opacity, the status is unambiguous but
  // the image remains visible behind the scrim.
  soldOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldLabelCenter: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.bold,
    // Fixed white ink — the scrim is always dark, so a theme text token
    // (black in dark mode) would render invisible.
    color: '#FFFFFF',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  // Video indicator — small dark circle with a white play glyph, upper-right.
  // Subtle (24pt) but discoverable; only cards whose media includes a
  // video render it.
  videoIndicator: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionHitTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Text-shadow scrim for glyph legibility on media — per AGENTS.md,
  // visible containment must have meaning. These controls don't need
  // containment; they need legibility. Shadow replaces circular chrome.
  actionGlyph: {
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  actionButtonsRow: {
    position: 'absolute',
    bottom: Space.xs,
    right: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  sustainabilityChipWrap: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
  },

  // Info - Clean hierarchy with breathing room
  info: {
    paddingTop: Space.sm,
    paddingHorizontal: Space.xs,
    gap: Space.xs,
  },
  // Brand eyebrow — a restrained single-line brand label above the title.
  // Only rendered when brand is present (Phase 5 WP7 identity synthesis).
  // Brandless listings show the clean title without a misleading label.
  brandEyebrow: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Price elevated to hero — 16pt bold, clearly dominant over 14pt title.
  // This is the Vestiaire/StockX move: price is the visual anchor.
  priceHero: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    marginTop: 2,
  },
  sellerIdentity: {
    flex: 1,
    minWidth: 0,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sellerAvatar: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
  },
  sellerAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerName: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    flex: 1,
  },
  sellerVerifiedIcon: {
    flexShrink: 0,
  },
  // Price-drop badge — top-left, red. Only the strongest deal signal
  // occupies this corner; otherwise the sustainability chip takes it.
  priceDropBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    backgroundColor: 'rgba(200,50,50,0.65)',
    paddingHorizontal: Space.sm,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  // Condition badge — lower-left, color-coded via inline backgroundColor.
  // Small 20pt pill with an 8pt radius so it reads as metadata, not chrome.
  conditionBadge: {
    position: 'absolute',
    bottom: Space.xs,
    left: Space.xs,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.bold,
    // Fixed white ink — condition/price-drop badges always sit on a dark
    // or saturated background, so a theme text token (black in dark mode)
    // would be invisible.
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },

  // Grid — breathable gaps for flagship feel (12pt vs 8pt)
  grid: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    gap: 12,
  },
  column: {
    flex: 1,
    gap: 12,
  },
});

// ============================================================================
// PRODUCT DISCOVERY TILE — lightweight masonry tile for FlashList v2
// ============================================================================
// A recycling-safe discovery tile: media + price + optional condition badge.
// No seller row, no full badge cascade, no description, no shipping info.
// Images use expo-image directly with `recyclingKey` so recycled cells never
// show stale media (FlashList v2 recycles aggressively). The tile holds NO
// local state — nothing leaks across recycled instances. Honours the product
// tile metadata budget (audit §02): media + title + price + one state marker.

interface ProductDiscoveryTileProps {
  /** Accepts the mock-data `Listing` or the production `DiscoveryListingSummary`
   *  carried by a `ListingFeedUnit` — both expose the fields the tile reads
   *  (id, images, title, price, condition, isSold, category). */
  item: Listing | DiscoveryListingSummary;
  onPress: () => void;
  /** Width divided by height for the media frame. Defaults to the listing's
   *  real media geometry, falling back to the 3:4 portrait standard. */
  aspectRatio?: number;
  /** Target display width in dp for CDN downscaling (optional). */
  downscaleWidth?: number;
  testID?: string;
}

function ProductDiscoveryTileBase({
  item,
  onPress,
  aspectRatio,
  downscaleWidth,
  testID,
}: ProductDiscoveryTileProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const tileStyles = React.useMemo(() => createTileStyles(colors), [colors]);
  const ratio = aspectRatio ?? resolveListingMediaAspectRatio(item);
  const primaryImage = (item.images ?? [])[0] ?? '';

  // Condition badge — single state marker only (sold > condition). Sits over
  // the media on the semantic `overlay` scrim; "New with tags" uses the
  // `success` semantic. Label text is fixed white because the overlay is
  // always dark and no semantic on-scrim text token exists (same convention
  // as the condition badge above, lines ~643–654).
  const conditionBadge = item.isSold
    ? { label: 'Sold', bg: colors.overlay }
    : item.condition
      ? {
          label: item.condition === 'New with tags' ? 'New' : item.condition,
          bg: item.condition === 'New with tags' ? colors.success : colors.overlay,
        }
      : null;

  return (
    <AnimatedPressable
      onPress={onPress}
      hapticFeedback="light"
      style={tileStyles.container}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}${item.condition ? `, ${item.condition}` : ''}${item.isSold ? ', Sold' : ''}`}
      accessibilityHint="Opens item details"
      testID={testID}
    >
      <View style={[tileStyles.media, { aspectRatio: ratio, backgroundColor: colors.surfaceAlt }]}>
        {primaryImage ? (
          <ExpoImage
            source={{ uri: primaryImage }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={item.id}
            placeholder={colors.surfaceAlt}
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <ImageEmptyGraphic icon="shirt-outline" style={StyleSheet.absoluteFill} />
        )}
        {conditionBadge ? (
          <View style={[tileStyles.conditionBadge, { backgroundColor: conditionBadge.bg }]}>
            <Text style={tileStyles.conditionText}>{conditionBadge.label}</Text>
          </View>
        ) : null}
      </View>
      <View style={tileStyles.info}>
        <Text style={tileStyles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={tileStyles.price}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Text>
      </View>
    </AnimatedPressable>
  );
}

export const ProductDiscoveryTile = React.memo(ProductDiscoveryTileBase);

const createTileStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: {
    flex: 1,
  },
  media: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Radius.lg,
  },
  conditionBadge: {
    position: 'absolute',
    bottom: Space.xs,
    left: Space.xs,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fixed white ink — the badge always sits on the dark `overlay` scrim or
  // the saturated `success` green, so a theme text token (black in dark
  // mode) would render invisible. Mirrors the ProductCardV2 convention.
  conditionText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.bold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
  info: {
    paddingTop: Space.sm,
    paddingHorizontal: Space.xs,
    gap: Space.xxs,
  },
  title: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  price: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
});

export default ProductCardV2;
