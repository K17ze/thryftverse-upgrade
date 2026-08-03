/**
 * ProductCard V2 — stable, image-first marketplace card.
 * Geometry is reserved before media loads to prevent masonry reflow.
 */

import React, { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Control, Type } from '../theme/designTokens';
import { T } from './ui/Text';
import { AnimatedPressable } from './AnimatedPressable';
import { CachedImage } from './CachedImage';
import { AnimatedHeart } from './AnimatedHeart';
import { ImageEmptyGraphic } from './ImageEmptyGraphic';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Listing } from '../data/mockData';
import { isVideoUri, getCategoryFocalPoint, FACE_FOCAL_POINT } from '../utils/media';
import { Typography } from '../theme/designTokens';
import { StaggeredItem } from './StaggeredGridEntrance';
import { PressPresets } from '../hooks/usePremiumPressFeedback';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { resolveListingMediaAspectRatio } from '../utils/listingMediaGeometry';

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
}

export function ProductCardV2({
  item,
  onPress,
  index = 0,
  showSaveButton = false,
  visualOnly = false,
  mediaAspectRatio,
  enableEntranceAnimation = true,
  onPressSeller,
  onMessageSeller,
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

  const cardContent = (
    <View style={styles.container}>
      {/* Image - Full bleed, subtle radius for modern feel */}
      <AnimatedPressable
        onPress={onPress}
        style={styles.imageWrap}
        {...PressPresets.card}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}`}
        accessibilityHint="Opens item details"
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
          />
        )}

        {/* Sold — editorial scrim keeps the image as visual anchor while
            clearly deactivating the card. The pill communicates status
            without washing out the media into a white rectangle. */}
        {item.isSold && (
          <>
            <View style={styles.soldScrim} />
            <View style={styles.soldPill}>
              <Text style={styles.soldPillText}>Sold</Text>
            </View>
          </>
        )}

        {/* Condition badge - top left, more subtle */}
        {!item.isSold && !hasPriceDrop && (
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionText}>{item.condition}</Text>
          </View>
        )}

        {/* A single top-left status keeps the image legible. */}
        {hasPriceDrop && !item.isSold && (
          <View style={[styles.conditionBadge, styles.priceDropBadge]}>
            <Text style={styles.conditionText}>-{priceDropPercent}%</Text>
          </View>
        )}

        {/* Media indicator - refined */}
        {(hasMultiple || hasVideo) && (
          <View style={styles.mediaBadge}>
            <Ionicons
              name={hasVideo ? 'videocam' : 'images'}
              size={13}
              color={colors.textInverse}
            />
          </View>
        )}

        {/* Favorite button — transparent hit targets with text-shadow scrim
            per AGENTS.md: separate hit area from visible shape. No decorative
            circular chrome; the glyph legibility comes from the shadow. */}
        <View style={styles.actionButtonsRow}>
          {showSaveButton ? (
            <AnimatedPressable
              style={styles.actionHitTarget}
              onPress={handleToggleSave}
              {...PressPresets.iconButton}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={isSaved ? 'Remove from saved' : 'Save product'}
              accessibilityHint="Toggles this product in your saved page"
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

      {/* Info - Clean hierarchy */}
      {!visualOnly && (
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <View style={styles.priceRow}>
            <View style={styles.priceWrap}>
              <Text style={styles.priceHero}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Text>
              {hasPriceDrop && (
                <Text style={styles.originalPrice}>{formatFromFiat(item.originalPrice!, 'GBP', { displayMode: 'fiat' })}</Text>
              )}
            </View>
            {item.likes > 0 ? (
              <View style={styles.likes}>
                <Ionicons name="heart" size={9} color={colors.textMuted} />
                <T.Caption style={styles.likesText}>{item.likes}</T.Caption>
              </View>
            ) : null}
          </View>

          {item.size ? <T.Caption numberOfLines={1} style={{ marginTop: 1 }}>{item.size}</T.Caption> : null}
          {sellerUsername ? (
            <View style={styles.sellerRow}>
              <AnimatedPressable
                style={styles.sellerIdentity}
                onPress={onPressSeller}
                disabled={!onPressSeller}
                activeOpacity={0.68}
                scaleValue={0.98}
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
                />
              ) : (
                // Premium compact seller placeholder — keeps alignment and
                // avoids awkward whitespace when avatar is missing.
                <View style={styles.sellerAvatarPlaceholder}>
                  <Ionicons name="person" size={10} color={colors.textMuted} />
                </View>
              )}
              <Text style={styles.sellerName} numberOfLines={1}>@{sellerUsername}</Text>
              </AnimatedPressable>
              {onMessageSeller ? (
                <AnimatedPressable
                  style={styles.messageButton}
                  onPress={onMessageSeller}
                  activeOpacity={0.62}
                  scaleValue={0.94}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel={`Message @${sellerUsername}`}
                >
                  <Ionicons name="chatbubble-outline" size={17} color={colors.textPrimary} />
                </AnimatedPressable>
              ) : null}
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

// ============================================================================
// MASONRY GRID
// ============================================================================

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
    const infoHeight = visualOnly ? 0 : 108;
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

  // Image - Pinterest/Depop tight editorial feel. No shadow, minimal radius.
  imageWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  image: {
    width: '100%',
  },

  // Sold — editorial scrim + pill (image stays visible)
  soldScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  soldPill: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  soldPillText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.bold,
    color: colors.textInverse,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
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

  // Info - Clean hierarchy with breathing room
  info: {
    paddingTop: Space.sm,
    paddingHorizontal: Space.xs,
    gap: Space.xs,
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
    justifyContent: 'space-between',
  },
  priceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Price elevated to hero — 16pt bold, clearly dominant over 14pt title.
  // This is the Vestiaire/StockX move: price is the visual anchor.
  priceHero: {
    fontSize: Type.bodyLarge.size,
    lineHeight: Type.bodyLarge.lineHeight,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.bodyLarge.letterSpacing,
  },
  originalPrice: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  likes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  likesText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
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
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  sellerAvatarPlaceholder: {
    width: 16,
    height: 16,
    borderRadius: 8,
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
  messageButton: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
  // Condition & price-drop badges
  conditionBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  priceDropBadge: {
    backgroundColor: 'rgba(200,50,50,0.65)',
  },
  conditionText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.bold,
    color: colors.textInverse,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
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

export default ProductCardV2;
