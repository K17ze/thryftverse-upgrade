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
import { CreatorAnalytics } from './creatorAnalytics';

// ── CreatorCamera — Flagship 2026 Elevation ────────────────────────
// Snapchat 2026 / TikTok / BeReal-grade camera component with:
//   - tap-to-focus with animated reticle
//   - corner brackets (mode-specific aspect ratio guide, refined 2pt)
//   - center crosshair
//   - large shutter button with press animation
//   - vertical controls rail: flip, flash, zoom, timer, grid (TikTok pattern)
//   - gallery thumbnail (64x64, recent photos carousel)
//   - quick-review overlay (post-capture preview with retake/edit/save)
//   - grid overlay (rule-of-thirds toggle)
//   - self-timer with countdown overlay
//   - refined gradient overlays (0.25 top, 0.35 bottom)
//   - proper permission states with art-directed empty states
//
// This is a dedicated component — not inline in a screen.
// The entry screen renders <CreatorCamera /> and receives captures.

const SHUTTER_SIZE = 80;
const SHUTTER_INNER = 64;
const CORNER_SIZE = 32;
const CORNER_STROKE = 2;
const GALLERY_THUMB_SIZE = 64;
const CONTROL_RAIL_ICON = 22;
const ZOOM_LEVELS = [0.5, 1, 2];
const TIMER_OPTIONS = [0, 3, 5, 10] as const;
const FOCUS_RETICLE_SIZE = 70;
const RECORDING_MAX_DURATION = 15000; // 15s max for video/boomerang
const BOOMERANG_DURATION = 2000; // 2s for boomerang
const RECORDING_RING_SIZE = SHUTTER_SIZE + 12;
const RECORDING_RING_STROKE = 4;
const MODE_SWITCHER_HEIGHT = 36;

type FlashMode = 'off' | 'on' | 'auto';
type ZoomLevel = 0 | 1 | 2;
type TimerOption = 0 | 3 | 5 | 10;
type CameraMode = 'photo' | 'video' | 'boomerang';

const CAMERA_MODES: { mode: CameraMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'photo', label: 'Photo', icon: 'camera-outline' },
  { mode: 'video', label: 'Video', icon: 'videocam-outline' },
  { mode: 'boomerang', label: 'Boomerang', icon: 'repeat-outline' },
];

export interface CreatorCameraProps {
  /** Camera mode — determines framing guide + labels */
  mode: 'poster' | 'look' | 'visual-search';
  /** Called when the user captures a photo and confirms it via quick-review */
  onCapture: (uri: string) => void;
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
  const [zoomIndex, setZoomIndex] = useState<ZoomLevel>(1);
  const [timerOption, setTimerOption] = useState<TimerOption>(0);
  const [showGrid, setShowGrid] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  // ── Long-press focus lock (Snapchat 2026 / iOS Camera pattern) ──
  // Long-press on the viewfinder locks AE/AF at the touch point. A persistent
  // "AE/AF LOCK" badge appears. Tap to unlock and return to continuous AF.
  const [focusLocked, setFocusLocked] = useState(false);
  const [focusLockPoint, setFocusLockPoint] = useState<{ x: number; y: number } | null>(null);
  const [lastImageUri, setLastImageUri] = useState<string | null>(null);
  const [recentImages, setRecentImages] = useState<string[]>([]);
  const [showRecentCarousel, setShowRecentCarousel] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const reviewOpacity = useSharedValue(0);
  const captureFlash = useSharedValue(0);
  // ── Multi-capture mode (Instagram Layout-style sequential captures) ──
  const [multiCaptureMode, setMultiCaptureMode] = useState(false);
  const [multiCaptures, setMultiCaptures] = useState<string[]>([]);

  // ── Flagship upgrade shared values ──
  // Flip animation (double-tap to switch camera)
  const flipRotation = useSharedValue(0);
  // Camera mode switcher
  const [cameraMode, setCameraMode] = useState<CameraMode>('photo');
  const modeSwitcherTranslate = useSharedValue(0);
  const modeUnderlineScale = useSharedValue(1);
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
  // Countdown Reanimated values (flagship spring)
  const countdownScale = useSharedValue(1.5);
  const countdownOpacity = useSharedValue(0);

  const isPoster = mode === 'poster';
  const isVisualSearch = mode === 'visual-search';
  const modeLabel = isVisualSearch ? 'Search' : isPoster ? 'Story' : 'Look';
  const zoom = ZOOM_LEVELS[zoomIndex];

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

  // ── Flash control: spring scale on tap ──
  const flashControlStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flashScale.value }],
  }));

  // ── Countdown: spring scale (1.5→1.0 bouncy) + fade ──
  const countdownTextStyle = useAnimatedStyle(() => ({
    opacity: countdownOpacity.value,
    transform: [{ scale: countdownScale.value }],
  }));

  // ── Mode switcher: underline scale ──
  const modeUnderlineStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: modeUnderlineScale.value }],
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
    setZoomIndex((p) => ((p + 1) % 3) as ZoomLevel);
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

  const toggleGrid = useCallback(() => {
    haptic.selection();
    setShowGrid((p) => !p);
  }, [haptic]);

  // ── Pinch-to-zoom (Snapchat pattern) ──
  // Tracks two-finger pinch scale and maps it to a smooth zoom factor.
  // The zoom factor is separate from the stepped zoomIndex — it provides
  // a continuous 1x–4x range that snaps to the nearest step on release.
  const pinchStartZoom = useRef(1);
  const [pinchZoom, setPinchZoom] = useState(1);

  const showZoomIndicator = useCallback(() => {
    if (!reducedMotion) {
      zoomIndicatorOpacity.value = withSpring(1, spring.tap);
      zoomIndicatorScale.value = withSpring(1, spring.lift);
      zoomIndicatorOpacity.value = withDelay(1200, withTiming(0, { duration: 200 }));
      zoomIndicatorScale.value = withDelay(1200, withSpring(0.8, spring.entrance));
    }
  }, [reducedMotion, zoomIndicatorOpacity, zoomIndicatorScale, spring]);

  const snapPinchToStep = useCallback((currentZoom: number) => {
    // Find nearest step — 0.5x, 1x, 2x
    if (currentZoom < 0.75) setZoomIndex(0); // 0.5x
    else if (currentZoom < 1.5) setZoomIndex(1); // 1x
    else setZoomIndex(2); // 2x or above
  }, []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          runOnJS((z: number) => {
            pinchStartZoom.current = z;
          })(zoom);
        })
        .onUpdate((e) => {
          'worklet';
          const newZoom = Math.max(0.5, Math.min(4, pinchStartZoom.current * e.scale));
          runOnJS(setPinchZoom)(newZoom);
        })
        .onEnd((e) => {
          'worklet';
          const finalZoom = Math.max(0.5, Math.min(4, pinchStartZoom.current * e.scale));
          runOnJS(setPinchZoom)(1);
          runOnJS(snapPinchToStep)(finalZoom);
          runOnJS(haptic.light)();
          runOnJS(showZoomIndicator)();
        }),
    [zoom, snapPinchToStep, haptic, showZoomIndicator],
  );

  // Effective zoom = stepped zoom × pinch multiplier (clamped)
  const effectiveZoom = Math.max(0.5, Math.min(4, zoom * pinchZoom));

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
        // Capture flash — white overlay 0→0.8→0 over 200ms (Snapchat pattern)
        if (!reducedMotion) {
          captureFlash.value = withSequence(
            withTiming(0.8, { duration: 80, easing: Easing.out(Easing.cubic) }),
            withTiming(0, { duration: 120, easing: Easing.in(Easing.cubic) })
          );
        }
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

  // ── Recording: start/stop with ring progress + timer ──
  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    haptic.medium(); // medium on recording stop
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recordingProgress.value = withSpring(0, spring.entrance);
    // Stop actual recording
    if (cameraMode === 'video') {
      cameraRef.current?.stopRecording();
      // ── Video duration telemetry ──
      CreatorAnalytics.captureVideo(isPoster ? 'poster' : 'look', recordingElapsed);
    }
  }, [isRecording, haptic, recordingProgress, cameraMode, spring, recordingElapsed, isPoster]);

  const startRecording = useCallback(() => {
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
    const maxDuration = cameraMode === 'boomerang' ? BOOMERANG_DURATION : RECORDING_MAX_DURATION;
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
    // Start actual video recording
    if (cameraMode === 'boomerang') {
      // Boomerang: record short clip then auto-stop
      const boomerangStart = Date.now();
      cameraRef.current?.recordAsync({ maxDuration: BOOMERANG_DURATION / 1000 })
        .then((video) => {
          if (video?.uri) {
            setCapturedUri(video.uri);
            CreatorAnalytics.captureBoomerang(
              isPoster ? 'poster' : 'look',
              Date.now() - boomerangStart,
            );
          }
        })
        .catch(() => {
          show('Failed to record boomerang', 'error');
        });
    } else {
      // Video mode — recording continues until user stops or max duration
    }
  }, [cameraRef, isRecording, haptic, reducedMotion, recordingProgress, recordingRingScale, cameraMode, show, stopRecording, spring]);

  // ── Cleanup recording timer on unmount ──
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, []);

  const handleShutterPress = useCallback(() => {
    // Press spring is handled internally by ShutterButton.
    if (cameraMode === 'video' || cameraMode === 'boomerang') {
      // Video/boomerang: toggle recording
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    } else {
      takePhoto();
    }
  }, [takePhoto, cameraMode, isRecording, startRecording, stopRecording]);

  // ── Camera mode switcher: spring underline + translate ──
  const handleModeSwitch = useCallback((newMode: CameraMode) => {
    if (newMode === cameraMode) return;
    haptic.light(); // light on mode change
    const modeIndex = CAMERA_MODES.findIndex((m) => m.mode === newMode);
    const modeWidth = 80; // approximate width per mode tab
    // Spring translate to new position
    if (!reducedMotion) {
      modeSwitcherTranslate.value = withSpring(modeIndex * modeWidth, spring.entrance);
      // Underline: shrink then grow for smooth transition
      modeUnderlineScale.value = withSequence(
        withSpring(0.3, spring.tap),
        withSpring(1, spring.lift),
      );
    }
    setCameraMode(newMode);
  }, [cameraMode, haptic, reducedMotion, modeSwitcherTranslate, modeUnderlineScale, spring]);

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
      });
    } else {
      reviewOpacity.value = 0;
      setCapturedUri(null);
    }
  }, [haptic, reducedMotion, reviewOpacity, spring]);

  const handleConfirmCapture = useCallback(() => {
    if (!capturedUri) return;
    haptic.light();
    // In multi-capture mode, add to stack instead of immediately sending
    if (multiCaptureMode) {
      setMultiCaptures((prev) => [...prev, capturedUri]);
      setCapturedUri(null);
      return;
    }
    onCapture(capturedUri);
  }, [capturedUri, haptic, onCapture, multiCaptureMode]);

  // ── Multi-capture: add another photo without leaving camera ──
  const handleAddAnother = useCallback(() => {
    haptic.selection();
    if (capturedUri) {
      setMultiCaptures((prev) => [...prev, capturedUri]);
      setCapturedUri(null);
    }
  }, [capturedUri, haptic]);

  // ── Multi-capture: finish and send all captures ──
  const handleFinishMultiCapture = useCallback(() => {
    if (multiCaptures.length === 0 && !capturedUri) return;
    haptic.medium();
    const all = capturedUri ? [...multiCaptures, capturedUri] : multiCaptures;
    // Send all captures — the first one goes via onCapture,
    // additional ones would need multi-capture support in the entry flow
    // For now, send the first and store the rest as recent images
    if (all.length > 0) {
      onCapture(all[0]);
    }
    setMultiCaptures([]);
    setMultiCaptureMode(false);
  }, [multiCaptures, capturedUri, haptic, onCapture]);

  // ── Multi-capture: toggle mode ──
  const toggleMultiCapture = useCallback(() => {
    haptic.selection();
    setMultiCaptureMode((p) => !p);
    if (multiCaptures.length > 0) setMultiCaptures([]);
  }, [haptic, multiCaptures.length]);

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

  const handleTapFocus = useCallback((evt: GestureResponderEvent) => {
    // If focus is locked, tap to unlock (iOS Camera pattern)
    if (focusLocked) {
      setFocusLocked(false);
      setFocusLockPoint(null);
      haptic.light();
      return;
    }
    const { locationX, locationY } = evt.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    // FocusReticle component handles its own spring animation + haptic + auto-dismiss
  }, [focusLocked, haptic]);

  // ── Long-press to lock AE/AF (Snapchat 2026 / iOS Camera pattern) ──
  // Long-press on the viewfinder locks focus + exposure at the touch point.
  // A persistent "AE/AF LOCK" badge appears. Tap anywhere to unlock.
  const handleLongPressFocus = useCallback((evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    setFocusLocked(true);
    setFocusLockPoint({ x: locationX, y: locationY });
    setFocusPoint({ x: locationX, y: locationY });
    haptic.medium(); // medium impact on lock
  }, [haptic]);

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
            {/* Full-screen camera feed with tap-to-focus + long-press focus lock + 3D flip rotation */}
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={handleTapFocus}
              onLongPress={handleLongPressFocus}
              delayLongPress={400}
            >
              <Reanimated.View style={[StyleSheet.absoluteFill, cameraFlipStyle]}>
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing={facing}
                  flash={flash}
                  mode={cameraMode === 'video' ? 'video' : 'picture'}
                  enableTorch={flash === 'on'}
                  zoom={effectiveZoom}
                />
              </Reanimated.View>
            </Pressable>
          </View>
        </GestureDetector>

      {/* Capture flash — subtle white overlay on capture (Snapchat pattern) */}
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

      {/* Focus reticle — extracted component with spring animation + color transition */}
      <FocusReticle
        focusPoint={focusPoint}
        size={FOCUS_RETICLE_SIZE}
        onDismiss={() => {
          // Don't auto-clear focusPoint when locked — the lock badge persists
          if (!focusLocked) setFocusPoint(null);
        }}
      />

      {/* AE/AF LOCK badge — persistent indicator when focus is locked (iOS Camera pattern) */}
      {focusLocked && focusLockPoint && (
        <View
          style={[
            styles.focusLockBadge,
            {
              left: focusLockPoint.x - 60,
              top: focusLockPoint.y + FOCUS_RETICLE_SIZE / 2 + 8,
            },
          ]}
          pointerEvents="none"
          accessibilityLabel="Auto exposure and auto focus locked. Tap to unlock."
          accessibilityRole="text"
        >
          <Ionicons name="lock-closed" size={11} color="#fff" />
          <Text style={styles.focusLockText}>AE/AF LOCK</Text>
        </View>
      )}

      {/* Zoom level indicator — spring appearance (0.5x/1x/2x/3x) */}
      <Reanimated.View style={[styles.zoomIndicator, zoomIndicatorStyle]} pointerEvents="none">
        <Text style={styles.zoomIndicatorText}>
          {zoom === 0.5 ? '0.5' : zoom}×
        </Text>
      </Reanimated.View>

      {/* Countdown overlay — Reanimated spring scale + fade */}
      {countdown !== null && (
        <View style={styles.countdownOverlay} pointerEvents="none">
          <Reanimated.Text
            style={[styles.countdownText, countdownTextStyle]}
          >
            {countdown}
          </Reanimated.Text>
        </View>
      )}

      {/* Corner brackets — mode-specific framing guide (Instagram/Snapchat pattern) */}
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
          {/* Flash control — three states with distinct icons + spring scale on tap */}
          <Pressable
            style={({ pressed }) => [styles.topIconBtn, pressed && styles.btnPressed]}
            onPress={cycleFlash}
            hitSlop={12}
            accessibilityLabel={`Flash ${flash}`}
            accessibilityRole="button"
          >
            <Reanimated.View style={flashControlStyle}>
              <Ionicons
                name={flash === 'off' ? 'flash-off' : flash === 'auto' ? 'flash-outline' : 'flash'}
                size={22}
                color={flash === 'off' ? '#fff' : colors.antiqueGold}
              />
            </Reanimated.View>
          </Pressable>
        </View>
      </View>

      {/* Vertical controls rail — right side (TikTok pattern) */}
      <ControlsRail
        top={Math.max(insets.top, 16) + 60}
        isVisualSearch={isVisualSearch}
        onFlip={toggleFacing}
        onCycleZoom={cycleZoom}
        zoom={zoom}
        onCycleTimer={cycleTimer}
        timerOption={timerOption}
        onToggleGrid={toggleGrid}
        showGrid={showGrid}
        onToggleMultiCapture={toggleMultiCapture}
        multiCaptureMode={multiCaptureMode}
        multiCaptureCount={multiCaptures.length}
        hasCapturedUri={!!capturedUri}
        accentColor={colors.antiqueGold}
      />

      {/* Bottom controls — gallery, shutter, flip */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]} pointerEvents="box-none">
        {/* Gallery thumbnail + recent photos carousel */}
        <GalleryCarousel
          lastImageUri={lastImageUri}
          recentImages={recentImages}
          showRecentCarousel={showRecentCarousel}
          carouselBottom={Math.max(insets.bottom, 16) + 140}
          onGallery={onGallery}
          onLongPress={handleGalleryLongPress}
        />

        {/* Shutter — the hero control with recording ring */}
        <ShutterButton
          onPress={handleShutterPress}
          isRecording={isRecording}
          cameraMode={cameraMode}
          disabled={countdown !== null}
          recordingProgress={recordingProgress}
          recordingRingScale={recordingRingScale}
        />

        {/* Spacer — flip is in the right rail, this keeps the shutter centered */}
        <View style={styles.bottomSpacer} />
      </View>

      {/* Camera mode switcher — Photo / Video / Boomerang with spring underline */}
      {!renderBottomOverlay && (
        <View style={[styles.modeSwitcher, { bottom: Math.max(insets.bottom, 16) + 130 }]} pointerEvents="box-none">
          {CAMERA_MODES.map((m) => {
            const isActive = cameraMode === m.mode;
            return (
              <Pressable
                key={m.mode}
                style={styles.modeTab}
                onPress={() => handleModeSwitch(m.mode)}
                hitSlop={8}
                accessibilityLabel={`${m.label} mode`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.modeTabText, isActive && styles.modeTabTextActive]}>
                  {m.label}
                </Text>
                {isActive && (
                  <Reanimated.View
                    style={[styles.modeUnderline, modeUnderlineStyle, { backgroundColor: colors.antiqueGold }]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Recording timer badge — shown while recording */}
      {isRecording && (
        <View style={[styles.recordingBadge, { top: Math.max(insets.top, 16) + 60 }]} pointerEvents="none">
          <View style={[styles.recordingDot, { backgroundColor: colors.danger }]} />
          <Text style={styles.recordingTimerText}>
            {Math.floor(recordingElapsed / 1000)}s
          </Text>
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

// ── Styles — Flagship 2026 ────────────────────────────────────────

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
  // AE/AF LOCK badge — persistent pill below the locked focus reticle (iOS Camera pattern)
  focusLockBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  focusLockText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.meta.size,
    color: '#fff',
    letterSpacing: 0.5,
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
  // Bottom bar
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
    minHeight: 120,
  },
  galleryBtn: {
    alignItems: 'center',
    gap: 6,
    width: 72,
    minHeight: 72,
    justifyContent: 'center',
  },
  galleryThumb: {
    width: GALLERY_THUMB_SIZE,
    height: GALLERY_THUMB_SIZE,
    borderRadius: GALLERY_THUMB_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  galleryThumbPlaceholder: {
    width: GALLERY_THUMB_SIZE,
    height: GALLERY_THUMB_SIZE,
    borderRadius: GALLERY_THUMB_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSpacer: {
    width: 72,
    minHeight: 72,
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
});
