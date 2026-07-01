import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  AccessibilityInfo,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import {
  GestureDetector,
  Gesture,
  FlatList,
} from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { isVideoUri } from '../../utils/media';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { AnimatedHeart } from '../AnimatedHeart';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { SharedTransitionImage } from '../SharedTransitionImage';
import { Video, ResizeMode } from '../compat/Video';

const MAX_ZOOM = 4;
const MIN_ZOOM = 1;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const applyRubberBand = (v: number, min: number, max: number, friction = 0.24) => {
  if (v < min) return min + (v - min) * friction;
  if (v > max) return max + (v - max) * friction;
  return v;
};

interface MediaPageProps {
  uri: string;
  width: number;
  height: number;
  onDoubleTap?: () => void;
  sharedTransitionTag?: string;
  onZoomStart?: () => void;
}

function MediaPage({ uri, width, height, onDoubleTap, sharedTransitionTag, onZoomStart }: MediaPageProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const ns = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(ns, MIN_ZOOM), MAX_ZOOM);
    })
    .onStart(() => {
      if (onZoomStart) runOnJS(onZoomStart)();
    })
    .onEnd(() => {
      if (scale.value < MIN_ZOOM) {
        scale.value = withSpring(MIN_ZOOM);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = MIN_ZOOM;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const zoom = Math.max(scale.value, savedScale.value);
      if (zoom > 1) {
        const maxX = (width * (zoom - 1)) / 2;
        const maxY = (height * (zoom - 1)) / 2;
        translateX.value = applyRubberBand(savedTranslateX.value + e.translationX, -maxX, maxX);
        translateY.value = applyRubberBand(savedTranslateY.value + e.translationY, -maxY, maxY);
      }
    })
    .onEnd((e) => {
      const zoom = Math.max(scale.value, savedScale.value);
      if (zoom <= 1) {
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
        return;
      }
      const maxX = (width * (zoom - 1)) / 2;
      const maxY = (height * (zoom - 1)) / 2;
      const tx = clamp(translateX.value + e.velocityX * 0.08, -maxX, maxX);
      const ty = clamp(translateY.value + e.velocityY * 0.08, -maxY, maxY);
      savedTranslateX.value = tx;
      savedTranslateY.value = ty;
      translateX.value = withSpring(tx, { damping: 17, stiffness: 200, velocity: reducedMotion ? 0 : e.velocityX });
      translateY.value = withSpring(ty, { damping: 17, stiffness: 200, velocity: reducedMotion ? 0 : e.velocityY });
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1, { damping: 15 });
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        const target = reducedMotion ? 2 : 2.5;
        scale.value = withSpring(target, { damping: 12 });
        savedScale.value = target;
        if (onDoubleTap) runOnJS(onDoubleTap)();
      }
    });

  const composed = Gesture.Simultaneous(Gesture.Race(doubleTap, pan), pinch);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View style={[styles.page, { width, height }, animStyle]}>
        <SharedTransitionImage
          source={{ uri }}
          style={styles.image}
          resizeMode="cover"
          sharedTransitionTag={sharedTransitionTag}
        />
      </Reanimated.View>
    </GestureDetector>
  );
}

function VideoPage({ uri, width, height, shouldPlay }: { uri: string; width: number; height: number; shouldPlay: boolean }) {
  return (
    <View style={[styles.page, { width, height }]}>
      <Video
        source={{ uri }}
        style={styles.image}
        resizeMode={ResizeMode.COVER}
        shouldPlay={shouldPlay}
        isMuted
        isLooping
        useNativeControls
      />
    </View>
  );
}

export interface CommerceMediaStageProps {
  images: string[];
  objectId: string;
  topInset: number;
  scrollY: SharedValue<number>;
  onBack: () => void;
  onShare: () => void;
  onSave?: () => void;
  onToggleFav?: () => void;
  isFav?: boolean;
  isSaved?: boolean;
  isSold?: boolean;
  onOpenFullscreen: (index: number) => void;
  onDoubleTap?: () => void;
  onZoomStart?: () => void;
  showSaveControl?: boolean;
  showFavControl?: boolean;
  heightFraction?: number;
  bigHeartOpacity?: SharedValue<number>;
  bigHeartScale?: SharedValue<number>;
  overlayTopContent?: React.ReactNode;
  overlayBottomContent?: React.ReactNode;
}

export function CommerceMediaStage({
  images,
  objectId,
  topInset,
  scrollY,
  onBack,
  onShare,
  onSave,
  onToggleFav,
  isFav = false,
  isSaved = false,
  isSold = false,
  onOpenFullscreen,
  onDoubleTap,
  onZoomStart,
  showSaveControl = true,
  showFavControl = true,
  heightFraction = 0.62,
  bigHeartOpacity,
  bigHeartScale,
  overlayTopContent,
  overlayBottomContent,
}: CommerceMediaStageProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<any>>(null);

  const heroHeight = Math.min(screenHeight * heightFraction, screenWidth * 1.35);

  const heroStyle = useAnimatedStyle(() => {
    const overscroll = Math.min(scrollY.value, 0);
    const pullDown = interpolate(overscroll, [-120, 0], [-56, 0], Extrapolation.CLAMP);
    const parallax = interpolate(scrollY.value, [0, heroHeight], [0, heroHeight * 0.15], Extrapolation.CLAMP);
    const scale = interpolate(overscroll, [-120, 0], [1.16, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY: pullDown + parallax }, { scale }] };
  });

  const bigHeartStyle = useAnimatedStyle(() => ({
    opacity: bigHeartOpacity?.value ?? 0,
    transform: [{ scale: bigHeartScale?.value ?? 0 }],
  }));

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const next = viewableItems[0].index ?? 0;
      setActiveIndex(next);
    }
  }, []);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const scrollToIndex = (index: number) => {
    listRef.current?.scrollToIndex({ index, animated: true });
  };

  const announceMedia = (index: number) => {
    AccessibilityInfo.announceForAccessibility(
      `Image ${index + 1} of ${images.length}`
    );
  };

  return (
    <Reanimated.View style={[styles.heroContainer, { height: heroHeight }, heroStyle]}>
      {images.length === 0 ? (
        <View style={styles.emptyHero}>
          <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
        </View>
      ) : (
      <FlatList
        ref={listRef}
        data={images}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        renderItem={({ item, index }) =>
          isVideoUri(item) ? (
            <VideoPage uri={item} width={screenWidth} height={heroHeight} shouldPlay={index === activeIndex} />
          ) : (
            <MediaPage
              uri={item}
              width={screenWidth}
              height={heroHeight}
              onDoubleTap={onDoubleTap}
              sharedTransitionTag={index === 0 && objectId ? `image-${objectId}-0` : undefined}
              onZoomStart={onZoomStart}
            />
          )
        }
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => scrollToIndex(index), 100);
        }}
      />
      )}

      <View style={styles.topScrim} />

      {bigHeartOpacity && bigHeartScale && (
        <Reanimated.View
          style={[StyleSheet.absoluteFill, styles.bigHeartWrap, bigHeartStyle]}
          pointerEvents="none"
        >
          <Ionicons name="heart" size={100} color="#fff" style={styles.bigHeartIcon} />
        </Reanimated.View>
      )}

      {isSold && (
        <View style={styles.soldOverlay}>
          <Text style={styles.soldText}>SOLD</Text>
        </View>
      )}

      <View style={[styles.floatingHeader, { paddingTop: Math.max(topInset, Space.sm) }]}>
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
            accessibilityLabel="Share"
          >
            <Ionicons name="share-outline" size={24} color="#fff" />
          </AnimatedPressable>

          {showSaveControl && onSave && (
            <AnimatedPressable
              style={styles.controlBtn}
              onPress={onSave}
              {...PressPresets.iconButton}
              accessibilityLabel={isSaved ? 'Saved to collection' : 'Save to collection'}
            >
              <Ionicons
                name={isSaved ? 'bookmark' : 'bookmark-outline'}
                size={24}
                color={isSaved ? Colors.brand : '#fff'}
              />
            </AnimatedPressable>
          )}

          {showFavControl && onToggleFav && (
            <View style={styles.controlBtn}>
              <AnimatedHeart
                isActive={isFav}
                onToggle={onToggleFav}
                size={24}
                activeColor={Colors.danger}
                inactiveColor="#fff"
              />
            </View>
          )}
        </View>
      </View>

      {overlayTopContent && (
        <View style={styles.overlayTopZone}>
          {overlayTopContent}
        </View>
      )}

      {overlayBottomContent && (
        <View style={styles.overlayBottomZone}>
          {overlayBottomContent}
        </View>
      )}

      {images.length > 1 && (
        <Pressable
          style={styles.indexBadge}
          onPress={() => onOpenFullscreen(activeIndex)}
          accessibilityLabel={`Image ${activeIndex + 1} of ${images.length}. Tap for fullscreen.`}
        >
          <Text style={styles.indexText}>
            {activeIndex + 1} / {images.length}
          </Text>
        </Pressable>
      )}

      {images.length > 0 && isVideoUri(images[activeIndex]) && (
        <View style={styles.videoBadge}>
          <Ionicons name="play-circle" size={16} color="#fff" />
          <Text style={styles.videoBadgeText}>Video</Text>
        </View>
      )}

      {images.length > 1 && (
        <View style={styles.thumbnailStrip}>
          <FlatList
            data={images}
            keyExtractor={(_, i) => String(i)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailContent}
            renderItem={({ item, index }) => {
              const isActive = index === activeIndex;
              const isVid = isVideoUri(item);
              return (
                <Pressable
                  onPress={() => {
                    scrollToIndex(index);
                    announceMedia(index);
                  }}
                  accessibilityLabel={`View image ${index + 1}`}
                  style={[styles.thumbnail, isActive && styles.thumbnailActive]}
                >
                  <CachedImage
                    uri={item}
                    style={styles.thumbnailImage}
                    containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.sm }}
                    contentFit="cover"
                  />
                  {isVid && (
                    <View style={styles.thumbnailVideoBadge}>
                      <Ionicons name="play" size={8} color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      )}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  heroContainer: {
    position: 'relative',
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  emptyHero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  page: {
    backgroundColor: '#0a0a0a',
  },
  image: {
    width: '100%',
    height: '100%',
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
    bottom: Space.lg,
    left: Space.md,
    backgroundColor: Colors.success,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
  },
  soldText: {
    color: Colors.background,
    fontSize: 16,
    fontFamily: Typography.family.bold,
    letterSpacing: 1,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    zIndex: 10,
  },
  headerRight: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayTopZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 100,
    paddingHorizontal: Space.md,
    zIndex: 8,
  },
  overlayBottomZone: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
    zIndex: 8,
  },
  indexBadge: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  indexText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
  videoBadge: {
    position: 'absolute',
    bottom: Space.sm,
    left: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  videoBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
  thumbnailStrip: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
  },
  thumbnailContent: {
    paddingHorizontal: Space.md,
    gap: 6,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    opacity: 0.5,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  thumbnailActive: {
    opacity: 1,
    borderColor: '#fff',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailVideoBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
