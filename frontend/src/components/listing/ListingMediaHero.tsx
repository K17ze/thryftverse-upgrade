import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import { isVideoUri } from '../../utils/media';
import { ImageViewer } from '../ImageViewer';
import { AnimatedPressable } from '../AnimatedPressable';
import { AnimatedHeart } from '../AnimatedHeart';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface ListingMediaHeroProps {
  images: string[];
  itemId: string;
  isFav: boolean;
  isSaved: boolean;
  isSold: boolean;
  topInset: number;
  onBack: () => void;
  onShare: () => void;
  onSave: () => void;
  onToggleFav: () => void;
  onDoubleTap: () => void;
  bigHeartOpacity: SharedValue<number>;
  bigHeartScale: SharedValue<number>;
  scrollY: SharedValue<number>;
}

export function ListingMediaHero({
  images,
  itemId,
  isFav,
  isSaved,
  isSold,
  topInset,
  onBack,
  onShare,
  onSave,
  onToggleFav,
  onDoubleTap,
  bigHeartOpacity,
  bigHeartScale,
  scrollY,
}: ListingMediaHeroProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const heroStyle = useAnimatedStyle(() => {
    const overscroll = Math.min(scrollY.value, 0);
    const pullDownTranslate = interpolate(overscroll, [-120, 0], [-56, 0], Extrapolation.CLAMP);
    const parallaxTranslate = interpolate(scrollY.value, [0, 360], [0, 90], Extrapolation.CLAMP);
    const scale = interpolate(overscroll, [-120, 0], [1.16, 1], Extrapolation.CLAMP);
    return {
      transform: [{ translateY: pullDownTranslate + parallaxTranslate }, { scale }],
    };
  });

  const bigHeartStyle = useAnimatedStyle(() => ({
    opacity: bigHeartOpacity.value,
    transform: [{ scale: bigHeartScale.value }],
  }));

  const heroHeight = SCREEN_H * 0.65;

  return (
    <Reanimated.View style={[styles.heroContainer, { height: heroHeight }, heroStyle]}>
      <ImageViewer
        images={images}
        height={heroHeight}
        onDoubleTap={onDoubleTap}
        itemId={itemId}
        onIndexChange={setActiveIndex}
      />

      <View style={styles.topScrim} />

      <Reanimated.View
        style={[StyleSheet.absoluteFill, styles.bigHeartWrap, bigHeartStyle]}
        pointerEvents="none"
      >
        <Ionicons name="heart" size={100} color="#fff" style={styles.bigHeartIcon} />
      </Reanimated.View>

      {isSold && (
        <View style={styles.soldOverlay}>
          <Text style={styles.soldText}>SOLD</Text>
        </View>
      )}

      {images.length > 1 && (
        <View style={styles.indexBadge}>
          <Text style={styles.indexText}>
            {activeIndex + 1} / {images.length}
          </Text>
        </View>
      )}

      {images.length > 0 && isVideoUri(images[activeIndex]) && (
        <View style={styles.videoBadge}>
          <Ionicons name="play-circle" size={16} color="#fff" />
          <Text style={styles.videoBadgeText}>Video</Text>
        </View>
      )}

      <View style={[styles.floatingHeader, { paddingTop: Math.max(topInset, 20) }]}>
        <AnimatedPressable
          style={styles.controlBtn}
          onPress={onBack}
          {...PressPresets.iconButton}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </AnimatedPressable>

        <View style={styles.headerRight}>
          <AnimatedPressable
            style={styles.controlBtn}
            onPress={onShare}
            {...PressPresets.iconButton}
            accessibilityLabel="Share this listing"
          >
            <Ionicons name="share-outline" size={24} color="#fff" />
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.controlBtn}
            onPress={onSave}
            {...PressPresets.iconButton}
            accessibilityLabel={isSaved ? 'Saved to collection' : 'Save to collection'}
            accessibilityHint="Opens collection picker"
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color={isSaved ? Colors.brand : '#fff'}
            />
          </AnimatedPressable>

          <View style={styles.controlBtn}>
            <AnimatedHeart
              isActive={isFav}
              onToggle={onToggleFav}
              size={24}
              activeColor={Colors.danger}
              inactiveColor="#fff"
            />
          </View>
        </View>
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  heroContainer: {
    width: SCREEN_W,
    position: 'relative',
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  bigHeartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  bigHeartIcon: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  soldOverlay: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    backgroundColor: Colors.success,
    paddingHorizontal: Space.md,
    paddingVertical: 8,
    borderRadius: 8,
  },
  soldText: {
    color: Colors.background,
    fontSize: 16,
    fontFamily: Typography.family.bold,
    letterSpacing: 1,
  },
  indexBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  indexText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
  videoBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  videoBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
