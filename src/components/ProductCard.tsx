import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { ActiveTheme, Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Listing, MOCK_USERS } from '../data/mockData';
import { mockFind } from '../utils/mockGate';
import { useStore } from '../store/useStore';
import { AnimatedHeart } from './AnimatedHeart';
import { AnimatedPressable } from './AnimatedPressable';
import { CachedImage } from './CachedImage';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { haptics } from '../utils/haptics';
import { getAccessibilityProps, accessibilityLabels, MIN_TOUCH_TARGET } from '../utils/accessibility';
import { Ionicons } from '@expo/vector-icons';
import { isVideoUri } from '../utils/media';
import { SharedTransitionView } from './SharedTransitionView';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const IS_LIGHT = ActiveTheme === 'light';
const CHIP_BG = IS_LIGHT ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.6)';
const CHIP_TEXT = IS_LIGHT ? '#3a3028' : '#fff';

interface Props {
  item: Listing;
  onPress: () => void;
  compact?: boolean;
  onPressSeller?: (sellerId: string) => void;
  onSaveToCollection?: (itemId: string) => void; // Opens collection selection modal
}

export function ProductCard({ item, onPress, compact, onPressSeller, onSaveToCollection }: Props) {
  const isFav = useStore((state) => state.isWishlisted(item.id));
  const toggleFav = useStore((state) => state.toggleWishlist);
  const isItemSavedAnywhere = useStore((state) => state.isItemSavedAnywhere(item.id));
  const getItemCollections = useStore((state) => state.getItemCollections(item.id));
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const seller = mockFind(MOCK_USERS, (u) => u.id === item.sellerId) || MOCK_USERS[0];
  const hasVideoMedia = item.images.some((uri) => isVideoUri(uri));
  const hasMultipleMedia = item.images.length > 1;

  const handleToggleFav = () => {
    toggleFav(item.id);
    if (!isFav) {
      haptics.like();
      show('Added to wishlist ♥', 'success');
    }
  };

  const handleSavePress = () => {
    if (onSaveToCollection) {
      onSaveToCollection(item.id);
    }
  };

  const handlePressSeller = () => {
    if (!onPressSeller) {
      return;
    }

    onPressSeller(item.sellerId);
  };

  const conditionLabel =
    item.condition === 'New with tags' ? 'NEW' :
    item.condition === 'Very good' ? 'MINT' :
    item.condition === 'Good' ? 'GOOD' : undefined;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <AnimatedPressable onPress={onPress} accessibilityLabel={`${item.title} by ${item.brand}, ${formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}${item.isSold ? ', sold' : ''}`}>
        <View style={[styles.imageContainer, compact && styles.imageContainerCompact]}>
          <SharedTransitionView
            style={styles.sharedMediaLayer}
            sharedTransitionTag={`image-${item.id}-0`}
          >
            <CachedImage
              uri={item.images[0]}
              style={styles.image}
              contentFit="cover"
              priority={compact ? 'low' : 'normal'}
            />
          </SharedTransitionView>

          {/* Sold overlay */}
          {item.isSold && (
            <View style={styles.soldOverlay}>
              <Text style={styles.soldText}>SOLD</Text>
            </View>
          )}

          {/* Condition chip - top left */}
          {conditionLabel && !item.isSold && (
            <View style={styles.conditionChip}>
              <Text style={styles.conditionText}>{conditionLabel}</Text>
            </View>
          )}

          {/* Multi-image indicator - top right */}
          {(hasMultipleMedia || hasVideoMedia) && (
            <View style={styles.multiImageBadge}>
              <Ionicons name={hasVideoMedia ? 'videocam-outline' : 'images-outline'} size={11} color="#fff" />
            </View>
          )}

          {/* Action Buttons Row */}
          <View style={styles.actionBtns}>
            {/* Save to Collection Button */}
            <AnimatedPressable onPress={handleSavePress} style={styles.saveBtn}>
              <Ionicons
                name={isItemSavedAnywhere ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color={isItemSavedAnywhere ? Colors.brand : Colors.textPrimary}
              />
              {isItemSavedAnywhere && getItemCollections.length > 0 && (
                <View style={styles.saveBadge}>
                  <Text style={styles.saveBadgeText}>{getItemCollections.length}</Text>
                </View>
              )}
            </AnimatedPressable>

            {/* Animated Favourite Button */}
            <AnimatedHeart
              isActive={isFav}
              onToggle={handleToggleFav}
              size={18}
              activeColor={Colors.danger}
            />
          </View>

          {/* Seller avatar - visual only */}
          <View style={styles.sellerAvatarWrap}>
            <CachedImage
              uri={seller.avatar}
              style={styles.sellerAvatar}
              containerStyle={styles.sellerAvatarContainer}
              contentFit="cover"
              transition={200}
            />
          </View>
        </View>

        <View style={styles.info}>
          <Text style={styles.price}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Text>
          <Text style={styles.brand} numberOfLines={1}>@{item.brand.toLowerCase()}</Text>
          <View style={styles.engagementRow}>
            <View style={styles.engagementItem}>
              <Ionicons name="heart" size={10} color={Colors.textMuted} />
              <Text style={styles.engagementText}>{item.likes}</Text>
            </View>
            {item.views !== undefined && (
              <View style={styles.engagementItem}>
                <Ionicons name="eye-outline" size={10} color={Colors.textMuted} />
                <Text style={styles.engagementText}>{item.views}</Text>
              </View>
            )}
          </View>
        </View>
      </AnimatedPressable>

      {onPressSeller ? (
        <AnimatedPressable
          style={styles.sellerLinkRow}
          onPress={handlePressSeller}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Open @${seller.username} profile`}
          accessibilityHint="Shows seller profile details"
        >
          <CachedImage
            uri={seller.avatar}
            style={styles.sellerLinkAvatar}
            containerStyle={styles.sellerLinkAvatarWrap}
            contentFit="cover"
            transition={200}
          />
          <Text style={styles.sellerLinkText} numberOfLines={1}>Seller: @{seller.username}</Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    backgroundColor: Colors.background,
    marginBottom: 20,
  },
  containerCompact: {
    marginBottom: 12,
  },
  imageContainer: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.4,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
  },
  imageContainerCompact: {
    height: CARD_WIDTH * 1.2,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  sharedMediaLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 10, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldText: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    fontSize: Typography.size.caption + 2,
    letterSpacing: Typography.tracking.caps,
  },
  conditionChip: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: CHIP_BG,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  conditionText: {
    color: CHIP_TEXT,
    fontSize: Typography.size.micro,
    fontFamily: Typography.family.bold,
    letterSpacing: Typography.tracking.caps,
  },
  multiImageBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  price: {
    color: Colors.textPrimary,
    fontSize: Typography.size.body,
    fontFamily: Typography.family.semibold,
    letterSpacing: Typography.tracking.normal,
    marginBottom: 2,
  },
  brand: {
    color: Colors.textSecondary,
    fontSize: Typography.size.caption,
    fontFamily: Typography.family.regular,
    letterSpacing: Typography.tracking.wide,
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  engagementText: {
    color: Colors.textMuted,
    fontSize: Typography.size.micro,
    fontFamily: Typography.family.medium,
  },
  actionBtns: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CHIP_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBadgeText: {
    color: Colors.background,
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
  favIcon: {
    // Style for AnimatedHeart wrapper
  },
  favBtn: {
    // Deprecated - replaced by actionBtns
    display: 'none',
  },
  sellerAvatarWrap: {
    position: 'absolute',
    bottom: 8,
    left: 8,
  },
  sellerAvatarContainer: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  sellerAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 13,
  },
  sellerLinkRow: {
    marginTop: 6,
    minHeight: MIN_TOUCH_TARGET.default,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  sellerLinkAvatarWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  sellerLinkAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  sellerLinkText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 9,
    fontFamily: Typography.family.medium,
  },
});
