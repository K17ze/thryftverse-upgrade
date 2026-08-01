import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  AccessibilityInfo,
  AppState,
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
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { isVideoUri } from '../../utils/media';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { AnimatedHeart } from '../AnimatedHeart';
import { ImageEmptyGraphic } from '../ImageEmptyGraphic';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { SharedTransitionImage } from '../SharedTransitionImage';
import { Video, ResizeMode } from '../compat/Video';
import type { ProductMediaItem } from '../../platform/product/productDetailViewModel';

const MAX_ZOOM = 4;
const MIN_ZOOM = 1;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const applyRubberBand = (v: number, min: number, max: number, friction = 0.24) => {
  if (v < min) return min + (v - min) * friction;
  if (v > max) return max + (v - max) * friction;
  return v;
};

const subComponentStyles = StyleSheet.create({
  page: {
    backgroundColor: '#0a0a0a',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

interface MediaPageProps {
  item: ProductMediaItem;
  width: number;
  height: number;
  onDoubleTap?: () => void;
  sharedTransitionTag?: string;
  onZoomStart?: () => void;
  onOpenFullscreen?: () => void;
}

function MediaPage({
  item,
  width,
  height,
  onDoubleTap,
  sharedTransitionTag,
  onZoomStart,
  onOpenFullscreen,
}: MediaPageProps) {
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);
  // Track zoom state in React state so the pan gesture can be
  // disabled when not zoomed. This is critical: when the pan gesture
  // is always active, it captures horizontal swipes and prevents the
  // parent FlatList from paging between images. By only enabling pan
  // when zoomed > 1x, horizontal swipes pass through to the FlatList
  // for carousel pagination, and the user can pan the zoomed image
  // once they've pinched or double-tapped to zoom in.
  const [isZoomed, setIsZoomed] = useState(false);
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
        runOnJS(setIsZoomed)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(setIsZoomed)(true);
      }
    });

  // Pan is only enabled when zoomed in. When not zoomed, horizontal
  // swipes pass through to the parent FlatList for carousel pagination.
  const pan = Gesture.Pan()
    .enabled(isZoomed)
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
        runOnJS(setIsZoomed)(false);
      } else {
        const target = reducedMotion ? 2 : 2.5;
        scale.value = withSpring(target, { damping: 12 });
        savedScale.value = target;
        runOnJS(setIsZoomed)(true);
        if (onDoubleTap) runOnJS(onDoubleTap)();
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (onOpenFullscreen) runOnJS(onOpenFullscreen)();
    });

  const composed = Gesture.Simultaneous(
    Gesture.Race(Gesture.Exclusive(doubleTap, singleTap), pan),
    pinch,
  );
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View
        style={[subComponentStyles.page, { width, height }, animStyle]}
        accessible
        accessibilityRole="imagebutton"
        accessibilityLabel={`${item.altText ?? 'Product image'}. Open fullscreen.`}
        onAccessibilityTap={onOpenFullscreen}
      >
        {failed || !item.uri ? (
          <ImageEmptyGraphic
            icon="image-outline"
            label="Photo unavailable"
            style={subComponentStyles.image}
          />
        ) : (
          item.focalPoint ? (
            <CachedImage
              uri={item.uri}
              style={subComponentStyles.image}
              containerStyle={subComponentStyles.image}
              contentFit={item.fit ?? 'contain'}
              focalPoint={item.focalPoint}
              onError={() => setFailed(true)}
            />
          ) : (
            <SharedTransitionImage
              source={{ uri: item.uri }}
              style={subComponentStyles.image}
              resizeMode={item.fit ?? 'contain'}
              sharedTransitionTag={sharedTransitionTag}
              onError={() => setFailed(true)}
            />
          )
        )}
      </Reanimated.View>
    </GestureDetector>
  );
}

function VideoPage({
  item,
  width,
  height,
  isActive,
}: {
  item: ProductMediaItem;
  width: number;
  height: number;
  isActive: boolean;
}) {
  // Pause video when the page is offscreen (scrolled away) or the app
  // is backgrounded. This prevents audio bleed and saves resources.
  const [appIsActive, setAppIsActive] = useState(true);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const shouldPlay = isActive && appIsActive;

  return (
    <View
      style={[subComponentStyles.page, { width, height }]}
      accessible
      accessibilityLabel={item.altText ?? 'Product video'}
    >
      <Video
        source={{ uri: item.uri }}
        style={subComponentStyles.image}
        resizeMode={item.fit === 'cover' ? ResizeMode.COVER : ResizeMode.CONTAIN}
        shouldPlay={shouldPlay}
        isMuted
        isLooping={false}
        useNativeControls
        usePoster={!!item.posterUri}
        posterSource={item.posterUri ? { uri: item.posterUri } : undefined}
      />
    </View>
  );
}

export interface CommerceMediaStageProps {
  images?: string[];
  /** Authoritative typed media. When supplied, media kind is never guessed
   * from a URL and crop/poster metadata remains attached end-to-end. */
  media?: readonly ProductMediaItem[];
  /** Canonical video URLs supplied by the API. URL-suffix detection remains
   * as a compatibility fallback for older callers. */
  videoUris?: readonly string[];
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
  /** When false, the built-in Back/Share/Save/Fav control cluster is
   * suppressed. The screen overlays CommerceDetailMediaRail to enforce
   * the max-3-visible-controls rule with overflow. Defaults to true for
   * backward compatibility. */
  showDefaultControls?: boolean;
  heightFraction?: number;
  bigHeartOpacity?: SharedValue<number>;
  bigHeartScale?: SharedValue<number>;
  overlayTopContent?: React.ReactNode;
  overlayBottomContent?: React.ReactNode;
  /**
   * Opt-in media picker for future media-heavy experiences. Flagship detail
   * pages default to swipe pagination so the hero is not duplicated by chrome.
   */
  showThumbnailStrip?: boolean;
  onActiveIndexChange?: (index: number) => void;
  /** Keeps the inline stage aligned with the last fullscreen page. */
  initialIndex?: number;
}

export function CommerceMediaStage({
  images = [],
  media,
  videoUris = [],
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
  showDefaultControls = true,
  heightFraction = 0.62,
  bigHeartOpacity,
  bigHeartScale,
  overlayTopContent,
  overlayBottomContent,
  showThumbnailStrip = false,
  onActiveIndexChange,
  initialIndex = 0,
}: CommerceMediaStageProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<any>>(null);
  // Zoom hint — shows a subtle magnifying glass on first view, fades out
  // after 2.5s or on first zoom interaction. Airbnb pattern: one-time
  // visual cue that pinch-to-zoom is available.
  const zoomHintOpacity = useSharedValue(0);
  const zoomHintDismissed = useRef(false);
  const dismissZoomHint = useCallback(() => {
    if (zoomHintDismissed.current) return;
    zoomHintDismissed.current = true;
    zoomHintOpacity.value = withTiming(0, { duration: 400 });
  }, [zoomHintOpacity]);
  const mediaItems = React.useMemo<ProductMediaItem[]>(() => {
    if (media) return media.filter((item) => !!item.uri);
    const videoUriSet = new Set(videoUris);
    return images
      .filter(Boolean)
      .map((uri) => ({
        uri,
        kind: videoUriSet.has(uri) || isVideoUri(uri) ? 'video' : 'image',
        fit: 'contain',
      }));
  }, [images, media, videoUris]);
  React.useEffect(() => {
    if (reducedMotion || mediaItems.length === 0) return;
    zoomHintOpacity.value = withTiming(0.7, { duration: 300 });
    const timer = setTimeout(() => dismissZoomHint(), 2800);
    return () => clearTimeout(timer);
  }, [reducedMotion, mediaItems.length, zoomHintOpacity, dismissZoomHint]);

  React.useEffect(() => {
    if (mediaItems.length === 0) return;
    const nextIndex = Math.min(Math.max(initialIndex, 0), mediaItems.length - 1);
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: nextIndex, animated: false });
    });
  }, [initialIndex, mediaItems.length]);

  const heroHeight = Math.min(screenHeight * heightFraction, screenWidth * 1.35);

  const heroStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    const overscroll = Math.min(scrollY.value, 0);
    const pullDown = interpolate(overscroll, [-120, 0], [-56, 0], Extrapolation.CLAMP);
    const scale = interpolate(overscroll, [-120, 0], [1.16, 1], Extrapolation.CLAMP);
    // Only the pull-to-expand state moves the stage. Translating the
    // container during positive scroll lets it overlap the identity seam;
    // any future parallax must animate media inside this clipped stage.
    return { transform: [{ translateY: pullDown }, { scale }] };
  });

  const bigHeartStyle = useAnimatedStyle(() => ({
    opacity: bigHeartOpacity?.value ?? 0,
    transform: [{ scale: bigHeartScale?.value ?? 0 }],
  }));
  const zoomHintStyle = useAnimatedStyle(() => ({
    opacity: zoomHintOpacity.value,
  }));
  const bottomScrimStyle = useAnimatedStyle(() => {
    // Clear the editorial caption before the collapsed navigation title
    // begins to appear. Overlapping two copies of a long product title makes
    // the transition read as visual noise rather than a deliberate hand-off.
    const opacity = interpolate(scrollY.value, [24, 128], [1, 0], Extrapolation.CLAMP);
    const hidden = scrollY.value >= 128;
    return {
      opacity: reducedMotion ? (scrollY.value < 112 ? 1 : 0) : opacity,
      display: hidden ? 'none' : 'flex',
    };
  });
  // Reanimated styles are view-bound; the scrim and caption need separate
  // animated style instances even though they follow the same curve.
  const bottomContentStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [24, 128], [1, 0], Extrapolation.CLAMP);
    const hidden = scrollY.value >= 128;
    return {
      opacity: reducedMotion ? (scrollY.value < 112 ? 1 : 0) : opacity,
      display: hidden ? 'none' : 'flex',
    };
  });

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const next = viewableItems[0].index ?? 0;
      setActiveIndex(next);
      onActiveIndexChange?.(next);
    }
  }, [onActiveIndexChange]);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const scrollToIndex = (index: number) => {
    listRef.current?.scrollToIndex({ index, animated: true });
  };

  const announceMedia = (index: number) => {
    AccessibilityInfo.announceForAccessibility(
      `${mediaItems[index]?.kind === 'video' ? 'Video' : 'Image'} ${index + 1} of ${mediaItems.length}`,
    );
  };

  return (
    <Reanimated.View style={[styles.heroContainer, { height: heroHeight }, heroStyle]}>
      {mediaItems.length === 0 ? (
        // Premium fallback hero — matches Thryftverse visual language.
        <ImageEmptyGraphic
          icon="image-outline"
          label="No photos yet"
          style={{ width: screenWidth, height: heroHeight }}
        />
      ) : (
      <FlatList
        ref={listRef}
        data={mediaItems}
        keyExtractor={(item, i) => item.id ?? `${item.uri}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        renderItem={({ item, index }) =>
          item.kind === 'video' ? (
            <VideoPage item={item} width={screenWidth} height={heroHeight} isActive={index === activeIndex} />
          ) : (
            <MediaPage
              item={item}
              width={screenWidth}
              height={heroHeight}
              onDoubleTap={onDoubleTap}
              sharedTransitionTag={index === 0 && objectId ? `image-${objectId}-0` : undefined}
              onZoomStart={() => { dismissZoomHint(); onZoomStart?.(); }}
              onOpenFullscreen={() => { dismissZoomHint(); onOpenFullscreen(index); }}
            />
          )
        }
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => scrollToIndex(index), 100);
        }}
      />
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.36)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']}
        locations={[0, 0.5, 1]}
        style={styles.topScrim}
        pointerEvents="none"
      />

      {overlayBottomContent ? (
        <Reanimated.View style={[styles.bottomScrim, bottomScrimStyle]} pointerEvents="none">
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.52)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Reanimated.View>
      ) : null}

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

      {showDefaultControls && (
        <View style={[styles.floatingHeader, { paddingTop: Math.max(topInset, Space.sm) }]}>
          <AnimatedPressable
            style={styles.controlBtn}
            onPress={onBack}
            {...PressPresets.iconButton}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color="#fff" style={styles.controlIcon} />
          </AnimatedPressable>

          <View style={styles.headerRight}>
            <AnimatedPressable
              style={styles.controlBtn}
              onPress={onShare}
              {...PressPresets.iconButton}
              accessibilityLabel="Share"
            >
              <Ionicons name="share-outline" size={24} color="#fff" style={styles.controlIcon} />
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
                  color={isSaved ? colors.brand : '#fff'}
                  style={styles.controlIcon}
                />
              </AnimatedPressable>
            )}

            {showFavControl && onToggleFav && (
              <View style={styles.controlBtn}>
                <AnimatedHeart
                  isActive={isFav}
                  onToggle={onToggleFav}
                  size={24}
                  activeColor={colors.danger}
                  inactiveColor="#fff"
                />
              </View>
            )}
          </View>
        </View>
      )}

      {overlayTopContent && (
        <View style={styles.overlayTopZone}>
          {overlayTopContent}
        </View>
      )}

      {overlayBottomContent && (
        <Reanimated.View style={[styles.overlayBottomZone, bottomContentStyle]}>
          {overlayBottomContent}
        </Reanimated.View>
      )}

      {mediaItems.length > 1 && (
        <Pressable
          style={styles.indexBadge}
          onPress={() => onOpenFullscreen(activeIndex)}
          accessibilityRole="button"
          accessibilityLabel={`${mediaItems[activeIndex]?.kind === 'video' ? 'Video' : 'Image'} ${activeIndex + 1} of ${mediaItems.length}. Open fullscreen.`}
        >
          {/* Dot indicators — Depop/Vinted/Grailed pattern.
              Up to 5 dots; active dot is wider and full-opacity.
              Beyond 5 images, dots collapse to a numeric counter. */}
          {mediaItems.length <= 5 ? (
            <View style={styles.dotRow}>
              {mediaItems.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === activeIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.indexText}>
              {activeIndex + 1} / {mediaItems.length}
            </Text>
          )}
        </Pressable>
      )}

      {mediaItems.length > 0 && mediaItems[activeIndex]?.kind === 'video' && (
        <View style={styles.videoBadge}>
          <Ionicons name="play-circle" size={16} color="#fff" />
          <Text style={styles.videoBadgeText}>Video</Text>
        </View>
      )}

      {/* Zoom hint — subtle magnifying glass that fades after 2.8s or
          on first zoom/fullscreen interaction. Airbnb pattern: one-time
          visual cue that pinch-to-zoom is available. */}
      {!reducedMotion && mediaItems.length > 0 && (
        <Reanimated.View style={[styles.zoomHint, zoomHintStyle]} pointerEvents="none">
          <Ionicons name="add-circle-outline" size={18} color="#fff" style={styles.zoomHintIcon} />
          <Text style={styles.zoomHintText}>Pinch to zoom</Text>
        </Reanimated.View>
      )}

      {showThumbnailStrip && mediaItems.length > 1 && (
        <View style={styles.thumbnailStrip}>
          <FlatList
            data={mediaItems}
            keyExtractor={(item, i) => item.id ?? `${item.uri}-${i}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailContent}
            renderItem={({ item, index }) => {
              const isActive = index === activeIndex;
              const isVid = item.kind === 'video';
              return (
                <Pressable
                  onPress={() => {
                    scrollToIndex(index);
                    announceMedia(index);
                  }}
                  accessibilityLabel={`View ${isVid ? 'video' : 'image'} ${index + 1}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={[styles.thumbnail, isActive && styles.thumbnailActive]}
                >
                  {isVid ? (
                    <View style={[styles.thumbnailImage, styles.thumbnailVideoFallback]}>
                      <Ionicons name="play-circle" size={20} color="#fff" />
                    </View>
                  ) : (
                    <CachedImage
                      uri={item.uri}
                      previewUri={item.posterUri ?? undefined}
                      style={styles.thumbnailImage}
                      containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.sm }}
                      contentFit="cover"
                      focalPoint={item.focalPoint ?? undefined}
                    />
                  )}
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  heroContainer: {
    position: 'relative',
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  emptyHero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 132,
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
    backgroundColor: colors.success,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
  },
  soldText: {
    color: colors.background,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Subtle media-contrast scrim behind control glyphs. Functional
  // (legibility over arbitrary imagery), not decorative chrome.
  controlIcon: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  // Dot indicators — quiet position signal (Depop/Vinted pattern).
  // Inactive dots are small and translucent; active dot is wider and opaque.
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: {
    width: 14,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
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
  // Zoom hint — bottom-center pill, fades out after 2.8s or on first
  // zoom interaction. Quiet, one-time cue (Airbnb pattern).
  zoomHint: {
    position: 'absolute',
    bottom: Space.sm,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  zoomHintIcon: {
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  zoomHintText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: Typography.family.medium,
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '48%',
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  thumbnailActive: {
    opacity: 1,
    borderWidth: 2,
    borderColor: '#fff',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailVideoFallback: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
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
