import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import {
  GestureDetector,
  Gesture,
  FlatList,
} from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius, Type, Control, Stroke } from '../../theme/designTokens';
import { ImageEmptyGraphic } from '../ImageEmptyGraphic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';

// ── Zoom bounds (matches CommerceMediaStage gesture matrix) ──
const MAX_ZOOM = 4;
const MIN_ZOOM = 1;
/** When the natural image ratio diverges from the frame by more than this
 *  factor, switch to `contain` so the full outfit stays visible instead of
 *  being heavily cropped. Art-directed cover is the default; contain is the
 *  graceful fallback for extreme aspect ratios. */
const CONTAIN_RATIO_DIVERGENCE = 1.8;
/** Dot indicator count threshold — beyond this, dots collapse to a numeric
 *  counter (Depop/Vinted/Grailed pattern). */
const DOT_MAX_PAGES = 5;
/** Swipe hint auto-dismiss delay (Agency Effect research, 2026). */
const SWIPE_HINT_DELAY_MS = 2800;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const applyRubberBand = (v: number, min: number, max: number, friction = 0.24) => {
  if (v < min) return min + (v - min) * friction;
  if (v > max) return max + (v - max) * friction;
  return v;
};

export interface LookMediaCarouselPage {
  id: string;
  uri: string;
  isVideo: boolean;
}

interface LookMediaCarouselProps {
  pages: LookMediaCarouselPage[];
  /** Aspect ratio (width/height) for the carousel container. Defaults to 4:5. */
  aspectRatio?: number;
  /** Called when the active page changes. */
  onActiveIndexChange?: (index: number) => void;
  /** Accessibility label for the carousel. */
  accessibilityLabel?: string;
}

// ============================================================================
// SUB-COMPONENT STYLES
// ============================================================================
const createSubComponentStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    page: {
      backgroundColor: colors.surfaceAlt,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      minHeight: Control.hit,
    },
    retryText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
    },
  });

// ============================================================================
// IMAGE PAGE — pinch / double-tap zoom / pan-when-zoomed / single-tap
// ============================================================================
interface MediaPageProps {
  item: LookMediaCarouselPage;
  width: number;
  height: number;
  pageIndex: number;
  totalPages: number;
  onZoomStart?: () => void;
  onSingleTap?: () => void;
}

const MediaPage = React.memo(function MediaPage({
  item,
  width,
  height,
  pageIndex,
  totalPages,
  onZoomStart,
  onSingleTap,
}: MediaPageProps) {
  const reducedMotion = useReducedMotion();
  const { colors } = useAppTheme();
  const subComponentStyles = useMemo(() => createSubComponentStyles(colors), [colors]);
  const [failed, setFailed] = useState(false);
  // Retry key — incrementing forces expo-image to remount and re-fetch.
  const [retryKey, setRetryKey] = useState(0);
  // Detected natural aspect ratio (width/height) from onLoad. Used to pick
  // cover vs contain so extreme aspect ratios don't crop the outfit away.
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  // Track zoom state in React state so the pan gesture can be disabled when
  // not zoomed. When pan is always active, it captures horizontal swipes and
  // prevents the parent FlatList from paging. Only enabling pan when zoomed
  // > 1x lets horizontal swipes pass through to the FlatList for pagination.
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
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (onSingleTap) runOnJS(onSingleTap)();
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
    ],
  }));

  // Art-directed content fit: cover by default, contain when the natural
  // ratio diverges sharply from the frame so the full outfit stays visible.
  const containerRatio = width / height;
  const contentFit: 'cover' | 'contain' =
    naturalRatio != null &&
    (naturalRatio / containerRatio > CONTAIN_RATIO_DIVERGENCE ||
      containerRatio / naturalRatio > CONTAIN_RATIO_DIVERGENCE)
      ? 'contain'
      : 'cover';

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View
        style={[subComponentStyles.page, { width, height }, animStyle]}
        accessible
        accessibilityRole="imagebutton"
        accessibilityLabel={`Look image ${pageIndex + 1} of ${totalPages}`}
        onAccessibilityTap={onSingleTap}
      >
        {failed || !item.uri ? (
          <ImageEmptyGraphic
            icon="image-outline"
            label="Photo unavailable"
            style={subComponentStyles.image}
          >
            <Pressable
              style={subComponentStyles.retryBtn}
              onPress={() => {
                setFailed(false);
                setRetryKey((k) => k + 1);
              }}
              accessibilityLabel="Retry loading image"
              accessibilityRole="button"
            >
              <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
              <Text style={subComponentStyles.retryText}>Retry</Text>
            </Pressable>
          </ImageEmptyGraphic>
        ) : (
          <ExpoImage
            key={retryKey}
            source={{ uri: item.uri }}
            style={subComponentStyles.image}
            contentFit={contentFit}
            cachePolicy="memory-disk"
            transition={reducedMotion ? 0 : 240}
            recyclingKey={item.uri}
            onLoad={(e) => {
              const { width: w, height: h } = e.source;
              if (w && h) setNaturalRatio(w / h);
            }}
            onError={() => setFailed(true)}
          />
        )}
      </Reanimated.View>
    </GestureDetector>
  );
});

// ============================================================================
// VIDEO PAGE — bespoke minimal controls (play/pause, mute, scrub, fullscreen)
// ============================================================================
function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

interface VideoPageProps {
  item: LookMediaCarouselPage;
  width: number;
  height: number;
  isActive: boolean;
  pageIndex: number;
  totalPages: number;
  onSingleTap?: () => void;
}

const VideoPage = React.memo(function VideoPage({
  item,
  width,
  height,
  isActive,
  pageIndex,
  totalPages,
  onSingleTap,
}: VideoPageProps) {
  const [appIsActive, setAppIsActive] = useState(true);
  const { colors } = useAppTheme();
  const subComponentStyles = useMemo(() => createSubComponentStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIsScrubbingRef = useRef(false);

  const shouldPlay = isActive && appIsActive;

  const player = useVideoPlayer(item.uri, (instance) => {
    try {
      instance.muted = true;
      instance.loop = true;
    } catch {
      /* no-op */
    }
  });

  // Sync play/pause with isActive and app state.
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

  // Sync mute.
  useEffect(() => {
    if (!player) return;
    try {
      player.muted = isMuted;
    } catch {
      /* no-op */
    }
  }, [isMuted, player]);

  // Track playing state.
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener?.('playingChange', ({ isPlaying: playing }: { isPlaying: boolean }) => {
      setIsPlaying(playing);
    });
    return () => sub?.remove?.();
  }, [player]);

  // Track duration.
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener?.('statusChange', ({ status }: { status: string }) => {
      if (status === 'readyToPlay') {
        try {
          setDuration(player.duration || 0);
        } catch {
          /* no-op */
        }
      } else if (status === 'error') {
        setFailed(true);
      }
    });
    return () => sub?.remove?.();
  }, [player]);

  // Poll current time for scrub bar.
  useEffect(() => {
    if (!player || !shouldPlay) return;
    const interval = setInterval(() => {
      if (userIsScrubbingRef.current) return;
      try {
        setCurrentTime(player.currentTime || 0);
        if (duration === 0 && player.duration > 0) {
          setDuration(player.duration);
        }
      } catch {
        /* no-op */
      }
    }, 250);
    return () => clearInterval(interval);
  }, [player, shouldPlay, duration]);

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

  const hideControls = useCallback(() => {
    setControlsVisible(false);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
  }, []);

  useEffect(() => {
    if (isPlaying && controlsVisible) showControls();
  }, [isPlaying, controlsVisible, showControls]);

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
    onSingleTap?.();
  }, [onSingleTap]);

  const hasDuration = duration > 0;
  const progress = hasDuration ? currentTime / duration : 0;

  if (failed) {
    return (
      <View
        style={[subComponentStyles.page, { width, height }]}
        accessible
        accessibilityRole="imagebutton"
        accessibilityLabel={`Look video ${pageIndex + 1} of ${totalPages}, unavailable`}
      >
        <ImageEmptyGraphic icon="videocam-outline" label="Video unavailable" style={subComponentStyles.image}>
          <Pressable
            style={subComponentStyles.retryBtn}
            onPress={() => setFailed(false)}
            accessibilityLabel="Retry loading video"
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
            <Text style={subComponentStyles.retryText}>Retry</Text>
          </Pressable>
        </ImageEmptyGraphic>
      </View>
    );
  }

  return (
    <View
      style={[subComponentStyles.page, { width, height }]}
      accessible
      accessibilityRole="imagebutton"
      accessibilityLabel={`Look video ${pageIndex + 1} of ${totalPages}`}
    >
      <VideoView
        player={player}
        style={subComponentStyles.image}
        contentFit="contain"
        nativeControls={false}
      />

      {/* Tap layer to toggle controls */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleVideoTap}
        accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
        accessibilityRole="button"
      />

      {controlsVisible && (
        <>
          {/* Bottom gradient scrim for control legibility */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
            locations={[0, 1]}
            style={videoControlStyles.bottomScrim}
            pointerEvents="none"
          />

          {/* Center play/pause button — only when paused */}
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

          {/* Bottom control bar */}
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

            {hasDuration && (
              <>
                <Text style={[videoControlStyles.timeText, { color: colors.scrimTextPrimary }]}>
                  {formatVideoTime(currentTime)}
                </Text>
                <Pressable
                  style={videoControlStyles.scrubTrack}
                  onPress={(e) => {
                    const trackWidth = width - 180;
                    const x = e.nativeEvent.locationX;
                    handleScrub((x / trackWidth) * duration);
                  }}
                  onPressIn={handleScrubStart}
                  onPressOut={handleScrubEnd}
                  accessibilityLabel="Video progress"
                  accessibilityRole="adjustable"
                  accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(currentTime) }}
                  hitSlop={{ top: 12, bottom: 12 }}
                >
                  <View style={videoControlStyles.scrubTrackBg}>
                    <View style={[videoControlStyles.scrubTrackFill, { width: `${progress * 100}%`, backgroundColor: colors.scrimTextPrimary }]} />
                    <View style={[videoControlStyles.scrubThumb, { left: `${progress * 100}%`, backgroundColor: colors.scrimTextPrimary }]} />
                  </View>
                </Pressable>
                <Text style={[videoControlStyles.timeText, { color: colors.scrimTextPrimary }]}>
                  {formatVideoTime(duration)}
                </Text>
              </>
            )}

            <Pressable
              style={videoControlStyles.controlBtn}
              onPress={toggleMute}
              accessibilityLabel={isMuted ? 'Unmute video' : 'Mute video'}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name={isMuted ? 'volume-mute' : 'volume-medium'} size={20} color={colors.scrimTextPrimary} />
            </Pressable>

            <Pressable
              style={videoControlStyles.controlBtn}
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
});

const videoControlStyles = StyleSheet.create({
  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  centerPlayBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -28,
    marginTop: -28,
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingBottom: Space.sm,
    gap: Space.xs,
  },
  controlBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubTrack: {
    flex: 1,
    height: Control.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
  },
  scrubTrackBg: {
    height: 3,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'visible',
  },
  scrubTrackFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  scrubThumb: {
    position: 'absolute',
    top: -5,
    width: 13,
    height: 13,
    borderRadius: Radius.full,
    marginLeft: -6.5,
  },
  timeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
    minWidth: 32,
    textAlign: 'center',
  },
});

// ============================================================================
// PAGINATION DOT — animated active-dot width morph
// ============================================================================
interface PaginationDotProps {
  isActive: boolean;
  reducedMotion: boolean;
  activeColor: string;
  inactiveColor: string;
}

const DOT_INACTIVE_WIDTH = 6;
const DOT_ACTIVE_WIDTH = 16;
const DOT_HEIGHT = 5;

const PaginationDot = React.memo(function PaginationDot({
  isActive,
  reducedMotion,
  activeColor,
  inactiveColor,
}: PaginationDotProps) {
  const widthSV = useSharedValue(isActive ? DOT_ACTIVE_WIDTH : DOT_INACTIVE_WIDTH);

  useEffect(() => {
    widthSV.value = withTiming(isActive ? DOT_ACTIVE_WIDTH : DOT_INACTIVE_WIDTH, {
      duration: reducedMotion ? 0 : Motion.duration.normal,
    });
  }, [isActive, reducedMotion, widthSV]);

  const animStyle = useAnimatedStyle(() => ({
    width: widthSV.value,
  }));

  return (
    <Reanimated.View
      style={[
        {
          height: DOT_HEIGHT,
          borderRadius: Radius.full,
          backgroundColor: isActive ? activeColor : inactiveColor,
          opacity: isActive ? 1 : 0.4,
        },
        animStyle,
      ]}
    />
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================
function LookMediaCarouselImpl({
  pages,
  aspectRatio = 0.8,
  onActiveIndexChange,
  accessibilityLabel = 'Look media carousel',
}: LookMediaCarouselProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<LookMediaCarouselPage>>(null);

  const carouselHeight = screenWidth / aspectRatio;

  // ── Swipe hint (Agency Effect, 2026) ──
  // On the first slide, when there are multiple pages, show a subtle
  // "Swipe →" hint that auto-dismisses after 2.8s. Skipped entirely under
  // reduced motion.
  const swipeHintOpacity = useSharedValue(0);
  const swipeHintDismissed = useRef(false);
  const dismissSwipeHint = useCallback(() => {
    if (swipeHintDismissed.current) return;
    swipeHintDismissed.current = true;
    swipeHintOpacity.value = withTiming(0, { duration: Motion.duration.slower });
  }, [swipeHintOpacity]);

  useEffect(() => {
    if (reducedMotion || pages.length < 2) return;
    swipeHintOpacity.value = withTiming(1, { duration: Motion.duration.slow });
    const timer = setTimeout(() => dismissSwipeHint(), SWIPE_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [reducedMotion, pages.length, swipeHintOpacity, dismissSwipeHint]);

  // Dismiss the hint as soon as the user leaves the first slide.
  useEffect(() => {
    if (activeIndex !== 0) dismissSwipeHint();
  }, [activeIndex, dismissSwipeHint]);

  const swipeHintStyle = useAnimatedStyle(() => ({ opacity: swipeHintOpacity.value }));

  // ── Preload adjacent media ──
  // When the active page changes, prefetch the next image. For videos we
  // only have the media uri (no separate poster), so we skip prefetching
  // the full video — the VideoView streams it on activation.
  useEffect(() => {
    if (pages.length < 2) return;
    const nextIdx = activeIndex + 1;
    if (nextIdx >= pages.length) return;
    const nextItem = pages[nextIdx];
    if (!nextItem.isVideo && nextItem.uri) {
      ExpoImage.prefetch(nextItem.uri).catch(() => {});
    }
  }, [activeIndex, pages]);

  // FlatList requires a stable onViewableItemsChanged identity.
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);
  onActiveIndexChangeRef.current = onActiveIndexChange;
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      if (viewableItems.length > 0) {
        const next = viewableItems[0].index ?? 0;
        setActiveIndex(next);
        onActiveIndexChangeRef.current?.(next);
        AccessibilityInfo.announceForAccessibility(
          `Page ${next + 1} of ${pages.length}`,
        );
      }
    },
    [pages.length],
  );
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const scrollToIndex = (index: number) => {
    listRef.current?.scrollToIndex({ index, animated: true });
  };

  const handleSingleTap = useCallback(() => {
    // Fullscreen viewer is not yet wired — dismiss the swipe hint as the
    // only side effect so it doesn't linger over a future overlay.
    dismissSwipeHint();
  }, [dismissSwipeHint]);

  const handleZoomStart = useCallback(() => {
    dismissSwipeHint();
  }, [dismissSwipeHint]);

  // ── Empty state ──
  if (pages.length === 0) {
    return (
      <View style={[styles.container, { width: screenWidth, height: carouselHeight }]}>
        <ImageEmptyGraphic
          icon="images-outline"
          label="No photos yet"
          style={{ width: screenWidth, height: carouselHeight }}
        />
      </View>
    );
  }

  const showDots = pages.length > 1 && pages.length <= DOT_MAX_PAGES;
  const showCounter = pages.length > DOT_MAX_PAGES;

  return (
    <View
      style={[styles.container, { width: screenWidth, height: carouselHeight }]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    >
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        renderItem={({ item, index }) =>
          item.isVideo ? (
            <VideoPage
              item={item}
              width={screenWidth}
              height={carouselHeight}
              isActive={index === activeIndex}
              pageIndex={index}
              totalPages={pages.length}
              onSingleTap={handleSingleTap}
            />
          ) : (
            <MediaPage
              item={item}
              width={screenWidth}
              height={carouselHeight}
              pageIndex={index}
              totalPages={pages.length}
              onZoomStart={handleZoomStart}
              onSingleTap={handleSingleTap}
            />
          )
        }
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => scrollToIndex(index), 100);
        }}
      />

      {/* Top scrim — for header glyph legibility when the parent overlays
          controls on top of the carousel. Scrim-only, no decorative chrome. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.36)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']}
        locations={[0, 0.5, 1]}
        style={styles.topScrim}
        pointerEvents="none"
      />

      {/* Numeric counter — > 5 pages. Subtle scrim pill, top-right. */}
      {showCounter && (
        <View
          style={styles.countBadge}
          accessibilityLabel={`Page ${activeIndex + 1} of ${pages.length}`}
          accessibilityRole="text"
          pointerEvents="none"
        >
          <Text style={styles.countBadgeText}>
            {activeIndex + 1} / {pages.length}
          </Text>
        </View>
      )}

      {/* Dot indicators — ≤ 5 pages. Bottom-center, above the caption area. */}
      {showDots && (
        <View style={styles.dotRow} pointerEvents="none">
          {pages.map((_, i) => (
            <PaginationDot
              key={pages[i].id}
              isActive={i === activeIndex}
              reducedMotion={reducedMotion}
              activeColor={colors.scrimTextPrimary}
              inactiveColor={colors.scrimTextSecondary}
            />
          ))}
        </View>
      )}

      {/* Swipe hint — first slide only, multiple pages, auto-dismiss 2.8s. */}
      {!reducedMotion && pages.length > 1 && (
        <Reanimated.View style={[styles.swipeHint, swipeHintStyle]} pointerEvents="none">
          <Text style={styles.swipeHintText}>Swipe</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.scrimTextSecondary} />
        </Reanimated.View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      position: 'relative',
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    topScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 132,
    },
    // Numeric counter pill — top-right, scrim text on overlay. A hairline
    // scrim border adds legibility on bright imagery (functional, not chrome).
    countBadge: {
      position: 'absolute',
      top: Space.sm,
      right: Space.sm,
      backgroundColor: colors.overlay,
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderWidth: Stroke.hairline,
      borderColor: colors.scrimTextTertiary,
      zIndex: 9,
    },
    countBadgeText: {
      color: colors.scrimTextPrimary,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      fontVariant: ['tabular-nums'],
    },
    // Dot row — bottom-center, above the caption area.
    dotRow: {
      position: 'absolute',
      bottom: Space.md,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      zIndex: 8,
    },
    // Swipe hint — bottom-center, below the dots. Scrim-only, auto-dismisses.
    swipeHint: {
      position: 'absolute',
      bottom: Space.sm,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      zIndex: 7,
    },
    swipeHintText: {
      color: colors.scrimTextSecondary,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      letterSpacing: 0.3,
    },
  });

export const LookMediaCarousel = React.memo(LookMediaCarouselImpl);
