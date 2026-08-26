import React from 'react';
import { AccessibilityInfo, Dimensions } from 'react-native';
import {
  Gesture,
  type PanGesture,
  type SimultaneousGesture,
  type ExclusiveGesture,
} from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  withTiming,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useHaptic } from './useHaptic';
import { HapticPatterns } from '../utils/hapticPatterns';
import { Motion } from '../theme/motionTokens';
import { clamp, rubberBand, isVideoUrl } from '../utils/posterPhysics';
import type {
  PosterStory,
  PosterFrame,
  PosterReactionType,
} from '../services/postersApi';
import type { CreatorDocument } from '../creator/composition';

type NavT = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const LONG_PRESS_THRESHOLD_MS = 350;
const SWIPE_THRESHOLD = 40;
const DOUBLE_TAP_DEBOUNCE_MS = 300;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_DOUBLE_TAP = 2.5;
const SPRING_SETTLE = Motion.spring.entrance;
const DISMISS_THRESHOLD = 120; // px — 30% of typical screen height
const DISMISS_VELOCITY = 500;  // px/s — fast flick also dismisses

export interface PosterViewerGestureConfig {
  activeFrame: PosterFrame | undefined;
  activeStory: PosterStory | undefined;
  compositionDoc: CreatorDocument | null;
  reducedMotion: boolean;
  goPrevFrame: () => void;
  goNextFrame: () => void;
  goNextStory: () => void;
  goPrevStory: () => void;
  handleReaction: (reaction: PosterReactionType) => void;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
  navigation: NavT;
  haptic: ReturnType<typeof useHaptic>;
  currentUserId: string | undefined;
}

export interface PosterViewerGesture {
  containerPanGesture: PanGesture;
  dismissAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  zoomComposedGesture: SimultaneousGesture;
  zoomAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  leftZoneGesture: ExclusiveGesture;
  rightZoneGesture: ExclusiveGesture;
  heartBurst: { id: number; x: number; y: number } | null;
}

/**
 * Owns the poster viewer's gesture layer: pinch-to-zoom, zoom-pan,
 * double-tap heart / zoom-toggle, tap-zone frame navigation, long-press
 * pause, and container swipe (down=dismiss, left/right=story, up=profile).
 *
 * Mechanical extraction from PosterViewerScreen — no behaviour changes.
 */
export function usePosterViewerGesture(config: PosterViewerGestureConfig): PosterViewerGesture {
  const {
    activeFrame,
    activeStory,
    compositionDoc,
    reducedMotion,
    goPrevFrame,
    goNextFrame,
    goNextStory,
    goPrevStory,
    handleReaction,
    setIsPaused,
    navigation,
    haptic,
    currentUserId,
  } = config;

  const [heartBurst, setHeartBurst] = React.useState<{ id: number; x: number; y: number } | null>(null);

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

  // ── Pinch-to-zoom shared values (image frames only) ────────────────
  const zoomScale = useSharedValue(1);
  const zoomSavedScale = useSharedValue(1);
  const zoomTranslateX = useSharedValue(0);
  const zoomTranslateY = useSharedValue(0);
  const zoomSavedTranslateX = useSharedValue(0);
  const zoomSavedTranslateY = useSharedValue(0);
  const [isZoomed, setIsZoomed] = React.useState(false);

  // ── Swipe-down dismiss rubber-band ──────────────────────────────────
  // The content follows the finger downward with diminishing resistance
  // (rubber-band clamp), and scales down slightly. On release, if past
  // threshold it animates off-screen then dismisses; otherwise it springs
  // back to position. This matches Instagram/Snapchat's natural dismiss.
  const dismissTranslateY = useSharedValue(0);
  const dismissScale = useSharedValue(1);
  const dismissOpacity = useSharedValue(1);

  const dismissAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dismissTranslateY.value },
      { scale: dismissScale.value },
    ],
    opacity: dismissOpacity.value,
  }));

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
            zoomScale.value = reducedMotion ? ZOOM_MIN : withSpring(ZOOM_MIN, SPRING_SETTLE);
            zoomTranslateX.value = reducedMotion ? 0 : withSpring(0, SPRING_SETTLE);
            zoomTranslateY.value = reducedMotion ? 0 : withSpring(0, SPRING_SETTLE);
            zoomSavedScale.value = ZOOM_MIN;
            zoomSavedTranslateX.value = 0;
            zoomSavedTranslateY.value = 0;
          } else if (zoomScale.value > ZOOM_MAX) {
            zoomScale.value = reducedMotion ? ZOOM_MAX : withSpring(ZOOM_MAX, SPRING_SETTLE);
            zoomSavedScale.value = ZOOM_MAX;
          } else {
            zoomSavedScale.value = zoomScale.value;
          }
        }),
    [isImageFrame, reducedMotion, zoomScale, zoomSavedScale, zoomTranslateX, zoomTranslateY, zoomSavedTranslateX, zoomSavedTranslateY]
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
            zoomTranslateX.value = reducedMotion ? 0 : withSpring(0, SPRING_SETTLE);
            zoomTranslateY.value = reducedMotion ? 0 : withSpring(0, SPRING_SETTLE);
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
          zoomTranslateX.value = reducedMotion ? targetX : withSpring(targetX, SPRING_SETTLE);
          zoomTranslateY.value = reducedMotion ? targetY : withSpring(targetY, SPRING_SETTLE);
        }),
    [isImageFrame, isZoomed, reducedMotion, zoomScale, zoomSavedScale, zoomTranslateX, zoomTranslateY, zoomSavedTranslateX, zoomSavedTranslateY]
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
      openProfile(navigation, activeStory.creatorId, currentUserId);
    }
  }, [activeStory, haptic, navigation, currentUserId]);

  const handleSwipeDismiss = React.useCallback(() => {
    haptic.heavy();
    navigation.goBack();
  }, [haptic, navigation]);

  const containerPanGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
        .activeOffsetY([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
        .onUpdate((e) => {
          'worklet';
          const { translationX: dx, translationY: dy } = e;
          // Only apply rubber-band during swipe-down (dismiss direction)
          if (dy > 0 && Math.abs(dy) > Math.abs(dx)) {
            // Rubber-band: diminishing resistance past 0
            const clamped = rubberBand(dy, 0, SCREEN_HEIGHT * 0.5, 0.35);
            dismissTranslateY.value = clamped;
            // Scale down slightly as content drags away
            dismissScale.value = 1 - (clamped / SCREEN_HEIGHT) * 0.25;
            dismissOpacity.value = 1 - (clamped / SCREEN_HEIGHT) * 0.5;
          }
        })
        .onEnd((e) => {
          'worklet';
          const { translationX: dx, translationY: dy } = e;
          // Swipe-down to dismiss (primary exit gesture per IG/Snapchat)
          if (dy > 0 && Math.abs(dy) > Math.abs(dx)) {
            if (dy > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
              // Animate off-screen then dismiss
              dismissTranslateY.value = withSpring(SCREEN_HEIGHT, {
                damping: 18,
                stiffness: 200,
                mass: 0.8,
              });
              dismissScale.value = withSpring(0.85, {
                damping: 18,
                stiffness: 200,
              });
              dismissOpacity.value = withSpring(0, {
                damping: 18,
                stiffness: 200,
              });
              runOnJS(handleSwipeDismiss)();
              return;
            }
            // Spring back — didn't drag far enough
            dismissTranslateY.value = reducedMotion ? 0 : withSpring(0, SPRING_SETTLE);
            dismissScale.value = reducedMotion ? 1 : withSpring(1, SPRING_SETTLE);
            dismissOpacity.value = reducedMotion ? 1 : withSpring(1, SPRING_SETTLE);
            return;
          }
          // Reset any partial dismiss state
          if (dismissTranslateY.value !== 0) {
            dismissTranslateY.value = reducedMotion ? 0 : withSpring(0, SPRING_SETTLE);
            dismissScale.value = reducedMotion ? 1 : withSpring(1, SPRING_SETTLE);
            dismissOpacity.value = reducedMotion ? 1 : withSpring(1, SPRING_SETTLE);
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
    [handleSwipeDismiss, handleSwipeUpProfile, goNextStory, goPrevStory, reducedMotion, dismissTranslateY, dismissScale, dismissOpacity]
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
    // Not zoomed: trigger heart reaction ONLY (Instagram pattern).
    // Pinch-to-zoom handles zoom-in; double-tap is the heart gesture.
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
  }, [haptic, handleReaction, reducedMotion, zoomScale, zoomTranslateX, zoomTranslateY, zoomSavedScale, zoomSavedTranslateX, zoomSavedTranslateY]);

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

  return {
    containerPanGesture,
    dismissAnimatedStyle,
    zoomComposedGesture,
    zoomAnimatedStyle,
    leftZoneGesture,
    rightZoneGesture,
    heartBurst,
  };
}
