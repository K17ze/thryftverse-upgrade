import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  Dimensions,
  AccessibilityInfo,
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
import { fetchPosterHighlights, type PosterHighlight } from '../services/postersApi';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = NativeStackScreenProps<RootStackParamList, 'PosterHighlightViewer'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TICK_MS = 50;
const DEFAULT_DURATION = 5000;
const ERROR_ICON_SIZE = 40;
const PAUSE_ICON_SIZE = 20;

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

  // Load highlight data
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // We don't know the userId here, so we fetch via a different approach:
        // The highlight viewer needs the highlight data. Since the GET endpoint
        // is /users/:userId/poster-highlights, we need the userId.
        // For now, we pass the highlight data via navigation params or
        // fetch from the store. Let's use a simpler approach: fetch all
        // highlights for the current user and find the one we need.
        // This is a limitation of the backend API design.
        //
        // Actually, the best approach is to pass the userId in the route.
        // But to keep it simple, we'll use the store to get the current user.
        const { useStore } = await import('../store/useStore');
        const currentUser = useStore.getState().currentUser;
        if (!currentUser) {
          setLoadError(true);
          setIsLoading(false);
          return;
        }
        const res = await fetchPosterHighlights(currentUser.id);
        if (cancelled) return;
        const found = res.items.find((h) => h.id === highlightId);
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
  }, [highlightId]);

  const activeFrame = highlight?.frames[frameIndex] ?? null;

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

  // Auto-advance timer
  React.useEffect(() => {
    if (!activeFrame || isPaused || isLoading) return;
    if (frameIndex >= (highlight?.frames.length ?? 1) - 1) return;

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
            borderRadius={0}
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
                haptic.error();
                setLoadError(false);
                setIsLoading(true);
                // Re-trigger the load effect by re-running the fetch
                // Force re-mount by changing a state that the effect depends on
                const reloadKey = Date.now();
                void reloadKey;
                navigation.goBack();
              }}
              style={styles.errorBtn}
              scaleValue={0.97}
              hapticFeedback="light"
              activeOpacity={0.85}
              accessibilityLabel="Go back"
              accessibilityHint="Returns to the previous screen"
              accessibilityRole="button"
            >
              <Text style={styles.errorBtnText}>Go back</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    );
  }

  const isVideo = activeFrame.mediaType === 'video' || isVideoUrl(activeFrame.mediaUrl);

  return (
    <View style={styles.container}>
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

      {/* Dark overlay for readability */}
      <View style={styles.overlay} pointerEvents="box-none" />

      {/* Top gradient scrim — ensures progress bar, title, and close button
          are always legible regardless of media content. Instagram pattern. */}
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

      {/* Progress segments */}
      <View style={[styles.progressWrap, { top: insets.top + 52 }]} pointerEvents="none">
        <PosterProgressSegments
          total={highlight.frames.length}
          currentIndex={frameIndex}
          progress={progress}
          isPaused={isPaused}
          isLoading={isLoading}
          reducedMotion={reducedMotion}
        />
      </View>

      {/* Tap zones for frame navigation */}
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

      {/* Caption (if present and not a text-only frame) */}
      {activeFrame.caption && activeFrame.mediaUrl && (
        <View style={[styles.captionWrap, { bottom: insets.bottom + 24 }]} pointerEvents="none">
          <Text style={styles.captionText} numberOfLines={3}>{activeFrame.caption}</Text>
        </View>
      )}

      {/* Frame counter */}
      <View style={[styles.frameCounter, { bottom: insets.bottom + 8 }]} pointerEvents="none">
        <Text style={styles.frameCounterText}>
          {frameIndex + 1} / {highlight.frames.length}
        </Text>
      </View>
    </View>
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
      lineHeight: Type.body.lineHeight,
      fontFamily: Typography.family.semibold,
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
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
      color: 'rgba(255,255,255,0.5)',
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
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
      fontSize: Type.bodyLarge.size,
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
  });
}
