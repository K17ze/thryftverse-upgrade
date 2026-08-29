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
  AppStateStatus } from 'react-native';
import {
  Camera,
  type CameraRef,
  useCameraDevice,
  usePhotoOutput,
  useVideoOutput } from 'react-native-vision-camera';
import { SkiaCamera, type SkiaCameraRef } from 'react-native-vision-camera-skia';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Typography, Radius, Space, Stroke} from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { IconGrammar } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { makeStableId } from '../utils/createStableId';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
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
  Extrapolation } from 'react-native-reanimated';
import { FocusReticle } from './camera/FocusReticle';
import { RecordingRing } from './camera/RecordingRing';
import { ShutterButton } from './camera/ShutterButton';
import { GalleryCarousel } from './camera/GalleryCarousel';
import { PermissionState } from './camera/PermissionState';
import { GreenScreenSheet, type GreenScreenSettings } from './camera/GreenScreenSheet';
import { CaptureToolsSheet, type TimerOption as SheetTimerOption } from './camera/CaptureToolsSheet';
import { useCameraEffectProcessor } from './camera/useCameraEffectProcessor';
import type { CameraEffectId } from './camera/CameraEffectBar';
import { CreatorAnalytics } from './creatorAnalytics';
import type { CreatorInitialMedia } from '../navigation/types';
import { useCreatorCapturePermissions } from './capture/useCreatorCapturePermissions';
import {
  useCaptureViewport,
  viewPointToViewportNormalized,
  type CaptureViewport } from './capture/CaptureViewport';
import { isCapabilitySupported } from './capabilities/registry';

// ── CreatorCamera ────────────────────────────────────────────────────
// Camera component with:
//   - real tap-to-focus via VisionCamera focusTo() (AE/AF/AWB metering)
//   - microphone permission ownership with muted-video fallback
//   - corner brackets (mode-specific aspect ratio guide, refined 2pt)
//   - center crosshair
//   - large shutter button with tap=photo / press-and-hold=video
//   - top bar: close (left), flash + tools (right)
//   - bottom bar: gallery (left), shutter (center), flip (right)
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
const CORNER_SIZE = 32;
const CORNER_STROKE = 2;
// Video capture is gated by the capability registry — the single source
// of truth for which creator capabilities have verified edit, viewer,
// export, and backend support.
const CAMERA_VIDEO_CAPTURE_ENABLED = isCapabilitySupported('videoCapture');
// Zoom is a numeric value passed to vision-camera's zoom prop. UI labels
// (1×, 2×, 3×) map to device zoom multipliers.
const ZOOM_STEPS = [
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '3×', value: 3 },
] as const;
const FOCUS_RETICLE_SIZE = 70;
const RECORDING_MAX_DURATION = 15000; // 15s max for video
// Press-and-hold threshold for video recording is 250ms, set in
// ShutterButton.tsx via delayLongPress. A quick tap lands as a photo;
// a hold beyond that threshold starts video recording.

// ── Hands-free capture (Snapchat hands-free pattern) ──
// When enabled, a 3-second countdown runs, then recording begins
// automatically and stops at HANDS_FREE_DEFAULT_DURATION. The user
// can tap to stop early. This lets the user prop the phone and capture
// without holding the shutter.
const HANDS_FREE_COUNTDOWN = 3; // seconds
const HANDS_FREE_DEFAULT_DURATION = 10000; // 10s default
const HANDS_FREE_MAX_DURATION = 30000; // 30s max

// ── Capture speed modes ──
// vision-camera supports native fps control via the video output's
// recording options. The selected speed multiplier is stored in the clip
// metadata (CreatorInitialMedia.speed) so the timeline/export engine
// can apply it at playback, and the native recording fps is adjusted
// for true slow-motion (high fps) or fast-motion (low fps).
const DEFAULT_SPEED = '1';

type FlashMode = 'off' | 'on' | 'auto';
type ZoomStepIndex = 0 | 1 | 2;
type TimerOption = 0 | 3 | 5 | 10;
type CapturedMediaMetadata = Pick<
  CreatorInitialMedia,
  'width' | 'height' | 'durationMs' | 'mimeType'
>;

function getPhotoMimeType(containerFormat: string): string | undefined {
  switch (containerFormat.toLowerCase()) {
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'heif':
    case 'heic':
      return 'image/heif';
    case 'png':
      return 'image/png';
    case 'dng':
      return 'image/x-adobe-dng';
    default:
      return undefined;
  }
}

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
  /** Called whenever the measured capture viewport changes. The parent
   *  uses this to build the camera→editor transition snapshot with the
   *  source content transform (the guide frame rect in screen coordinates)
   *  so the destination can calculate its crop/focal point from the
   *  source content transform. */
  onViewportChange?: (viewport: CaptureViewport | null) => void;
}

export default function CreatorCamera({
  mode,
  onCapture,
  onCaptureBatch,
  onGallery,
  onClose,
  renderBottomOverlay,
  renderTopRightAccessory,
  onViewportChange }: CreatorCameraProps) {
  const { show } = useToast();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const cameraRef = useRef<CameraRef | SkiaCameraRef>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(facing);
  // Single permission owner: useCreatorCapturePermissions wraps both
  // camera and microphone permission state. Do not call useCameraPermission
  // directly — that creates a duplicate owner and divergent state.
  const capturePermissions = useCreatorCapturePermissions();
  const { cameraGranted: hasPermission, canRequestCamera: canRequestPermission, requestCamera: requestPermission } = capturePermissions;
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'balanced', quality: 0.92 });
  // Gate audio on microphone permission — if mic is denied or not yet
  // requested, record muted video. The mic permission is requested
  // lazily on the first video recording attempt (see beginVideoRecording).
  // VisionCamera v5: "Enabling Audio requires microphone permission."
  const videoOutput = useVideoOutput({ enableAudio: capturePermissions.shouldRecordAudio });
  const [cameraReady, setCameraReady] = useState(false);
  // Deactivate the camera on unmount to release the native CameraSession
  // promptly. Without this, the native session can linger until GC, causing
  // "A resource failed to call release" warnings and blocking other camera
  // consumers (e.g. VisualSearchCamera) from acquiring the device.
  const [cameraActive, setCameraActive] = useState(true);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoomIndex, setZoomIndex] = useState<ZoomStepIndex>(0);
  // ── Real-time camera effect (Skia frame processor) ──
  // The selected effect is applied to the live preview via a GPU Skia
  // frame processor (useSkiaFrameProcessor). The effect is also attached
  // to the captured media payload so the timeline/export engine applies
  // the same color matrix post-capture.
  const [cameraEffect, setCameraEffect] = useState<CameraEffectId>('none');
  const effectFrameProcessor = useCameraEffectProcessor(cameraEffect);
  const [timerOption, setTimerOption] = useState<TimerOption>(0);
  const [showGrid, setShowGrid] = useState(false);
  // ── Explicit framing mode ──
  // Per AGENTS.md §4: brackets and crosshair are NOT shown for ordinary
  // capture — only for Visual Search or when the user explicitly enables
  // framing mode via Tools. This keeps the preview as the dominant object
  // without decorative chrome for everyday Poster/Look capture.
  const [framingMode, setFramingMode] = useState(false);
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
  const [capturedMetadata, setCapturedMetadata] = useState<CapturedMediaMetadata>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const reviewOpacity = useSharedValue(0);
  const captureFlash = useSharedValue(0);
  // ── Multi-capture mode (Snapchat Multi Snap pattern) ──
  // Every capture is retained as a CreatorInitialMedia entry. Poster maps
  // captures to frames; Look maps captures to layers.
  // Single capture is the default creation gesture: one shutter tap lands in
  // the editor immediately. Multi-capture is an explicit mode in Tools and
  // accumulates into the staging tray. Defaulting multi-capture on adds an
  // avoidable Done step to every ordinary Poster/Look capture.
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

  // ── Green screen (post-capture) ──
  // vision-camera supports real-time chroma keying via Skia frame processors.
  // The user selects a background image and key parameters; the settings are
  // preserved in CreatorInitialMedia.greenScreen so the timeline can
  // re-render the composite.
  const [showGreenScreenSheet, setShowGreenScreenSheet] = useState(false);
  const [greenScreenSettings, setGreenScreenSettings] = useState<GreenScreenSettings | null>(null);

  // ── Shared animation values ──
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
  // Muted recording indicator — true when recording video without audio
  // because microphone permission was denied or not granted.
  const [isMutedRecording, setIsMutedRecording] = useState(false);
  const recordingProgress = useSharedValue(0);
  const recordingRingScale = useSharedValue(1);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ── Native recording recorder ref (P0.1 — one recording lifecycle) ──
  // recorderRef is declared in beginVideoRecording scope above.
  // Countdown Reanimated values
  const countdownScale = useSharedValue(1.5);
  const countdownOpacity = useSharedValue(0);
  // ── Tools sheet (secondary tools behind a Tools button in the top bar) ──
  const [showToolsSheet, setShowToolsSheet] = useState(false);
  // ── Press-and-hold video: track long-press state to suppress photo on release ──
  const isLongPressRef = useRef(false);

  // Capture intent is owned by the studio shell. Entry-mode changes remount
  // the correct canonical composer before media is committed.
  const isPoster = mode === 'poster';
  const isVisualSearch = mode === 'visual-search';
  const zoomLabel = ZOOM_STEPS[zoomIndex].label;
  const zoomValue = ZOOM_STEPS[zoomIndex].value;

  // ── Measured capture viewport ──────────────────────────────────────
  // The guide frame adapts to real device dimensions via onLayout instead
  // of hardcoded offsets. Brackets/crosshair are shown ONLY for Visual
  // Search or explicit framing mode (AGENTS.md §4 — no decorative chrome
  // for ordinary capture). The authored aspect ratio insets the guide
  // frame within the available area so brackets describe the actual
  // capture crop.
  const showFramingGuides = isVisualSearch || framingMode;
  const authoredAspectRatio = isPoster ? 3 / 4 : isVisualSearch ? undefined : 9 / 16;
  const { viewport, onViewportLayout } = useCaptureViewport({
    authoredAspectRatio,
    showFramingGuides });

  // Notify the parent of viewport changes so the camera→editor transition
  // snapshot can include the source content transform (the guide frame rect
  // in screen coordinates). The destination calculates its crop/focal point
  // from this transform, preserving content continuity across the transition.
  useEffect(() => {
    onViewportChange?.(viewport);
  }, [viewport, onViewportChange]);

  // Visual search must analyse the unstyled source. If the user changes from
  // a creation mode with an active effect, fail closed to the identity matrix.
  useEffect(() => {
    if (isVisualSearch && cameraEffect !== 'none') setCameraEffect('none');
  }, [cameraEffect, isVisualSearch]);

  const captureFlashStyle = useAnimatedStyle(() => ({ opacity: captureFlash.value }));

  // ── Quick-review overlay opacity ──
  const reviewOpacityStyle = useAnimatedStyle(() => ({ opacity: reviewOpacity.value }));

  // ── Framing-guide opacity (crossfade on mode switch) ──

  // ── Flip rotation: rotateY 0→180→360 for double-tap camera switch ──
  const cameraFlipStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${flipRotation.value}deg` }] }));

  // ── Zoom indicator: spring appearance ──
  const zoomIndicatorStyle = useAnimatedStyle(() => ({
    opacity: zoomIndicatorOpacity.value,
    transform: [{ scale: zoomIndicatorScale.value }] }));

  // ── Countdown: spring scale (1.5→1.0 bouncy) + fade ──
  const countdownTextStyle = useAnimatedStyle(() => ({
    opacity: countdownOpacity.value,
    transform: [{ scale: countdownScale.value }] }));

  // ── Permission entrance: spring slide-up + fade when denied ──
  useEffect(() => {
    if (!hasPermission) {
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
  }, [hasPermission, reducedMotion, permissionEntrance]);

  // ── Load recent gallery photos for thumbnail + carousel ──
  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      try {
        // Never ambush the creator with a broad photo-library permission
        // merely to decorate the gallery control. If access already exists,
        // show a recent thumbnail; otherwise the glyph remains truthful and
        // the system picker asks only when the user chooses Gallery.
        const mediaPermission = await MediaLibrary.getPermissionsAsync(false);
        if (!mediaPermission.granted || cancelled) return;
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: ['photo', 'video'],
          sortBy: [['creationTime', false]],
          first: 10 });
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
    setCameraReady(false);
    // Spring 3D flip animation: rotateY 0→180→360
    if (!reducedMotion) {
      flipRotation.value = withSequence(
        withSpring(flipRotation.value + 180, spring.lift),
      );
    }
    setFacing((p) => (p === 'back' ? 'front' : 'back'));
    // device is reactive — useCameraDevice(facing) will resolve the new device
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

  // ── Tools sheet open/close ──
  const openToolsSheet = useCallback(() => {
    haptic.light();
    setShowToolsSheet(true);
  }, [haptic]);

  const closeToolsSheet = useCallback(() => {
    haptic.light();
    setShowToolsSheet(false);
  }, [haptic]);

  // ── Timer change from the CaptureToolsSheet ──
  const handleTimerChange = useCallback((option: SheetTimerOption) => {
    setTimerOption(option);
  }, []);

  const handleEffectChange = useCallback((nextEffect: CameraEffectId) => {
    // Crossing the native Camera/SkiaCamera boundary reconfigures the camera
    // session. Block the shutter until the replacement preview reports ready.
    if ((cameraEffect === 'none') !== (nextEffect === 'none')) {
      setCameraReady(false);
    }
    setCameraEffect(nextEffect);
    CreatorAnalytics.cameraEffectSelected(nextEffect);
  }, [cameraEffect]);

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
  // vision-camera V5 uses a callback-based Recorder: createRecorder() →
  // startRecording(onFinished, onError) → stopRecording(). The onFinished
  // callback receives a filePath (filesystem path, not file:// URI).
  // We prepend "file://" for downstream consumers that expect URIs.
  const recorderRef = useRef<import('react-native-vision-camera').Recorder | null>(null);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    haptic.medium();
    // Stop native recording — this triggers the onRecordingFinished callback
    void recorderRef.current?.stopRecording();
  }, [isRecording, haptic]);

  const beginVideoRecording = useCallback(async (customMaxDuration?: number) => {
    if (!cameraReady || isRecording || !videoOutput) return;

    // ── P0: Microphone permission ownership ────────────────────────
    // On the first transition from shutter press to video intent,
    // request microphone permission before recording. If denied,
    // record muted video and show a visible "muted" indicator.
    //
    // VisionCamera v5: "Enabling Audio requires microphone permission."
    // The videoOutput's enableAudio flag is baked in at creation time
    // by useVideoOutput (useMemo on enableAudio). If mic was NOT granted
    // at the last render, the videoOutput in this closure has
    // enableAudio: false. Even if requestMic() grants permission during
    // this call, the current videoOutput still records muted — React
    // hasn't re-rendered yet to create a new videoOutput with
    // enableAudio: true. The NEXT recording will have audio after
    // re-render. We set isMutedRecording truthfully so the user sees
    // the mic-off indicator on this first recording.
    let willRecordMuted = !capturePermissions.shouldRecordAudio;
    if (!capturePermissions.micGranted && capturePermissions.micState !== 'blocked') {
      // Request mic permission on first video attempt — this updates
      // micState so the next render creates a videoOutput with audio.
      await capturePermissions.requestMic();
    }
    setIsMutedRecording(willRecordMuted);

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
      // Update the shared value every tick (no re-render) for the progress ring.
      // Update React state at a coarser 200ms cadence for the timer text —
      // 5 updates/sec is smooth enough for a "0:03" display while avoiding
      // 20 re-renders/sec (the old 50ms interval caused jank on low-end devices).
      recordingProgress.value = Math.min(1, elapsed / maxDuration);
      if (elapsed % 200 < 50) {
        setRecordingElapsed(elapsed);
      }
      if (elapsed >= maxDuration) {
        // Auto-stop at max duration
        stopRecording();
      }
    }, 50);

    // Create a Recorder and start recording with callbacks
    try {
      const recorder = await videoOutput.createRecorder({});
      recorderRef.current = recorder;
      await recorder.startRecording(
        (filePath) => {
          // onRecordingFinished — filePath is a filesystem path
          const uri = `file://${filePath}`;
          const durationMs = Math.max(1, Date.now() - startTime);
          haptic.medium();
          // Capture flash — white overlay
          if (!reducedMotion) {
            captureFlash.value = withSequence(
              withTiming(0.8, { duration: Motion.duration.touch, easing: Easing.out(Easing.cubic) }),
              withTiming(0, { duration: Motion.duration.fast, easing: Easing.in(Easing.cubic) }),
            );
          }
          // ── Multi-capture: accumulate directly to the staging tray ──
          if (multiCaptureMode && !isVisualSearch) {
            const media: CreatorInitialMedia = {
              id: makeStableId('capture'),
              uri,
              kind: 'video',
              durationMs,
              mimeType: 'video/mp4' };
            if (cameraEffect !== 'none') {
              media.cameraEffect = cameraEffect;
            }
            if (speedMode !== DEFAULT_SPEED) {
              media.speed = parseFloat(speedMode);
            }
            if (greenScreenSettings) {
              media.greenScreen = {
                backgroundUri: greenScreenSettings.backgroundUri,
                keyColor: greenScreenSettings.keyColor,
                tolerance: greenScreenSettings.tolerance,
                feather: greenScreenSettings.feather };
            }
            setMultiCaptures((prev) => [...prev, media]);
          } else {
            setCapturedKind('video');
            setCapturedMetadata({ durationMs, mimeType: 'video/mp4' });
            setCapturedUri(uri);
          }
          CreatorAnalytics.captureVideo(isPoster ? 'poster' : 'look', Date.now() - startTime);
          // Cleanup UI state
          setIsRecording(false);
          setIsMutedRecording(false);
          if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
          }
          recordingProgress.value = withSpring(0, spring.entrance);
          recorderRef.current = null;
        },
        (error) => {
          // onRecordingError
          show('Failed to record video', 'error');
          setIsRecording(false);
          setIsMutedRecording(false);
          if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
          }
          recordingProgress.value = withSpring(0, spring.entrance);
          recorderRef.current = null;
        },
      );
    } catch {
      show('Failed to start recording', 'error');
      setIsRecording(false);
      setIsMutedRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      recordingProgress.value = withSpring(0, spring.entrance);
    }
  }, [cameraReady, isRecording, haptic, reducedMotion, recordingProgress, recordingRingScale, show, stopRecording, spring, captureFlash, isPoster, multiCaptureMode, isVisualSearch, speedMode, greenScreenSettings, cameraEffect, videoOutput, capturePermissions]);

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
          withTiming(1, { duration: Motion.duration.fast }),
          withDelay(700, withTiming(0, { duration: Motion.duration.normal })),
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

  // ── Framing mode toggle ──
  // Explicit framing shows brackets + crosshair for ordinary Poster/Look
  // capture. Visual Search always shows framing guides regardless of this
  // toggle. Per AGENTS.md §4, framing chrome is opt-in, not default.
  const toggleFramingMode = useCallback(() => {
    haptic.selection();
    setFramingMode((p) => !p);
  }, [haptic]);

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
  const [pinchZoomDelta, setPinchZoomDelta] = useState(0);

  const showZoomIndicator = useCallback(() => {
    if (!reducedMotion) {
      zoomIndicatorOpacity.value = withSpring(1, spring.tap);
      zoomIndicatorScale.value = withSpring(1, spring.lift);
      zoomIndicatorOpacity.value = withDelay(1200, withTiming(0, { duration: Motion.duration.normal }));
      zoomIndicatorScale.value = withDelay(1200, withSpring(0.8, spring.entrance));
    }
  }, [reducedMotion, zoomIndicatorOpacity, zoomIndicatorScale, spring]);

  const snapPinchToStep = useCallback((zoom: number) => {
    // Snap to nearest step: 1 (1×), 2 (2×), 3 (3×)
    if (zoom < 1.5) setZoomIndex(0);
    else if (zoom < 2.5) setZoomIndex(1);
    else setZoomIndex(2);
  }, []);

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
          runOnJS(setPinchZoomDelta)(newZoom - pinchStartZoom.value);
        })
        .onEnd((e) => {
          'worklet';
          const finalZoom = Math.max(1, pinchStartZoom.value + (e.scale - 1) * 0.5);
          runOnJS(setPinchZoomDelta)(0);
          runOnJS(snapPinchToStep)(finalZoom);
          runOnJS(haptic.light)();
          runOnJS(showZoomIndicator)();
        }),
    [zoomValue, snapPinchToStep, haptic, showZoomIndicator, pinchStartZoom],
  );

  // Effective zoom = stepped baseline + pinch delta, clamped to device range
  const effectiveZoom = Math.max(1, zoomValue + pinchZoomDelta);

  // ── Capture with optional timer ──
  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || !cameraReady || countdown !== null) return;

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
            withTiming(1, { duration: Motion.duration.fast }),
            withDelay(700, withTiming(0, { duration: Motion.duration.normal })),
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
      // vision-camera V5: capturePhoto returns an in-memory Photo object.
      // Save to temp file and dispose to free native memory.
      const photo = await photoOutput.capturePhoto(
        { flashMode: flash },
        {},
      );
      const photoMetadata: CapturedMediaMetadata = {
        width: photo.width,
        height: photo.height,
        mimeType: getPhotoMimeType(photo.containerFormat) };
      const filePath = await photo.saveToTemporaryFileAsync();
      const photoUri = `file://${filePath}`;
      photo.dispose();
      const captureLatencyMs = Date.now() - captureStart;
      if (photoUri) {
        haptic.medium();
        // Capture flash — white overlay 0→0.8→0 over 200ms. This is the
        // capture feedback signal and runs regardless of whether the
        // capture goes direct-to-editor or through the review overlay.
        if (!reducedMotion) {
          captureFlash.value = withSequence(
            withTiming(0.8, { duration: Motion.duration.touch, easing: Easing.out(Easing.cubic) }),
            withTiming(0, { duration: Motion.duration.fast, easing: Easing.in(Easing.cubic) })
          );
        }
        setCapturedKind('image');
        setCapturedMetadata(photoMetadata);
        // ── Multi-capture: accumulate directly to the staging tray ──
        // When multi-capture is explicitly enabled (single capture is the
        // default), photo captures pile up silently like Snapchat Multi
        // Snap — no per-capture review overlay. The user finishes via the
        // Done button in the staging tray. Visual search is excluded
        // (different intent — single capture with a confirm step).
        if (multiCaptureMode && !isVisualSearch) {
          // Photo media is constructed inline because buildCaptureMedia is
          // declared below and would otherwise be used before declaration.
          const media: CreatorInitialMedia = {
            id: makeStableId('capture'),
            uri: photoUri,
            kind: 'image',
            ...photoMetadata };
          if (cameraEffect !== 'none') {
            media.cameraEffect = cameraEffect;
          }
          if (greenScreenSettings) {
            media.greenScreen = { ...greenScreenSettings };
          }
          setMultiCaptures((prev) => [...prev, media]);
        } else if (!!onCaptureBatch && !isVisualSearch) {
          // ── Single-capture direct-to-edit (poster/look) ──
          // Per .devin/surfaces/creator-poster.md: in poster/look mode
          // a single photo capture goes direct-to-editor with no quick-review
          // overlay — the capture commits and retake/undo lives in the editor,
          // preserving the continuous gesture. This path is reached when the
          // user has explicitly toggled multi-capture OFF in Tools.
          const media: CreatorInitialMedia = {
            id: makeStableId('capture'),
            uri: photoUri,
            kind: 'image',
            ...photoMetadata };
          if (cameraEffect !== 'none') {
            media.cameraEffect = cameraEffect;
          }
          if (greenScreenSettings) {
            media.greenScreen = { ...greenScreenSettings };
          }
          onCaptureBatch([media]);
        } else {
          // Review overlay (visual search, or legacy single capture)
          setCapturedUri(photoUri);
        }
        // ── Capture latency telemetry ──
        // Tracks shutter-to-photo-ready time so we can monitor camera
        // performance regressions across devices and OS versions.
        CreatorAnalytics.capturePhoto(isPoster ? 'poster' : 'look', captureLatencyMs);
      }
    } catch {
      show('Failed to capture photo', 'error');
    }
  }, [photoOutput, flash, cameraReady, countdown, haptic, reducedMotion, show, timerOption, countdownScale, countdownOpacity, captureFlash, spring, onCaptureBatch, isVisualSearch, multiCaptureMode, isPoster, cameraEffect, greenScreenSettings]);

  // ── Cleanup recording on unmount / interruption ──
  useEffect(() => {
    return () => {
      // Deactivate the camera first so the native CameraSession releases
      // the device immediately, before we stop recording. This prevents
      // "A resource failed to call release" finalizer warnings.
      setCameraActive(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      // Stop any active native recording to prevent orphaned recordings
      if (recorderRef.current) {
        void recorderRef.current.stopRecording();
        recorderRef.current = null;
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
        if (recorderRef.current) {
          void recorderRef.current.stopRecording();
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
  // Quick tap takes a photo. Press-and-hold (beyond 250ms — see
  // ShutterButton.tsx delayLongPress) starts video recording; releasing
  // stops it. This eliminates the need for
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
        runOnJS(setCapturedMetadata)({});
      });
    } else {
      reviewOpacity.value = 0;
      setCapturedUri(null);
      setCapturedKind('image');
      setCapturedMetadata({});
    }
  }, [haptic, reducedMotion, reviewOpacity, spring]);

  // ── Build a CreatorInitialMedia with capture-intent metadata ──
  // Speed: vision-camera supports native fps control; the multiplier is
  //   also stored in metadata so the timeline/export engine can apply it.
  // GreenScreen: chroma key settings are preserved so the timeline can
  //   re-render the composite via Skia.
  const buildCaptureMedia = useCallback((
    uri: string,
    kind: 'image' | 'video',
    metadata: CapturedMediaMetadata = {},
  ): CreatorInitialMedia => {
    const media: CreatorInitialMedia = {
      id: makeStableId('capture'),
      uri,
      kind,
      ...metadata };
    // Attach speed metadata for video captures (1× is the default and
    // omitted to keep backward-compatible payloads clean)
    if (kind === 'video' && speedMode !== DEFAULT_SPEED) {
      media.speed = parseFloat(speedMode);
    }
    // Keep capture WYSIWYG: the Skia preview is non-destructive, so the
    // editor/export scene must receive the same selected color matrix.
    if (cameraEffect !== 'none') {
      media.cameraEffect = cameraEffect;
    }
    // Attach green screen settings if active
    if (greenScreenSettings) {
      media.greenScreen = {
        backgroundUri: greenScreenSettings.backgroundUri,
        keyColor: greenScreenSettings.keyColor,
        tolerance: greenScreenSettings.tolerance,
        feather: greenScreenSettings.feather };
    }
    return media;
  }, [speedMode, greenScreenSettings, cameraEffect]);

  const handleConfirmCapture = useCallback(() => {
    if (!capturedUri) return;
    haptic.light();
    // Single-capture path only — multi-capture mode accumulates directly
    // to the staging tray without setting capturedUri, so this handler is
    // only reached by the legacy review path or visual search (which always
    // keeps a confirm step because the intent is search, not creation).
    if (onCaptureBatch && !isVisualSearch) {
      onCaptureBatch([buildCaptureMedia(capturedUri, capturedKind, capturedMetadata)]);
    } else {
      onCapture(capturedUri);
    }
  }, [capturedUri, capturedKind, capturedMetadata, haptic, onCapture, onCaptureBatch, isVisualSearch, buildCaptureMedia]);

  // ── Multi-capture: finish and send ALL captures ──
  // Every capture is retained and sent as a CreatorInitialMedia[] batch.
  // Poster maps captures to frames; Look maps captures to layers.
  // Speed and greenScreen metadata are preserved on each clip so the
  // timeline/export engine can apply them at playback.
  // Triggered from the Done button in the staging tray (Snapchat Multi
  // Snap "Edit & Send" pattern).
  const handleFinishMultiCapture = useCallback(() => {
    if (multiCaptures.length === 0) return;
    haptic.medium();
    if (onCaptureBatch) {
      onCaptureBatch(multiCaptures);
    } else if (multiCaptures.length > 0) {
      onCapture(multiCaptures[0].uri);
    }
    setMultiCaptures([]);
    // Mode state can remain active until the camera unmounts; returning to
    // the creator entry remounts the camera in the one-tap default mode.
  }, [multiCaptures, haptic, onCapture, onCaptureBatch]);

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
  }, [device, isRecording]);

  const handleOpenSettings = useCallback(() => Linking.openSettings(), []);

  const handleGalleryLongPress = useCallback(() => {
    if (recentImages.length > 1) {
      haptic.selection();
      setShowRecentCarousel((p) => !p);
    }
  }, [haptic, recentImages.length]);

  // ── Permission: permanently denied ──
  if (!hasPermission && !canRequestPermission) {
    return <PermissionState status="denied" isPoster={isPoster} entrance={permissionEntrance} onEnable={handleOpenSettings} onGallery={onGallery} />;
  }

  // ── Permission: undetermined — ask ──
  if (!hasPermission) {
    return <PermissionState status="undetermined" isPoster={isPoster} entrance={permissionEntrance} onEnable={() => requestPermission()} onGallery={onGallery} />;
  }

  // ── No camera device available (simulator or no camera) ──
  // Distinct from permission-denied: Settings cannot add camera hardware,
  // so we render the `unavailable` state — a camera-outline icon, an
  // informational message, and a gallery fallback (no Settings CTA).
  if (!device) {
    return <PermissionState status="unavailable" isPoster={isPoster} entrance={permissionEntrance} onEnable={handleOpenSettings} onGallery={onGallery} />;
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
              accessibilityRole="button"
              accessibilityLabel="Camera viewfinder"
              accessibilityHint="Tap to focus at that point"
            >
              <Reanimated.View style={[StyleSheet.absoluteFill, cameraFlipStyle]}>
                {cameraEffect !== 'none' ? (
                  <SkiaCamera
                    ref={cameraRef as React.RefObject<SkiaCameraRef>}
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive={cameraActive}
                    outputs={[photoOutput, videoOutput]}
                    torchMode={flash === 'on' ? 'on' : 'off'}
                    zoom={effectiveZoom}
                    orientationSource="interface"
                    onFrame={effectFrameProcessor}
                    onStarted={() => setCameraReady(true)}
                    onError={() => {
                      setCameraReady(false);
                      show('Camera could not start. Try again or use your gallery.', 'error');
                    }}
                  />
                ) : (
                  <Camera
                    ref={cameraRef as React.RefObject<CameraRef>}
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive={cameraActive}
                    outputs={[photoOutput, videoOutput]}
                    torchMode={flash === 'on' ? 'on' : 'off'}
                    zoom={effectiveZoom}
                    orientationSource="interface"
                    onStarted={() => setCameraReady(true)}
                    onError={() => {
                      setCameraReady(false);
                      show('Camera could not start. Try again or use your gallery.', 'error');
                    }}
                  />
                )}
                {/* Camera initialization loading overlay — shown between
                    permission granted and cameraReady=true. A subtle
                    spinner on the dark preview communicates "starting"
                    instead of a black screen with no feedback. */}
                {!cameraReady && (
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <View style={styles.cameraInitOverlay} />
                    <View style={styles.cameraInitSpinnerWrap}>
                      <View style={styles.cameraInitSpinner} />
                    </View>
                  </View>
                )}
              </Reanimated.View>
            </Pressable>
          </View>
        </GestureDetector>

      {/* Capture flash — subtle white overlay on capture */}
      <Reanimated.View
        style={[styles.captureFlash, captureFlashStyle]}
        pointerEvents="none"
      />

      {/* Gradient overlays — 0.25 top, 0.35 bottom */}
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

      {/* One unobscured capture viewport owns every composition guide. The
          guide frame is measured via onLayout so it adapts to real device
          dimensions instead of hardcoded offsets. Brackets and crosshair
          are shown ONLY for Visual Search or explicit framing mode
          (AGENTS.md §4 — no decorative chrome for ordinary capture). For
          ordinary Poster/Look capture, only an optional rule-of-thirds
          grid is shown. */}
      <View
        style={[
          styles.captureGuideViewport,
          {
            top: Math.max(insets.top, 16) + 72,
            bottom: Math.max(insets.bottom, 16) + (renderBottomOverlay ? 184 : 140),
            left: isVisualSearch ? 52 : isPoster ? 24 : 36,
            right: isVisualSearch ? 52 : isPoster ? 24 : 36 },
        ]}
        onLayout={onViewportLayout}
        pointerEvents="none"
      >
        {/* Rule-of-thirds grid — available in all modes via Tools toggle.
            For ordinary capture this is the only guide (no brackets). */}
        {showGrid ? (
          <View style={styles.gridOverlay}>
            <View style={styles.gridLineV1} />
            <View style={styles.gridLineV2} />
            <View style={styles.gridLineH1} />
            <View style={styles.gridLineH2} />
          </View>
        ) : null}
        {/* Corner brackets + crosshair — Visual Search or explicit framing
            mode only. The guide frame is inset within the measured viewport
            to match the authored aspect ratio so brackets describe the
            actual capture crop. */}
        {showFramingGuides && viewport ? (
          <View
            style={[
              styles.framingFrame,
              {
                left: viewport.viewRect.x,
                top: viewport.viewRect.y,
                width: viewport.viewRect.width,
                height: viewport.viewRect.height },
            ]}
          >
            <View style={styles.bracketTL} />
            <View style={styles.bracketTR} />
            <View style={styles.bracketBL} />
            <View style={styles.bracketBR} />
            <View style={styles.crosshair}>
              <View style={styles.crosshairH} />
              <View style={styles.crosshairV} />
            </View>
          </View>
        ) : null}
      </View>

      {/* Focus reticle — real AE/AF/AWB metering via focusTo() on
          supported devices; visual tap indicator on unsupported ones. */}
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

      {/* Top controls — close (left), flash + tools (right) */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 8 }]} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.topIconBtn, pressed && styles.btnPressed]}
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Close camera"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={IconGrammar.hero} color="#fff" />
        </Pressable>

        <View style={styles.topRightControls}>
          {renderTopRightAccessory?.()}
          {/* Flash — top-right, prominent circular button */}
          <Pressable
            style={({ pressed }) => [styles.topIconBtn, pressed && styles.btnPressed, flash !== 'off' && styles.topIconBtnActive]}
            onPress={cycleFlash}
            hitSlop={12}
            accessibilityLabel={`Flash ${flash}`}
            accessibilityRole="button"
          >
            <Ionicons
              name={flash === 'off' ? 'flash-off' : flash === 'auto' ? 'flash-outline' : 'flash'}
              size={IconGrammar.hero}
              color={flash === 'off' ? '#fff' : colors.antiqueGold}
            />
          </Pressable>
          {/* Tools button — opens CaptureToolsSheet for all secondary tools */}
          <Pressable
            style={({ pressed }) => [styles.topIconBtn, pressed && styles.btnPressed]}
            onPress={openToolsSheet}
            hitSlop={12}
            accessibilityLabel="Camera tools"
            accessibilityHint="Opens timer, grid, hands-free, speed, green screen, and multi-capture"
            accessibilityRole="button"
          >
            <Ionicons name="ellipsis-horizontal-circle-outline" size={IconGrammar.hero} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* ── Multi-snap staging tray (Snapchat staging area pattern) ──
          Whenever captures exist, a persistent horizontal row of captured
          thumbnails is visible on the camera surface so the user sees their
          sequence accumulate while shooting (see the creator-poster surface
          contract). Each thumbnail is tappable to drop that frame. A Done
          button at the end lets the user finish and enter the editor — the
          Snapchat Multi Snap "Edit & Send" pattern. The tray is visible
          whenever captures exist, regardless of the multi-capture toggle,
          so accumulated captures are never hidden. */}
      {multiCaptures.length > 0 && (
        <View
          style={[styles.stagingTray, { top: Math.max(insets.top, 16) + 56 }]}
          pointerEvents="box-none"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stagingTrayContent}
          >
            {multiCaptures.map((cap, i) => (
              <Pressable
                key={cap.id}
                style={styles.stagingThumbWrap}
                onPress={() => handleRemoveCapture(cap.id)}
                hitSlop={4}
                accessibilityLabel={`Frame ${i + 1} of ${multiCaptures.length}, tap to remove`}
                accessibilityRole="button"
              >
                <Image source={{ uri: cap.uri }} style={styles.stagingThumb} />
                {/* Order index — bottom-left, the verified multi-select pattern */}
                <View style={styles.stagingOrderBadge}>
                  <Text style={styles.stagingOrderText}>{i + 1}</Text>
                </View>
                {/* Remove glyph — top-right, signals the tap action */}
                <View style={styles.stagingRemoveBadge}>
                  <Ionicons name="close" size={IconGrammar.badge} color="#fff" />
                </View>
              </Pressable>
            ))}
            {/* Done button — finish multi-capture and enter the editor.
                Snapchat Multi Snap "Edit & Send" pattern: the user
                accumulates captures, then taps Done to enter the editor
                with the full batch. */}
            <Pressable
              style={styles.stagingDoneBtn}
              onPress={handleFinishMultiCapture}
              hitSlop={4}
              accessibilityLabel={`Done, ${multiCaptures.length} captures selected`}
              accessibilityHint="Finishes multi-capture and opens the editor with all captures"
              accessibilityRole="button"
            >
              <Ionicons name="checkmark" size={IconGrammar.badge} color="#fff" />
              <Text style={styles.stagingDoneText}>Done ({multiCaptures.length})</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      {/* Bottom controls — gallery (left), shutter (center), flip (right) */}
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
          onLongPress={CAMERA_VIDEO_CAPTURE_ENABLED && cameraEffect === 'none' ? handleShutterLongPress : undefined}
          onPressOut={CAMERA_VIDEO_CAPTURE_ENABLED && cameraEffect === 'none' ? handleShutterPressOut : undefined}
          isRecording={isRecording}
          disabled={!cameraReady || countdown !== null || handsFreeCountdown !== null}
          recordingProgress={recordingProgress}
          recordingRingScale={recordingRingScale}
          handsFreeMode={handsFreeMode}
          speedMode={speedMode}
          videoCaptureEnabled={CAMERA_VIDEO_CAPTURE_ENABLED && cameraEffect === 'none'}
        />

        {/* Flip camera — transparent 44pt target (AGENTS.md §4: ordinary
            controls default to transparent). The bottom scrim provides
            legibility; no persistent dark plate. */}
        <Pressable
          style={({ pressed }) => [styles.flipBtn, pressed && styles.btnPressed]}
          onPress={toggleFacing}
          hitSlop={12}
          accessibilityLabel="Flip camera"
          accessibilityRole="button"
        >
          <Ionicons name="camera-reverse-outline" size={IconGrammar.hero} color="#fff" />
        </Pressable>
      </View>

      {/* Recording timer badge — shown while recording.
          Includes speed indicator when a non-1× speed mode is active.
          Includes muted indicator when recording without microphone.
          Wrapped in a full-width container so the badge stays centered
          regardless of whether the muted indicator adds width. */}
      {isRecording && (
        <View style={[styles.recordingBadgeWrap, { top: Math.max(insets.top, 16) + 60 }]} pointerEvents="none">
          <View style={styles.recordingBadge}>
            <View style={[styles.recordingDot, { backgroundColor: colors.danger }]} />
            <Text style={styles.recordingTimerText}>
              {Math.floor(recordingElapsed / 1000)}s
              {speedMode !== DEFAULT_SPEED && `  ${speedMode}×`}
            </Text>
            {isMutedRecording && (
              <View style={styles.mutedIndicator}>
                <Ionicons name="mic-off" size={12} color="#fff" />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Hands-free mode indicator — subtle badge when hands-free is armed */}
      {handsFreeMode && !isRecording && handsFreeCountdown === null && (
        <View style={[styles.handsFreeBadge, { top: Math.max(insets.top, 16) + 60 }]} pointerEvents="none">
          <Ionicons name="hand-right-outline" size={IconGrammar.badge} color={colors.antiqueGold} />
          <Text style={[styles.handsFreeBadgeText, { color: colors.antiqueGold }]}>Hands-free</Text>
        </View>
      )}

      {/* Green screen sheet — background image picker, key color,
          tolerance, feather. Settings are saved with the capture and
          the chroma key effect is rendered on the timeline via Skia. */}
      <GreenScreenSheet
        visible={showGreenScreenSheet}
        onApply={handleGreenScreenApply}
        onCancel={handleGreenScreenCancel}
      />

      {/* ── Capture tools sheet ──────────────────────────────────────── */}
      {/* Bottom sheet containing all secondary camera tools: Timer, Grid,
          Hands-free, Speed, Green Screen, Multi-capture. Opens from the
          Tools button in the top bar. Camera effects live in this sheet so
          capture intent remains unobstructed. Each supported tool applies
          immediately; the sheet can stay open or be dismissed. */}
      <CaptureToolsSheet
        visible={showToolsSheet}
        onClose={closeToolsSheet}
        timerOption={timerOption}
        onTimerChange={handleTimerChange}
        showGrid={showGrid}
        onToggleGrid={toggleGrid}
        framingMode={framingMode}
        onToggleFramingMode={toggleFramingMode}
        activeEffect={cameraEffect}
        onEffectChange={handleEffectChange}
        handsFreeMode={handsFreeMode}
        onToggleHandsFree={toggleHandsFree}
        speedMode={speedMode}
        onSpeedChange={handleSpeedChange}
        greenScreenActive={!!greenScreenSettings}
        onOpenGreenScreen={() => {
          setShowToolsSheet(false);
          if (!greenScreenSettings) {
            setShowGreenScreenSheet(true);
          } else {
            // Toggle off — clear settings
            toggleGreenScreen();
          }
        }}
        multiCaptureMode={multiCaptureMode}
        onToggleMultiCapture={toggleMultiCapture}
        multiCaptureCount={multiCaptures.length}
        hasCapturedUri={!!capturedUri}
        isVisualSearch={isVisualSearch}
        isRecording={isRecording}
        videoCaptureEnabled={CAMERA_VIDEO_CAPTURE_ENABLED && cameraEffect === 'none'}
      />

      {/* Green screen active indicator — shows the selected background
          thumbnail when green screen is armed. Suppressed while recording
          or hands-free is armed: only one status chip may occupy a region
          at a time (recording > hands-free > zoom > effect metadata). */}
      {greenScreenSettings && !showGreenScreenSheet && !isRecording && !handsFreeMode && (
        <View style={[styles.greenScreenBadge, { top: Math.max(insets.top, 16) + 60 }]} pointerEvents="none">
          <Image
            source={{ uri: greenScreenSettings.backgroundUri }}
            style={styles.greenScreenThumb}
          />
          <Text style={styles.greenScreenBadgeText}>Green Screen (post)</Text>
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

          {/* Review actions — single-capture mode only. When multi-capture
              is explicitly enabled, captures accumulate silently to the
              staging tray and the review overlay never appears. This
              overlay is reached only in the default single-capture mode,
              or in visual search mode (which always uses a confirm step). */}
          <View style={[styles.reviewActions, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
            {/* Retake */}
            <Pressable
              style={({ pressed }) => [styles.reviewBtn, pressed && styles.btnPressed]}
              onPress={handleRetake}
              hitSlop={12}
              accessibilityLabel="Retake photo"
              accessibilityHint="Discards the current photo and returns to the camera"
              accessibilityRole="button"
            >
              <Ionicons name="refresh-outline" size={IconGrammar.hero} color="#fff" />
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
              <Ionicons name="arrow-forward" size={IconGrammar.hero} color={colors.background} />
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
              <Ionicons name="download-outline" size={IconGrammar.hero} color="#fff" />
              <Text style={styles.reviewBtnLabel}>Save</Text>
            </Pressable>
          </View>
        </Reanimated.View>
      )}
      </View>
    </GestureDetector>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Camera initialization loading overlay ──
  cameraInitOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)' },
  cameraInitSpinnerWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center' },
  cameraInitSpinner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.2)',
    borderTopColor: 'rgba(255,255,255,0.9)' },
  // ── Camera-overlay whites ──────────────────────────────────────────
  // The camera preview is always dark regardless of app theme, so overlay
  // controls (brackets, crosshair, grid, labels, shutter ring, review
  // secondary actions) intentionally use white / rgba(255,255,255,*) for
  // high contrast. The theme has no `textOnMedia` token, and `textPrimary`
  // resolves to black in light mode (invisible on dark preview), so these
  // are kept as literal whites. Semantic colours (danger, antiqueGold) and
  // non-overlay surfaces (review overlay, primary button) use theme tokens
  // via inline overrides above.
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }] },
  // Gradient overlays
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140 },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160 },
  // One geometry owner for rule-of-thirds, framing corners and crosshair.
  captureGuideViewport: {
    position: 'absolute' },
  // Framing frame — the aspect-ratio-fitted guide rect inside the measured
  // viewport. Brackets and crosshair are positioned relative to this frame
  // so they describe the actual capture crop, not the available space.
  framingFrame: {
    position: 'absolute' },
  // Grid overlay (rule-of-thirds)
  gridOverlay: {
    ...StyleSheet.absoluteFill },
  gridLineV1: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)' },
  gridLineV2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)' },
  gridLineH1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)' },
  gridLineH2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)' },
  // Pinch zoom indicator — subtle pill at bottom center
  zoomIndicator: {
    position: 'absolute',
    bottom: 220,
    alignSelf: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.xxl,
    backgroundColor: 'rgba(0,0,0,0.6)' },
  zoomIndicatorText: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.body.size,
    color: '#fff' },
  // Capture flash — full-screen white overlay
  captureFlash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#fff' },
  // Countdown overlay
  countdownOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center' },
  countdownText: {
    fontFamily: Typography.family.bold,
    fontSize: 96,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8 },
  // Corner brackets — refined 2pt stroke, smaller and more elegant
  bracketTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_STROKE,
    borderLeftWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderTopLeftRadius: 8 },
  bracketTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_STROKE,
    borderRightWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderTopRightRadius: 8 },
  bracketBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_STROKE,
    borderLeftWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderBottomLeftRadius: 8 },
  bracketBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_STROKE,
    borderRightWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderBottomRightRadius: 8 },
  // Crosshair — centered in the framing guide area
  crosshair: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 24,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center' },
  crosshairH: {
    position: 'absolute',
    width: 24,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.5)' },
  crosshairV: {
    position: 'absolute',
    width: 2,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.5)' },
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
    paddingBottom: Space.sm },
  topRightControls: {
    flexDirection: 'row',
    gap: 8 },
  // Top bar buttons — transparent (AGENTS.md §4: ordinary controls default to transparent)
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  // Flash active state — subtle accent background so the user can read
  // the toggle state at a glance without a heavy fill.
  topIconBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.12)' },
  // ── Multi-snap staging tray ──
  // A persistent horizontal row of captured thumbnails below the top bar.
  // Reads as a staging area (Snapchat pattern), not a chrome panel: flat
  // canvas, hairline-edged thumbs, no enclosing card. The tray recedes in
  // the squint test — the viewfinder still dominates.
  stagingTray: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 15 },
  stagingTrayContent: {
    gap: 6,
    alignItems: 'center' },
  stagingThumbWrap: {
    position: 'relative' },
  // 40pt thumbnail — smaller than the 44pt gallery thumb so the tray stays
  // compact and does not compete with the viewfinder. 2pt white/90 ring.
  stagingThumb: {
    width: 40,
    height: 52,
    borderRadius: Radius.sm,
    borderWidth: Stroke.emphasis,
    borderColor: 'rgba(255,255,255,0.9)' },
  // Order index badge — bottom-left, the verified multi-select pattern.
  stagingOrderBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center' },
  stagingOrderText: {
    color: '#fff',
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  // Remove glyph — top-right, signals the tap-to-drop action.
  stagingRemoveBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center' },
  // Done button — finishes multi-capture and enters the editor.
  // Snapchat Multi Snap "Edit & Send" pattern: a compact pill with a
  // checkmark that commits the accumulated batch. Translucent dark fill
  // with a brighter border so it reads as the primary action in the tray.
  stagingDoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(255,255,255,0.3)' },
  stagingDoneText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.semibold },
  // Bottom bar — gallery (left) | shutter (center) | flip (right).
  // The viewfinder dominates; controls are compact and purposeful.
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
    minHeight: 100 },
  // Flip camera — transparent 44pt target (AGENTS.md §4: ordinary controls
  // default to transparent). No persistent dark plate; the bottom scrim
  // provides legibility over bright previews.
  flipBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center' },
  // Recording badge — timer + red dot at top.
  // A full-width wrapper centers the badge so it stays centered
  // whether or not the muted indicator adds width.
  recordingBadgeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center' },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)' },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    // backgroundColor applied inline via colors.danger (theme token)
  },
  recordingTimerText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size,
    color: '#fff' },
  // Muted recording indicator — mic-off icon shown when recording without audio
  mutedIndicator: {
    marginLeft: 2,
    opacity: 0.8 },
  // Quick-review overlay
  reviewOverlay: {
    ...StyleSheet.absoluteFill,
    // backgroundColor applied inline via colors.background (theme token)
    zIndex: 100 },
  reviewImage: {
    ...StyleSheet.absoluteFill,
    resizeMode: 'contain' },
  // Top scrim for the review overlay — ensures any top chrome is legible
  // over bright captures (white backgrounds, light product photography).
  reviewTopScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100 },
  reviewActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Space.xl,
    paddingTop: Space.md },
  reviewBtn: {
    alignItems: 'center',
    gap: 6 },
  reviewBtnLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: 'rgba(255,255,255,0.85)' },
  reviewPrimaryBtn: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    // backgroundColor applied inline via colors.textPrimary (theme token)
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2 },
  reviewPrimaryLabel: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.meta.size,
    // color applied inline via colors.background (theme token)
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
    backgroundColor: 'rgba(0,0,0,0.6)' },
  handsFreeBadgeText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
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
    backgroundColor: 'rgba(0,0,0,0.6)' },
  greenScreenThumb: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm },
  greenScreenBadgeText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: 'rgba(255,255,255,0.85)' } });
