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
  interpolate,
  Extrapolation,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue } from 'react-native-reanimated';
import {
  GestureDetector,
  Gesture,
  FlatList } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control, Stroke, PressScale } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { isVideoUri, getCategoryFocalPoint } from '../../utils/media';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { AnimatedHeart } from '../AnimatedHeart';
import { ImageEmptyGraphic } from '../ImageEmptyGraphic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';
import type { ProductMediaItem } from '../../platform/product/productDetailViewModel';

const MAX_ZOOM = 4;
const MIN_ZOOM = 1;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const applyRubberBand = (v: number, min: number, max: number, friction = 0.24) => {
  if (v < min) return min + (v - min) * friction;
  if (v > max) return max + (v - max) * friction;
  return v;
};

const createSubComponentStyles = (colors: ThemeColors) => StyleSheet.create({
  page: {
    backgroundColor: colors.background },
  image: {
    width: '100%',
    height: '100%' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    minHeight: 44 },
  retryText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary } });

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
  onOpenFullscreen }: MediaPageProps) {
  const reducedMotion = useReducedMotion();
  const { colors } = useAppTheme();
  const subComponentStyles = useMemo(() => createSubComponentStyles(colors), [colors]);
  const [failed, setFailed] = useState(false);
  // Retry key — incrementing forces CachedImage to remount and re-fetch.
  const [retryKey, setRetryKey] = useState(0);
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
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }] }));

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
          >
            <Pressable
              style={({ pressed }) => [subComponentStyles.retryBtn, pressed && { opacity: 0.85, transform: [{ scale: PressScale.tap }] }]}
              onPress={() => { setFailed(false); setRetryKey((k) => k + 1); }}
              accessibilityLabel="Retry loading image"
              accessibilityRole="button"
            >
              <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
              <Text style={subComponentStyles.retryText}>Retry</Text>
            </Pressable>
          </ImageEmptyGraphic>
        ) : (
          item.focalPoint ? (
            <CachedImage
              key={retryKey}
              uri={item.uri}
              blurhash={item.blurhash ?? undefined}
              style={subComponentStyles.image}
              containerStyle={subComponentStyles.image}
              contentFit={item.fit ?? 'cover'}
              transition={Motion.duration.normal}
              focalPoint={item.focalPoint}
              sharedTransitionTag={sharedTransitionTag}
              onError={() => setFailed(true)}
              downscaleWidth={width}
            />
          ) : (
            <CachedImage
              key={retryKey}
              uri={item.uri}
              blurhash={item.blurhash ?? undefined}
              style={subComponentStyles.image}
              containerStyle={subComponentStyles.image}
              contentFit={item.fit ?? 'cover'}
              transition={Motion.duration.normal}
              sharedTransitionTag={sharedTransitionTag}
              onError={() => setFailed(true)}
              downscaleWidth={width}
            />
          )
        )}
      </Reanimated.View>
    </GestureDetector>
  );
}

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function VideoPage({
  item,
  width,
  height,
  isActive,
  onOpenFullscreen }: {
  item: ProductMediaItem;
  width: number;
  height: number;
  isActive: boolean;
  onOpenFullscreen?: () => void;
}) {
  // Pause video when the page is offscreen (scrolled away) or the app
  // is backgrounded. This prevents audio bleed and saves resources.
  const [appIsActive, setAppIsActive] = useState(true);
  const { colors } = useAppTheme();
  const subComponentStyles = useMemo(() => createSubComponentStyles(colors), [colors]);
  const videoControlStyles = useMemo(() => createVideoControlStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();

  // ── Custom video control state ──
  // Bespoke minimal control layer replaces generic useNativeControls.
  // Per audit 03: play/pause, mute, scrub only when meaningful, duration,
  // full-screen. Controls auto-hide after 3s of inactivity, reappear on tap.
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIsScrubbingRef = useRef(false);

  const sourceUri = item.uri;
  const shouldPlay = isActive && appIsActive;

  const player = useVideoPlayer(sourceUri, (instance) => {
    try {
      instance.muted = true;
      instance.loop = false;
    } catch {
      /* no-op */
    }
  });

  // Sync play/pause with isActive and appIsActive
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

  // Sync mute state
  useEffect(() => {
    if (!player) return;
    try {
      player.muted = isMuted;
    } catch {
      /* no-op */
    }
  }, [isMuted, player]);

  // Track playing state
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener?.('playingChange', ({ isPlaying: playing }: { isPlaying: boolean }) => {
      setIsPlaying(playing);
    });
    return () => sub?.remove?.();
  }, [player]);

  // Track duration and current time for scrub bar
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener?.('statusChange', ({ status }: { status: string }) => {
      if (status === 'readyToPlay') {
        try {
          setDuration(player.duration || 0);
        } catch {
          /* no-op */
        }
      }
    });
    return () => sub?.remove?.();
  }, [player]);

  // Poll current time for scrub bar (expo-video doesn't emit timeChange)
  useEffect(() => {
    if (!player || !shouldPlay) return;
    const interval = setInterval(() => {
      if (userIsScrubbingRef.current) return;
      try {
        setCurrentTime(player.currentTime || 0);
        // Update duration if it wasn't set yet
        if (duration === 0 && player.duration > 0) {
          setDuration(player.duration);
        }
      } catch {
        /* no-op */
      }
    }, 250);
    return () => clearInterval(interval);
  }, [player, shouldPlay, duration]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  // ── Controls auto-hide ──
  // Show controls on tap, auto-hide after 3s. Per Airbnb pattern:
  // controls appear on interaction, fade when not needed.
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = setTimeout(() => {
      if (isPlaying) setControlsVisible(false);
    }, 3000);
  }, [isPlaying]);

  const hideControls = useCallback(() => {
    setControlsVisible(false);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
  }, []);

  // Auto-hide controls when video starts playing
  useEffect(() => {
    if (isPlaying && controlsVisible) {
      showControls();
    }
  }, [isPlaying, controlsVisible, showControls]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
    };
  }, []);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        AccessibilityInfo.announceForAccessibility('Video playing');
      } else {
        AccessibilityInfo.announceForAccessibility('Video paused');
      }
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

  const handleScrub = useCallback((value: number) => {
    if (!player) return;
    try {
      player.currentTime = value;
      setCurrentTime(value);
    } catch {
      /* no-op */
    }
  }, [player]);

  const handleScrubStart = useCallback(() => {
    userIsScrubbingRef.current = true;
    showControls();
  }, [showControls]);

  const handleScrubEnd = useCallback(() => {
    userIsScrubbingRef.current = false;
    showControls();
  }, [showControls]);

  const handleVideoTap = useCallback(() => {
    if (controlsVisible) {
      hideControls();
    } else {
      showControls();
    }
  }, [controlsVisible, hideControls, showControls]);

  const handleFullscreen = useCallback(() => {
    onOpenFullscreen?.();
  }, [onOpenFullscreen]);

  const hasDuration = duration > 0;
  const progress = hasDuration ? currentTime / duration : 0;
  const showPoster = !!item.posterUri && !isPlaying && currentTime === 0;

  return (
    <View
      style={[subComponentStyles.page, { width, height }]}
      accessible
      accessibilityLabel={item.altText ?? 'Product video'}
    >
      <VideoView
        player={player}
        style={subComponentStyles.image}
        contentFit={item.fit === 'cover' ? 'cover' : 'contain'}
        nativeControls={false}
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

      {/* Tap layer to toggle controls */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleVideoTap}
        accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
        accessibilityRole="button"
      />

      {/* ── Bespoke minimal control layer ──
          Per audit 03: play/pause, mute, scrub only when meaningful,
          duration, full-screen. Auto-hides after 3s when playing. */}
      {controlsVisible && (
        <>
          {/* Bottom gradient scrim for control legibility */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
            locations={[0, 1]}
            style={videoControlStyles.bottomScrim}
            pointerEvents="none"
          />

          {/* Center play/pause button — only show when paused or on first load */}
          {!isPlaying && (
            <Pressable
              style={({ pressed }) => [videoControlStyles.centerPlayBtn, pressed && { opacity: 0.85, transform: [{ scale: PressScale.tap }] }]}
              onPress={togglePlayPause}
              accessibilityLabel="Play video"
              accessibilityRole="button"
            >
              <Ionicons name="play" size={32} color={colors.scrimTextPrimary} />
            </Pressable>
          )}

          {/* Bottom control bar */}
          <View style={videoControlStyles.controlBar}>
            {/* Play/pause */}
            <Pressable
              style={({ pressed }) => [videoControlStyles.controlBtn, pressed && { opacity: 0.85, transform: [{ scale: PressScale.tap }] }]}
              onPress={togglePlayPause}
              accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color={colors.scrimTextPrimary} />
            </Pressable>

            {/* Scrub bar — only when duration is meaningful (> 0) */}
            {hasDuration && (
              <>
                <Text style={videoControlStyles.timeText}>
                  {formatVideoTime(currentTime)}
                </Text>
                <Pressable
                  style={videoControlStyles.scrubTrack}
                  onPress={(e) => {
                    const trackWidth = width - 180; // approximate control bar width minus buttons
                    const x = e.nativeEvent.locationX;
                    handleScrub((x / trackWidth) * duration);
                  }}
                  onPressIn={handleScrubStart}
                  onPressOut={handleScrubEnd}
                  accessibilityLabel="Video progress"
                  accessibilityRole="adjustable"
                  accessibilityValue={{
                    min: 0,
                    max: Math.round(duration),
                    now: Math.round(currentTime) }}
                  hitSlop={{ top: 12, bottom: 12 }}
                >
                  <View style={videoControlStyles.scrubTrackBg}>
                    <View style={[videoControlStyles.scrubTrackFill, { width: `${progress * 100}%` }]} />
                    <View style={[videoControlStyles.scrubThumb, { left: `${progress * 100}%` }]} />
                  </View>
                </Pressable>
                <Text style={videoControlStyles.timeText}>
                  {formatVideoTime(duration)}
                </Text>
              </>
            )}

            {/* Mute toggle */}
            <Pressable
              style={({ pressed }) => [videoControlStyles.controlBtn, pressed && { opacity: 0.85, transform: [{ scale: PressScale.tap }] }]}
              onPress={toggleMute}
              accessibilityLabel={isMuted ? 'Unmute video' : 'Mute video'}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name={isMuted ? 'volume-mute' : 'volume-medium'} size={20} color={colors.scrimTextPrimary} />
            </Pressable>

            {/* Fullscreen */}
            <Pressable
              style={({ pressed }) => [videoControlStyles.controlBtn, pressed && { opacity: 0.85, transform: [{ scale: PressScale.tap }] }]}
              onPress={handleFullscreen}
              accessibilityLabel="Open video fullscreen"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name="expand" size={20} color={colors.scrimTextPrimary} />
            </Pressable>
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
    justifyContent: 'center' },
  scrubTrack: {
    flex: 1,
    height: Control.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.xs },
  scrubTrackBg: {
    height: 3,
    borderRadius: Radius.full,
    backgroundColor: colors.scrimTextTertiary,
    overflow: 'visible' },
  scrubTrackFill: {
    height: '100%',
    borderRadius: Radius.full,
    backgroundColor: colors.scrimTextPrimary },
  scrubThumb: {
    position: 'absolute',
    top: -5,
    width: 13,
    height: 13,
    borderRadius: Radius.full,
    backgroundColor: colors.scrimTextPrimary,
    marginLeft: -6.5 },
  timeText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    minWidth: 32,
    textAlign: 'center' } });

export interface CommerceMediaStageProps {
  /** Canonical typed media. When supplied, media kind is never guessed
   * from a URL and crop/poster metadata remains attached end-to-end. */
  media?: readonly ProductMediaItem[];
  /** Raw image URIs — mapped internally to ProductMediaItem[] (cover fit)
   * so both props render through the single media code path. */
  images?: string[];
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
  /**
   * When false, suppresses the built-in dot/counter page indicator.
   * Callers that overlay their own indicator (e.g. the iOS Photos
   * pill-stretch PaginationDots on ItemDetailScreen) set this to false
   * to avoid duplicate indicators competing for attention.
   * Defaults to true for backward compatibility.
   */
  showPageIndicator?: boolean;
  /**
   * Category label used to derive category-sensitive default focal
   * points for art-directed crops when the caller supplies raw image
   * URIs (the `images` prop) rather than typed `media` with explicit
   * focalPoint metadata. Per research doc 03 §Macro D: the gallery
   * should default to category-appropriate focal positioning (e.g.
   * centre-top for shoes, centre for bags) instead of blind cover.
   */
  category?: string | null;
}

export function CommerceMediaStage({
  media,
  images = [],
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
  showPageIndicator = true,
  category }: CommerceMediaStageProps) {
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
    zoomHintOpacity.value = withTiming(0, { duration: Motion.duration.slower });
  }, [zoomHintOpacity]);
  const mediaItems = React.useMemo<ProductMediaItem[]>(() => {
    if (media) return media.filter((item) => !!item.uri);
    const videoUriSet = new Set(videoUris);
    // Per research doc 03 §Macro D: apply category-sensitive default
    // focal points so PDP images use art-directed crops instead of blind
    // `contentFit="contain"`. The focal point is only applied to images
    // (videos use their own contentFit logic). `cover` + focalPoint
    // preserves the most important region of the image.
    const defaultFocalPoint = getCategoryFocalPoint(category);
    return images
      .filter(Boolean)
      .map((uri) => ({
        uri,
        kind: videoUriSet.has(uri) || isVideoUri(uri) ? 'video' : 'image',
        fit: videoUriSet.has(uri) || isVideoUri(uri) ? 'contain' : 'cover',
        focalPoint: videoUriSet.has(uri) || isVideoUri(uri) ? null : defaultFocalPoint }));
  }, [images, media, videoUris, category]);
  React.useEffect(() => {
    if (reducedMotion || mediaItems.length === 0) return;
    zoomHintOpacity.value = withTiming(0.7, { duration: Motion.duration.slow });
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

  // ── Preload adjacent media ──
  // Per audit 03 P0: "preload next image and video poster, not every full
  // video." When the active page changes, prefetch the next image and the
  // next video's poster (not the full video) so swipe-forward feels instant.
  // expo-image's prefetch API warms the disk cache without rendering.
  React.useEffect(() => {
    if (mediaItems.length < 2) return;
    const nextIdx = activeIndex + 1;
    if (nextIdx >= mediaItems.length) return;
    const nextItem = mediaItems[nextIdx];
    if (nextItem.kind === 'video') {
      // Only preload the poster, not the full video
      if (nextItem.posterUri) {
        ExpoImage.prefetch(nextItem.posterUri).catch(() => {});
      }
    } else if (nextItem.uri) {
      ExpoImage.prefetch(nextItem.uri).catch(() => {});
    }
  }, [activeIndex, mediaItems]);

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
    transform: [{ scale: bigHeartScale?.value ?? 0 }] }));
  const zoomHintStyle = useAnimatedStyle(() => ({
    opacity: zoomHintOpacity.value }));
  const bottomScrimStyle = useAnimatedStyle(() => {
    // Clear the editorial caption before the collapsed navigation title
    // begins to appear. Overlapping two copies of a long product title makes
    // the transition read as visual noise rather than a deliberate hand-off.
    const opacity = interpolate(scrollY.value, [24, 128], [1, 0], Extrapolation.CLAMP);
    const hidden = scrollY.value >= 128;
    return {
      opacity: reducedMotion ? (scrollY.value < 112 ? 1 : 0) : opacity,
      display: hidden ? 'none' : 'flex' };
  });
  // Reanimated styles are view-bound; the scrim and caption need separate
  // animated style instances even though they follow the same curve.
  const bottomContentStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [24, 128], [1, 0], Extrapolation.CLAMP);
    const hidden = scrollY.value >= 128;
    return {
      opacity: reducedMotion ? (scrollY.value < 112 ? 1 : 0) : opacity,
      display: hidden ? 'none' : 'flex' };
  });

  // FlatList requires onViewableItemsChanged to have a stable identity —
  // changing it between renders throws "Changing onViewableItemsChanged on
  // the fly is not supported". Use a ref to hold the latest onActiveIndexChange
  // so the callback identity never changes.
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);
  onActiveIndexChangeRef.current = onActiveIndexChange;
  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
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
            <VideoPage item={item} width={screenWidth} height={heroHeight} isActive={index === activeIndex} onOpenFullscreen={() => { dismissZoomHint(); onOpenFullscreen(index); }} />
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

      {/* Image count badge — top-right pill showing current/total.
          Per Aug 2026 research: subtle scrim pill, tabular numerals.
          Sits above the topScrim for legibility; pointerEvents none so
          it never intercepts header controls or image gestures. */}
      {mediaItems.length > 1 && (
        <View
          style={styles.countBadge}
          accessibilityLabel={`Image ${activeIndex + 1} of ${mediaItems.length}`}
          accessibilityRole="text"
          pointerEvents="none"
        >
          <Text style={styles.countBadgeText}>
            {activeIndex + 1}/{mediaItems.length}
          </Text>
        </View>
      )}

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
          <Ionicons name="heart" size={100} color={colors.scrimTextPrimary} style={styles.bigHeartIcon} />
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
            scaleValue={PressScale.tap}
            activeOpacity={0.85}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.scrimTextPrimary} style={styles.controlIcon} />
          </AnimatedPressable>

          <View style={styles.headerRight}>
            <AnimatedPressable
              style={styles.controlBtn}
              onPress={onShare}
              scaleValue={PressScale.tap}
              activeOpacity={0.85}
              accessibilityLabel="Share"
            >
              <Ionicons name="share-outline" size={24} color={colors.scrimTextPrimary} style={styles.controlIcon} />
            </AnimatedPressable>

            {showSaveControl && onSave && (
              <AnimatedPressable
                style={styles.controlBtn}
                onPress={onSave}
                scaleValue={PressScale.tap}
                activeOpacity={0.85}
                accessibilityLabel={isSaved ? 'Saved to collection' : 'Save to collection'}
              >
                <Ionicons
                  name={isSaved ? 'bookmark' : 'bookmark-outline'}
                  size={24}
                  color={isSaved ? colors.brand : colors.scrimTextPrimary}
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
                  inactiveColor={colors.scrimTextPrimary}
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

      {showPageIndicator && mediaItems.length > 1 && (
        <Pressable
          style={({ pressed }) => [styles.indexBadge, pressed && styles.indexBadgePressed]}
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
          <Ionicons name="play-circle" size={16} color={colors.scrimTextPrimary} />
          <Text style={styles.videoBadgeText}>Video</Text>
        </View>
      )}

      {/* Zoom hint — subtle magnifying glass that fades after 2.8s or
          on first zoom/fullscreen interaction. Airbnb pattern: one-time
          visual cue that pinch-to-zoom is available. */}
      {!reducedMotion && mediaItems.length > 0 && (
        <Reanimated.View style={[styles.zoomHint, zoomHintStyle]} pointerEvents="none">
          <Ionicons name="add-circle-outline" size={18} color={colors.scrimTextPrimary} style={styles.zoomHintIcon} />
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
                  style={({ pressed }) => [styles.thumbnail, isActive && styles.thumbnailActive, pressed && styles.thumbnailPressed]}
                >
                  {isVid ? (
                    <View style={[styles.thumbnailImage, styles.thumbnailVideoFallback]}>
                      <Ionicons name="play-circle" size={20} color={colors.scrimTextPrimary} />
                    </View>
                  ) : (
                    <CachedImage
                      uri={item.uri}
                      previewUri={item.posterUri ?? undefined}
                      blurhash={item.blurhash ?? undefined}
                      style={styles.thumbnailImage}
                      containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.sm }}
                      contentFit="cover"
                      focalPoint={item.focalPoint ?? undefined}
                    />
                  )}
                  {isVid && (
                    <View style={styles.thumbnailVideoBadge}>
                      <Ionicons name="play" size={8} color={colors.scrimTextPrimary} />
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
    overflow: 'hidden' },
  emptyHero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 132 },
  // Image count badge — top-right pill (e.g. "1/8").
  // Semi-transparent dark pill with white tabular-nums text.
  countBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: colors.overlay,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    zIndex: 9 },
  countBadgeText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  bigHeartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5 },
  bigHeartIcon: {
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10 },
  soldOverlay: {
    position: 'absolute',
    bottom: Space.lg,
    left: Space.md,
    backgroundColor: colors.success,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md },
  soldText: {
    color: colors.background,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: 1 },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    zIndex: 10 },
  headerRight: {
    flexDirection: 'row',
    gap: Space.sm },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center' },
  // Subtle media-contrast scrim behind control glyphs. Functional
  // (legibility over arbitrary imagery), not decorative chrome.
  controlIcon: {
    textShadowColor: colors.overlay,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4 },
  overlayTopZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 100,
    paddingHorizontal: Space.md,
    zIndex: 8 },
  overlayBottomZone: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
    zIndex: 8 },
  indexBadge: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.md,
    backgroundColor: colors.overlay,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md },
  indexBadgePressed: {
    opacity: 0.85,
    transform: [{ scale: PressScale.tap }] },
  // Dot indicators — quiet position signal (Depop/Vinted pattern).
  // Inactive dots are small and translucent; active dot is wider and opaque.
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
    fontFamily: TypographyV2.meta.fontFamily },
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
    fontFamily: TypographyV2.meta.fontFamily },
  // Zoom hint — bottom-center pill, fades out after 2.8s or on first
  // zoom interaction. Quiet, one-time cue (Airbnb pattern).
  zoomHint: {
    position: 'absolute',
    bottom: Space.sm,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.md },
  zoomHintIcon: {
    textShadowColor: colors.overlay,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3 },
  zoomHintText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '48%' },
  thumbnailStrip: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0 },
  thumbnailContent: {
    paddingHorizontal: Space.md,
    gap: Space.xs + 2 },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    opacity: 0.5,
    borderWidth: Stroke.standard,
    borderColor: 'transparent' },
  thumbnailActive: {
    opacity: 1,
    borderWidth: Stroke.emphasis,
    borderColor: colors.scrimTextPrimary },
  thumbnailPressed: {
    opacity: 0.85,
    transform: [{ scale: PressScale.tap }] },
  thumbnailImage: {
    width: '100%',
    height: '100%' },
  thumbnailVideoFallback: {
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center' },
  thumbnailVideoBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: Radius.md,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' } });
