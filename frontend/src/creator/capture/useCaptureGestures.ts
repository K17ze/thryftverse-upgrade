// ── useCaptureGestures ───────────────────────────────────────────────
// Owns the capture gesture grammar of CreatorCamera — double-tap to
// flip, top-strip swipe-down to dismiss, pinch-to-zoom with the stepped
// baseline, and the hold-drag grammar (slide-to-zoom + slide-to-lock
// pill) plus the shutter tap/long-press arbitration that routes into
// useCameraRecording's lifecycles. Tap-to-focus lives here too — it is
// part of the same viewfinder touch grammar. Extracted verbatim; hook
// order and dependency arrays are unchanged apart from listing
// refs/setters that now arrive as options.

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import type { RefObject, Dispatch, SetStateAction } from 'react';
import {
  View,
  GestureResponderEvent,
  type StyleProp,
  type ViewStyle } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  type CameraRef,
  useCameraDevice } from 'react-native-vision-camera';
import { type SkiaCameraRef } from 'react-native-vision-camera-skia';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  runOnJS,
  type AnimatedStyle } from 'react-native-reanimated';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useToast } from '../../context/ToastContext';
import { Motion } from '../../theme/motionTokens';
import type { UseCameraReviewResult } from './useCameraReview';
import type { UseCameraRecordingResult } from './useCameraRecording';
import { DISMISS_ZONE_HEIGHT } from './captureConstants';

export interface UseCaptureGesturesOptions {
  onClose: () => void;
  toggleFacing: () => void;
  cameraRef: RefObject<CameraRef | SkiaCameraRef | null>;
  device: ReturnType<typeof useCameraDevice>;
  setFocusPoint: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  /** Stepped zoom baseline (ZOOM_STEPS[zoomIndex].value). */
  zoomValue: number;
  setZoomIndex: Dispatch<SetStateAction<0 | 1 | 2>>;
  /** Maximum captures the staging tray will accept. */
  maxCaptures?: number;
  haptic: ReturnType<typeof useHaptic>;
  show: ReturnType<typeof useToast>['show'];
  reducedMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  /** Synchronous hold state shared with useCameraRecording — set on
   *  long-press, cleared on press-out so a pending mic-permission await
   *  can abort the recording start once the finger lifts. */
  pressHeldRef: RefObject<boolean>;
  review: Pick<UseCameraReviewResult, 'multiCaptureMode' | 'multiCaptures'>;
  recording: Pick<
    UseCameraRecordingResult,
    | 'isRecording'
    | 'isRecordingSV'
    | 'stopRecording'
    | 'beginVideoRecording'
    | 'takePhoto'
    | 'startHandsFreeCapture'
    | 'cancelHandsFreeCountdown'
    | 'handsFreeMode'
    | 'handsFreeCountdown'
    | 'countdown'
    | 'setCountdown'
    | 'photoCountdownTokenRef'
  >;
}

export interface UseCaptureGesturesResult {
  doubleTapGesture: ReturnType<typeof Gesture.Tap>;
  swipeDownDismiss: ReturnType<typeof Gesture.Pan>;
  pinchGesture: ReturnType<typeof Gesture.Pinch>;
  /** Stepped baseline + pinch/slide delta, clamped to the device range. */
  effectiveZoom: number;
  zoomIndicatorStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  recordLocked: boolean;
  lockHot: boolean;
  lockZoneRef: RefObject<View | null>;
  handleShutterPress: () => void;
  handleShutterLongPress: () => void;
  handleShutterPressOut: () => void;
  handleHoldTouchStart: (x: number, y: number) => void;
  handleHoldTouchMove: (pageX: number, pageY: number) => void;
  handleTapFocus: (evt: GestureResponderEvent) => void;
}

export function useCaptureGestures({
  onClose,
  toggleFacing,
  cameraRef,
  device,
  setFocusPoint,
  zoomValue,
  setZoomIndex,
  maxCaptures,
  haptic,
  show,
  reducedMotion,
  spring,
  pressHeldRef,
  review,
  recording,
}: UseCaptureGesturesOptions): UseCaptureGesturesResult {
  const { multiCaptureMode, multiCaptures } = review;
  const {
    isRecording,
    isRecordingSV,
    stopRecording,
    beginVideoRecording,
    takePhoto,
    startHandsFreeCapture,
    cancelHandsFreeCountdown,
    handsFreeMode,
    handsFreeCountdown,
    countdown,
    setCountdown,
    photoCountdownTokenRef,
  } = recording;

  // Zoom indicator spring appearance
  const zoomIndicatorOpacity = useSharedValue(0);
  const zoomIndicatorScale = useSharedValue(0.8);

  // ── Press-and-hold video: track long-press state to suppress photo on release ──
  const isLongPressRef = useRef(false);

  // ── Zoom indicator: spring appearance ──
  const zoomIndicatorStyle = useAnimatedStyle(() => ({
    opacity: zoomIndicatorOpacity.value,
    transform: [{ scale: zoomIndicatorScale.value }] }));

  // ── Double-tap to switch camera ──
  const doubleTapGesture = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        'worklet';
        runOnJS(toggleFacing)();
      });
  }, [toggleFacing]);

  // ── Swipe-down to dismiss ──
  // A fast downward swipe from the top area closes the camera. Only
  // activates when the swipe starts in the top 120pt region and moves
  // predominantly downward, so it doesn't conflict with tap-to-focus
  // or the pinch-to-zoom gesture.
  const swipeDownDismiss = useMemo(() => {
    return Gesture.Pan()
      .minDistance(40)
      .minPointers(1)
      .maxPointers(1)
      // Directional grammar: only a committed downward drag activates.
      // Upward swipes and predominantly horizontal drags (staging tray
      // scroll, sheet pans) fail the gesture natively before activation.
      .activeOffsetY(30)
      .failOffsetY(-15)
      .failOffsetX([-30, 30])
      .onTouchesDown((e, manager) => {
        'worklet';
        // Origin gate: dismissal only applies to touches starting inside
        // the top strip. While recording, no region may dismiss — the take
        // owns the surface until it ends.
        const touch = e.changedTouches[0] ?? e.allTouches[0];
        if (!touch || touch.y > DISMISS_ZONE_HEIGHT || isRecordingSV.value) manager.fail();
      })
      .onEnd((e) => {
        'worklet';
        // Only dismiss for predominantly downward swipes with sufficient velocity
        if (e.translationY > 80 && Math.abs(e.translationY) > Math.abs(e.translationX) * 2) {
          runOnJS(onClose)();
        }
      });
  }, [onClose, isRecordingSV]);

  // ── Pinch-to-zoom ──
  // Tracks two-finger pinch and maps it to the normalized 0..1 zoom range
  // required by Expo Camera's zoom prop. The pinch delta is added to the
  // stepped zoom baseline and clamped to 0..1. On release, it snaps to the
  // nearest zoom step.
  // Shared value (not useRef) so it can be read inside worklet closures
  // without triggering Reanimated's "Tried to modify key `current`" freeze
  // warning, which logs synchronously on the Android UI thread and causes
  // ANRs (input dispatch timeout).
  const pinchStartZoom = useSharedValue(0);
  // Pinch zoom delta — shared value for UI-thread updates during pinch,
  // mirrored to React state on a throttled basis (every 50ms) to avoid
  // per-frame JS re-renders while keeping the Camera prop responsive.
  const pinchZoomDeltaSV = useSharedValue(0);
  const [pinchZoomDelta, setPinchZoomDelta] = useState(0);
  const lastZoomBridgeMs = useSharedValue(0);

  const showZoomIndicator = useCallback(() => {
    if (!reducedMotion) {
      zoomIndicatorOpacity.value = withSpring(1, spring.tap);
      zoomIndicatorScale.value = withSpring(1, spring.lift);
      zoomIndicatorOpacity.value = withDelay(1200, withTiming(0, { duration: Motion.duration.normal }));
      // Per §5.14: auto-dismiss exit uses timing, not spring.
      zoomIndicatorScale.value = withDelay(1200, withTiming(0.8, { duration: Motion.duration.normal, easing: Motion.easing.exit }));
    }
  }, [reducedMotion, zoomIndicatorOpacity, zoomIndicatorScale, spring]);

  const snapPinchToStep = useCallback((zoom: number) => {
    // Snap to nearest step: 1 (1×), 2 (2×), 3 (3×)
    if (zoom < 1.5) setZoomIndex(0);
    else if (zoom < 2.5) setZoomIndex(1);
    else setZoomIndex(2);
  }, [setZoomIndex]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          pinchStartZoom.value = zoomValue;
        })
        .onUpdate((e) => {
          'worklet';
          // Map pinch scale to zoom delta. A scale of 2 doubles the zoom.
          const newZoom = Math.max(1, pinchStartZoom.value + (e.scale - 1) * 0.5);
          pinchZoomDeltaSV.value = newZoom - pinchStartZoom.value;
          // Throttle JS bridge to every 50ms — smooth enough for the Camera
          // zoom prop while avoiding per-frame React re-renders.
          const now = global.performance?.now?.() ?? Date.now();
          if (now - lastZoomBridgeMs.value > 50) {
            lastZoomBridgeMs.value = now;
            runOnJS(setPinchZoomDelta)(pinchZoomDeltaSV.value);
          }
        })
        .onEnd((e) => {
          'worklet';
          const finalZoom = Math.max(1, pinchStartZoom.value + (e.scale - 1) * 0.5);
          pinchZoomDeltaSV.value = 0;
          runOnJS(setPinchZoomDelta)(0);
          runOnJS(snapPinchToStep)(finalZoom);
          runOnJS(haptic.light)();
          runOnJS(showZoomIndicator)();
        }),
    [zoomValue, snapPinchToStep, haptic, showZoomIndicator, pinchStartZoom, pinchZoomDeltaSV, lastZoomBridgeMs],
  );

  // Effective zoom = stepped baseline + pinch delta, clamped to device range
  const effectiveZoom = Math.max(1, zoomValue + pinchZoomDelta);

  // ── Shutter: tap=photo, press-and-hold=video ──
  // Quick tap takes a photo. Press-and-hold (beyond 250ms — see
  // ShutterButton.tsx delayLongPress) starts video recording; releasing
  // stops it. This eliminates the need for permanent Photo/Video/Boomerang
  // mode tabs.
  //
  // In hands-free mode, a tap starts the 3-second countdown then auto-records.
  // A tap during recording stops it early. Long-press is disabled in
  // hands-free mode since the user doesn't need to hold the button.
  const handleShutterPress = useCallback(() => {
    // Pressable fires a trailing onPress after onLongPress release — the
    // hold already did its work, so swallow it (isLongPressRef is cleared
    // 50ms after pressOut, i.e. after this press lands). Without this the
    // trailing press hits `isRecording` below and kills a just-locked take,
    // or double-stops a normal one.
    if (isLongPressRef.current) return;
    // If recording, tap stops early (hands-free or normal)
    if (isRecording) {
      stopRecording();
      return;
    }
    // A photo timer counting down — a second tap cancels it instead of
    // being swallowed by takePhoto's countdown guard.
    if (countdown !== null) {
      photoCountdownTokenRef.current += 1;
      setCountdown(null);
      return;
    }
    // A countdown already running — a second tap cancels it (Snap grammar:
    // tap to arm, tap to abort) instead of being swallowed.
    if (handsFreeCountdown !== null) {
      cancelHandsFreeCountdown();
      return;
    }
    // Hands-free: tap starts countdown → auto-record
    if (handsFreeMode) {
      startHandsFreeCapture();
      return;
    }
    // Tray is at the caller's cap — refuse honestly instead of
    // accumulating media the host cannot accept.
    if (multiCaptureMode && maxCaptures !== undefined && multiCaptures.length >= maxCaptures) {
      show(`All ${maxCaptures} slots filled — tap Done to continue`, 'info');
      return;
    }
    // Quick tap — take photo
    takePhoto();
  }, [takePhoto, isRecording, handsFreeMode, handsFreeCountdown, cancelHandsFreeCountdown, startHandsFreeCapture, stopRecording, countdown, multiCaptureMode, maxCaptures, multiCaptures.length, show, photoCountdownTokenRef, setCountdown]);

  const handleShutterLongPress = useCallback(() => {
    // Long-press disabled in hands-free mode
    if (handsFreeMode) return;
    // While a countdown is armed the shutter stays tap-enabled so a tap
    // can abort (Snap grammar) — but a hold must not stack a recording
    // on top of the pending capture.
    if (countdown !== null || handsFreeCountdown !== null) return;
    // Same tray cap as the tap path — video captures accumulate too.
    if (multiCaptureMode && maxCaptures !== undefined && multiCaptures.length >= maxCaptures) {
      show(`All ${maxCaptures} slots filled — tap Done to continue`, 'info');
      return;
    }
    // Press-and-hold — start video recording
    isLongPressRef.current = true;
    pressHeldRef.current = true;
    beginVideoRecording();
  }, [beginVideoRecording, handsFreeMode, countdown, handsFreeCountdown, multiCaptureMode, maxCaptures, multiCaptures.length, show, pressHeldRef]);

  // ── Hold-drag grammar (Snap/IG) ──────────────────────────────────
  // While the shutter is held and recording, the same finger can:
  //   • slide up/down to zoom continuously (pinch needs a second hand —
  //     impossible mid-hold), and
  //   • slide up-left onto the lock pill to keep recording hands-free.
  const holdOriginRef = useRef<{ x: number; y: number } | null>(null);
  // Throttles slide-to-zoom's React-state mirroring — same 50ms cadence the
  // pinch gesture's JS bridge uses, so per-move events don't re-render the
  // camera tree every frame.
  const lastSlideZoomBridgeMsRef = useRef(0);
  // Last computed slide-zoom delta — flushed to React state on release so
  // the final position can't be dropped by the 50ms throttle window.
  const lastSlideDeltaRef = useRef(0);
  const [recordLocked, setRecordLocked] = useState(false);
  const [lockHot, setLockHot] = useState(false);
  const lockZoneRef = useRef<View>(null);
  const lockZoneRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Measure the lock zone once per recording so move events can hit-test
  // without paying measureInWindow per frame.
  useEffect(() => {
    if (isRecording) {
      lockZoneRef.current?.measureInWindow((x, y, w, h) => {
        lockZoneRectRef.current = { x, y, w, h };
      });
    } else {
      lockZoneRectRef.current = null;
      setRecordLocked(false);
      setLockHot(false);
    }
  }, [isRecording]);

  const handleHoldTouchStart = useCallback((_x: number, y: number) => {
    holdOriginRef.current = { x: _x, y };
  }, []);

  const handleHoldTouchMove = useCallback((pageX: number, pageY: number) => {
    const origin = holdOriginRef.current;
    if (!origin || !isRecording || handsFreeMode || recordLocked) return;
    // Slide-to-zoom: vertical drag maps to the pinch-delta pipeline so the
    // zoom indicator and effectiveZoom stay consistent. 160pt of travel
    // adds ~2×; clamped so effective zoom stays >= 1.
    const dy = origin.y - pageY;
    const delta = Math.max(-(zoomValue - 1), Math.min(3, dy / 80));
    lastSlideDeltaRef.current = delta;
    pinchZoomDeltaSV.value = delta;
    // Mirror to React state on the same 50ms cadence as the pinch bridge —
    // unthrottled setState per move event re-renders the CameraView tree
    // every frame while the finger drags.
    const now = Date.now();
    if (now - lastSlideZoomBridgeMsRef.current > 50) {
      lastSlideZoomBridgeMsRef.current = now;
      setPinchZoomDelta(delta);
    }
    // Slide-to-lock: finger inside the lock pill latches recording.
    const z = lockZoneRectRef.current;
    if (z) {
      const inZone = pageX >= z.x - 12 && pageX <= z.x + z.w + 12 && pageY >= z.y - 12 && pageY <= z.y + z.h + 12;
      if (inZone !== lockHot) setLockHot(inZone);
      if (inZone) {
        setRecordLocked(true);
        haptic.medium();
        show('Recording locked — tap to stop', 'info');
      }
    }
  }, [isRecording, handsFreeMode, recordLocked, zoomValue, pinchZoomDeltaSV, lockHot, haptic, show]);

  const handleShutterPressOut = useCallback(() => {
    holdOriginRef.current = null;
    pressHeldRef.current = false;
    setLockHot(false);
    // Flush the final slide-zoom delta — the 50ms throttle can drop the
    // last move event, leaving effectiveZoom one frame behind the finger.
    setPinchZoomDelta(lastSlideDeltaRef.current);
    // Locked recording survives release — tap-to-stop handles it. In
    // hands-free mode, release does nothing (recording auto-stops).
    if (!recordLocked && !handsFreeMode && isRecording) {
      stopRecording();
    }
    // Reset long-press flag after a tick so onPress doesn't also fire.
    // This must run on every release — the early returns above used to
    // leave it set, swallowing the next photo tap after a locked take.
    setTimeout(() => { isLongPressRef.current = false; }, 50);
  }, [isRecording, stopRecording, handsFreeMode, recordLocked, pressHeldRef]);

  // ── P0: Real tap-to-focus via VisionCamera focusTo() ──────────────
  // VisionCamera v5 exposes CameraRef.focusTo(viewPoint, options?) which
  // performs real AE/AF/AWB metering at the tapped point. The Camera/
  // PreviewView converts view coordinates to camera sensor coordinates
  // internally via convertViewPointToCameraPoint(...).
  //
  // The tap point is routed through the measured viewport so the reticle
  // and any guide-relative overlays position themselves within the
  // authored crop. focusTo still receives raw view coordinates (relative
  // to the Camera view) because the native PreviewView handles the
  // sensor conversion — the viewport is used for guide-relative math,
  // not for the native focus call.
  const handleTapFocus = useCallback((evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    // FocusReticle handles its own spring animation + haptic + auto-dismiss

    // Perform real focus metering if the device supports it.
    // focusTo takes view coordinates (relative to the Camera view) and
    // converts them to camera coordinates internally.
    const cam = cameraRef.current;
    if (cam && device?.supportsFocusMetering) {
      void cam.focusTo(
        { x: locationX, y: locationY },
        {
          responsiveness: isRecording ? 'steady' : 'snappy',
          adaptiveness: 'continuous',
          autoResetAfter: 5 },
      ).catch(() => {
        // Focus request failed — the reticle still showed as a tap
        // indicator, but we don't surface an error toast for a focus
        // failure. The camera continues with its own autofocus.
      });
    }
  }, [device, isRecording, cameraRef, setFocusPoint]);

  return {
    doubleTapGesture,
    swipeDownDismiss,
    pinchGesture,
    effectiveZoom,
    zoomIndicatorStyle,
    recordLocked,
    lockHot,
    lockZoneRef,
    handleShutterPress,
    handleShutterLongPress,
    handleShutterPressOut,
    handleHoldTouchStart,
    handleHoldTouchMove,
    handleTapFocus,
  };
}
