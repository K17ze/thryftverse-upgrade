import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  PanResponder,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

const { width } = Dimensions.get('window');

interface ImageItem {
  id: string;
  uri: string;
  type: 'standard' | '360';
}

interface AuctionGalleryProps {
  images: ImageItem[];
  currentBid: number;
  bidCount: number;
  isLive?: boolean;
  viewerCount?: number;
  isAuthentic?: boolean;
  condition?: string;
  conditionScore?: number;
  onImagePress?: (index: number) => void;
  on360ViewPress?: () => void;
  style?: ViewStyle;
}

export function AuctionGallery({
  images,
  currentBid,
  bidCount,
  isLive = false,
  viewerCount,
  isAuthentic = false,
  condition,
  conditionScore,
  onImagePress,
  on360ViewPress,
  style,
}: AuctionGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [is360Mode, setIs360Mode] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);
  const panX = useRef(new Animated.Value(0)).current;

  const has360View = images.some((img) => img.type === '360');

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => is360Mode,
      onMoveShouldSetPanResponder: () => is360Mode,
      onPanResponderMove: (_, gestureState) => {
        if (is360Mode) {
          const newAngle = rotationAngle + gestureState.dx * 0.5;
          setRotationAngle(newAngle);
          panX.setValue(newAngle);
        }
      },
      onPanResponderRelease: () => {
        setRotationAngle(rotationAngle);
      },
    })
  ).current;

  const handleScroll = (event: any) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / width);
    setActiveIndex(index);
  };

  const toggle360Mode = () => {
    setIs360Mode(!is360Mode);
    if (!is360Mode) {
      on360ViewPress?.();
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Main Image Gallery */}
      <View style={styles.galleryContainer}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          scrollEnabled={!is360Mode}
        >
          {images.map((image, index) => (
            <TouchableOpacity
              key={image.id}
              activeOpacity={0.95}
              onPress={() => onImagePress?.(index)}
              {...(image.type === '360' ? panResponder.panHandlers : {})}
            >
              <View style={styles.imageWrapper}>
                <Image
                  source={{ uri: image.uri }}
                  style={[
                    styles.image,
                    image.type === '360' && is360Mode && {
                      transform: [{ rotateY: `${rotationAngle}deg` }],
                    },
                  ]}
                  resizeMode="cover"
                />
                
                {/* 360 Badge */}
                {image.type === '360' && (
                  <TouchableOpacity
                    style={styles.badge360}
                    onPress={toggle360Mode}
                  >
                    <Ionicons name="sync" size={16} color="#FFFFFF" />
                    <Text style={styles.badge360Text}>
                      {is360Mode ? 'Exit 360°' : '360° View'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Pagination Dots */}
        <View style={styles.pagination}>
          {images.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === activeIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {/* Live Badge */}
        {isLive && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}

        {/* Viewer Count */}
        {viewerCount && viewerCount > 0 && (
          <View style={[styles.viewerBadge, isLive ? { right: 12 } : { left: 12 }]}>
            <Ionicons name="eye" size={14} color="#FFFFFF" />
            <Text style={styles.viewerText}>
              {viewerCount.toLocaleString()} watching
            </Text>
          </View>
        )}

        {/* Authentic Badge */}
        {isAuthentic && (
          <View style={styles.authenticBadge}>
            <Ionicons name="shield-checkmark" size={14} color={Colors.success} />
            <Text style={styles.authenticText}>Verified Authentic</Text>
          </View>
        )}

        {/* Condition Badge */}
        {condition && (
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionText}>
              {condition}
              {conditionScore && ` • ${conditionScore}/10`}
            </Text>
          </View>
        )}
      </View>

      {/* Current Bid Display */}
      <View style={styles.bidInfo}>
        <View>
          <Text style={styles.currentBidLabel}>Current Bid</Text>
          <Text style={styles.currentBidAmount}>
            ${currentBid.toLocaleString()}
          </Text>
        </View>
        <View style={styles.bidCountContainer}>
          <Text style={styles.bidCount}>{bidCount} bids</Text>
          <Ionicons name="trending-up" size={16} color={Colors.success} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
  },
  galleryContainer: {
    position: 'relative',
  },
  imageWrapper: {
    width: width - 32,
    height: (width - 32) * 0.75,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.brand,
    width: 24,
  },
  badge360: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badge360Text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  viewerBadge: {
    position: 'absolute',
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  viewerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  authenticBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  authenticText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  conditionBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  conditionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  bidInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.background,
    margin: 16,
    borderRadius: 12,
  },
  currentBidLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  currentBidAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  bidCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bidCount: {
    fontSize: 15,
    color: Colors.textMuted,
  },
});
