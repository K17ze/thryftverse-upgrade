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
import { Typography } from '../constants/typography';
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
      {/* Image - Full bleed, no border radius */}
      <AnimatedPressable onPress={onPress} style={styles.imageWrap}>
        <CachedImage
          uri={item.images?.[0] ?? ''}
          style={[styles.image, { aspectRatio, borderRadius: visualOnly ? 16 : Radius.none }]}
          contentFit="cover"
          transition={300}
        />

        {/* Sold overlay */}
        {item.isSold && (
          <View style={styles.soldOverlay}>
            <Text style={styles.soldText}>SOLD</Text>
          </View>
        )}

        {/* Condition badge - top left */}
        {!item.isSold && (
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionText}>{item.condition}</Text>
          </View>
        )}

        {/* Price drop flash - top left below condition */}
        {hasPriceDrop && !item.isSold && (
          <View style={[styles.conditionBadge, styles.priceDropBadge]}>
            <Text style={styles.conditionText}>-{priceDropPercent}%</Text>
          </View>
        )}

        {/* Media indicator */}
        {(hasMultiple || hasVideo) && (
          <View style={styles.mediaBadge}>
            <Ionicons
              name={hasVideo ? 'videocam' : 'images'}
              size={12}
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

      {/* Info - Tight padding like Depop */}
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
                <Ionicons name="heart" size={10} color={Colors.textMuted} />
                <T.Caption>{item.likes}</T.Caption>
              </View>
            )}
          </View>

          <T.Caption numberOfLines={1}>{item.size}</T.Caption>

          {/* Seller info omitted — shown in ItemDetail only */}
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
    marginBottom: 10,
    ...Elevation.subtle, // ELEVATED: Use design system
  },

  // Image - No border radius, full bleed
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    borderRadius: Radius.none, // Sharp corners like Depop
  },

  // Overlays
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldText: {
    fontSize: 14,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  mediaBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    width: 26,
    height: 26,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  favBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
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

  // Info - Refined padding
  info: {
    padding: Space.sm,
    paddingTop: Space.sm + 2,
    gap: 3,
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
    backgroundColor: Colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  // Condition & price-drop badges
  conditionBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  priceDropBadge: {
    top: Space.sm + 26,
    backgroundColor: 'rgba(220,38,38,0.75)',
  },
  conditionText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
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
