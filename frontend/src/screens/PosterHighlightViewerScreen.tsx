import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  Dimensions,
  AccessibilityInfo,
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Control, Stroke } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { CachedImage } from '../components/CachedImage';
import { Video } from '../components/compat/Video';
import { PosterProgressSegments } from '../components/poster/PosterProgressSegments';
import { fetchPosterHighlightById, type PosterHighlight } from '../services/postersApi';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
} from 'react-native-reanimated';

type Props = NativeStackScreenProps<RootStackParamList, 'PosterHighlightViewer'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TICK_MS = 50;
const DEFAULT_DURATION = 5000;
const ERROR_ICON_SIZE = 40;
const PAUSE_ICON_SIZE = 20;
const SWIPE_THRESHOLD = 40;

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url);
}

export default function PosterHighlightViewerScreen({ route, navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const { highlightId } = route.params;

  const [highlight, setHighlight] = React.useState<PosterHighlight | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(true);
  const [mediaError, setMediaError] = React.useState(false);
  const [mediaRetryKey, setMediaRetryKey] = React.useState(0);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [videoPosition, setVideoPosition] = React.useState(0);
  const [videoDuration, setVideoDuration] = React.useState(0);
  const playerRef = React.useRef<any>(null);
  const scrubberBarWidth = React.useRef(0);
  // Caption expand/collapse — 3-line clamp with "more" tap.
  const [captionExpanded, setCaptionExpanded] = React.useState(false);

  // Load highlight data
  // NOTE: The backend API exposes only a list endpoint
  // (GET /users/:userId/poster-highlights) — there is no single-highlight
  // fetch. We therefore fetch the user's highlights and find the matching
  // id. When a GET /poster-highlights/:id endpoint becomes available,
  // this should be replaced with a direct fetch.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await fetchPosterHighlightById(highlightId);
        if (cancelled) return;
        if (!found) {
          setLoadError(true);
        } else {
          setHighlight(found);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [highlightId, reloadKey]);

  const activeFrame = highlight?.frames[frameIndex] ?? null;
  const isVideo = !!activeFrame && (activeFrame.mediaType === 'video' || isVideoUrl(activeFrame.mediaUrl));

  // Reset caption expansion whenever the frame changes so each frame starts
  // in its collapsed (3-line clamp) state.
  React.useEffect(() => {
    setCaptionExpanded(false);
    setVideoPosition(0);
    setVideoDuration(0);
  }, [activeFrame?.frameId]);

  // Android hardware back button — dismiss the viewer (matches close button
  // and swipe-down dismiss).
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      haptic.light();
      navigation.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [navigation, haptic]);

  // Swipe-down to dismiss gesture — matches the main PosterViewerScreen's
  // primary exit gesture (Instagram/Snapchat pattern).
  const handleSwipeDismiss = React.useCallback(() => {
    haptic.heavy();
    navigation.goBack();
  }, [haptic, navigation]);

  const dismissPanGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(SWIPE_THRESHOLD)
        .onEnd((e) => {
          if (e.translationY > SWIPE_THRESHOLD && Math.abs(e.translationY) > Math.abs(e.translationX)) {
            runOnJS(handleSwipeDismiss)();
          }
        }),
    [handleSwipeDismiss]
  );

  const goNextFrame = React.useCallback(() => {
    setProgress(0);
    setMediaError(false);
    if (!highlight) return;
    if (frameIndex < highlight.frames.length - 1) {
      haptic.selection();
      setFrameIndex(frameIndex + 1);
      AccessibilityInfo.announceForAccessibility(
        `Frame ${frameIndex + 2} of ${highlight.frames.length}`
      );
    }
    // At last frame, don't auto-exit — let user manually close.
  }, [highlight, frameIndex, haptic]);

  const goPrevFrame = React.useCallback(() => {
    setProgress(0);
    setMediaError(false);
    if (frameIndex > 0) {
      haptic.selection();
      setFrameIndex(frameIndex - 1);
      AccessibilityInfo.announceForAccessibility(
        `Frame ${frameIndex} of ${highlight?.frames.length ?? 1}`
      );
    }
  }, [frameIndex, highlight, haptic]);

  const handleRetryMedia = () => {
    setMediaError(false);
    setMediaRetryKey((k) => k + 1);
    setProgress(0);
  };

  // Auto-advance timer (image frames only; video frames use position tracking)
  React.useEffect(() => {
    if (!activeFrame || isPaused || isLoading) return;
    if (frameIndex >= (highlight?.frames.length ?? 1) - 1) return;
    const isVideoFrame = activeFrame.mediaType === 'video' || isVideoUrl(activeFrame.mediaUrl);
    if (isVideoFrame) return;

    if (reducedMotion) {
      const timeoutId = setTimeout(() => goNextFrame(), DEFAULT_DURATION);
      return () => clearTimeout(timeoutId);
    }

    const intervalId = setInterval(() => {
      setProgress((prev) => {
        const next = prev + TICK_MS / DEFAULT_DURATION;
        if (next >= 1) {
          clearInterval(intervalId);
          goNextFrame();
          return 0;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(intervalId);
  }, [activeFrame?.frameId, isPaused, isLoading, goNextFrame, reducedMotion, frameIndex, highlight?.frames.length]);

  // Video position-based progress + auto-advance at end
  React.useEffect(() => {
    if (!isVideo || isPaused || isLoading) return;
    if (frameIndex >= (highlight?.frames.length ?? 1) - 1) return;
    if (videoDuration > 0 && videoPosition >= videoDuration && videoPosition > 0) {
      goNextFrame();
    }
  }, [videoPosition, videoDuration, isVideo, isPaused, isLoading, frameIndex, highlight?.frames.length, goNextFrame]);

  const videoProgress = videoDuration > 0 ? videoPosition / videoDuration : 0;

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingBody}>
          {/* Skeleton block matching the media area on a dark background */}
          <SkeletonLoader
            width={SCREEN_WIDTH}
            height={SCREEN_HEIGHT * 0.6}
            borderRadius={Radius.none}
          />
        </View>
      </View>
    );
  }

  // Error state
  if (loadError || !highlight || !activeFrame) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.errorBody}>
          <Ionicons name="alert-circle-outline" size={ERROR_ICON_SIZE} color="rgba(255,255,255,0.6)" />
          <Text style={styles.errorText}>Could not load highlight</Text>
          <View style={styles.errorBtnRow}>
            <AnimatedPressable
              onPress={() => {
                haptic.light();
                setHighlight(null);
                setLoadError(false);
                setMediaError(false);
                setFrameIndex(0);
                setProgress(0);
                setIsLoading(true);
                setReloadKey((k) => k + 1);
              }}
              style={styles.errorBtn}
              scaleValue={0.97}
              hapticFeedback="light"
              activeOpacity={0.85}
              accessibilityLabel="Retry loading highlight"
              accessibilityHint="Retries loading the highlight data"
              accessibilityRole="button"
            >
              <Text style={styles.errorBtnText}>Retry</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    );
  }

  const isSingleFrame = highlight.frames.length <= 1;

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={dismissPanGesture}>
        <View style={StyleSheet.absoluteFill}>
      <StatusBar barStyle="light-content" />

      {/* Media layer */}
      <View style={styles.mediaLayer}>
        {isVideo && activeFrame.mediaUrl ? (
          <Video
            key={`hl-video-${activeFrame.frameId}-${mediaRetryKey}`}
            source={{ uri: activeFrame.mediaUrl }}
            style={styles.mediaFull}
            shouldPlay={!isPaused}
            isMuted={isMuted}
            isLooping={false}
            resizeMode="cover"
            onError={() => setMediaError(true)}
            playerRef={playerRef}
            onPlaybackStatusUpdate={(status) => {
              setVideoPosition(status.positionMillis);
              setVideoDuration(status.durationMillis);
            }}
          />
        ) : activeFrame.mediaUrl ? (
          <CachedImage
            key={`hl-img-${activeFrame.frameId}-${mediaRetryKey}`}
            uri={activeFrame.mediaUrl}
            style={styles.mediaFull}
            contentFit="cover"
            containerStyle={StyleSheet.absoluteFill}
            onError={() => setMediaError(true)}
          />
        ) : (
          <View style={[styles.mediaFull, { backgroundColor: activeFrame.backgroundColor || '#1a1a1a' }]}>
            <Text style={styles.textFrameCaption}>{activeFrame.caption}</Text>
          </View>
        )}
      </View>

      {/* Media error overlay with retry */}
      {mediaError && (
        <View style={styles.mediaErrorOverlay}>
          <Ionicons name="alert-circle-outline" size={ERROR_ICON_SIZE} color="rgba(255,255,255,0.7)" />
          <Text style={styles.mediaErrorText}>Unable to load media</Text>
          <AnimatedPressable
            onPress={handleRetryMedia}
            style={styles.retryBtn}
            scaleValue={0.97}
            hapticFeedback="medium"
            activeOpacity={0.85}
            accessibilityLabel="Retry loading media"
            accessibilityHint="Retries loading the media"
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={16} color="#fff" />
            <Text style={styles.retryBtnText}>Retry</Text>
          </AnimatedPressable>
        </View>
      )}

      {/* Pause indicator */}
      {isPaused && !mediaError && (
        <View style={styles.pauseIndicator} pointerEvents="none">
          <Ionicons name="pause" size={PAUSE_ICON_SIZE} color="rgba(255,255,255,0.7)" />
        </View>
      )}

      {/* Mute/unmute toggle for video frames */}
      {isVideo && !mediaError && (
        <AnimatedPressable
          onPress={() => {
            haptic.light();
            setIsMuted((m) => !m);
          }}
          style={[styles.muteBtn, { top: insets.top + 52, right: Space.smMd }]}
          scaleValue={0.97}
          hapticFeedback="light"
          activeOpacity={0.85}
          accessibilityLabel={isMuted ? 'Unmute video' : 'Mute video'}
          accessibilityHint="Toggles video audio"
          accessibilityRole="button"
        >
          <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
        </AnimatedPressable>
      )}

      {/* Scrubber bar for video frames */}
      {isVideo && !mediaError && videoDuration > 0 && (
        <View
          style={[styles.scrubberWrap, { bottom: insets.bottom + 160 }]}
          pointerEvents="box-none"
          onLayout={(e) => { scrubberBarWidth.current = e.nativeEvent.layout.width; }}
        >
          <Pressable
            style={styles.scrubberBar}
            onPress={(e) => {
              const barWidth = scrubberBarWidth.current || 1;
              const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth));
              if (playerRef.current && videoDuration > 0) {
                playerRef.current.currentTime = ratio * (videoDuration / 1000);
                setVideoPosition(ratio * videoDuration);
              }
              haptic.light();
            }}
            accessibilityLabel="Seek video"
            accessibilityRole="adjustable"
            accessibilityHint="Drag to seek through the video"
          >
            <View style={styles.scrubberTrack}>
              <View style={[styles.scrubberFill, { width: videoProgress * (scrubberBarWidth.current || 0) }]} />
              <View style={[styles.scrubberHandle, { left: videoProgress * (scrubberBarWidth.current || 0) }]} />
            </View>
          </Pressable>
        </View>
      )}

      {/* Dark overlay for readability */}
      <View style={styles.overlay} pointerEvents="box-none" />

      {/* Top gradient scrim — ensures progress bar, title, and close button
          are always legible regardless of media content. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.40)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']}
        locations={[0, 0.5, 1]}
        style={styles.topScrim}
        pointerEvents="none"
      />

      {/* Bottom gradient scrim — ensures caption and frame counter
          are readable over any media background. */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.85)']}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* Top bar: close + title */}
      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          scaleValue={0.97}
          hapticFeedback="light"
          activeOpacity={0.85}
          accessibilityLabel="Close highlight"
          accessibilityHint="Closes the highlight viewer"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={26} color="#fff" />
        </AnimatedPressable>
        <Text style={styles.topTitle} numberOfLines={1}>{highlight.title}</Text>
        <View style={styles.iconBtn} />
      </SafeAreaView>

      {/* Progress segments — hidden for single-frame highlights (no
          navigation needed, cleaner immersive view). */}
      {!isSingleFrame && (
        <View style={[styles.progressWrap, { top: insets.top + 52 }]} pointerEvents="none">
          <PosterProgressSegments
            total={highlight.frames.length}
            currentIndex={frameIndex}
            progress={isVideo ? videoProgress : progress}
            isPaused={isPaused}
            isLoading={isLoading}
            reducedMotion={reducedMotion}
          />
        </View>
      )}

      {/* Tap zones for frame navigation — only for multi-frame highlights.
          Single-frame highlights have no navigation, so tap zones are
          omitted to avoid confusing empty press targets. */}
      {!isSingleFrame && (
        <View
          style={[styles.tapLayer, { top: insets.top + 52, bottom: insets.bottom + 24 }]}
          pointerEvents="box-none"
        >
          <Pressable
            style={styles.tapLeft}
            onPress={goPrevFrame}
            onLongPress={() => { setIsPaused(true); haptic.light(); }}
            onPressOut={() => { if (isPaused) setIsPaused(false); }}
            accessibilityLabel="Previous frame"
            accessibilityRole="button"
          />
          <Pressable
            style={styles.tapRight}
            onPress={goNextFrame}
            onLongPress={() => { setIsPaused(true); haptic.light(); }}
            onPressOut={() => { if (isPaused) setIsPaused(false); }}
            accessibilityLabel="Next frame"
            accessibilityRole="button"
          />
        </View>
      )}

      {/* Caption (if present and not a text-only frame).
          3-line clamp with "more" tap to expand.
          Tappable (not pointerEvents="none") so the user can expand/collapse. */}
      {activeFrame.caption && activeFrame.mediaUrl && (
        <Pressable
          style={[styles.captionWrap, { bottom: insets.bottom + 24 }]}
          onPress={() => { haptic.selection(); setCaptionExpanded((v) => !v); }}
          accessibilityLabel={captionExpanded ? 'Collapse caption' : 'Expand caption'}
          accessibilityRole="button"
          accessibilityHint="Toggles caption expansion"
        >
          <Text
            style={styles.captionText}
            numberOfLines={captionExpanded ? undefined : 3}
          >
            {activeFrame.caption}
            {!captionExpanded && (
              <Text style={styles.captionMore}> … more</Text>
            )}
          </Text>
        </Pressable>
      )}

      {/* Frame counter — hidden for single-frame highlights */}
      {!isSingleFrame && (
        <View style={[styles.frameCounter, { bottom: insets.bottom + 8 }]} pointerEvents="none">
          <Text style={styles.frameCounterText}>
            {frameIndex + 1} / {highlight.frames.length}
          </Text>
        </View>
      )}
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
    },
    mediaLayer: {
      ...StyleSheet.absoluteFill,
    },
    mediaFull: {
      width: '100%',
      height: '100%',
    },
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    // Top gradient scrim — ensures chrome legibility over any media content
    topScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 140,
      zIndex: 5,
    },
    // Bottom gradient scrim — ensures caption/counter legibility over any media
    bottomScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 180,
      zIndex: 5,
    },
    loadingBody: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorBody: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: Space.md,
    },
    errorText: {
      color: 'rgba(255,255,255,0.8)',
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
    },
    errorBtnRow: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.xs,
    },
    errorBtn: {
      paddingHorizontal: Space.lg,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(255,255,255,0.15)',
    },
    errorBtnText: {
      color: '#fff',
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.sm,
      zIndex: 10,
    },
    iconBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.full,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    topTitle: {
      flex: 1,
      textAlign: 'center',
      color: '#fff',
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    progressWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      zIndex: 10,
    },
    tapLayer: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      zIndex: 5,
    },
    tapLeft: {
      flex: 1,
    },
    tapRight: {
      flex: 1,
    },
    captionWrap: {
      position: 'absolute',
      left: Space.md,
      right: Space.md,
    },
    captionText: {
      color: '#fff',
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight + 2,
      fontFamily: Typography.family.regular,
      textShadowColor: 'rgba(0,0,0,0.7)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 8,
    },
    captionMore: {
      color: 'rgba(255,255,255,0.7)',
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
    },
    textFrameCaption: {
      color: '#fff',
      fontSize: Type.title.size,
      fontFamily: Typography.family.bold,
      textAlign: 'center',
      padding: Space.lg,
    },
    frameCounter: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    frameCounterText: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      backgroundColor: 'rgba(0,0,0,0.35)',
      paddingHorizontal: Space.smMd,
      paddingVertical: Space.xs - 1,
      borderRadius: Radius.full,
      letterSpacing: 0.3,
    },
    mediaErrorOverlay: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.7)',
      gap: Space.smMd,
      zIndex: 25,
    },
    mediaErrorText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
      color: '#fff',
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.md + 4,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    retryBtnText: {
      color: '#fff',
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    pauseIndicator: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginLeft: -(Control.hit / 2),
      marginTop: -(Control.hit / 2),
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 15,
    },
    muteBtn: {
      position: 'absolute',
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(0,0,0,0.28)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 12,
    },
    scrubberWrap: {
      position: 'absolute',
      left: Space.lg,
      right: Space.lg,
      zIndex: 11,
    },
    scrubberBar: {
      height: Control.hit,
      justifyContent: 'center',
    },
    scrubberTrack: {
      height: 3,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(255,255,255,0.25)',
      overflow: 'visible',
    },
    scrubberFill: {
      height: 3,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(255,255,255,0.9)',
    },
    scrubberHandle: {
      position: 'absolute',
      top: -4,
      width: 11,
      height: 11,
      marginLeft: -5.5,
      borderRadius: Radius.full,
      backgroundColor: '#fff',
    },
  });
}
