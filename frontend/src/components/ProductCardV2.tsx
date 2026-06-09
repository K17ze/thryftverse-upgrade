/**
 * ProductCard V2 - Depop Style (Minimal, No Container)
 * Image is the card - no border radius on images
 * Price-first hierarchy like Vinted/Depop
 */

import React from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Space, Radius, Layout, Elevation } from '../theme/designTokens';
import { T, Price } from './ui/Text';
import { AnimatedPressable } from './AnimatedPressable';
import { CachedImage } from './CachedImage';
import { AnimatedHeart } from './AnimatedHeart';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Listing } from '../data/mockData';
import { isVideoUri } from '../utils/media';
import { Typography } from '../theme/designTokens';
import { StaggeredItem } from './StaggeredGridEntrance';

const ASPECT_RATIOS = [0.75, 1.0, 1.25, 1.5]; // Masonry varied heights

interface ProductCardV2Props {
  item: Listing;
  onPress: () => void;
  index?: number;
  showSaveButton?: boolean;
  visualOnly?: boolean;
  /** Enable staggered entrance animation (default true) */
  enableEntranceAnimation?: boolean;
}

export function ProductCardV2({ item, onPress, index = 0, showSaveButton = false, visualOnly = false, enableEntranceAnimation = true }: ProductCardV2Props) {
  const isFav = useStore((state) => state.isWishlisted(item.id));
  const toggleFav = useStore((state) => state.toggleWishlist);
  const isSaved = useStore((state) => state.isSavedProduct(item.id));
  const toggleSaved = useStore((state) => state.toggleSavedProduct);
  const { show } = useToast();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();

  // Deterministic aspect ratio based on item id
  const aspectRatio = ASPECT_RATIOS[item.id.charCodeAt(0) % ASPECT_RATIOS.length];
  const hasVideo = item.images.some((uri) => isVideoUri(uri));
  const hasMultiple = item.images.length > 1;

  const handleToggleFav = () => {
    haptic.light(); // ELEVATED: Subtle haptic feedback
    toggleFav(item.id);
    if (!isFav) {
      haptic.success(); // ELEVATED: Success feedback on add
      show('Added to wishlist', 'success');
    }
  };

  const handleToggleSave = () => {
    haptic.light();
    toggleSaved(item.id);
    show(isSaved ? 'Removed from saved' : 'Added to saved', 'info');
  };

  const hasPriceDrop = item.originalPrice && item.originalPrice > item.price;
  const priceDropPercent = hasPriceDrop
    ? Math.round(((item.originalPrice! - item.price) / item.originalPrice!) * 100)
    : 0;

  const cardContent = (
    <View style={styles.container}>
      {/* Image - Full bleed, subtle radius for modern feel */}
      <AnimatedPressable onPress={onPress} style={styles.imageWrap}>
        <CachedImage
          uri={item.images?.[0] ?? ''}
          style={[styles.image, { aspectRatio, borderRadius: visualOnly ? 16 : Radius.sm }]}
          contentFit="cover"
          transition={300}
        />

        {/* Sold overlay */}
        {item.isSold && (
          <View style={styles.soldOverlay}>
            <Text style={styles.soldText}>SOLD</Text>
          </View>
        )}

        {/* Condition badge - top left, more subtle */}
        {!item.isSold && (
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionText}>{item.condition}</Text>
          </View>
        )}

        {/* Price drop badge - top left below condition */}
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
              size={11}
              color="#FFFFFF"
            />
          </View>
        )}

        {/* Favorite button */}
        <View style={styles.actionButtonsRow}>
          {showSaveButton ? (
            <AnimatedPressable
              style={styles.saveBtn}
              onPress={handleToggleSave}
              accessibilityRole="button"
              accessibilityLabel={isSaved ? 'Remove from saved' : 'Save product'}
              accessibilityHint="Toggles this product in your saved page"
            >
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={isSaved ? Colors.brand : '#FFFFFF'} />
            </AnimatedPressable>
          ) : null}
          <View style={styles.favBtn}>
            <AnimatedHeart
              isActive={isFav}
              onToggle={handleToggleFav}
              size={20}
              activeColor={Colors.danger}
              inactiveColor="#FFFFFF"
            />
          </View>
        </View>
      </AnimatedPressable>

      {/* Info - Clean hierarchy */}
      {!visualOnly && (
        <View style={styles.info}>
          <View style={styles.priceRow}>
            <View style={styles.priceWrap}>
              <Price amount={item.price} />
              {hasPriceDrop && (
                <Text style={styles.originalPrice}>{formatFromFiat(item.originalPrice!, 'GBP', { displayMode: 'fiat' })}</Text>
              )}
            </View>
            {item.likes > 0 && (
              <View style={styles.likes}>
                <Ionicons name="heart" size={9} color={Colors.textMuted} />
                <T.Caption style={{ fontSize: 11, lineHeight: 14 }}>{item.likes}</T.Caption>
              </View>
            )}
          </View>

          {item.size ? <T.Caption numberOfLines={1} style={{ marginTop: 1 }}>{item.size}</T.Caption> : null}
        </View>
      )}
    </View>
  );

  if (!enableEntranceAnimation) {
    return cardContent;
  }

  return (
    <StaggeredItem index={index} animation="fadeDown" staggerMs={40}>
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
  // Split items into columns for masonry effect, tracking original indices
  const columns: { item: Listing; originalIndex: number }[][] = Array.from({ length: numColumns }, () => []);
  items.forEach((item, index) => {
    columns[index % numColumns].push({ item, originalIndex: index });
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Image - Flagship radius with subtle shadow for depth
  imageWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
    ...Elevation.card,
  },
  image: {
    width: '100%',
    borderRadius: Radius.lg,
  },

  // Overlays
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldText: {
    fontSize: 13,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  mediaBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.40)',
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonsRow: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },

  // Info - Clean hierarchy
  info: {
    paddingTop: Space.sm,
    paddingHorizontal: 2,
    gap: 2,
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
  originalPrice: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  likes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  // Condition & price-drop badges
  conditionBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.50)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priceDropBadge: {
    top: Space.sm + 24,
    backgroundColor: 'rgba(200,50,50,0.70)',
  },
  conditionText: {
    fontSize: 9,
    fontFamily: Typography.family.bold,
    color: '#FFFFFF',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // Grid
  grid: {
    flexDirection: 'row',
    paddingHorizontal: Space.sm,
    gap: Space.sm,
  },
  column: {
    flex: 1,
    gap: 0,
  },
});

export default ProductCardV2;
