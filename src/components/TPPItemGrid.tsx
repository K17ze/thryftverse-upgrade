import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

const { width } = Dimensions.get('window');
const GAP = 8;
const COLUMNS = 2;
const ITEM_WIDTH = (width - 32 - GAP) / COLUMNS;
const ASPECT_RATIO = 3 / 4;
const ITEM_HEIGHT = ITEM_WIDTH / ASPECT_RATIO;

interface Item {
  id: string;
  imageUri: string;
  title: string;
  price: number;
  currency: string;
  status: 'available' | 'sold' | 'reserved';
  likes?: number;
  size?: string;
  condition?: string;
}

interface TPPItemGridProps {
  items: Item[];
  onItemPress?: (item: Item) => void;
  onLikePress?: (item: Item) => void;
  showLikes?: boolean;
  style?: ViewStyle;
}

export function TPPItemGrid({
  items,
  onItemPress,
  onLikePress,
  showLikes = true,
  style,
}: TPPItemGridProps) {
  // Split items into two columns for masonry effect
  const leftColumn: Item[] = [];
  const rightColumn: Item[] = [];

  items.forEach((item, index) => {
    if (index % 2 === 0) {
      leftColumn.push(item);
    } else {
      rightColumn.push(item);
    }
  });

  const renderItem = (item: Item) => {
    const isSold = item.status === 'sold';
    const isReserved = item.status === 'reserved';
    const showOverlay = isSold || isReserved;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.itemContainer}
        onPress={() => onItemPress?.(item)}
        activeOpacity={0.9}
      >
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: item.imageUri }}
            style={styles.image}
            resizeMode="cover"
          />

          {/* Status Overlay */}
          {showOverlay && (
            <View style={[
              styles.overlay,
              isSold && styles.soldOverlay,
              isReserved && styles.reservedOverlay,
            ]}>
              <Text style={styles.overlayText}>
                {isSold ? 'SOLD' : 'RESERVED'}
              </Text>
            </View>
          )}

          {/* Like Button */}
          {showLikes && (
            <TouchableOpacity
              style={styles.likeButton}
              onPress={(e) => {
                e.stopPropagation();
                onLikePress?.(item);
              }}
            >
              <Ionicons name="heart-outline" size={18} color="#FFFFFF" />
              {item.likes && item.likes > 0 && (
                <Text style={styles.likeCount}>{item.likes}</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Size Badge */}
          {item.size && (
            <View style={styles.sizeBadge}>
              <Text style={styles.sizeText}>{item.size}</Text>
            </View>
          )}

          {/* Condition Badge */}
          {item.condition && (
            <View style={styles.conditionBadge}>
              <Text style={styles.conditionText}>{item.condition}</Text>
            </View>
          )}
        </View>

        {/* Item Info */}
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.itemPrice}>
            {item.currency} {item.price.toFixed(2)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.grid}>
        <View style={styles.column}>
          {leftColumn.map(renderItem)}
        </View>
        <View style={styles.column}>
          {rightColumn.map(renderItem)}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
  },
  grid: {
    flexDirection: 'row',
    gap: GAP,
  },
  column: {
    flex: 1,
    gap: GAP,
  },
  itemContainer: {
    width: ITEM_WIDTH,
  },
  imageContainer: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  soldOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  reservedOverlay: {
    backgroundColor: 'rgba(255, 184, 0, 0.7)',
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },
  likeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    padding: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likeCount: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  sizeBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  sizeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  conditionBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: Colors.brand,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  conditionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  itemInfo: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  itemTitle: {
    fontSize: 14,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
