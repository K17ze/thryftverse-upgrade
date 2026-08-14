import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  Dimensions,
  AppState,
  Image,
  Alert,
  ActivityIndicator,
  AccessibilityInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import {
  fetchPosterStories,
  fetchPosterStoryById,
  recordPosterFrameView,
  setPosterFrameReaction,
  removePosterFrameReaction,
  createPosterReply,
  deletePosterStory,
  archivePosterStory,
  fetchPosterTags,
  recordPosterTagClick,
} from '../services/postersApi';
import type {
  PosterStory,
  PosterFrame,
  PosterReactionType,
  PosterTag,
} from '../services/postersApi';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { HapticPatterns } from '../utils/hapticPatterns';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Type, Typography, Space, Radius, Control, LetterSpacing } from '../theme/designTokens';
import { Motion } from '../theme/motionTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PosterViewerSkeleton } from '../components/skeletons/PosterViewerSkeleton';
import { PosterProgressSegments } from '../components/poster/PosterProgressSegments';
import { PosterStickerLayer } from '../components/poster/PosterStickerLayer';
import { PosterReactionReplyBar } from '../components/poster/PosterReactionReplyBar';
import { ShareSheet } from '../components/ShareSheet';
import { CachedImage } from '../components/CachedImage';
import { VerificationBadge } from '../components/profile/VerificationBadge';
import { Video } from '../components/compat/Video';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
  cancelAnimation,
  Easing as ReEasing,
} from 'react-native-reanimated';
import { safeValidateDocument, type CreatorDocument } from '../creator/composition';
import { CreatorCanvas } from '../creator/CreatorCanvas';
import * as Clipboard from 'expo-clipboard';
import { Sentry } from '../platform/monitoring';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TICK_MS = 50;
const LONG_PRESS_THRESHOLD_MS = 350;
const SWIPE_THRESHOLD = 40;
const DOUBLE_TAP_DEBOUNCE_MS = 300;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_DOUBLE_TAP = 2.5;
const SPRING_SETTLE = Motion.spring.entrance;

// Rubber-band clamp: allows overscroll but with diminishing resistance.
function rubberBand(value: number, min: number, max: number, friction = 0.24): number {
  'worklet';
  if (value < min) return min + (value - min) * friction;
  if (value > max) return max + (value - max) * friction;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'PosterViewer'>;

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|m4v|webm|quicktime)(\?|$)/i.test(url);
}

// Lighten/darken a hex color by a percentage (-100..100). Used to derive a
// gradient end-color from the text-frame background for Instagram Create-mode
// style depth. Falls back to the original color on parse failure.
function shadeColor(hex: string, percent: number): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return hex;
  const num = parseInt(cleaned, 16);
  if (Number.isNaN(num)) return hex;
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default function PosterViewerScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const [stories, setStories] = React.useState<PosterStory[]>([]);
  const [storyIndex, setStoryIndex] = React.useState(0);
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [mediaError, setMediaError] = React.useState(false);
  const [recordedFrames, setRecordedFrames] = React.useState<Set<string>>(new Set());
  const [posterTags, setPosterTags] = React.useState<PosterTag[]>([]);
  const [shareVisible, setShareVisible] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(true);
  const [mediaRetryKey, setMediaRetryKey] = React.useState(0);
  const [isBuffering, setIsBuffering] = React.useState(false);
  const [heartBurst, setHeartBurst] = React.useState<{ id: number; x: number; y: number } | null>(null);
  // Caption expand/collapse — Instagram pattern: 3-line clamp with "more" tap.
  const [captionExpanded, setCaptionExpanded] = React.useState(false);

  // Double-tap detection: track last tap timestamp to distinguish double-tap
  // (heart reaction) from single-tap (frame navigation).
  const lastTapRef = React.useRef(0);
  const heartBurstIdRef = React.useRef(0);

  // 300ms debounce guard to prevent multiple heart bursts from rapid tapping.
  const lastHeartBurstRef = React.useRef(0);

  // Track whether a long-press fired during the current touch to avoid
  // advancing the frame when the user releases after a hold-pause.
  const didLongPressRef = React.useRef(false);

  // Single-tap timer for delayed frame navigation (double-tap detection).
  const singleTapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const storyId = route.params?.storyId;
  const startFrameIndex = route.params?.startFrameIndex ?? 0;

  React.useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    const loadStories = async () => {
      try {
        if (storyId) {
          const story = await fetchPosterStoryById(storyId);
          if (!mounted) return;
          setStories([story]);
          setStoryIndex(0);
          setFrameIndex(Math.min(startFrameIndex, story.frames.length - 1));
        } else {
          const res = await fetchPosterStories({ active: true, limit: 50 });
          if (!mounted) return;
          setStories(res.items);
          setStoryIndex(0);
          setFrameIndex(0);
        }
      } catch {
        if (mounted) show('Could not load poster stories', 'error');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadStories();
    return () => { mounted = false; };
  }, [storyId, startFrameIndex, show]);

  // Clear recorded-frames set when the storyId changes so view counts are
  // re-recorded for a freshly opened story (prevents stale-set memory leak).
  React.useEffect(() => {
    setRecordedFrames(new Set());
  }, [storyId]);

  const activeStory = stories[storyIndex];
  const activeFrame: PosterFrame | undefined = activeStory?.frames[frameIndex];
  const isOwner = !!activeStory && !!currentUser && activeStory.creatorId === currentUser.id;

  // Reset caption expansion whenever the frame changes so each frame starts
  // in its collapsed (3-line clamp) state.
  React.useEffect(() => {
    setCaptionExpanded(false);
  }, [activeFrame?.id]);

  // Parse the canonical composition document for WYSIWYG rendering. When
  // present, each page maps to a story frame and is rendered through the
  // same CreatorCanvas used in the editor, preserving all layers, geometry,
  // styles, and background.
  const compositionDoc = React.useMemo<CreatorDocument | null>(() => {
    if (!activeStory?.compositionDocument) return null;
    const result = safeValidateDocument(activeStory.compositionDocument);
    if (result.success && result.data && result.data.type === 'poster') {
      return result.data;
    }
    return null;
  }, [activeStory?.compositionDocument]);

  const compositionPage = compositionDoc?.pages[frameIndex] ?? null;

  const goNextFrame = React.useCallback(() => {
    setProgress(0);
    if (!activeStory) return;
    if (frameIndex < activeStory.frames.length - 1) {
      haptic.selection();
      setFrameIndex(frameIndex + 1);
      AccessibilityInfo.announceForAccessibility(
        `Frame ${frameIndex + 2} of ${activeStory.frames.length}`
      );
    } else if (storyIndex < stories.length - 1) {
      haptic.selection();
      const nextStory = stories[storyIndex + 1];
      const nextCreator = nextStory?.creator?.username ?? nextStory?.creatorId ?? '';
      setStoryIndex(storyIndex + 1);
      setFrameIndex(0);
      AccessibilityInfo.announceForAccessibility(
        `Now viewing ${nextCreator}'s poster. Frame 1 of ${nextStory?.frames.length ?? 1}`
      );
    }
    // At the last frame of the last story, do NOT auto-exit.
    // Instagram/Snapchat pattern: user must manually swipe down or tap X.
    // The progress timer simply stops advancing.
  }, [activeStory, frameIndex, storyIndex, stories.length, stories, haptic]);

  const goPrevFrame = React.useCallback(() => {
    setProgress(0);
    if (frameIndex > 0) {
      haptic.selection();
      setFrameIndex(frameIndex - 1);
      AccessibilityInfo.announceForAccessibility(
        `Frame ${frameIndex} of ${activeStory?.frames.length ?? 1}`
      );
    } else if (storyIndex > 0) {
      haptic.selection();
      const prevStory = stories[storyIndex - 1];
      const prevCreator = prevStory?.creator?.username ?? prevStory?.creatorId ?? '';
      const prevFrameCount = prevStory?.frames.length ?? 1;
      setStoryIndex(storyIndex - 1);
      setFrameIndex(Math.max(0, prevFrameCount - 1));
      AccessibilityInfo.announceForAccessibility(
        `Now viewing ${prevCreator}'s poster. Frame ${prevFrameCount} of ${prevFrameCount}`
      );
    }
  }, [frameIndex, storyIndex, stories, activeStory, haptic]);

  // ── Story transition — flat scale/fade (flagship restraint) ─────────
  // Per audit: the 3D cube rotation reads as a "demo effect" rather than
  // flagship restraint. Replaced with a flatter spatial transition:
  // horizontal edge continuity + small scale/fade only, keeping the
  // progress bar and header stable. Reduced-motion = no transform.
  const storyScale = useSharedValue(1);
  const storyOpacity = useSharedValue(1);
  const prevStoryIndexRef = React.useRef(storyIndex);

  React.useEffect(() => {
    if (prevStoryIndexRef.current === storyIndex) return;
    prevStoryIndexRef.current = storyIndex;
    if (reducedMotion) {
      storyScale.value = 1;
      storyOpacity.value = 1;
      return;
    }
    // Subtle scale dip (0.94→1) + brief opacity fade (0.5→1) for a
    // clean crossfade that preserves edge continuity without a 3D demo.
    storyScale.value = 0.94;
    storyOpacity.value = 0.5;
    storyScale.value = withSpring(1, Motion.spring.entrance);
    storyOpacity.value = withSpring(1, Motion.spring.entrance);
  }, [storyIndex, storyScale, storyOpacity, reducedMotion]);

  const storyAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: storyScale.value }],
    opacity: storyOpacity.value,
  }));

  // Skip to the next story (account) — used by swipe-left gesture.
  const goNextStory = React.useCallback(() => {
    setProgress(0);
    if (storyIndex < stories.length - 1) {
      haptic.selection();
      setStoryIndex(storyIndex + 1);
      setFrameIndex(0);
    }
  }, [storyIndex, stories.length, haptic]);

  // Go to the previous story (account) — used by swipe-right gesture.
  const goPrevStory = React.useCallback(() => {
    setProgress(0);
    if (storyIndex > 0) {
      haptic.selection();
      setStoryIndex(storyIndex - 1);
      setFrameIndex(0);
    }
  }, [storyIndex, haptic]);

  const handleDelete = async () => {
    if (!activeStory || !isOwner) return;
    haptic.medium();
    Alert.alert(
      'Delete story?',
      'This will permanently remove your poster story.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePosterStory(activeStory.id);
              show('Story deleted', 'info');
              navigation.goBack();
            } catch {
              show('Failed to delete story', 'error');
            }
          },
        },
      ]
    );
  };

  const handleArchive = async () => {
    if (!activeStory || !isOwner) return;
    haptic.medium();
    try {
      await archivePosterStory(activeStory.id);
      show('Story archived', 'info');
      navigation.goBack();
    } catch {
      show('Failed to archive story', 'error');
    }
  };

  // Record view when frame changes
  React.useEffect(() => {
    if (!activeFrame || !activeStory || isOwner) return;
    if (recordedFrames.has(activeFrame.id)) return;

    setRecordedFrames((prev) => new Set(prev).add(activeFrame.id));
    recordPosterFrameView(activeFrame.id).catch((err: unknown) => { Sentry.captureException?.(err); });
  }, [activeFrame?.id, activeStory, isOwner, recordedFrames]);

  // Fetch shoppable product tags for the active poster story. Tags are
  // scoped to the poster (story), so we refetch whenever the active story
  // changes. The hotspots themselves are only rendered for the current frame.
  React.useEffect(() => {
    if (!activeStory) {
      setPosterTags([]);
      return;
    }
    let mounted = true;
    fetchPosterTags(activeStory.id)
      .then((res) => {
        if (mounted) setPosterTags(res.tags ?? []);
      })
      .catch(() => {
        if (mounted) setPosterTags([]);
      });
    return () => { mounted = false; };
  }, [activeStory?.id]);

  // Preload the next frame's media and the first frame of the next story
  // to eliminate blank-spinner gaps during navigation (Snapchat/Instagram
  // three-layer preloading pattern).
  React.useEffect(() => {
    if (!activeStory) return;

    const nextFrame = activeStory.frames[frameIndex + 1];
    if (nextFrame?.mediaUrl && !isVideoUrl(nextFrame.mediaUrl)) {
      Image.prefetch(nextFrame.mediaUrl).catch((err: unknown) => { Sentry.captureException?.(err); });
    }

    const nextStory = stories[storyIndex + 1];
    const nextStoryFirstFrame = nextStory?.frames[0];
    if (nextStoryFirstFrame?.mediaUrl && !isVideoUrl(nextStoryFirstFrame.mediaUrl)) {
      Image.prefetch(nextStoryFirstFrame.mediaUrl).catch((err: unknown) => { Sentry.captureException?.(err); });
    }
  }, [activeStory, frameIndex, stories, storyIndex]);

  // Pause when app goes to background
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState !== 'active') setIsPaused(true);
    });
    return () => sub.remove();
  }, []);

  // Auto-advance timer
  React.useEffect(() => {
    if (!activeFrame || isPaused || isLoading) return;

    // At the last frame of the last story, don't auto-advance — let the user
    // manually exit (Instagram/Snapchat pattern).
    const isLastFrameOfLastStory =
      frameIndex >= (activeStory?.frames.length ?? 1) - 1 &&
      storyIndex >= stories.length - 1;
    if (isLastFrameOfLastStory) return;

    // Reduced-motion: skip the animated progress and just advance after the
    // full duration, so there's no visible progress animation.
    if (reducedMotion) {
      const duration = activeFrame.durationMs || 5000;
      const timeoutId = setTimeout(() => {
        goNextFrame();
      }, duration);
      return () => clearTimeout(timeoutId);
    }

    const duration = activeFrame.durationMs || 5000;
    const intervalId = setInterval(() => {
      setProgress((prev) => {
        const next = prev + TICK_MS / duration;
        if (next >= 1) {
          clearInterval(intervalId);
          goNextFrame();
          return 0;
        }
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(intervalId);
  }, [activeFrame?.id, isPaused, isLoading, goNextFrame, reducedMotion, frameIndex, storyIndex, activeStory?.frames.length, stories.length]);

  // Reset media error, pause, and buffering state when frame changes.
  // For video frames, set buffering=true so the indicator shows until onLoad fires.
  // A short delay threshold prevents the buffering indicator from flashing
  // for videos that load quickly (Instagram pattern: only show after ~400ms).
  React.useEffect(() => {
    setMediaError(false);
    setIsPaused(false);
    const isVideoFrame = activeFrame?.mediaType === 'video' ||
      (activeFrame?.mediaUrl && isVideoUrl(activeFrame.mediaUrl));
    if (isVideoFrame) {
      // Delay showing the buffering indicator to avoid flash on fast loads.
      const thresholdTimer = setTimeout(() => setIsBuffering(true), 400);
      return () => clearTimeout(thresholdTimer);
    }
    setIsBuffering(false);
  }, [activeFrame?.id, activeFrame?.mediaType, activeFrame?.mediaUrl]);

  // ── Pinch-to-zoom shared values (image frames only) ────────────────
  const zoomScale = useSharedValue(1);
  const zoomSavedScale = useSharedValue(1);
  const zoomTranslateX = useSharedValue(0);
  const zoomTranslateY = useSharedValue(0);
  const zoomSavedTranslateX = useSharedValue(0);
  const zoomSavedTranslateY = useSharedValue(0);
  const [isZoomed, setIsZoomed] = React.useState(false);

  // Reset zoom whenever the frame changes — prevents carrying zoom state
  // across frames. Respects reducedMotion (instant, no animation).
  React.useEffect(() => {
    if (reducedMotion) {
      zoomScale.value = 1;
      zoomSavedScale.value = 1;
      zoomTranslateX.value = 0;
      zoomTranslateY.value = 0;
      zoomSavedTranslateX.value = 0;
      zoomSavedTranslateY.value = 0;
    } else {
      cancelAnimation(zoomScale);
      cancelAnimation(zoomTranslateX);
      cancelAnimation(zoomTranslateY);
      zoomScale.value = 1;
      zoomSavedScale.value = 1;
      zoomTranslateX.value = 0;
      zoomTranslateY.value = 0;
      zoomSavedTranslateX.value = 0;
      zoomSavedTranslateY.value = 0;
    }
  }, [activeFrame?.id, reducedMotion, zoomScale, zoomSavedScale, zoomTranslateX, zoomTranslateY, zoomSavedTranslateX, zoomSavedTranslateY]);

  // Track zoom state in React for conditional gesture enabling.
  useAnimatedReaction(
    () => zoomScale.value > 1.01,
    (isZoomedNow, wasZoomed) => {
      if (isZoomedNow !== wasZoomed) {
        runOnJS(setIsZoomed)(isZoomedNow);
      }
    }
  );

  const zoomAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: zoomTranslateX.value },
      { translateY: zoomTranslateY.value },
      { scale: zoomScale.value },
    ],
  }));

  // ── Image zoom gestures (pinch + pan + double-tap toggle) ───────────
  // Only active for image frames (not videos, not composition docs).
  const isImageFrame = !compositionDoc && !!activeFrame?.mediaUrl &&
    activeFrame.mediaType !== 'video' && !isVideoUrl(activeFrame.mediaUrl);

  const zoomPinchGesture = React.useMemo(
    () =>
      Gesture.Pinch()
        .enabled(isImageFrame)
        .onStart(() => {
          zoomSavedScale.value = zoomScale.value;
        })
        .onUpdate((e) => {
          const newScale = zoomSavedScale.value * e.scale;
          zoomScale.value = clamp(newScale, ZOOM_MIN, ZOOM_MAX);
        })
        .onEnd(() => {
          if (zoomScale.value < ZOOM_MIN) {
            zoomScale.value = withSpring(ZOOM_MIN, SPRING_SETTLE);
            zoomTranslateX.value = withSpring(0, SPRING_SETTLE);
            zoomTranslateY.value = withSpring(0, SPRING_SETTLE);
            zoomSavedScale.value = ZOOM_MIN;
            zoomSavedTranslateX.value = 0;
            zoomSavedTranslateY.value = 0;
          } else if (zoomScale.value > ZOOM_MAX) {
            zoomScale.value = withSpring(ZOOM_MAX, SPRING_SETTLE);
            zoomSavedScale.value = ZOOM_MAX;
          } else {
            zoomSavedScale.value = zoomScale.value;
          }
        }),
    [isImageFrame, zoomScale, zoomSavedScale, zoomTranslateX, zoomTranslateY, zoomSavedTranslateX, zoomSavedTranslateY]
  );

  const zoomPanGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(isImageFrame && isZoomed)
        .onStart(() => {
          zoomSavedTranslateX.value = zoomTranslateX.value;
          zoomSavedTranslateY.value = zoomTranslateY.value;
        })
        .onUpdate((e) => {
          const zoomLevel = Math.max(zoomScale.value, zoomSavedScale.value);
          if (zoomLevel <= 1) return;
          const maxTransX = (SCREEN_WIDTH * (zoomLevel - 1)) / 2;
          const maxTransY = (SCREEN_HEIGHT * (zoomLevel - 1)) / 2;
          const nextX = zoomSavedTranslateX.value + e.translationX;
          const nextY = zoomSavedTranslateY.value + e.translationY;
          zoomTranslateX.value = rubberBand(nextX, -maxTransX, maxTransX);
          zoomTranslateY.value = rubberBand(nextY, -maxTransY, maxTransY);
        })
        .onEnd((e) => {
          const zoomLevel = Math.max(zoomScale.value, zoomSavedScale.value);
          if (zoomLevel <= 1) {
            zoomSavedTranslateX.value = 0;
            zoomSavedTranslateY.value = 0;
            zoomTranslateX.value = withSpring(0, SPRING_SETTLE);
            zoomTranslateY.value = withSpring(0, SPRING_SETTLE);
            return;
          }
          const maxTransX = (SCREEN_WIDTH * (zoomLevel - 1)) / 2;
          const maxTransY = (SCREEN_HEIGHT * (zoomLevel - 1)) / 2;
          const projectedX = zoomTranslateX.value + e.velocityX * 0.08;
          const projectedY = zoomTranslateY.value + e.velocityY * 0.08;
          const targetX = clamp(projectedX, -maxTransX, maxTransX);
          const targetY = clamp(projectedY, -maxTransY, maxTransY);
          zoomSavedTranslateX.value = targetX;
          zoomSavedTranslateY.value = targetY;
          zoomTranslateX.value = withSpring(targetX, SPRING_SETTLE);
          zoomTranslateY.value = withSpring(targetY, SPRING_SETTLE);
        }),
    [isImageFrame, isZoomed, zoomScale, zoomSavedScale, zoomTranslateX, zoomTranslateY, zoomSavedTranslateX, zoomSavedTranslateY]
  );

  // Double-tap zoom toggle is integrated into the tap zone double-tap logic
  // (triggerHeartBurst) to avoid gesture conflicts with the tap layer that
  // sits on top of the image. See triggerHeartBurst for the zoom-toggle logic.

  // Compose zoom gestures: pinch + pan simultaneous.
  // Double-tap zoom toggle is handled by the tap zone gestures (which are
  // layered on top of the image) via triggerHeartBurst, so we don't include
  // a separate double-tap here to avoid gesture conflicts.
  const zoomComposedGesture = React.useMemo(
    () =>
      Gesture.Simultaneous(zoomPanGesture, zoomPinchGesture),
    [zoomPanGesture, zoomPinchGesture]
  );

  // ── Container swipe gesture (down=dismiss, left=next story, right=prev story, up=view profile) ──
  // Uses Gesture.Pan() with activeOffset thresholds so it only activates for
  // clear swipes, avoiding interference with tap zones and the reply input.
  const handleSwipeUpProfile = React.useCallback(() => {
    if (activeStory) {
      haptic.light();
      openProfile(navigation, activeStory.creatorId, currentUser?.id);
    }
  }, [activeStory, haptic, navigation, currentUser?.id]);

  const handleSwipeDismiss = React.useCallback(() => {
    haptic.heavy();
    navigation.goBack();
  }, [haptic, navigation]);

  const containerPanGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
        .activeOffsetY([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
        .onEnd((e) => {
          const { translationX: dx, translationY: dy } = e;
          // Swipe-down to dismiss (primary exit gesture per IG/Snapchat)
          if (dy > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
            runOnJS(handleSwipeDismiss)();
            return;
          }
          // Swipe-up to view creator profile
          if (dy < -SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
            runOnJS(handleSwipeUpProfile)();
            return;
          }
          // Horizontal swipe between stories (accounts)
          if (Math.abs(dx) > Math.abs(dy)) {
            if (dx < -SWIPE_THRESHOLD) {
              runOnJS(goNextStory)();
            } else if (dx > SWIPE_THRESHOLD) {
              runOnJS(goPrevStory)();
            }
          }
        }),
    [handleSwipeDismiss, handleSwipeUpProfile, goNextStory, goPrevStory]
  );

  // Cleanup single-tap timer on unmount to prevent frame advance after exit.
  React.useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
    };
  }, []);

  const handleReaction = React.useCallback(async (reaction: PosterReactionType) => {
    if (!activeFrame) return;
    haptic.light();
    try {
      await setPosterFrameReaction(activeFrame.id, reaction);
      AccessibilityInfo.announceForAccessibility('Reaction sent');
    } catch {
      haptic.error();
      show('Failed to set reaction', 'error');
    }
  }, [activeFrame, haptic, show]);

  // Double-tap to heart — Instagram core gesture. Uses a delayed single-tap
  // approach: on first tap, schedule frame advance after 280ms. If a second
  // tap arrives within that window, cancel the advance and trigger heart.
  // A 300ms debounce guard prevents multiple heart bursts from rapid tapping.

  const triggerHeartBurst = React.useCallback((x: number, y: number) => {
    // If zoomed in, double-tap zooms out instead of triggering a heart.
    if (zoomScale.value > 1) {
      zoomScale.value = reducedMotion ? 1 : withSpring(1, SPRING_SETTLE);
      zoomTranslateX.value = reducedMotion ? 0 : withSpring(0, SPRING_SETTLE);
      zoomTranslateY.value = reducedMotion ? 0 : withSpring(0, SPRING_SETTLE);
      zoomSavedScale.value = 1;
      zoomSavedTranslateX.value = 0;
      zoomSavedTranslateY.value = 0;
      return;
    }
    // Not zoomed: trigger heart reaction + zoom to 2.5x
    const now = Date.now();
    if (now - lastHeartBurstRef.current < DOUBLE_TAP_DEBOUNCE_MS) return;
    lastHeartBurstRef.current = now;
    HapticPatterns.like();
    setHeartBurst({
      id: ++heartBurstIdRef.current,
      x,
      y,
    });
    setTimeout(() => setHeartBurst(null), 2500);
    handleReaction('love');
    // Zoom to 2.5x on double-tap (only for image frames)
    if (isImageFrame) {
      zoomScale.value = reducedMotion ? ZOOM_DOUBLE_TAP : withSpring(ZOOM_DOUBLE_TAP, SPRING_SETTLE);
      zoomSavedScale.value = ZOOM_DOUBLE_TAP;
    }
  }, [haptic, handleReaction, reducedMotion, isImageFrame, zoomScale, zoomTranslateX, zoomTranslateY, zoomSavedScale, zoomSavedTranslateX, zoomSavedTranslateY]);

  const handleTapLeft = React.useCallback((absoluteX: number, absoluteY: number) => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    // If a pending single-tap exists, this is a double-tap → trigger heart
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
      if (activeFrame && activeStory?.allowReactions) {
        triggerHeartBurst(absoluteX, absoluteY);
      }
      return;
    }
    // Schedule single-tap (go to previous frame) after delay
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      goPrevFrame();
    }, 280);
  }, [activeFrame, activeStory?.allowReactions, triggerHeartBurst, goPrevFrame]);

  const handleTapRight = React.useCallback((absoluteX: number, absoluteY: number) => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
      if (activeFrame && activeStory?.allowReactions) {
        triggerHeartBurst(absoluteX, absoluteY);
      }
      return;
    }
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      goNextFrame();
    }, 280);
  }, [activeFrame, activeStory?.allowReactions, triggerHeartBurst, goNextFrame]);

  // ── Tap zone gestures (Gesture.Tap + Gesture.LongPress) ─────────────
  // Long-press callbacks for hold-to-pause (shared by both zones).
  const handleLongPressStart = React.useCallback(() => {
    didLongPressRef.current = true;
    setIsPaused(true);
    haptic.medium();
    AccessibilityInfo.announceForAccessibility('Paused');
  }, [haptic]);

  const handleLongPressEnd = React.useCallback(() => {
    if (didLongPressRef.current) {
      setIsPaused(false);
      AccessibilityInfo.announceForAccessibility('Resumed');
    }
  }, []);

  // Left zone: single-tap → prev frame, double-tap → heart, long-press → pause
  const tapLeftGesture = React.useMemo(
    () =>
      Gesture.Tap().onEnd((e, success) => {
        if (success) runOnJS(handleTapLeft)(e.absoluteX, e.absoluteY);
      }),
    [handleTapLeft]
  );

  const longPressLeftGesture = React.useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(LONG_PRESS_THRESHOLD_MS)
        .onStart(() => {
          runOnJS(handleLongPressStart)();
        })
        .onEnd(() => {
          runOnJS(handleLongPressEnd)();
        }),
    [handleLongPressStart, handleLongPressEnd]
  );

  // Right zone: single-tap → next frame, double-tap → heart, long-press → pause
  const tapRightGesture = React.useMemo(
    () =>
      Gesture.Tap().onEnd((e, success) => {
        if (success) runOnJS(handleTapRight)(e.absoluteX, e.absoluteY);
      }),
    [handleTapRight]
  );

  const longPressRightGesture = React.useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(LONG_PRESS_THRESHOLD_MS)
        .onStart(() => {
          runOnJS(handleLongPressStart)();
        })
        .onEnd(() => {
          runOnJS(handleLongPressEnd)();
        }),
    [handleLongPressStart, handleLongPressEnd]
  );

  // Compose each zone's tap + long-press as exclusive (long-press cancels tap)
  const leftZoneGesture = React.useMemo(
    () => Gesture.Exclusive(longPressLeftGesture, tapLeftGesture),
    [longPressLeftGesture, tapLeftGesture]
  );
  const rightZoneGesture = React.useMemo(
    () => Gesture.Exclusive(longPressRightGesture, tapRightGesture),
    [longPressRightGesture, tapRightGesture]
  );

  const handleRemoveReaction = async () => {
    if (!activeFrame) return;
    try {
      await removePosterFrameReaction(activeFrame.id);
    } catch {
      show('Failed to remove reaction', 'error');
    }
  };

  const handleReply = async (text: string) => {
    if (!activeFrame) return;
    try {
      const replyId = `reply_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
      await createPosterReply(activeFrame.id, { id: replyId, body: text });
      haptic.success();
      show('Reply sent', 'success');
      AccessibilityInfo.announceForAccessibility('Reply sent');
    } catch {
      haptic.error();
      show('Failed to send reply', 'error');
    }
  };

  const handleShare = () => {
    haptic.light();
    setShareVisible(true);
  };

  const handleCopyLink = async () => {
    if (!activeStory) return;
    haptic.light();
    const url = `https://thryftverse.com/story/${activeStory.id}`;
    try {
      await Clipboard.setStringAsync(url);
      show('Link copied', 'info');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  // Consolidated "more" menu — Instagram pattern. Archive, delete, and
  // copy-link are tucked into an action sheet so the top bar stays clean
  // (only mute + close remain visible). Owner-only actions are gated.
  const handleMoreMenu = () => {
    haptic.light();
    const options: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[] = [
      {
        text: 'Copy link',
        onPress: handleCopyLink,
      },
    ];
    if (isOwner) {
      options.push({
        text: 'Archive story',
        onPress: handleArchive,
      });
      options.push({
        text: 'Delete story',
        onPress: handleDelete,
        style: 'destructive',
      });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Story options', undefined, options);
  };

  const handleRetryMedia = () => {
    setMediaError(false);
    // Force media components to remount by incrementing a key.
    // This causes CachedImage/Video to re-fetch from the network.
    setMediaRetryKey((k) => k + 1);
    setProgress(0);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <PosterViewerSkeleton />
      </View>
    );
  }

  if (!activeStory || !activeFrame) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.emptyText}>No stories available</Text>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.closeBtn}
          scaleValue={0.97}
          activeOpacity={0.85}
          hapticFeedback="light"
          accessibilityLabel="Close"
          accessibilityHint="Closes the story viewer and returns to the previous screen"
        >
          <Text style={styles.closeBtnText}>Close</Text>
        </AnimatedPressable>
      </View>
    );
  }

  const creatorName = activeStory.creator.username ?? activeStory.creatorId;
  const minutesSincePosted = Math.max(1, Math.floor((Date.now() - new Date(activeStory.createdAt).getTime()) / (60 * 1000)));
  const postedTimeLabel = minutesSincePosted < 60 ? `${minutesSincePosted}m` : `${Math.floor(minutesSincePosted / 60)}h`;
  // Expiration time — shows how long until the story expires (24h lifecycle).
  const minutesUntilExpiry = Math.max(0, Math.floor((new Date(activeStory.expiresAt).getTime() - Date.now()) / (60 * 1000)));
  const expiryLabel = minutesUntilExpiry < 60
    ? `${minutesUntilExpiry}m left`
    : `${Math.floor(minutesUntilExpiry / 60)}h left`;
  const isVideo = activeFrame.mediaType === 'video' || (activeFrame.mediaUrl && isVideoUrl(activeFrame.mediaUrl));

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={containerPanGesture}>
        <View style={StyleSheet.absoluteFill}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background — canonical composition or legacy media.
          Wrapped in a Reanimated.View for the flat scale/fade story transition. */}
      <Reanimated.View style={[styles.mediaFull, storyAnimatedStyle]}>
      {compositionDoc && compositionPage ? (
        <CreatorCanvas
          document={compositionDoc}
          page={compositionPage}
          canvasWidth={SCREEN_WIDTH}
          canvasHeight={SCREEN_HEIGHT}
          mode="view"
        />
      ) : isVideo && activeFrame.mediaUrl ? (
        <Video
          key={`video-${activeFrame.id}-${mediaRetryKey}`}
          source={{ uri: activeFrame.mediaUrl }}
          style={styles.mediaFull}
          shouldPlay={!isPaused}
          isMuted={isMuted}
          isLooping={false}
          resizeMode="cover"
          onLoad={() => setIsBuffering(false)}
          onError={() => { setMediaError(true); setIsBuffering(false); }}
        />
      ) : activeFrame.mediaUrl ? (
        <GestureDetector gesture={zoomComposedGesture}>
          <Reanimated.View style={[styles.mediaFull, zoomAnimatedStyle]}>
            <CachedImage
              key={`img-${activeFrame.id}-${mediaRetryKey}`}
              uri={activeFrame.mediaUrl}
              style={styles.mediaFull}
              contentFit="cover"
              priority="high"
              containerStyle={StyleSheet.absoluteFill}
              onError={() => setMediaError(true)}
            />
          </Reanimated.View>
        </GestureDetector>
      ) : (
        <LinearGradient
          colors={[
            activeFrame.backgroundColor ?? '#1a1a1a',
            activeFrame.backgroundColor
              ? shadeColor(activeFrame.backgroundColor, -18)
              : '#0a0a0a',
          ]}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={styles.mediaFull}
        >
          {/* Subtle vignette for depth — Instagram Create-mode pattern */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)']}
            style={styles.textFrameVignette}
            pointerEvents="none"
          />
          <Text
            style={[
              styles.textFrameContent,
              { color: activeFrame.backgroundColor === '#ffffff' ? '#000' : '#fff' },
            ]}
          >
            {activeFrame.caption}
          </Text>
        </LinearGradient>
      )}
      </Reanimated.View>

      <View style={styles.backdropOverlay} />

      {/* Top gradient scrim — ensures progress bar, username, and close button
          are always legible regardless of media content. Instagram pattern.
          Slightly stronger at the top edge so the meta row reads cleanly over
          bright media (white backgrounds, light product photography). */}
      <LinearGradient
        colors={['rgba(0,0,0,0.50)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']}
        locations={[0, 0.55, 1]}
        style={styles.topScrim}
        pointerEvents="none"
      />

      {mediaError && (
        <View style={styles.mediaErrorOverlay}>
          <Ionicons name="alert-circle-outline" size={48} color="#fff" />
          <Text style={styles.mediaErrorText}>Unable to load media</Text>
          <AnimatedPressable
            onPress={handleRetryMedia}
            style={styles.retryBtn}
            activeOpacity={0.8}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel="Retry loading media"
            accessibilityHint="Reloads the story media"
          >
            <Ionicons name="refresh-outline" size={18} color="#fff" />
            <Text style={styles.retryBtnText}>Retry</Text>
          </AnimatedPressable>
        </View>
      )}

      {/* Pause indicator — subtle pill with "Paused" label (Instagram pattern).
          Appears only when paused by long-press. Refined from a bare circle
          to a soft pill so it reads as a status, not a loading spinner. */}
      {isPaused && !mediaError && (
        <View style={styles.pauseIndicator} pointerEvents="none">
          <Ionicons name="pause" size={16} color="rgba(255,255,255,0.85)" />
          <Text style={styles.pauseIndicatorText}>Paused</Text>
        </View>
      )}

      {/* Video buffering indicator — shows while video is loading/buffering.
          Instagram pattern: progress bar pauses, subtle spinner shows. */}
      {isBuffering && !mediaError && !isPaused && (
        <View style={styles.bufferingIndicator} pointerEvents="none">
          <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
        </View>
      )}

      {/* Double-tap heart burst — Instagram core gesture.
          Shows a floating heart at the tap location that scales up and fades. */}
      {heartBurst && (
        <HeartBurst key={heartBurst.id} x={heartBurst.x} y={heartBurst.y} reducedMotion={reducedMotion} />
      )}

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        {/* Progress segments for frames in current story */}
        <PosterProgressSegments
          total={activeStory.frames.length}
          currentIndex={frameIndex}
          progress={progress}
          isPaused={isPaused}
          isLoading={isLoading}
          reducedMotion={reducedMotion}
        />

        {/* Tap zones for frame navigation.
            The tap layer is positioned between the top meta row and the
            bottom footer using safe-area insets, so it never overlaps the
            reply bar or the top controls. Long-press on either zone pauses
            without advancing (the didLongPressRef flag prevents the tap
            from firing after a hold). */}
        <View
          style={[
            styles.tapLayer,
            { top: insets.top + 52, bottom: insets.bottom + 72 },
          ]}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={leftZoneGesture}>
            <Reanimated.View
              style={styles.tapLeft}
              accessible
              accessibilityLabel="Previous frame"
              accessibilityRole="button"
              accessibilityHint="Double-tap to go back, double-tap again to react with heart"
            />
          </GestureDetector>
          <GestureDetector gesture={rightZoneGesture}>
            <Reanimated.View
              style={styles.tapRight}
              accessible
              accessibilityLabel="Next frame"
              accessibilityRole="button"
              accessibilityHint="Double-tap to go forward, double-tap again to react with heart"
            />
          </GestureDetector>
        </View>

        {/* Top meta row */}
        <View style={styles.topMetaRow}>
          <AnimatedPressable
            style={styles.authorBtn}
            onPress={() => openProfile(navigation, activeStory.creatorId, currentUser?.id)}
            activeOpacity={0.85}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel={`Open @${creatorName} profile`}
            accessibilityRole="button"
            accessibilityHint="Opens the creator's profile"
          >
            {activeStory.creator.avatar ? (
              <CachedImage
                uri={activeStory.creator.avatar}
                style={styles.authorAvatar}
                containerStyle={{ borderRadius: Radius.full, overflow: 'hidden' }}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.authorAvatar, styles.authorAvatarPlaceholder]}>
                <Text style={styles.authorAvatarText}>{creatorName[0]?.toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.authorName}>@{creatorName}</Text>
            {activeStory.creator.isVerified && activeStory.creator.verificationTier && (
              <VerificationBadge tier={activeStory.creator.verificationTier} compact />
            )}
            <Text style={styles.postedTime}>{'\u2022'} {postedTimeLabel}</Text>
          </AnimatedPressable>

          <View style={styles.topControlRow}>
            <AnimatedPressable
              style={styles.topIconBtn}
              onPress={() => { haptic.patterns.toggle(); setIsMuted((m) => !m); }}
              activeOpacity={0.85}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityLabel={isMuted ? 'Unmute sound' : 'Mute sound'}
              accessibilityRole="button"
              accessibilityHint="Toggles audio playback for video frames"
            >
              <Ionicons name={isMuted ? 'volume-mute-outline' : 'volume-high-outline'} size={20} color="#fff" />
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.topIconBtn}
              onPress={handleMoreMenu}
              activeOpacity={0.85}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityLabel="More options"
              accessibilityRole="button"
              accessibilityHint="Opens story options: copy link, archive, delete"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.topIconBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityLabel="Close viewer"
              accessibilityRole="button"
              accessibilityHint="Closes the story viewer and returns to the previous screen"
            >
              <Ionicons name="close" size={22} color="#fff" />
            </AnimatedPressable>
          </View>
        </View>

        {/* Stickers overlay — skipped when rendering canonical composition,
            since the composition canvas already includes all layers */}
        {!compositionDoc && activeFrame.stickers.length > 0 && (
          <>
            <PosterStickerLayer
              stickers={activeFrame.stickers}
              containerWidth={SCREEN_WIDTH}
              containerHeight={SCREEN_HEIGHT}
            />
            {/* Mention sticker tap targets — the PosterStickerLayer renders
                stickers with pointerEvents="none" in view mode, so we overlay
                transparent Pressables at mention sticker positions for
                tap-to-view-profile functionality. */}
            <View style={styles.mentionTapLayer} pointerEvents="box-none">
              {activeFrame.stickers
                .filter((s) => s.type === 'mention' && s.payload.userId)
                .map((sticker) => (
                  <Pressable
                    key={sticker.id}
                    style={[
                      styles.mentionTapTarget,
                      {
                        left: sticker.x * SCREEN_WIDTH - 30,
                        top: sticker.y * SCREEN_HEIGHT - 24,
                      },
                    ]}
                    hitSlop={8}
                    accessibilityLabel={`View @${sticker.payload.username}'s profile`}
                    accessibilityRole="button"
                    accessibilityHint="Opens the mentioned user's profile"
                    onPress={() => {
                      if (sticker.payload.userId) {
                        haptic.light();
                        openProfile(navigation, sticker.payload.userId, currentUser?.id);
                      }
                    }}
                  />
                ))}
            </View>
          </>
        )}

        {/* Shoppable product tag hotspots — only for the current frame.
            Coordinates are normalized (0–1) relative to the frame media. */}
        {posterTags.length > 0 && (
          <View style={styles.tagLayer} pointerEvents="box-none">
            {posterTags.map((tag) => (
              <View
                key={tag.id}
                style={[
                  styles.tagHotspot,
                  {
                    left: tag.x * SCREEN_WIDTH,
                    top: tag.y * SCREEN_HEIGHT,
                  },
                ]}
              >
                <Pressable
                  hitSlop={12}
                  accessibilityLabel={tag.label}
                  accessibilityRole="button"
                  accessibilityHint="View tagged product"
                  onPress={() => handleTagPress(tag, activeStory, navigation, haptic, show)}
                  style={({ pressed }) => [
                    styles.tagDot,
                    pressed && styles.tagDotPressed,
                  ]}
                >
                  <View style={[styles.tagDotInner, { backgroundColor: colors.brand }]} />
                </Pressable>
                <View style={styles.tagLabelWrap}>
                  <Text style={styles.tagLabelText} numberOfLines={1}>
                    {tag.label}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Caption — skipped when rendering canonical composition.
            Instagram pattern: 3-line clamp with "more" tap to expand.
            The caption sits above the reply bar with deliberate spacing so
            the reply bar remains the primary interactive element. */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.82)']}
          style={[styles.footerGradient, { bottom: 0 }]}
          pointerEvents="none"
        />

        <View style={[styles.viewerFooter, { bottom: insets.bottom }]} pointerEvents="box-none">
          {!compositionDoc && activeFrame.caption && activeFrame.mediaType !== 'text' && (
            <Pressable
              style={styles.captionWrap}
              onPress={() => { haptic.selection(); setCaptionExpanded((v) => !v); }}
              accessibilityLabel={captionExpanded ? 'Collapse caption' : 'Expand caption'}
              accessibilityRole="button"
              accessibilityHint="Toggles caption expansion"
            >
              <Text
                style={styles.captionText}
                numberOfLines={captionExpanded ? undefined : 3}
              >
                <Text style={styles.captionAuthor}>@{creatorName} </Text>
                {activeFrame.caption}
                {!captionExpanded && (
                  <Text style={styles.captionMore}>… more</Text>
                )}
              </Text>
            </Pressable>
          )}

          {/* Subtle expiry indicator — moved here from the top meta row so the
              top stays clean (Instagram pattern). Sits between caption and
              reply bar as quiet metadata, not a loud badge. */}
          {!compositionDoc && (
            <Text style={styles.footerExpiry} pointerEvents="none">
              {expiryLabel}
            </Text>
          )}

          <PosterReactionReplyBar
            allowReactions={activeStory.allowReactions}
            allowReplies={activeStory.allowReplies}
            viewerReaction={activeFrame.viewerReaction}
            onReaction={handleReaction}
            onRemoveReaction={handleRemoveReaction}
            onReply={handleReply}
            isOwner={isOwner}
            viewerCount={activeStory.uniqueViewerCount}
            onShowActivity={() => navigation.navigate('PosterStoryActivity', { storyId: activeStory.id })}
            onShare={handleShare}
          />
        </View>
      </SafeAreaView>

      <ShareSheet
        visible={shareVisible}
        onDismiss={() => setShareVisible(false)}
        url={`https://thryftverse.com/story/${activeStory.id}`}
        title={`@${creatorName}'s story`}
        imageUri={activeFrame.mediaUrl || activeStory.creator.avatar || undefined}
      />
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

// Extracted tag-press handler to keep the component body focused on render.
function handleTagPress(
  tag: PosterTag,
  activeStory: PosterStory,
  navigation: NativeStackNavigationProp<RootStackParamList>,
  haptic: ReturnType<typeof useHaptic>,
  show: (message: string, type?: 'info' | 'error' | 'success') => void,
) {
  haptic.selection();
  recordPosterTagClick(activeStory.id, tag.id).catch((err: unknown) => { Sentry.captureException?.(err); });
  if (tag.listingId) {
    (navigation as unknown as { navigate: (route: string, params: Record<string, unknown>) => void })
      .navigate('ItemDetail', { itemId: tag.listingId });
  } else {
    show('This product is no longer available', 'info');
  }
}

// ── Heart burst particle component ─────────────────────────────────────
// Reanimated-based particle burst: 12–22 heart emoji particles explode
// outward with random velocity, gravity, rotation, scale, and fade.
// Respects reducedMotion (single heart fade only).
interface ParticleConfig {
  id: number;
  velX: number;
  velY: number;
  scale: number;
  rotSpeed: number;
}

const GRAVITY = 980; // pts/sec²
const LIFETIME_MS = 2500;
const FADE_DELAY_MS = 1500;

function HeartBurst({ x, y, reducedMotion }: { x: number; y: number; reducedMotion: boolean }) {
  // Reduced motion: single heart that fades out — no particle physics.
  if (reducedMotion) {
    return <ReducedMotionHeart x={x} y={y} />;
  }

  // Generate 12–22 particles with random initial properties.
  // Configs are generated once per burst (not per render).
  const configs = React.useMemo<ParticleConfig[]>(() => {
    const count = 12 + Math.floor(Math.random() * 11); // 12–22
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      velX: -200 + Math.random() * 400, // -200 to 200
      velY: -(400 + Math.random() * 400), // 400–800 upward
      scale: 0.6 + Math.random() * 0.6, // 0.6–1.2
      rotSpeed: -3 + Math.random() * 6, // -3 to 3 rad/sec
    }));
  }, []);

  return (
    <View style={[heartBurstStyles.container, { left: x, top: y }]} pointerEvents="none">
      {configs.map((cfg) => (
        <ParticleHeart key={cfg.id} config={cfg} />
      ))}
    </View>
  );
}

// Single particle heart — owns its shared values and physics animation.
function ParticleHeart({ config }: { config: ParticleConfig }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(config.scale);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    // Horizontal: constant velocity decay
    translateX.value = withTiming(config.velX * 0.8, {
      duration: LIFETIME_MS,
      easing: ReEasing.out(ReEasing.cubic),
    });

    // Vertical: initial upward, then gravity pulls down (two-phase)
    translateY.value = withTiming(config.velY * 0.5, {
      duration: 1200,
      easing: ReEasing.out(ReEasing.cubic),
    });
    const gravityTimer = setTimeout(() => {
      translateY.value = withTiming(GRAVITY * 0.3, {
        duration: 1300,
        easing: ReEasing.in(ReEasing.cubic),
      });
    }, 1200);

    // Rotation: constant angular velocity
    rotation.value = withTiming(config.rotSpeed, { duration: LIFETIME_MS });

    // Fade out after 1.5s
    const fadeTimer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 1000 });
    }, FADE_DELAY_MS);

    return () => {
      clearTimeout(gravityTimer);
      clearTimeout(fadeTimer);
    };
  }, [config, translateX, translateY, rotation, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotation.value}rad` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Reanimated.Text style={[heartBurstStyles.particle, animatedStyle]} allowFontScaling={false}>
      ❤️
    </Reanimated.Text>
  );
}

// Reduced-motion heart: single heart that scales up briefly and fades.
function ReducedMotionHeart({ x, y }: { x: number; y: number }) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0.8);

  React.useEffect(() => {
    scale.value = withTiming(1, { duration: 200 });
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 400 });
    }, 200);
    return () => clearTimeout(timer);
  }, [scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={[heartBurstStyles.container, { left: x, top: y }]} pointerEvents="none">
      <Reanimated.Text style={[heartBurstStyles.text, animatedStyle]} allowFontScaling={false}>
        ❤️
      </Reanimated.Text>
    </View>
  );
}

const heartBurstStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    transform: [{ translateX: -20 }, { translateY: -20 }],
    zIndex: 30,
  },
  text: {
    fontSize: 60,
  },
  particle: {
    position: 'absolute',
    fontSize: 28,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.md,
  },
  emptyText: {
    color: '#fff',
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  closeBtn: {
    paddingHorizontal: Space.md + 4,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    // Near-transparent chrome (Instagram/Snapchat pattern). Legibility
    // comes from the top scrim + text shadows, not an opaque pill fill.
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  closeBtnText: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  mediaFull: {
    position: 'absolute',
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textFrameContent: {
    fontFamily: Typography.family.bold,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    letterSpacing: Type.subtitle.letterSpacing,
    textAlign: 'center',
    paddingHorizontal: Space.xl,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  textFrameVignette: {
    ...StyleSheet.absoluteFill,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  // Top gradient scrim — ensures chrome legibility over any media content
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    zIndex: 5,
  },
  overlay: {
    flex: 1,
    paddingHorizontal: Space.sm + Space.xs,
  },
  // Tap layer positioned between the top meta row and the bottom footer
  // using safe-area insets. This replaces the fragile Space.xxl*10-40 math.
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
  topMetaRow: {
    marginTop: Space.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.xs + 2,
    zIndex: 10,
  },
  authorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    // Near-transparent chrome (Instagram/Snapchat pattern). The author
    // name + posted time carry text shadows for legibility over media.
    backgroundColor: 'rgba(0,0,0,0.08)',
    gap: Space.sm,
  },
  authorAvatar: {
    width: Space.lg + 4,
    height: Space.lg + 4,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorAvatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  authorAvatarText: {
    color: '#fff',
    fontFamily: Typography.family.bold,
    fontSize: Type.captionElevated.size,
  },
  authorName: {
    color: '#fff',
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.bold,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  postedTime: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  topIconBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    // Near-transparent chrome (Instagram/Snapchat pattern). Icons rely
    // on the top scrim for legibility rather than an opaque dark disc.
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  viewerFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: Space.sm + Space.xs,
    zIndex: 20,
  },
  captionWrap: {
    paddingBottom: Space.sm,
    // Deliberate breathing room above the reply bar so the caption reads
    // as authored content, not a label stuck to the input.
    marginBottom: Space.xs,
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
  captionAuthor: {
    fontFamily: Typography.family.semibold,
    fontWeight: '600',
  },
  captionMore: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
  footerExpiry: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    paddingBottom: Space.xs,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  footerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 200,
    zIndex: 5,
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
    marginLeft: -44,
    marginTop: -22,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md + 4,
    zIndex: 15,
  },
  pauseIndicatorText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: LetterSpacing.wide,
  },
  bufferingIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -16,
    marginTop: -16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  tagLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 15,
  },
  mentionTapLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 16,
  },
  mentionTapTarget: {
    position: 'absolute',
    width: 60,
    height: 48,
    borderRadius: Radius.full,
  },
  tagHotspot: {
    position: 'absolute',
    alignItems: 'center',
  },
  tagDot: {
    width: Space.lg,
    height: Space.lg,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  tagDotPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.9 }],
  },
  tagDotInner: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.full,
  },
  tagLabelWrap: {
    marginTop: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs - 1,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
    maxWidth: 140,
  },
  tagLabelText: {
    color: '#fff',
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: LetterSpacing.wide,
  },
});
