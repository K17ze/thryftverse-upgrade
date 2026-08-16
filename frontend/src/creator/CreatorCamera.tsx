import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  GestureResponderEvent,
  Linking,
  ScrollView,
  AppState,
  AppStateStatus,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Typography, Radius, Type, Space } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { makeStableId } from '../utils/createStableId';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useMotionConfig } from '../hooks/useMotionConfig';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { FocusReticle } from './camera/FocusReticle';
import { RecordingRing } from './camera/RecordingRing';
import { ShutterButton } from './camera/ShutterButton';
import { ControlsRail } from './camera/ControlsRail';
import { GalleryCarousel } from './camera/GalleryCarousel';
import { PermissionState } from './camera/PermissionState';
import { GreenScreenSheet, type GreenScreenSettings } from './camera/GreenScreenSheet';
import { CameraEffectBar, type CameraEffectId } from './camera/CameraEffectBar';
import { CreatorSegmentControl } from './controls/CreatorSegmentControl';
import { CreatorAnalytics } from './creatorAnalytics';
import type { CreatorInitialMedia } from '../navigation/types';

// ── CreatorCamera ────────────────────────────────────────────────────
// Camera component with:
//   - tap-to-focus visual indicator (no fake AE/AF lock claim)
//   - corner brackets (mode-specific aspect ratio guide, refined 2pt)
//   - center crosshair
//   - large shutter button with tap=photo / press-and-hold=video
//   - vertical controls rail: flip, zoom, tools disclosure
//   - gallery thumbnail (64x64, recent photos carousel)
//   - quick-review overlay (post-capture preview with retake/edit/save)
//   - multi-capture with frame-review tray (all captures retained)
//   - grid overlay (rule-of-thirds, behind Tools)
//   - self-timer with countdown overlay (behind Tools)
//   - refined gradient overlays (0.25 top, 0.35 bottom)
//   - proper permission states with art-directed empty states
//
// This is a dedicated component — not inline in a screen.
// The entry screen renders <CreatorCamera /> and receives captures.

// Shutter constants kept in sync with ShutterButton.tsx (78pt outer, 60pt inner).
const SHUTTER_SIZE = 78;
const SHUTTER_INNER = 60;
const CORNER_SIZE = 32;
const CORNER_STROKE = 2;
const GALLERY_THUMB_SIZE = 44;
const CONTROL_RAIL_ICON = 22;
// Zoom is normalized 0..1 per Expo Camera contract. UI labels (1×, 2×, 3×)
// are digital zoom multipliers mapped honestly to the normalized range.
const ZOOM_STEPS = [
  { label: '1×', normalized: 0 },
  { label: '2×', normalized: 0.5 },
  { label: '3×', normalized: 1 },
] as const;
const TIMER_OPTIONS = [0, 3, 5, 10] as const;
const FOCUS_RETICLE_SIZE = 70;
const RECORDING_MAX_DURATION = 15000; // 15s max for video
const RECORDING_RING_SIZE = SHUTTER_SIZE + 12;
const RECORDING_RING_STROKE = 4;
const MODE_SWITCHER_HEIGHT = 36;
// Press-and-hold threshold for video recording (ms)
const HOLD_THRESHOLD_MS = 350;

// ── Hands-free capture (Snapchat hands-free pattern) ──
// When enabled, a 3-second countdown runs, then recording begins
// automatically and stops at HANDS_FREE_DEFAULT_DURATION. The user
// can tap to stop early. This lets the user prop the phone and capture
// without holding the shutter.
const HANDS_FREE_COUNTDOWN = 3; // seconds
const HANDS_FREE_DEFAULT_DURATION = 10000; // 10s default
const HANDS_FREE_MAX_DURATION = 30000; // 30s max

// ── Capture speed modes ──
// expo-camera 57 does NOT support native slow/fast-motion recording
// (no fps or speed parameter in recordAsync). The video is always
// recorded at 1×. The selected speed multiplier is stored in the clip
// metadata (CreatorInitialMedia.speed) so the timeline/export engine
// applies it at playback. This is the truthful approach — we do not
// claim the native camera is recording in slow-motion.
const SPEED_MODES = [
  { label: '0.3×', value: '0.3' },
  { label: '1×', value: '1' },
  { label: '2×', value: '2' },
  { label: '3×', value: '3' },
] as const;
const DEFAULT_SPEED = '1';

type FlashMode = 'off' | 'on' | 'auto';
type ZoomStepIndex = 0 | 1 | 2;
type TimerOption = 0 | 3 | 5 | 10;

export interface CreatorCameraProps {
  /** Camera mode — determines framing guide + labels */
  mode: 'poster' | 'look' | 'visual-search';
  /** Called when the user captures a photo and confirms it via quick-review.
   *  Used for single captures and backward-compatible callers (visual search,
   *  legacy poster CameraCapture). */
  onCapture: (uri: string) => void;
  /** Called when the user finishes a batch capture (multi-capture or single
   *  capture in poster/look mode). Every capture is retained as a
   *  CreatorInitialMedia entry in deterministic order. When provided, this
   *  takes precedence over onCapture for poster/look modes. */
  onCaptureBatch?: (captures: CreatorInitialMedia[]) => void;
  /** Called when the user taps the gallery thumbnail */
  onGallery: () => void;
  /** Called when the user taps close */
  onClose: () => void;
  /** Optional render prop for the bottom overlay (e.g. mode switcher) */
  renderBottomOverlay?: () => React.ReactNode;
  /** Optional control rendered beside the canonical flash control. */
  renderTopRightAccessory?: () => React.ReactNode;
}

export default function CreatorCamera({
  mode,
  onCapture,
  onCaptureBatch,
  onGallery,
  onClose,
  renderBottomOverlay,
  renderTopRightAccessory,
}: CreatorCameraProps) {
  const { show } = useToast();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoomIndex, setZoomIndex] = useState<ZoomStepIndex>(0);
  const [timerOption, setTimerOption] = useState<TimerOption>(0);
  const [showGrid, setShowGrid] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [lastImageUri, setLastImageUri] = useState<string | null>(null);
  const [recentImages, setRecentImages] = useState<string[]>([]);
  const [showRecentCarousel, setShowRecentCarousel] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  // Track whether the current capture is a photo or video so the
  // confirmed capture is sent with the correct kind. Without this, video
  // recordings are misclassified as images, breaking playback in the
  // poster/look canvas.
  const [capturedKind, setCapturedKind] = useState<'image' | 'video'>('image');
  const [countdown, setCountdown] = useState<number | null>(null);
  const reviewOpacity = useSharedValue(0);
  const captureFlash = useSharedValue(0);
  // ── Multi-capture mode (Snapchat Multi Snap pattern) ──
  // Every capture is retained as a CreatorInitialMedia entry. Poster maps
  // captures to frames; Look maps captures to layers.
  const [multiCaptureMode, setMultiCaptureMode] = useState(false);
  const [multiCaptures, setMultiCaptures] = useState<CreatorInitialMedia[]>([]);

  // ── Hands-free capture mode ──
  // When enabled, tapping the shutter starts a 3-second countdown, then
  // recording begins automatically and stops at the configured duration.
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [handsFreeCountdown, setHandsFreeCountdown] = useState<number | null>(null);
  const handsFreeCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Capture speed mode ──
  // Stored as a string for CreatorSegmentControl; converted to number
  // when building CreatorInitialMedia metadata.
  const [speedMode, setSpeedMode] = useState<string>(DEFAULT_SPEED);

  // ── Camera effect (post-capture filter) ──
  // expo-camera does not support real-time color matrix filters (no
  // frame-processor API), so the selected effect is stored and applied
  // post-capture. The CameraEffectBar shows the user what effect will
  // be applied. The effect ID is preserved in CreatorInitialMedia so
  // the composer can apply it as a filter node when seeding the media.
  const [cameraEffect, setCameraEffect] = useState<CameraEffectId>('none');

  // ── Green screen (post-capture) ──
  // Real-time chroma keying is not feasible with expo-camera alone (no
  // frame-processor API). The user selects a background image and key
  // parameters; the video is recorded normally and the green screen
  // effect is applied in post-production via Skia. The settings are
  // preserved in CreatorInitialMedia.greenScreen so the timeline can
  // re-render the composite.
  const [showGreenScreenSheet, setShowGreenScreenSheet] = useState(false);
  const [greenScreenSettings, setGreenScreenSettings] = useState<GreenScreenSettings | null>(null);

  // ── Flagship upgrade shared values ──
  // Flip animation (double-tap to switch camera)
  const flipRotation = useSharedValue(0);
  // Zoom indicator spring appearance
  const zoomIndicatorOpacity = useSharedValue(0);
  const zoomIndicatorScale = useSharedValue(0.8);
  // Flash control spring scale
  const flashScale = useSharedValue(1);
  // Permission entrance animation
  const permissionEntrance = useSharedValue(0);
  // Recording state + ring progress
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const recordingProgress = useSharedValue(0);
  const recordingRingScale = useSharedValue(1);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ── Native recording promise ref (P0.1 — one recording lifecycle) ──
  const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  // Countdown Reanimated values (flagship spring)
  const countdownScale = useSharedValue(1.5);
  const countdownOpacity = useSharedValue(0);
  // ── Tools disclosure (timer/grid/multi-capture behind one button) ──
  const [showTools, setShowTools] = useState(false);
  // ── Press-and-hold video: track long-press state to suppress photo on release ──
  const isLongPressRef = useRef(false);

  const isPoster = mode === 'poster';
  const isVisualSearch = mode === 'visual-search';
  const modeLabel = isVisualSearch ? 'Search' : isPoster ? 'Story' : 'Look';
  const zoomLabel = ZOOM_STEPS[zoomIndex].label;
  const zoomNormalized = ZOOM_STEPS[zoomIndex].normalized;

  const captureFlashStyle = useAnimatedStyle(() => ({ opacity: captureFlash.value }));

  // ── Quick-review overlay opacity ──
  const reviewOpacityStyle = useAnimatedStyle(() => ({ opacity: reviewOpacity.value }));

  // ── Flip rotation: rotateY 0→180→360 for double-tap camera switch ──
  const cameraFlipStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${flipRotation.value}deg` }],
  }));

  // ── Zoom indicator: spring appearance ──
  const zoomIndicatorStyle = useAnimatedStyle(() => ({
    opacity: zoomIndicatorOpacity.value,
    transform: [{ scale: zoomIndicatorScale.value }],
  }));

  // ── Countdown: spring scale (1.5→1.0 bouncy) + fade ──
  const countdownTextStyle = useAnimatedStyle(() => ({
    opacity: countdownOpacity.value,
    transform: [{ scale: countdownScale.value }],
  }));

  // ── Permission ──
  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain) {
      requestPermission().catch(() => {
        show('Camera permission is required', 'error');
      });
    }
  }, [permission, requestPermission, show]);

  // ── Permission entrance: spring slide-up + fade when denied ──
  useEffect(() => {
    if (permission && !permission.granted) {
      permissionEntrance.value = 0;
      if (!reducedMotion) {
        permissionEntrance.value = withDelay(
          100,
          withSpring(1, spring.entrance),
        );
      } else {
        permissionEntrance.value = 1;
      }
    }
  }, [permission, reducedMotion, permissionEntrance]);

  // ── Load recent gallery photos for thumbnail + carousel ──
  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      try {
        const mediaPermission = await MediaLibrary.requestPermissionsAsync(false);
        if (!mediaPermission.granted || cancelled) return;
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: ['photo', 'video'],
          sortBy: [['creationTime', false]],
          first: 10,
        });
        if (!cancelled && page.assets.length > 0) {
          const uris = page.assets.map((a) => a.uri).filter(Boolean);
          setRecentImages(uris);
          setLastImageUri(uris[0]);
        }
      } catch {
        // The thumbnail is optional; camera capture remains usable if the
        // platform library is unavailable or its permission changes.
      }
    }
    void loadRecent();
    return () => { cancelled = true; };
  }, []);

  // ── Camera controls ──
  const cycleFlash = useCallback(() => {
    haptic.light();
    // Spring scale pop on flash toggle
    if (!reducedMotion) {
      flashScale.value = withSequence(
        withSpring(0.88, spring.tap),
        withSpring(1, spring.entrance),
      );
    }
    setFlash((p) => p === 'off' ? 'on' : p === 'on' ? 'auto' : 'off');
  }, [haptic, reducedMotion, flashScale, spring]);

  const toggleFacing = useCallback(() => {
    haptic.medium();
    // Spring 3D flip animation: rotateY 0→180→360
    if (!reducedMotion) {
      flipRotation.value = withSequence(
        withSpring(flipRotation.value + 180, spring.lift),
      );
    }
    setFacing((p) => (p === 'back' ? 'front' : 'back'));
  }, [haptic, reducedMotion, flipRotation, spring]);

  // ── Double-tap to switch camera ──
  const doubleTapGesture = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        'worklet';
        runOnJS(toggleFacing)();
      });
  }, [toggleFacing]);

  const cycleZoom = useCallback(() => {
    haptic.light();
    setZoomIndex((p) => ((p + 1) % 3) as ZoomStepIndex);
    // Show zoom indicator with spring appearance, auto-hide after 1.2s
    if (!reducedMotion) {
      zoomIndicatorOpacity.value = withSpring(1, spring.tap);
      zoomIndicatorScale.value = withSpring(1, spring.lift);
      zoomIndicatorOpacity.value = withDelay(1200, withTiming(0, { duration: 200 }));
      zoomIndicatorScale.value = withDelay(1200, withSpring(0.8, spring.entrance));
    }
  }, [haptic, reducedMotion, zoomIndicatorOpacity, zoomIndicatorScale, spring]);

  const cycleTimer = useCallback(() => {
    haptic.selection();
    setTimerOption((p) => {
      const idx = TIMER_OPTIONS.indexOf(p);
      return TIMER_OPTIONS[(idx + 1) % TIMER_OPTIONS.length] as TimerOption;
    });
  }, [haptic]);

  // ── Hands-free mode toggle ──
  const toggleHandsFree = useCallback(() => {
    haptic.selection();
    setHandsFreeMode((p) => !p);
    // Cancel any in-progress hands-free countdown
    if (handsFreeCountdownRef.current) {
      clearInterval(handsFreeCountdownRef.current);
      handsFreeCountdownRef.current = null;
    }
    setHandsFreeCountdown(null);
  }, [haptic]);

  // ── Speed mode change ──
  const handleSpeedChange = useCallback((value: string) => {
    haptic.selection();
    setSpeedMode(value);
  }, [haptic]);

  // ── Green screen toggle ──
  const toggleGreenScreen = useCallback(() => {
    haptic.selection();
    if (greenScreenSettings) {
      // Toggle off — clear settings
      setGreenScreenSettings(null);
    } else {
      // Open the sheet to configure
      setShowGreenScreenSheet(true);
    }
  }, [haptic, greenScreenSettings]);

  const handleGreenScreenApply = useCallback((settings: GreenScreenSettings) => {
    haptic.light();
    setGreenScreenSettings(settings);
    setShowGreenScreenSheet(false);
  }, [haptic]);

  const handleGreenScreenCancel = useCallback(() => {
    haptic.light();
    setShowGreenScreenSheet(false);
  }, [haptic]);

  // ── P0.1: One unified recording lifecycle ────────────────────────
  // beginVideoRecording() starts native recordAsync() and stores the promise.
  // stopRecording() calls stopRecording() on the native camera, which causes
  // the promise to resolve. The awaited result enters the same review object
  // as a photo. Cleanup runs on background/unmount/interruption.
  // Declared before startHandsFreeCapture (which calls beginVideoRecording)
  // to avoid temporal dead zone errors with const arrow functions.
  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    haptic.medium();
    // Stop native recording — this resolves the recordAsync promise
    cameraRef.current?.stopRecording();
    // The await in beginVideoRecording handles the rest (UI cleanup, review)
  }, [isRecording, haptic]);

  const beginVideoRecording = useCallback(async (customMaxDuration?: number) => {
    if (!cameraRef.current || isRecording) return;
    haptic.medium(); // medium on recording start
    setIsRecording(true);
    setRecordingElapsed(0);
    recordingProgress.value = 0;
    // Ring scale pulse on start
    if (!reducedMotion) {
      recordingRingScale.value = withSequence(
        withSpring(1.15, spring.tap),
        withSpring(1, spring.entrance),
      );
    }
    // Use custom duration (hands-free) or fall back to the standard max
    const maxDuration = Math.min(customMaxDuration ?? RECORDING_MAX_DURATION, HANDS_FREE_MAX_DURATION);
    const startTime = Date.now();
    recordingTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setRecordingElapsed(elapsed);
      recordingProgress.value = Math.min(1, elapsed / maxDuration);
      if (elapsed >= maxDuration) {
        // Auto-stop at max duration
        stopRecording();
      }
    }, 50);

    // Start native recording — one promise for the entire lifecycle
    recordingPromiseRef.current = cameraRef.current.recordAsync({
      maxDuration: maxDuration / 1000,
    });

    try {
      const result = await recordingPromiseRef.current;
      recordingPromiseRef.current = null;
      if (result?.uri) {
        haptic.medium();
        // Capture flash — white overlay
        if (!reducedMotion) {
          captureFlash.value = withSequence(
            withTiming(0.8, { duration: 80, easing: Easing.out(Easing.cubic) }),
            withTiming(0, { duration: 120, easing: Easing.in(Easing.cubic) }),
          );
        }
        setCapturedKind('video');
        setCapturedUri(result.uri);
        CreatorAnalytics.captureVideo(isPoster ? 'poster' : 'look', Date.now() - startTime);
      }
    } catch {
      show('Failed to record video', 'error');
    }

    // Cleanup UI state (runs after promise resolves or rejects)
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recordingProgress.value = withSpring(0, spring.entrance);
  }, [cameraRef, isRecording, haptic, reducedMotion, recordingProgress, recordingRingScale, show, stopRecording, spring, captureFlash, isPoster]);

  // ── Hands-free countdown → auto-record ──
  // Starts a 3-second countdown with haptic ticks, then begins recording.
  // Recording auto-stops at HANDS_FREE_DEFAULT_DURATION. The user can
  // tap the shutter to stop early.
  const startHandsFreeCapture = useCallback(async () => {
    if (!cameraRef.current || isRecording || handsFreeCountdown !== null) return;
    haptic.medium(); // medium on countdown start

    for (let i = HANDS_FREE_COUNTDOWN; i > 0; i--) {
      setHandsFreeCountdown(i);
      // Reanimated spring countdown: scale 1.5→1.0 bouncy + fade in/out
      if (!reducedMotion) {
        countdownScale.value = 1.5;
        countdownOpacity.value = 0;
        countdownScale.value = withSpring(1, spring.lift);
        countdownOpacity.value = withSequence(
          withTiming(1, { duration: 100 }),
          withDelay(700, withTiming(0, { duration: 200 })),
        );
      } else {
        countdownScale.value = 1;
        countdownOpacity.value = 1;
        countdownOpacity.value = withDelay(800, withTiming(0, { duration: 0 }));
      }
      haptic.light(); // tick on each number
      await new Promise((r) => setTimeout(r, 1000));
    }
    setHandsFreeCountdown(null);

    // Begin recording with the hands-free duration
    beginVideoRecording(HANDS_FREE_DEFAULT_DURATION);
  }, [cameraRef, isRecording, handsFreeCountdown, haptic, reducedMotion, countdownScale, countdownOpacity, spring, beginVideoRecording]);

  const toggleGrid = useCallback(() => {
    haptic.selection();
    setShowGrid((p) => !p);
  }, [haptic]);

  // ── Pinch-to-zoom ──
  // Tracks two-finger pinch and maps it to the normalized 0..1 zoom range
  // required by Expo Camera's zoom prop. The pinch delta is added to the
  // stepped zoom baseline and clamped to 0..1. On release, it snaps to the
  // nearest zoom step.
  const pinchStartZoom = useRef(0);
  const [pinchZoomDelta, setPinchZoomDelta] = useState(0);

  const showZoomIndicator = useCallback(() => {
    if (!reducedMotion) {
      zoomIndicatorOpacity.value = withSpring(1, spring.tap);
      zoomIndicatorScale.value = withSpring(1, spring.lift);
      zoomIndicatorOpacity.value = withDelay(1200, withTiming(0, { duration: 200 }));
      zoomIndicatorScale.value = withDelay(1200, withSpring(0.8, spring.entrance));
    }
  }, [reducedMotion, zoomIndicatorOpacity, zoomIndicatorScale, spring]);

  const snapPinchToStep = useCallback((normalizedZoom: number) => {
    // Snap to nearest step: 0 (1×), 0.5 (2×), 1 (3×)
    if (normalizedZoom < 0.25) setZoomIndex(0);
    else if (normalizedZoom < 0.75) setZoomIndex(1);
    else setZoomIndex(2);
  }, []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          runOnJS((z: number) => {
            pinchStartZoom.current = z;
          })(zoomNormalized);
        })
        .onUpdate((e) => {
          'worklet';
          // Map pinch scale to normalized zoom delta. A scale of 2 doubles
          // the zoom, so we map proportionally within the 0..1 range.
          const newZoom = Math.max(0, Math.min(1, pinchStartZoom.current + (e.scale - 1) * 0.5));
          runOnJS(setPinchZoomDelta)(newZoom - pinchStartZoom.current);
        })
        .onEnd((e) => {
          'worklet';
          const finalZoom = Math.max(0, Math.min(1, pinchStartZoom.current + (e.scale - 1) * 0.5));
          runOnJS(setPinchZoomDelta)(0);
          runOnJS(snapPinchToStep)(finalZoom);
          runOnJS(haptic.light)();
          runOnJS(showZoomIndicator)();
        }),
    [zoomNormalized, snapPinchToStep, haptic, showZoomIndicator],
  );

  // Effective zoom = stepped baseline + pinch delta, clamped to 0..1
  const effectiveZoom = Math.max(0, Math.min(1, zoomNormalized + pinchZoomDelta));

  // ── Capture with optional timer ──
  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || countdown !== null) return;

    if (timerOption > 0) {
      haptic.medium(); // medium on countdown start
      for (let i = timerOption; i > 0; i--) {
        setCountdown(i);
        // Reanimated spring countdown: scale 1.5→1.0 bouncy + fade in/out
        if (!reducedMotion) {
          countdownScale.value = 1.5;
          countdownOpacity.value = 0;
          countdownScale.value = withSpring(1, spring.lift);
          countdownOpacity.value = withSequence(
            withTiming(1, { duration: 100 }),
            withDelay(700, withTiming(0, { duration: 200 })),
          );
        } else {
          countdownScale.value = 1;
          countdownOpacity.value = 1;
          countdownOpacity.value = withDelay(800, withTiming(0, { duration: 0 }));
        }
        haptic.light(); // tick on each number
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(null);
    }

    try {
      const captureStart = Date.now();
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      const captureLatencyMs = Date.now() - captureStart;
      if (photo?.uri) {
        haptic.medium();
        // Capture flash — white overlay 0→0.8→0 over 200ms
        if (!reducedMotion) {
          captureFlash.value = withSequence(
            withTiming(0.8, { duration: 80, easing: Easing.out(Easing.cubic) }),
            withTiming(0, { duration: 120, easing: Easing.in(Easing.cubic) })
          );
        }
        setCapturedKind('image');
        setCapturedUri(photo.uri);
        // ── Capture latency telemetry ──
        // Tracks shutter-to-photo-ready time so we can monitor camera
        // performance regressions across devices and OS versions.
        CreatorAnalytics.capturePhoto(isPoster ? 'poster' : 'look', captureLatencyMs);
      }
    } catch {
      show('Failed to capture photo', 'error');
    }
  }, [cameraRef, countdown, haptic, reducedMotion, show, timerOption, countdownScale, countdownOpacity, captureFlash, spring]);

  // ── Cleanup recording on unmount / interruption ──
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      // Stop any active native recording to prevent orphaned promises
      if (recordingPromiseRef.current) {
        cameraRef.current?.stopRecording();
        recordingPromiseRef.current = null;
      }
      // Clean up hands-free countdown timer
      if (handsFreeCountdownRef.current) {
        clearInterval(handsFreeCountdownRef.current);
        handsFreeCountdownRef.current = null;
      }
    };
  }, []);

  // ── Cleanup recording on app background ────────────────────────────
  // When the app goes to background (user switches apps, notification
  // overlay, etc.), stop any active recording immediately. An orphaned
  // recording promise on background can hang indefinitely on iOS.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        if (recordingPromiseRef.current) {
          cameraRef.current?.stopRecording();
        }
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
      }
    });
    return () => subscription.remove();
  }, []);

  // ── Shutter: tap=photo, press-and-hold=video (Snapchat 2026 pattern) ──
  // Quick tap takes a photo. Press-and-hold (beyond HOLD_THRESHOLD_MS) starts
  // video recording; releasing stops it. This eliminates the need for
  // permanent Photo/Video/Boomerang mode tabs.
  //
  // In hands-free mode, a tap starts the 3-second countdown then auto-records.
  // A tap during recording stops it early. Long-press is disabled in
  // hands-free mode since the user doesn't need to hold the button.
  const handleShutterPress = useCallback(() => {
    // If recording, tap stops early (hands-free or normal)
    if (isRecording) {
      stopRecording();
      return;
    }
    // Hands-free: tap starts countdown → auto-record
    if (handsFreeMode) {
      startHandsFreeCapture();
      return;
    }
    // Quick tap — take photo (only if the long-press didn't fire)
    if (!isLongPressRef.current) {
      takePhoto();
    }
  }, [takePhoto, isRecording, handsFreeMode, startHandsFreeCapture, stopRecording]);

  const handleShutterLongPress = useCallback(() => {
    // Long-press disabled in hands-free mode
    if (handsFreeMode) return;
    // Press-and-hold — start video recording
    isLongPressRef.current = true;
    beginVideoRecording();
  }, [beginVideoRecording, handsFreeMode]);

  const handleShutterPressOut = useCallback(() => {
    // In hands-free mode, release does nothing (recording auto-stops)
    if (handsFreeMode) return;
    // Release — if recording, stop
    if (isRecording) {
      stopRecording();
    }
    // Reset long-press flag after a tick so onPress doesn't also fire
    setTimeout(() => { isLongPressRef.current = false; }, 50);
  }, [isRecording, stopRecording, handsFreeMode]);

  // ── Quick-review flow ──
  useEffect(() => {
    if (capturedUri) {
      if (reducedMotion) {
        reviewOpacity.value = 1;
      } else {
        reviewOpacity.value = 0;
        reviewOpacity.value = withSpring(1, spring.entrance);
      }
    }
  }, [capturedUri, reducedMotion, reviewOpacity, spring]);

  const handleRetake = useCallback(() => {
    haptic.selection();
    if (!reducedMotion) {
      reviewOpacity.value = withSpring(0, spring.entrance, () => {
        runOnJS(setCapturedUri)(null);
        runOnJS(setCapturedKind)('image');
      });
    } else {
      reviewOpacity.value = 0;
      setCapturedUri(null);
      setCapturedKind('image');
    }
  }, [haptic, reducedMotion, reviewOpacity, spring]);

  // ── Build a CreatorInitialMedia with speed + greenScreen metadata ──
  // Speed: expo-camera 57 records at 1× always; the multiplier is stored
  //   in metadata so the timeline/export engine applies it at playback.
  // GreenScreen: post-capture chroma key settings are preserved so the
  //   timeline can re-render the composite via Skia.
  const buildCaptureMedia = useCallback((uri: string, kind: 'image' | 'video'): CreatorInitialMedia => {
    const media: CreatorInitialMedia = {
      id: makeStableId('capture'),
      uri,
      kind,
    };
    // Attach speed metadata for video captures (1× is the default and
    // omitted to keep backward-compatible payloads clean)
    if (kind === 'video' && speedMode !== DEFAULT_SPEED) {
      media.speed = parseFloat(speedMode);
    }
    // Attach green screen settings if active
    if (greenScreenSettings) {
      media.greenScreen = {
        backgroundUri: greenScreenSettings.backgroundUri,
        keyColor: greenScreenSettings.keyColor,
        tolerance: greenScreenSettings.tolerance,
        feather: greenScreenSettings.feather,
      };
    }
    // Attach camera effect if a non-'none' effect is selected. The
    // effect ID is stored so the composer can apply it as a filter node
    // when seeding the media layer (post-capture application).
    if (cameraEffect !== 'none') {
      media.cameraEffect = cameraEffect;
    }
    return media;
  }, [speedMode, greenScreenSettings, cameraEffect]);

  const handleConfirmCapture = useCallback(() => {
    if (!capturedUri) return;
    haptic.light();
    // In multi-capture mode, add to stack instead of immediately sending
    if (multiCaptureMode) {
      const media = buildCaptureMedia(capturedUri, capturedKind);
      setMultiCaptures((prev) => [...prev, media]);
      setCapturedUri(null);
      return;
    }
    // If onCaptureBatch is provided, use it for poster/look modes
    if (onCaptureBatch && !isVisualSearch) {
      onCaptureBatch([buildCaptureMedia(capturedUri, capturedKind)]);
    } else {
      onCapture(capturedUri);
    }
  }, [capturedUri, capturedKind, haptic, onCapture, onCaptureBatch, multiCaptureMode, isVisualSearch, buildCaptureMedia]);

  // ── Multi-capture: add another photo without leaving camera ──
  const handleAddAnother = useCallback(() => {
    haptic.selection();
    if (capturedUri) {
      const media = buildCaptureMedia(capturedUri, capturedKind);
      setMultiCaptures((prev) => [...prev, media]);
      setCapturedUri(null);
    }
  }, [capturedUri, capturedKind, haptic, buildCaptureMedia]);

  // ── Multi-capture: finish and send ALL captures (P0.3 fix) ──
  // Every capture is retained and sent as a CreatorInitialMedia[] batch.
  // Poster maps captures to frames; Look maps captures to layers.
  // Speed and greenScreen metadata are preserved on each clip so the
  // timeline/export engine can apply them at playback.
  const handleFinishMultiCapture = useCallback(() => {
    if (multiCaptures.length === 0 && !capturedUri) return;
    haptic.medium();
    const currentCapture: CreatorInitialMedia[] = capturedUri
      ? [buildCaptureMedia(capturedUri, capturedKind)]
      : [];
    const all = [...multiCaptures, ...currentCapture];
    // Send all captures via onCaptureBatch if available, else fall back
    if (onCaptureBatch) {
      onCaptureBatch(all);
    } else if (all.length > 0) {
      onCapture(all[0].uri);
    }
    setMultiCaptures([]);
    setMultiCaptureMode(false);
  }, [multiCaptures, capturedUri, capturedKind, haptic, onCapture, onCaptureBatch, buildCaptureMedia]);

  // ── Multi-capture: toggle mode ──
  const toggleMultiCapture = useCallback(() => {
    haptic.selection();
    setMultiCaptureMode((p) => !p);
    if (multiCaptures.length > 0) setMultiCaptures([]);
  }, [haptic, multiCaptures.length]);

  // ── Multi-capture: remove a specific capture from the tray ──
  const handleRemoveCapture = useCallback((captureId: string) => {
    haptic.selection();
    setMultiCaptures((prev) => prev.filter((c) => c.id !== captureId));
  }, [haptic]);

  const handleSaveToGallery = useCallback(async () => {
    if (!capturedUri) return;
    try {
      await MediaLibrary.saveToLibraryAsync(capturedUri);
      haptic.light();
      show('Saved to gallery', 'success');
    } catch {
      show('Failed to save to gallery', 'error');
    }
  }, [capturedUri, haptic, show]);

  // ── P0.4: Truthful tap-to-focus visual indicator ──────────────────
  // Expo Camera's public surface exposes focus mode rather than arbitrary
  // point focus. We keep a visual tap indicator (FocusReticle) so the user
  // gets feedback that their tap was registered, but we do NOT claim AE/AF
  // lock or simulate a camera capability with UI-only animation. The native
  // camera continues to use its own continuous autofocus.
  const handleTapFocus = useCallback((evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    // FocusReticle component handles its own spring animation + haptic + auto-dismiss
  }, []);

  const handleOpenSettings = useCallback(() => Linking.openSettings(), []);

  const handleGalleryLongPress = useCallback(() => {
    if (recentImages.length > 1) {
      haptic.selection();
      setShowRecentCarousel((p) => !p);
    }
  }, [haptic, recentImages.length]);

  // ── Permission: loading ──
  if (!permission) {
    return <PermissionState status="loading" isPoster={isPoster} entrance={permissionEntrance} onEnable={handleOpenSettings} onGallery={onGallery} />;
  }

  // ── Permission: permanently denied ──
  if (!permission.granted && !permission.canAskAgain) {
    return <PermissionState status="denied" isPoster={isPoster} entrance={permissionEntrance} onEnable={handleOpenSettings} onGallery={onGallery} />;
  }

  // ── Permission: undetermined — ask ──
  if (!permission.granted) {
    return <PermissionState status="undetermined" isPoster={isPoster} entrance={permissionEntrance} onEnable={() => requestPermission()} onGallery={onGallery} />;
  }

  // ── Camera viewfinder ──
  return (
    <GestureDetector gesture={pinchGesture}>
      <View style={StyleSheet.absoluteFill}>
        {/* Double-tap gesture for camera flip (wrapped around camera feed) */}
        <GestureDetector gesture={doubleTapGesture}>
          <View style={StyleSheet.absoluteFill}>
            {/* Full-screen camera feed with tap-to-focus visual indicator + 3D flip rotation */}
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={handleTapFocus}
            >
              <Reanimated.View style={[StyleSheet.absoluteFill, cameraFlipStyle]}>
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing={facing}
                  flash={flash}
                  mode="picture"
                  enableTorch={flash === 'on'}
                  zoom={effectiveZoom}
                />
              </Reanimated.View>
            </Pressable>
          </View>
        </GestureDetector>

      {/* Capture flash — subtle white overlay on capture */}
      <Reanimated.View
        style={[styles.captureFlash, captureFlashStyle]}
        pointerEvents="none"
      />

      {/* Refined gradient overlays — 0.25 top, 0.35 bottom (less heavy, more premium) */}
      <LinearGradient
        colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)']}
        style={styles.topGradient}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

      {/* Grid overlay (rule-of-thirds) */}
      {showGrid && (
        <View style={styles.gridOverlay} pointerEvents="none">
          <View style={styles.gridLineV1} />
          <View style={styles.gridLineV2} />
          <View style={styles.gridLineH1} />
          <View style={styles.gridLineH2} />
        </View>
      )}

      {/* Focus reticle — visual tap indicator only (P0.4: no AE/AF lock claim) */}
      <FocusReticle
        focusPoint={focusPoint}
        size={FOCUS_RETICLE_SIZE}
        onDismiss={() => {
          setFocusPoint(null);
        }}
      />

      {/* Zoom level indicator — spring appearance (1×/2×/3×) */}
      <Reanimated.View style={[styles.zoomIndicator, zoomIndicatorStyle]} pointerEvents="none">
        <Text style={styles.zoomIndicatorText}>
          {zoomLabel}
        </Text>
      </Reanimated.View>

      {/* Countdown overlay — Reanimated spring scale + fade.
          Shows the self-timer countdown OR the hands-free countdown. */}
      {(countdown !== null || handsFreeCountdown !== null) && (
        <View style={styles.countdownOverlay} pointerEvents="none">
          <Reanimated.Text
            style={[styles.countdownText, countdownTextStyle]}
          >
            {countdown ?? handsFreeCountdown}
          </Reanimated.Text>
        </View>
      )}

      {/* Corner brackets — mode-specific framing guide */}
      {/* Visual Search: square crop area. Look (4:5): squarer. Poster (9:16): taller. */}
      {(() => {
        const bracketTop = isVisualSearch ? '22%' : isPoster ? '14%' : '16%';
        const bracketBottom = isVisualSearch ? '32%' : isPoster ? '30%' : '30%';
        const bracketLeft = isVisualSearch ? '20%' : isPoster ? '8%' : '10%';
        const bracketRight = isVisualSearch ? '20%' : isPoster ? '8%' : '10%';
        const bracketColor = isVisualSearch ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.85)';
        return (
          <>
            <View style={[styles.bracketTL, { top: bracketTop, left: bracketLeft, borderColor: bracketColor }]} />
            <View style={[styles.bracketTR, { top: bracketTop, right: bracketRight, borderColor: bracketColor }]} />
            <View style={[styles.bracketBL, { bottom: bracketBottom, left: bracketLeft, borderColor: bracketColor }, renderBottomOverlay && styles.bracketBottomWithDeck]} />
            <View style={[styles.bracketBR, { bottom: bracketBottom, right: bracketRight, borderColor: bracketColor }, renderBottomOverlay && styles.bracketBottomWithDeck]} />
          </>
        );
      })()}

      {/* Center crosshair */}
      <View style={styles.crosshair} pointerEvents="none">
        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />
      </View>

      {/* Top controls — close (left), accessories + flash (right) */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 8 }]} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.topIconBtn, pressed && styles.btnPressed]}
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Close camera"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        <View style={styles.topRightControls}>
          {renderTopRightAccessory?.()}
          {/* Flash control moved to the expanded ControlsRail to reduce
              idle chrome. The top bar keeps only the close button and the
              screen-level accessory (overflow menu). */}
        </View>
      </View>

      {/* Vertical controls rail — right side */}
      {/* IDLE: only Flip + More are visible. EXPANDED: Flash, Zoom, Timer,
          Grid, Multi-capture are revealed. This keeps the viewfinder
          dominant — the camera preview is the hero, not a wall of controls. */}
      <ControlsRail
        top={Math.max(insets.top, 16) + 60}
        isVisualSearch={isVisualSearch}
        onFlip={toggleFacing}
        flash={flash}
        onCycleFlash={cycleFlash}
        onCycleZoom={cycleZoom}
        zoomLabel={zoomLabel}
        onCycleTimer={cycleTimer}
        timerOption={timerOption}
        onToggleGrid={toggleGrid}
        showGrid={showGrid}
        onToggleMultiCapture={toggleMultiCapture}
        multiCaptureMode={multiCaptureMode}
        multiCaptureCount={multiCaptures.length}
        hasCapturedUri={!!capturedUri}
        showTools={showTools}
        onToggleTools={() => { haptic.light(); setShowTools((p) => !p); }}
        accentColor={colors.antiqueGold}
        // ── Hands-free capture ──
        handsFreeMode={handsFreeMode}
        onToggleHandsFree={toggleHandsFree}
        // ── Speed modes ──
        speedMode={speedMode}
        onSpeedChange={handleSpeedChange}
        // ── Green screen (post-capture) ──
        greenScreenActive={!!greenScreenSettings}
        onToggleGreenScreen={toggleGreenScreen}
      />

      {/* Bottom controls — gallery, shutter, flip */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]} pointerEvents="box-none">
        {/* Gallery thumbnail + recent photos carousel */}
        <GalleryCarousel
          lastImageUri={lastImageUri}
          recentImages={recentImages}
          showRecentCarousel={showRecentCarousel}
          carouselBottom={Math.max(insets.bottom, 16) + 112}
          onGallery={onGallery}
          onLongPress={handleGalleryLongPress}
        />

        {/* Shutter — the hero control with recording ring */}
        <ShutterButton
          onPress={handleShutterPress}
          onLongPress={handleShutterLongPress}
          onPressOut={handleShutterPressOut}
          isRecording={isRecording}
          disabled={countdown !== null || handsFreeCountdown !== null}
          recordingProgress={recordingProgress}
          recordingRingScale={recordingRingScale}
          handsFreeMode={handsFreeMode}
          speedMode={speedMode}
        />

        {/* Spacer — flip is in the right rail, this keeps the shutter centered */}
        <View style={styles.bottomSpacer} />
      </View>

      {/* Recording timer badge — shown while recording.
          Includes speed indicator when a non-1× speed mode is active. */}
      {isRecording && (
        <View style={[styles.recordingBadge, { top: Math.max(insets.top, 16) + 60 }]} pointerEvents="none">
          <View style={[styles.recordingDot, { backgroundColor: colors.danger }]} />
          <Text style={styles.recordingTimerText}>
            {Math.floor(recordingElapsed / 1000)}s
            {speedMode !== DEFAULT_SPEED && `  ${speedMode}×`}
          </Text>
        </View>
      )}

      {/* ── Camera effect bar ─────────────────────────────────────────── */}
      {/* Horizontal scrollable bar of camera effect buttons. The selected
          effect is stored and applied post-capture (expo-camera does not
          support real-time color matrix filters). Shown above the bottom
          area when not recording, not in visual search, and no active
          countdown. Disabled during recording. */}
      {!isVisualSearch && handsFreeCountdown === null && countdown === null && (
        <View style={[styles.cameraEffectBarWrap, { bottom: Math.max(insets.bottom, 16) + 56 }]}>
          <CameraEffectBar
            activeEffect={cameraEffect}
            onSelectEffect={setCameraEffect}
            disabled={isRecording}
          />
        </View>
      )}

      {/* Speed mode segment control — shown above the bottom bar when
          tools are expanded. Uses CreatorSegmentControl for spring
          physics + selection haptic. The speed is stored in clip
          metadata; expo-camera records at 1× and the timeline applies
          the speed at playback (truthful labelling). */}
      {showTools && !isVisualSearch && !isRecording && handsFreeCountdown === null && countdown === null && (
        <View style={[styles.speedControlWrap, { bottom: Math.max(insets.bottom, 16) + 120 }]}>
          <CreatorSegmentControl
            segments={SPEED_MODES.map((s) => ({ label: s.label, value: s.value }))}
            value={speedMode}
            onChange={handleSpeedChange}
            testID="camera-speed-control"
          />
        </View>
      )}

      {/* Hands-free mode indicator — subtle badge when hands-free is armed */}
      {handsFreeMode && !isRecording && handsFreeCountdown === null && (
        <View style={[styles.handsFreeBadge, { top: Math.max(insets.top, 16) + 60 }]} pointerEvents="none">
          <Ionicons name="hand-right-outline" size={14} color={colors.antiqueGold} />
          <Text style={[styles.handsFreeBadgeText, { color: colors.antiqueGold }]}>Hands-free</Text>
        </View>
      )}

      {/* Green screen (post-capture) sheet — background image picker,
          key color, tolerance, feather. Real-time chroma keying is not
          feasible with expo-camera alone, so the effect is applied in
          post-production via Skia. Truthfully labelled. */}
      <GreenScreenSheet
        visible={showGreenScreenSheet}
        onApply={handleGreenScreenApply}
        onCancel={handleGreenScreenCancel}
      />

      {/* Green screen active indicator — shows the selected background
          thumbnail when green screen is armed */}
      {greenScreenSettings && !showGreenScreenSheet && (
        <View style={[styles.greenScreenBadge, { top: Math.max(insets.top, 16) + (handsFreeMode ? 100 : 60) }]} pointerEvents="none">
          <Image
            source={{ uri: greenScreenSettings.backgroundUri }}
            style={styles.greenScreenThumb}
          />
          <Text style={styles.greenScreenBadgeText}>Green Screen (post)</Text>
        </View>
      )}

      {/* Mode indicator (only when no bottom overlay and no mode switcher) */}
      {!renderBottomOverlay && (
        <View style={styles.modePill} pointerEvents="none">
          <Text style={styles.modeText}>{modeLabel}</Text>
        </View>
      )}

      {/* Optional bottom overlay (e.g. mode switcher) */}
      {renderBottomOverlay?.()}

      {/* ── Quick-review overlay ── */}
      {capturedUri && (
        <Reanimated.View
          style={[
            styles.reviewOverlay,
            { backgroundColor: colors.background },
            reviewOpacityStyle,
          ]}
        >
          <Image source={{ uri: capturedUri }} style={styles.reviewImage} />

          {/* Top scrim for close-area legibility over bright captures */}
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)']}
            style={styles.reviewTopScrim}
            pointerEvents="none"
          />

          {/* Review actions — refined layout with clear primary/secondary hierarchy.
              The primary action (Edit/Search/Done) is a prominent pill with an
              icon + label; secondary actions (Retake, Save, Add) are compact
              icon+label clusters. This matches iOS Camera/Snapchat post-capture
              patterns where the primary action is visually dominant. */}
          <View style={[styles.reviewActions, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
            {multiCaptureMode ? (
              <>
                {/* Multi-capture: Add another */}
                <Pressable
                  style={({ pressed }) => [styles.reviewBtn, pressed && styles.btnPressed]}
                  onPress={handleAddAnother}
                  hitSlop={12}
                  accessibilityLabel="Add another photo"
                  accessibilityHint="Captures another photo without leaving the camera"
                  accessibilityRole="button"
                >
                  <Ionicons name="add-circle-outline" size={26} color="#fff" />
                  <Text style={styles.reviewBtnLabel}>Add</Text>
                </Pressable>

                {/* Multi-capture: Done — primary action */}
                <Pressable
                  style={({ pressed }) => [styles.reviewPrimaryBtn, { backgroundColor: colors.textPrimary }, pressed && styles.btnPressed]}
                  onPress={handleFinishMultiCapture}
                  hitSlop={16}
                  accessibilityLabel={`Finish multi-capture and edit, ${multiCaptures.length + 1} photos selected`}
                  accessibilityRole="button"
                >
                  <Ionicons name="checkmark" size={28} color={colors.background} />
                  <Text style={[styles.reviewPrimaryLabel, { color: colors.background }]}>
                    Done ({multiCaptures.length + 1})
                  </Text>
                </Pressable>

                {/* Retake current */}
                <Pressable
                  style={({ pressed }) => [styles.reviewBtn, pressed && styles.btnPressed]}
                  onPress={handleRetake}
                  hitSlop={12}
                  accessibilityLabel="Retake current photo"
                  accessibilityHint="Discards the current photo and returns to the camera"
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh-outline" size={26} color="#fff" />
                  <Text style={styles.reviewBtnLabel}>Retake</Text>
                </Pressable>
              </>
            ) : (
              <>
                {/* Retake */}
                <Pressable
                  style={({ pressed }) => [styles.reviewBtn, pressed && styles.btnPressed]}
                  onPress={handleRetake}
                  hitSlop={12}
                  accessibilityLabel="Retake photo"
                  accessibilityHint="Discards the current photo and returns to the camera"
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh-outline" size={26} color="#fff" />
                  <Text style={styles.reviewBtnLabel}>Retake</Text>
                </Pressable>

                {/* Use — primary action */}
                <Pressable
                  style={({ pressed }) => [styles.reviewPrimaryBtn, { backgroundColor: colors.textPrimary }, pressed && styles.btnPressed]}
                  onPress={handleConfirmCapture}
                  hitSlop={16}
                  accessibilityLabel={isVisualSearch ? 'Search with this photo' : 'Edit in studio'}
                  accessibilityHint={isVisualSearch ? 'Starts a visual search with the captured photo' : 'Opens the studio editor with this photo'}
                  accessibilityRole="button"
                >
                  <Ionicons name="arrow-forward" size={28} color={colors.background} />
                  <Text style={[styles.reviewPrimaryLabel, { color: colors.background }]}>
                    {isVisualSearch ? 'Search' : 'Edit'}
                  </Text>
                </Pressable>

                {/* Save to gallery */}
                <Pressable
                  style={({ pressed }) => [styles.reviewBtn, pressed && styles.btnPressed]}
                  onPress={handleSaveToGallery}
                  hitSlop={12}
                  accessibilityLabel="Save to gallery"
                  accessibilityHint="Saves the photo to the device photo library"
                  accessibilityRole="button"
                >
                  <Ionicons name="download-outline" size={26} color="#fff" />
                  <Text style={styles.reviewBtnLabel}>Save</Text>
                </Pressable>
              </>
            )}
          </View>
        </Reanimated.View>
      )}
      </View>
    </GestureDetector>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Camera-overlay whites ──────────────────────────────────────────
  // The camera preview is always dark regardless of app theme, so overlay
  // controls (brackets, crosshair, grid, labels, shutter ring, review
  // secondary actions) intentionally use white / rgba(255,255,255,*) for
  // high contrast. The theme has no `textOnMedia` token, and `textPrimary`
  // resolves to black in light mode (invisible on dark preview), so these
  // are kept as literal whites. Semantic colours (danger, antiqueGold) and
  // non-overlay surfaces (review overlay, primary button) use theme tokens
  // via inline overrides above.
  // Permission states — superseded by the extracted PermissionState.tsx
  // component. Retained for reference but not rendered here; live permission
  // colours live in PermissionState.tsx (createStyles(colors) factory).
  permissionOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionContent: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  permissionIconWrap: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
  },
  permissionTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: 18,
    color: '#fff',
    marginTop: Space.xs,
  },
  permissionText: {
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    marginTop: Space.md,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: Radius.xxl,
    backgroundColor: '#fff',
  },
  permissionBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    color: '#000',
  },
  galleryFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  galleryFallbackText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  // Gradient overlays
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  // Grid overlay (rule-of-thirds)
  gridOverlay: {
    ...StyleSheet.absoluteFill,
  },
  gridLineV1: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridLineV2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridLineH1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridLineH2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  // Focus reticle — SvgCircle-based with spring scale + color transition
  focusReticle: {
    position: 'absolute',
    width: FOCUS_RETICLE_SIZE,
    height: FOCUS_RETICLE_SIZE,
    pointerEvents: 'none',
  },
  // Pinch zoom indicator — subtle pill at bottom center
  zoomIndicator: {
    position: 'absolute',
    bottom: 220,
    alignSelf: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.xxl,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  zoomIndicatorText: {
    fontFamily: Typography.family.bold,
    fontSize: Type.bodyLarge.size,
    color: '#fff',
  },
  // Capture flash — full-screen white overlay
  captureFlash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#fff',
  },
  // Countdown overlay
  countdownOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    fontFamily: Typography.family.bold,
    fontSize: 96,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  // Corner brackets — refined 2pt stroke, smaller and more elegant
  bracketTL: {
    position: 'absolute',
    top: '18%',
    left: '12%',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_STROKE,
    borderLeftWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderTopLeftRadius: 8,
  },
  bracketTR: {
    position: 'absolute',
    top: '18%',
    right: '12%',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_STROKE,
    borderRightWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderTopRightRadius: 8,
  },
  bracketBL: {
    position: 'absolute',
    bottom: '28%',
    left: '12%',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_STROKE,
    borderLeftWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderBottomLeftRadius: 8,
  },
  bracketBR: {
    position: 'absolute',
    bottom: '28%',
    right: '12%',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_STROKE,
    borderRightWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderBottomRightRadius: 8,
  },
  bracketBottomWithDeck: {
    bottom: '38%',
  },
  // Crosshair — centered in the framing guide area
  crosshair: {
    position: 'absolute',
    left: '50%',
    top: '42%',
    width: 24,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    position: 'absolute',
    width: 24,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  crosshairV: {
    position: 'absolute',
    width: 2,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: Space.sm,
  },
  topRightControls: {
    flexDirection: 'row',
    gap: 8,
  },
  // Top bar buttons — transparent (AGENTS.md §4: ordinary controls default to transparent)
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Vertical controls rail — transparent, icon + label only (Snapchat/iOS Camera pattern)
  controlsRail: {
    position: 'absolute',
    right: 8,
    gap: 16,
    alignItems: 'center',
  },
  railBtn: {
    width: 48,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  railLabel: {
    fontFamily: Typography.family.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
  },
  zoomLabel: {
    fontFamily: Typography.family.bold,
    fontSize: Type.body.size,
    color: '#fff',
  },
  // Recent photos carousel
  recentCarousel: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recentCarouselContent: {
    paddingHorizontal: Space.md,
    gap: 8,
  },
  recentThumbWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  recentThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
  },
  // Mode pill — transparent, text only
  modePill: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 6,
  },
  modeText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.captionElevated.size,
    color: '#fff',
  },
  // Bottom bar — compact: shutter (78pt) + gallery (44pt) + spacer.
  // Reduced from 120pt to 100pt minHeight so the viewfinder dominates more.
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Space.lg,
    paddingTop: 10,
    minHeight: 100,
  },
  galleryBtn: {
    alignItems: 'center',
    gap: 4,
    width: 56,
    minHeight: 56,
    justifyContent: 'center',
  },
  galleryThumb: {
    width: GALLERY_THUMB_SIZE,
    height: GALLERY_THUMB_SIZE,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  galleryThumbPlaceholder: {
    width: GALLERY_THUMB_SIZE,
    height: GALLERY_THUMB_SIZE,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSpacer: {
    width: 56,
    minHeight: 56,
  },
  bottomLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
    color: 'rgba(255,255,255,0.85)',
  },
  // Shutter — superseded by the extracted ShutterButton.tsx component.
  // These styles are retained for reference but are not rendered here; the
  // live shutter/recording colours live in ShutterButton.tsx + RecordingRing.tsx.
  shutterOuter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  shutterInner: {
    width: SHUTTER_INNER,
    height: SHUTTER_INNER,
    borderRadius: SHUTTER_INNER / 2,
    backgroundColor: '#fff',
  },
  shutterInnerRecording: {
    width: SHUTTER_INNER * 0.6,
    height: SHUTTER_INNER * 0.6,
    borderRadius: Radius.sm,
    // Superseded — live recording colour is colors.danger in ShutterButton.tsx
  },
  // Recording ring — wraps the shutter with SVG progress
  recordingRingWrap: {
    position: 'absolute',
    top: -(RECORDING_RING_SIZE - SHUTTER_SIZE) / 2,
    left: -(RECORDING_RING_SIZE - SHUTTER_SIZE) / 2,
    width: RECORDING_RING_SIZE,
    height: RECORDING_RING_SIZE,
  },
  // Camera mode switcher — Photo / Video / Boomerang
  modeSwitcher: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.xl,
    height: MODE_SWITCHER_HEIGHT,
    alignItems: 'center',
  },
  modeTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.sm,
    height: MODE_SWITCHER_HEIGHT,
  },
  modeTabText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: 'rgba(255,255,255,0.6)',
  },
  modeTabTextActive: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
  },
  modeUnderline: {
    position: 'absolute',
    bottom: 2,
    width: 24,
    height: 3,
    borderRadius: Radius.full,
    // backgroundColor applied inline via colors.antiqueGold (theme token)
  },
  // Recording badge — timer + red dot at top
  recordingBadge: {
    position: 'absolute',
    left: '50%',
    marginLeft: -40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    // backgroundColor applied inline via colors.danger (theme token)
  },
  recordingTimerText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: '#fff',
  },
  // Quick-review overlay
  reviewOverlay: {
    ...StyleSheet.absoluteFill,
    // backgroundColor applied inline via colors.background (theme token)
    zIndex: 100,
  },
  reviewImage: {
    ...StyleSheet.absoluteFill,
    resizeMode: 'contain',
  },
  // Top scrim for the review overlay — ensures any top chrome is legible
  // over bright captures (white backgrounds, light product photography).
  reviewTopScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  reviewActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
  },
  reviewBtn: {
    alignItems: 'center',
    gap: 6,
  },
  reviewBtnLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    color: 'rgba(255,255,255,0.85)',
  },
  reviewPrimaryBtn: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    // backgroundColor applied inline via colors.textPrimary (theme token)
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  reviewPrimaryLabel: {
    fontFamily: Typography.family.bold,
    fontSize: Type.caption.size,
    // color applied inline via colors.background (theme token)
  },
  // ── Speed mode segment control wrapper ──
  // Positioned above the bottom bar, centered. The segment control
  // itself is 36pt tall with equal-width segments.
  speedControlWrap: {
    position: 'absolute',
    left: Space.lg,
    right: Space.lg,
    alignSelf: 'center',
    maxWidth: 320,
  },
  // ── Camera effect bar wrapper ──
  // Positioned above the bottom area (mode switcher + shutter). The
  // CameraEffectBar is a transparent horizontal scroll — no card, no
  // background — so it reads as an overlay on the camera preview.
  cameraEffectBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // ── Hands-free mode badge ──
  // Subtle indicator that hands-free is armed. Positioned at top-left
  // so it doesn't conflict with the recording badge (top-center).
  handsFreeBadge: {
    position: 'absolute',
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  handsFreeBadgeText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  // ── Green screen active badge ──
  // Shows the selected background thumbnail + truthful "post-capture" label.
  greenScreenBadge: {
    position: 'absolute',
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  greenScreenThumb: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
  },
  greenScreenBadgeText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    color: 'rgba(255,255,255,0.85)',
  },
});
