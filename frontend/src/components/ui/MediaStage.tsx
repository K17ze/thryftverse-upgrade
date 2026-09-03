/**
 * MediaStage — shared full-bleed media container for detail surfaces.
 *
 * A generic, reusable media hero for product / auction / look detail screens.
 * Supports paged images and video with a one-video-playback constraint
 * (only the active page plays), floating overlay controls (back, share, save)
 * with transparent 44pt hit areas, page indicator dots, and pinch-to-zoom
 * for images.
 *
 * Art-directed aspect ratios (AGENTS.md §15 — media storytelling):
 *   - 'product'     → 4:5  (marketplace standard, Depop/Instagram)
 *   - 'collectible' → 1:1  (collectibles, art, watches)
 *   - 'video'       → 9:16 (video-first / story format)
 *   - 'portrait'    → 3:4  (Poshmark 2026 portrait standard)
 *   - number        → explicit width/height ratio
 *
 * This is the shared UI-level primitive. Commerce-specific surfaces that
 * need scroll parallax, shared-element transitions, or ProductMediaItem
 * typing continue to use CommerceMediaStage; MediaStage is the lighter,
 * generic surface for auction, look, and future detail screens.
 *
 * Design principles (AGENTS.md §4, §13, §15):
 *  - Media is the primary visual anchor — chrome recedes.
 *  - Floating controls use transparent 44pt hit areas with text-shadow
 *    scrims for legibility (no decorative circular chrome).
 *  - One-video-playback: only the active page's video plays; offscreen
 *    pages pause and backgrounded apps pause all video.
 *  - Pinch-to-zoom on images; pan enabled only when zoomed > 1x so
 *    horizontal swipes pass through to carousel pagination.
 *  - Page indicator dots: up to 5 dots, active dot wider; beyond 5 a
 *    numeric counter (Depop/Vinted pattern).
 *  - Reduced-motion: zoom springs critically damped, entrance collapses.
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  AccessibilityInfo,
  AppState } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS } from 'react-native-reanimated';
import {
  GestureDetector,
  Gesture,
  FlatList } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import {
  Space,
  Radius,
  Control,
  AspectRatio,
  CommerceLayout,
  FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { isVideoUri } from '../../utils/media';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { ImageEmptyGraphic } from '../ImageEmptyGraphic';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MediaStageAspectRatio =
  | 'product'
  | 'collectible'
  | 'video'
  | 'portrait'
  | number;

export interface MediaStageItem {
  /** Media URI (image or video). */
  uri: string;
  /** Media kind. When omitted, inferred from the URI. */
  kind?: 'image' | 'video';
  /** Poster URI for video pages (shown until playback starts). */
  posterUri?: string;
  /** Focal point for art-directed cover crops ({ x, y } in 0–1). */
  focalPoint?: { x: number; y: number };
  /** contentFit override. Defaults to 'contain' for images, 'contain' for video. */
  fit?: 'cover' | 'contain';
  /** Alt text for accessibility. */
  altText?: string;
}

export interface MediaStageOverlayControl {
  /** Ionicons glyph name. */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Tap handler. */
  onPress: () => void;
  /** Accessibility label. */
  accessibilityLabel: string;
  /** Filled/active state — renders a filled glyph + brand tint. */
  active?: boolean;
  /** Active color override (defaults to brand). */
  activeColor?: string;
}

export interface MediaStageProps {
  /** Media items to display in the paged carousel. */
  media: MediaStageItem[];
  /**
   * Art-directed aspect ratio. Accepts a semantic preset or an explicit
   * width/height number. Defaults to 'product' (4:5).
   */
  aspectRatio?: MediaStageAspectRatio;
  /** Top inset for the floating header (status bar / safe area top). */
  topInset?: number;
  /** Back control — rendered top-left. Omit to hide. */
  onBack?: () => void;
  /** Right-side overlay controls (share, save, etc.). */
  controls?: MediaStageOverlayControl[];
  /** Called when the active page changes. */
  onActiveIndexChange?: (index: number) => void;
  /** Called when an image is double-tapped (e.g. like gesture). */
  onDoubleTap?: () => void;
  /** Called when a media page is tapped to open fullscreen. */
  onOpenFullscreen?: (index: number) => void;
  /** Initial page index. Defaults to 0. */
  initialIndex?: number;
  /** Show the built-in page indicator dots. Defaults to true. */
  showPageIndicator?: boolean;
  /** Show the built-in floating controls. Defaults to true. */
  showControls?: boolean;
  /** Override the max zoom factor. Defaults to CommerceLayout.mediaMaxZoom (4). */
  maxZoom?: number;
  style?: any;
}

// ---------------------------------------------------------------------------
// Aspect ratio resolution
// ---------------------------------------------------------------------------

function resolveAspectRatio(ar: MediaStageAspectRatio | undefined): number {
  if (ar === undefined) return AspectRatio.marketplace; // 4:5 default
  if (typeof ar === 'number') return ar;
  switch (ar) {
    case 'product': return AspectRatio.marketplace;     // 4:5
    case 'collectible': return AspectRatio.square;      // 1:1
    case 'video': return AspectRatio.portraitTall;      // 9:16
    case 'portrait': return AspectRatio.portrait;       // 3:4
    default: return AspectRatio.marketplace;
  }
}

const MIN_ZOOM = 1;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const applyRubberBand = (v: number, min: number, max: number, friction = 0.24) => {
  if (v < min) return min + (v - min) * friction;
  if (v > max) return max + (v - max) * friction;
  return v;
};

// ---------------------------------------------------------------------------
// Image page — pinch-to-zoom + pan (pan enabled only when zoomed)
// ---------------------------------------------------------------------------

interface ImagePageProps {
  item: MediaStageItem;
  width: number;
  height: number;
  maxZoom: number;
  onDoubleTap?: () => void;
  onOpenFullscreen?: () => void;
  reducedMotion: boolean;
}

function ImagePage({
  item,
  width,
  height,
  maxZoom,
  onDoubleTap,
  onOpenFullscreen,
  reducedMotion }: ImagePageProps) {
  const { colors } = useAppTheme();
  const [failed, setFailed] = useState(false);
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
      scale.value = Math.min(Math.max(ns, MIN_ZOOM), maxZoom);
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
        translateX.value = withSpring(0, Motion.spring.settle);
        translateY.value = withSpring(0, Motion.spring.settle);
        return;
      }
      const maxX = (width * (zoom - 1)) / 2;
      const maxY = (height * (zoom - 1)) / 2;
      const tx = clamp(translateX.value + e.velocityX * 0.08, -maxX, maxX);
      const ty = clamp(translateY.value + e.velocityY * 0.08, -maxY, maxY);
      savedTranslateX.value = tx;
      savedTranslateY.value = ty;
      translateX.value = withSpring(tx, { ...Motion.spring.press, velocity: reducedMotion ? 0 : e.velocityX });
      translateY.value = withSpring(ty, { ...Motion.spring.press, velocity: reducedMotion ? 0 : e.velocityY });
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1, Motion.spring.press);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(setIsZoomed)(false);
      } else {
        const target = reducedMotion ? 2 : 2.5;
        scale.value = withSpring(target, Motion.spring.success);
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
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ] }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View
        style={[{ width, height, backgroundColor: colors.surfaceAlt }, animStyle]}
        accessible
        accessibilityRole="imagebutton"
        accessibilityLabel={`${item.altText ?? 'Image'}. Open fullscreen.`}
        onAccessibilityTap={onOpenFullscreen}
      >
        {failed || !item.uri ? (
          <ImageEmptyGraphic
            icon="image-outline"
            label="Photo unavailable"
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <CachedImage
            uri={item.uri}
            style={{ width: '100%', height: '100%' }}
            containerStyle={{ width: '100%', height: '100%' }}
            contentFit={item.fit ?? 'contain'}
            focalPoint={item.focalPoint}
            onError={() => setFailed(true)}
          />
        )}
      </Reanimated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// Video page — one-video-playback constraint
// ---------------------------------------------------------------------------

interface VideoPageProps {
  item: MediaStageItem;
  width: number;
  height: number;
  isActive: boolean;
  onOpenFullscreen?: () => void;
}

function VideoPage({ item, width, height, isActive, onOpenFullscreen }: VideoPageProps) {
  const { colors } = useAppTheme();
  const videoControlStyles = useMemo(() => createVideoControlStyles(colors), [colors]);
  const [appIsActive, setAppIsActive] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldPlay = isActive && appIsActive;
  const player = useVideoPlayer(item.uri, (instance) => {
    try {
      instance.muted = true;
      instance.loop = false;
    } catch { /* no-op */ }
  });

  useEffect(() => {
    if (!player) return;
    try {
      if (shouldPlay && isPlaying) {
        player.play();
      } else {
        player.pause();
      }
    } catch { /* no-op */ }
  }, [shouldPlay, isPlaying, player]);

  useEffect(() => {
    if (!player) return;
    try { player.muted = isMuted; } catch { /* no-op */ }
  }, [isMuted, player]);

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener?.('playingChange', ({ isPlaying: playing }: { isPlaying: boolean }) => {
      setIsPlaying(playing);
    });
    return () => sub?.remove?.();
  }, [player]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (isPlaying) setControlsVisible(false);
    }, 3000);
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      AccessibilityInfo.announceForAccessibility(next ? 'Video playing' : 'Video paused');
      return next;
    });
    showControls();
  }, [showControls]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      AccessibilityInfo.announceForAccessibility(prev ? 'Audio unmuted' : 'Audio muted');
      return !prev;
    });
    showControls();
  }, [showControls]);

  const handleTap = useCallback(() => {
    setControlsVisible((prev) => {
      if (prev) {
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        return false;
      }
      showControls();
      return true;
    });
  }, [showControls]);

  const showPoster = !!item.posterUri && !isPlaying;

  return (
    <View style={{ width, height, backgroundColor: colors.surfaceAlt }} accessible accessibilityLabel={item.altText ?? 'Video'}>
      <VideoView
        player={player}
        style={{ width: '100%', height: '100%' }}
        contentFit={item.fit === 'cover' ? 'cover' : 'contain'}
        nativeControls={false}
      />

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

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleTap}
        accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
        accessibilityRole="button"
      />

      {controlsVisible && (
        <>
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
            locations={[0, 1]}
            style={videoControlStyles.bottomScrim}
            pointerEvents="none"
          />
          {!isPlaying && (
            <Pressable
              style={videoControlStyles.centerPlayBtn}
              onPress={togglePlayPause}
              accessibilityLabel="Play video"
              accessibilityRole="button"
            >
              <Ionicons name="play" size={32} color={colors.scrimTextPrimary} />
            </Pressable>
          )}
          <View style={videoControlStyles.controlBar}>
            <Pressable
              style={videoControlStyles.controlBtn}
              onPress={togglePlayPause}
              accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color={colors.scrimTextPrimary} />
            </Pressable>
            <Pressable
              style={videoControlStyles.controlBtn}
              onPress={toggleMute}
              accessibilityLabel={isMuted ? 'Unmute video' : 'Mute video'}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name={isMuted ? 'volume-mute' : 'volume-medium'} size={20} color={colors.scrimTextPrimary} />
            </Pressable>
            {onOpenFullscreen ? (
              <Pressable
                style={videoControlStyles.controlBtn}
                onPress={onOpenFullscreen}
                accessibilityLabel="Open video fullscreen"
                accessibilityRole="button"
                hitSlop={8}
              >
                <Ionicons name="expand" size={20} color={colors.scrimTextPrimary} />
              </Pressable>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

const createVideoControlStyles = (colors: ThemeColors) => StyleSheet.create({
  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80 },
  centerPlayBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -28,
    marginTop: -28,
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' },
  controlBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingBottom: Space.sm,
    gap: Space.xs },
  controlBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' } });

// ---------------------------------------------------------------------------
// MediaStage
// ---------------------------------------------------------------------------

export function MediaStage({
  media,
  aspectRatio = 'product',
  topInset = 0,
  onBack,
  controls = [],
  onActiveIndexChange,
  onDoubleTap,
  onOpenFullscreen,
  initialIndex = 0,
  showPageIndicator = true,
  showControls = true,
  maxZoom = CommerceLayout.mediaMaxZoom,
  style }: MediaStageProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<MediaStageItem>>(null);

  const ratio = resolveAspectRatio(aspectRatio);
  const stageHeight = screenWidth / ratio;

  const mediaItems = useMemo<MediaStageItem[]>(() => {
    return media
      .filter((item) => !!item.uri)
      .map((item) => ({
        ...item,
        kind: item.kind ?? (isVideoUri(item.uri) ? 'video' : 'image') }));
  }, [media]);

  useEffect(() => {
    if (mediaItems.length === 0) return;
    const nextIndex = Math.min(Math.max(initialIndex, 0), mediaItems.length - 1);
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: nextIndex, animated: false });
    });
  }, [initialIndex, mediaItems.length]);

  // Preload adjacent media for instant swipe-forward.
  useEffect(() => {
    if (mediaItems.length < 2) return;
    const nextIdx = activeIndex + 1;
    if (nextIdx >= mediaItems.length) return;
    const nextItem = mediaItems[nextIdx];
    if (nextItem.kind === 'video') {
      if (nextItem.posterUri) ExpoImage.prefetch(nextItem.posterUri).catch(() => {});
    } else if (nextItem.uri) {
      ExpoImage.prefetch(nextItem.uri).catch(() => {});
    }
  }, [activeIndex, mediaItems]);

  const onActiveIndexChangeRef = useRef(onActiveIndexChange);
  onActiveIndexChangeRef.current = onActiveIndexChange;
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems.length > 0) {
      const next = viewableItems[0].index ?? 0;
      setActiveIndex(next);
      onActiveIndexChangeRef.current?.(next);
    }
  }, []);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const scrollToIndex = (index: number) => {
    listRef.current?.scrollToIndex({ index, animated: true });
  };

  return (
    <View style={[styles.stage, { height: stageHeight }, style]}>
      {mediaItems.length === 0 ? (
        <ImageEmptyGraphic
          icon="image-outline"
          label="No media yet"
          style={{ width: screenWidth, height: stageHeight }}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={mediaItems}
          keyExtractor={(item, i) => `${item.uri}-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig.current}
          renderItem={({ item, index }) =>
            item.kind === 'video' ? (
              <VideoPage
                item={item}
                width={screenWidth}
                height={stageHeight}
                isActive={index === activeIndex}
                onOpenFullscreen={onOpenFullscreen ? () => onOpenFullscreen(index) : undefined}
              />
            ) : (
              <ImagePage
                item={item}
                width={screenWidth}
                height={stageHeight}
                maxZoom={maxZoom}
                onDoubleTap={onDoubleTap}
                onOpenFullscreen={onOpenFullscreen ? () => onOpenFullscreen(index) : undefined}
                reducedMotion={reducedMotion}
              />
            )
          }
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => scrollToIndex(index), 100);
          }}
        />
      )}

      {/* Top legibility scrim for floating controls — functional, not decorative */}
      <LinearGradient
        colors={['rgba(0,0,0,0.36)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']}
        locations={[0, 0.5, 1]}
        style={styles.topScrim}
        pointerEvents="none"
      />

      {/* Floating overlay controls — transparent 44pt hit areas with
          text-shadow scrims (AGENTS.md: separate hit area from visible shape) */}
      {showControls && (onBack || controls.length > 0) && (
        <View style={[styles.floatingHeader, { paddingTop: Math.max(topInset, Space.sm) }]}>
          {onBack ? (
            <AnimatedPressable
              style={styles.controlBtn}
              onPress={onBack}
              {...PressPresets.iconButton}
              accessibilityLabel="Go back"
              accessibilityHint="Returns to the previous screen"
            >
              <Ionicons name="chevron-back" size={24} color={colors.scrimTextPrimary} style={styles.controlIcon} />
            </AnimatedPressable>
          ) : <View style={styles.controlBtn} />}

          <View style={styles.headerRight}>
            {controls.map((ctrl, i) => (
              <AnimatedPressable
                key={i}
                style={styles.controlBtn}
                onPress={ctrl.onPress}
                {...PressPresets.iconButton}
                accessibilityLabel={ctrl.accessibilityLabel}
              >
                <Ionicons
                  name={ctrl.icon}
                  size={24}
                  color={ctrl.active ? (ctrl.activeColor ?? colors.brand) : colors.scrimTextPrimary}
                  style={styles.controlIcon}
                />
              </AnimatedPressable>
            ))}
          </View>
        </View>
      )}

      {/* Page indicator dots — Depop/Vinted pattern.
          Up to 5 dots (active wider); beyond 5 a numeric counter. */}
      {showPageIndicator && mediaItems.length > 1 && (
        <Pressable
          style={({ pressed }) => [styles.indexBadge, pressed && styles.indexBadgePressed]}
          onPress={() => onOpenFullscreen?.(activeIndex)}
          accessibilityRole="button"
          accessibilityLabel={`${mediaItems[activeIndex]?.kind === 'video' ? 'Video' : 'Image'} ${activeIndex + 1} of ${mediaItems.length}. Open fullscreen.`}
        >
          {mediaItems.length <= 5 ? (
            <View style={styles.dotRow}>
              {mediaItems.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === activeIndex && styles.dotActive]}
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

      {/* Video badge — lower-left when the active page is video */}
      {mediaItems.length > 0 && mediaItems[activeIndex]?.kind === 'video' && (
        <View style={styles.videoBadge}>
          <Ionicons name="play-circle" size={16} color={colors.scrimTextPrimary} />
          <Text style={styles.videoBadgeText}>Video</Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  stage: {
    position: 'relative',
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden' },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 132 },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Space.md,
    zIndex: 10 },
  headerRight: {
    flexDirection: 'row',
    gap: Space.sm },
  controlBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  // Subtle media-contrast scrim behind control glyphs — functional
  // (legibility over arbitrary imagery), not decorative chrome.
  controlIcon: {
    textShadowColor: colors.overlay,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4 },
  indexBadge: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.md,
    backgroundColor: colors.overlay,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md },
  indexBadgePressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }] },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  dot: {
    width: 5,
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: colors.scrimTextTertiary },
  dotActive: {
    width: 14,
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: colors.scrimTextPrimary },
  indexText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },
  videoBadge: {
    position: 'absolute',
    bottom: Space.sm,
    left: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.md },
  videoBadgeText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium } });
