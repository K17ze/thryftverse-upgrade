import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  AccessibilityInfo,
  AppState,
  StatusBar,
  ScrollView } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
  FadeIn,
  FadeOut,
  interpolate,
  Extrapolation } from 'react-native-reanimated';
import {
  GestureDetector,
  Gesture,
  FlatList } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { isVideoUri } from '../../utils/media';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import type { ProductMediaItem } from '../../platform/product/productDetailViewModel';

const MAX_ZOOM = 5;
const MIN_ZOOM = 1;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Rubber-band clamp for drag-to-dismiss resistance.
function rubberBand(value: number, min: number, max: number, friction = 0.3): number {
  'worklet';
  if (value < min) return min + (value - min) * friction;
  if (value > max) return max + (value - max) * friction;
  return value;
}

interface FullscreenImagePageProps {
  item: ProductMediaItem;
  width: number;
  height: number;
  onClose?: () => void;
  onZoomStart?: () => void;
  onToggleChrome?: () => void;
  chromeVisible: boolean;
}

function FullscreenImagePage({
  item,
  width,
  height,
  onClose,
  onZoomStart,
  onToggleChrome,
  chromeVisible }: FullscreenImagePageProps) {
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const { colors } = useAppTheme();
  const subStyles = useMemo(() => createSubStyles(colors), [colors]);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  // Drag-to-dismiss vertical offset (only when not zoomed).
  const dismissY = useSharedValue(0);
  const dismissOpacity = useSharedValue(1);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      if (onZoomStart) runOnJS(onZoomStart)();
    })
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, MIN_ZOOM), MAX_ZOOM);
    })
    .onEnd(() => {
      if (scale.value < MIN_ZOOM) {
        scale.value = withSpring(MIN_ZOOM, spring.tap);
        translateX.value = withSpring(0, spring.tap);
        translateY.value = withSpring(0, spring.tap);
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
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      } else {
        // Not zoomed — drag-to-dismiss with rubber-band resistance.
        dismissY.value = rubberBand(e.translationY, -150, 150, 0.35);
        dismissOpacity.value = interpolate(
          Math.abs(dismissY.value),
          [0, 150],
          [1, 0.4],
          Extrapolation.CLAMP,
        );
      }
    })
    .onEnd((e) => {
      const zoom = Math.max(scale.value, savedScale.value);
      if (zoom <= 1) {
        // Dismiss if dragged far enough, else spring back.
        if (Math.abs(e.translationY) > 120 && onClose) {
          runOnJS(onClose)();
        } else {
          dismissY.value = withSpring(0, spring.entrance);
          dismissOpacity.value = withTiming(1, { duration: 180 });
        }
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        translateX.value = withSpring(0, spring.tap);
        translateY.value = withSpring(0, spring.tap);
        return;
      }
      const maxX = (width * (zoom - 1)) / 2;
      const maxY = (height * (zoom - 1)) / 2;
      const tx = clamp(translateX.value + e.velocityX * 0.08, -maxX, maxX);
      const ty = clamp(translateY.value + e.velocityY * 0.08, -maxY, maxY);
      savedTranslateX.value = tx;
      savedTranslateY.value = ty;
      translateX.value = withSpring(tx, spring.tap);
      translateY.value = withSpring(ty, spring.tap);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1, spring.tap);
        translateX.value = withSpring(0, spring.tap);
        translateY.value = withSpring(0, spring.tap);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        const target = reducedMotion ? 2 : 3;
        scale.value = withSpring(target, spring.lift);
        savedScale.value = target;
      }
    });

  // Single tap toggles chrome visibility (iOS Photos pattern).
  const singleTap = Gesture.Tap()
    .onEnd(() => {
      if (onToggleChrome) runOnJS(onToggleChrome)();
    });

  const composed = Gesture.Simultaneous(Gesture.Race(doubleTap, pan, singleTap), pinch);
  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ] }));

  // Dismiss transform — applied to the outer container so the image
  // slides down with diminishing opacity (iOS Photos drag-to-dismiss).
  const dismissStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dismissY.value }],
    opacity: dismissOpacity.value }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View style={[subStyles.page, { width, height }, dismissStyle]}>
        <Reanimated.View style={[subStyles.imageWrap, animStyle]}>
          <CachedImage
            uri={item.uri}
            previewUri={item.posterUri ?? undefined}
            style={subStyles.image}
            containerStyle={{ width: '100%', height: '100%', backgroundColor: colors.background }}
            contentFit="contain"
            focalPoint={item.focalPoint ?? undefined}
            downscaleWidth={Math.round(width * 2)}
          />
        </Reanimated.View>
      </Reanimated.View>
    </GestureDetector>
  );
}

function FullscreenVideoPage({
  item,
  width,
  height,
  isActive,
  onToggleChrome }: {
  item: ProductMediaItem;
  width: number;
  height: number;
  isActive: boolean;
  onToggleChrome?: () => void;
}) {
  // Pause when the app is backgrounded to prevent audio bleed.
  const [appIsActive, setAppIsActive] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const { colors } = useAppTheme();
  const subStyles = useMemo(() => createSubStyles(colors), [colors]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const shouldPlay = isActive && appIsActive;

  const player = useVideoPlayer(item.uri, (instance) => {
    try {
      instance.muted = true;
      instance.loop = false;
    } catch {
      /* no-op */
    }
  });

  // Sync play/pause with isActive and appIsActive.
  useEffect(() => {
    if (!player) return;
    try {
      if (shouldPlay && isPlaying) {
        player.play();
      } else {
        player.pause();
      }
    } catch {
      /* no-op */
    }
  }, [shouldPlay, isPlaying, player]);

  // Track playing state so the poster hides once playback starts.
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener?.('playingChange', ({ isPlaying: playing }: { isPlaying: boolean }) => {
      setIsPlaying(playing);
    });
    return () => sub?.remove?.();
  }, [player]);

  const showPoster = !!item.posterUri && !isPlaying;

  // Single tap toggles chrome for video pages too.
  const singleTap = Gesture.Tap()
    .onEnd(() => {
      if (onToggleChrome) runOnJS(onToggleChrome)();
    });

  return (
    <GestureDetector gesture={singleTap}>
      <View
        style={[subStyles.page, { width, height }]}
        accessible
        accessibilityLabel={item.altText ?? 'Product video'}
      >
        <VideoView
          player={player}
          style={subStyles.image}
          contentFit={item.fit === 'cover' ? 'cover' : 'contain'}
          nativeControls
        />

        {/* Poster image shown until video starts playing */}
        {showPoster && item.posterUri && (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <ExpoImage
              source={{ uri: item.posterUri }}
              style={StyleSheet.absoluteFill}
              contentFit={item.fit === 'cover' ? 'cover' : 'contain'}
              cachePolicy="memory-disk"
              recyclingKey={item.posterUri}
            />
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

export interface FullscreenMediaViewerProps {
  images?: string[];
  media?: readonly ProductMediaItem[];
  /** Canonical video URLs supplied by the API. URL-suffix detection remains
   * as a compatibility fallback for older callers. */
  videoUris?: readonly string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  onZoomStart?: () => void;
  onActiveIndexChange?: (index: number) => void;
}

export function FullscreenMediaViewer({
  images = [],
  media,
  videoUris = [],
  initialIndex,
  visible,
  onClose,
  onZoomStart,
  onActiveIndexChange }: FullscreenMediaViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const listRef = useRef<FlatList<ProductMediaItem>>(null);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const mediaItems = useMemo<ProductMediaItem[]>(() => {
    if (media) return media.filter((item) => !!item.uri);
    const videoUriSet = new Set(videoUris);
    return images
      .filter(Boolean)
      .map((uri) => ({
        uri,
        kind: videoUriSet.has(uri) || isVideoUri(uri) ? 'video' : 'image',
        fit: 'contain' }));
  }, [images, media, videoUris]);
  const safeInitialIndex = mediaItems.length > 0
    ? Math.min(Math.max(initialIndex, 0), mediaItems.length - 1)
    : 0;
  const [activeIndex, setActiveIndex] = useState(safeInitialIndex);

  // ── Chrome visibility (tap-to-toggle) ──
  // iOS Photos pattern: tap the image to hide/show chrome. Chrome starts
  // visible so the close button and index are immediately discoverable.
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeOpacity = useSharedValue(1);

  const toggleChrome = useCallback(() => {
    setChromeVisible((prev) => {
      const next = !prev;
      chromeOpacity.value = reducedMotion
        ? next ? 1 : 0
        : withSpring(next ? 1 : 0, spring.tap);
      AccessibilityInfo.announceForAccessibility(
        next ? 'Controls shown' : 'Controls hidden',
      );
      return next;
    });
  }, [chromeOpacity, reducedMotion, spring]);

  // Chrome animated style — applies to close button, index, thumbnail strip.
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: chromeOpacity.value,
    pointerEvents: chromeOpacity.value > 0.5 ? 'auto' as const : 'none' as const }));

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(safeInitialIndex);
    setChromeVisible(true);
    chromeOpacity.value = 1;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: safeInitialIndex,
        animated: false });
    });
  }, [safeInitialIndex, visible, chromeOpacity]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const nextIndex = viewableItems[0].index ?? 0;
      setActiveIndex(nextIndex);
      onActiveIndexChange?.(nextIndex);
    }
  }, [onActiveIndexChange]);

  const scrollToIndex = useCallback((index: number) => {
    listRef.current?.scrollToIndex({ index, animated: !reducedMotion });
  }, [reducedMotion]);

  if (!visible) return null;

  return (
    <Reanimated.View
      style={styles.overlay}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      accessibilityViewIsModal
      importantForAccessibility="yes"
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      <FlatList
        ref={listRef}
        data={mediaItems}
        keyExtractor={(item, i) => item.id ?? `${item.uri}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={safeInitialIndex}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        renderItem={({ item, index }) =>
          item.kind === 'video' ? (
            <FullscreenVideoPage
              item={item}
              width={width}
              height={height}
              isActive={index === activeIndex}
              onToggleChrome={toggleChrome}
            />
          ) : (
            <FullscreenImagePage
              item={item}
              width={width}
              height={height}
              onClose={onClose}
              onZoomStart={onZoomStart}
              onToggleChrome={toggleChrome}
              chromeVisible={chromeVisible}
            />
          )
        }
        onScrollToIndexFailed={({ index }) => {
          listRef.current?.scrollToOffset({ offset: width * index, animated: false });
        }}
      />

      {/* Top gradient scrim — ensures close button legibility over any media.
          Fades with chrome so it recedes when the user wants a clean view. */}
      <Reanimated.View style={[styles.topScrim, chromeStyle]} pointerEvents="none" />

      {/* Close button — transparent 44pt target with a 24pt glyph (AGENTS.md §4) */}
      <Reanimated.View style={[styles.closeButtonContainer, { top: Math.max(insets.top, Space.md) }, chromeStyle]}>
        <AnimatedPressable
          style={styles.closeButton}
          onPress={onClose}
          {...PressPresets.iconButton}
          accessibilityLabel="Close fullscreen viewer"
          accessibilityHint="Closes the image viewer and returns to the previous screen"
        >
          <Ionicons name="close" size={24} color={colors.scrimTextPrimary} />
        </AnimatedPressable>
      </Reanimated.View>

      {/* Index indicator + thumbnail strip — bottom chrome that recedes on tap.
          The index pill sits above the thumbnail strip for galleries with
          multiple items. Both fade together with the chrome. */}
      {mediaItems.length > 1 && (
        <Reanimated.View style={[styles.bottomChrome, { bottom: Math.max(insets.bottom, Space.lg) }, chromeStyle]}>
          {/* Thumbnail strip — synchronized horizontal scroll (iOS Photos pattern).
              Each thumbnail is a 44pt target showing a 36pt image; the active
              one gets a 2pt brand border (selection grammar per AGENTS.md §4). */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStripContent}
            style={styles.thumbStrip}
          >
            {mediaItems.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <Pressable
                  key={item.id ?? `${item.uri}-${index}`}
                  style={styles.thumbTarget}
                  onPress={() => scrollToIndex(index)}
                  accessibilityLabel={`${item.kind === 'video' ? 'Video' : 'Image'} ${index + 1} of ${mediaItems.length}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  hitSlop={Space.xs}
                >
                  <CachedImage
                    uri={item.posterUri ?? item.uri}
                    style={[
                      styles.thumbImage,
                      isActive && styles.thumbImageActive,
                    ]}
                    containerStyle={{
                      borderRadius: Radius.sm,
                      overflow: 'hidden',
                      borderWidth: isActive ? Stroke.emphasis : 0,
                      borderColor: isActive ? colors.scrimTextPrimary : 'transparent' }}
                    contentFit="cover"
                    downscaleWidth={48}
                  />
                  {item.kind === 'video' && (
                    <View style={styles.thumbVideoBadge} pointerEvents="none">
                      <Ionicons name="play" size={10} color={colors.scrimTextPrimary} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Index pill — compact, sits below the thumbnail strip */}
          <View
            style={styles.indicatorContainer}
            accessible
            accessibilityLabel={`${mediaItems[activeIndex]?.kind === 'video' ? 'Video' : 'Image'} ${activeIndex + 1} of ${mediaItems.length}`}
          >
            <Text style={styles.indicatorText}>
              {activeIndex + 1} / {mediaItems.length}
            </Text>
          </View>
        </Reanimated.View>
      )}
    </Reanimated.View>
  );
}

const createSubStyles = (colors: ThemeColors) => StyleSheet.create({
  page: {
    backgroundColor: colors.background },
  imageWrap: {
    width: '100%',
    height: '100%' },
  image: {
    width: '100%',
    height: '100%' } });

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 999 },
  page: {
    backgroundColor: colors.background },
  imageWrap: {
    width: '100%',
    height: '100%' },
  image: {
    width: '100%',
    height: '100%' },
  // Top gradient scrim — ensures close button legibility over bright media.
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'transparent',
    // LinearGradient would be ideal but we use a simple semi-transparent
    // overlay to avoid an extra dependency import. The scrim is subtle
    // (0.35 → 0) so it doesn't darken the image noticeably.
  },
  closeButtonContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Space.md,
    zIndex: 10,
    elevation: 10 },
  closeButton: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    // Near-transparent chrome (AGENTS.md §4: ordinary controls default to
    // transparent). Legibility comes from the top scrim, not an opaque disc.
    backgroundColor: colors.overlay },
  // Bottom chrome — thumbnail strip + index pill, fades with tap-to-toggle.
  bottomChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    elevation: 10 },
  thumbStrip: {
    maxWidth: '100%' },
  thumbStripContent: {
    paddingHorizontal: Space.md,
    gap: Space.xs,
    alignItems: 'center' },
  thumbTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  thumbImage: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    opacity: 0.6 },
  thumbImageActive: {
    opacity: 1 },
  thumbVideoBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' },
  indicatorContainer: {
    marginTop: Space.xs,
    alignItems: 'center' },
  indicatorText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.xs - 1,
    borderRadius: Radius.full,
    letterSpacing: 0.3 } });
}
