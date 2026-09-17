import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Linking } from 'react-native';
import {
  type CameraRef,
  useCameraDevice,
  usePhotoOutput,
  useVideoOutput } from 'react-native-vision-camera';
import { type SkiaCameraRef } from 'react-native-vision-camera-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAppTheme } from '../../theme/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Motion } from '../../theme/motionTokens';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay } from 'react-native-reanimated';
import { FocusReticle } from '../camera/FocusReticle';
import { PermissionState } from '../camera/PermissionState';
import { useCameraEffectProcessor } from '../camera/useCameraEffectProcessor';
import type { CameraEffectId } from '../camera/CameraEffectBar';
import type { CreatorInitialMedia } from '../../navigation/types';
import { useCreatorCapturePermissions } from './useCreatorCapturePermissions';
import {
  useCaptureViewport,
  type CaptureViewport } from './CaptureViewport';
import { isCapabilitySupported } from '../capabilities/registry';
import { POSTER_DEFAULT_ASPECT_RATIO, LOOK_DEFAULT_ASPECT_RATIO } from '../core/projectStore/composition';
import { styles } from './CreatorCameraStyles';
import { CameraInitErrorOverlay } from './composer/CameraInitErrorOverlay';
import { CameraFeed } from './composer/CameraFeed';
import { CameraScrimGradients } from './composer/CameraScrimGradients';
import { CaptureGuideOverlay } from './composer/CaptureGuideOverlay';
import { CameraCountdownOverlay } from './composer/CameraCountdownOverlay';
import { CameraTopBar } from './composer/CameraTopBar';
import { CaptureStagingTray } from './composer/CaptureStagingTray';
import { CameraBottomBar } from './composer/CameraBottomBar';
import { CameraStatusRegion } from './composer/CameraStatusRegion';
import { CameraToolSheets } from './composer/CameraToolSheets';
import { CameraReviewOverlay } from './composer/CameraReviewOverlay';
import { useCameraInit } from './useCameraInit';
import { useCameraTools } from './useCameraTools';
import { useRecentGallery } from './useRecentGallery';
import { useCameraReview } from './useCameraReview';
import { useCameraRecording } from './useCameraRecording';
import { useCaptureGestures } from './useCaptureGestures';
import { DEFAULT_SPEED } from './captureConstants';

// ── CreatorCamera ────────────────────────────────────────────────────
// Camera component with tap-to-focus, tap=photo / press-and-hold=video,
// multi-capture staging tray, grid overlay, self-timer, and quick-review.
//
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
// Press-and-hold threshold for video recording is 250ms, set in
// ShutterButton.tsx via delayLongPress. A quick tap lands as a photo;
// a hold beyond that threshold starts video recording.

type FlashMode = 'off' | 'on' | 'auto';
type ZoomStepIndex = 0 | 1 | 2;

export interface CreatorCameraProps {
  /** Camera mode — determines framing guide + labels */
  mode: 'poster' | 'look' | 'visual-search' | 'moodboard';
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
  /** Optional: called when the user long-presses the gallery thumbnail.
   *  When provided, replaces the default recent-photos carousel behavior
   *  so the parent can route the long-press to a custom browser (progressive
   *  disclosure: tap = ordinary path, long-press = power-user path). */
  onGalleryLongPress?: () => void;
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
  /** Arm multi-capture (staging tray) on mount — listing flows open with
   *  Multi Snap accumulation rather than the single-capture review. */
  initialMultiCapture?: boolean;
  /** Maximum captures the staging tray will accept. Reaching the cap
   *  refuses the next shutter press with honest feedback instead of
   *  silently accumulating media the caller cannot accept. */
  maxCaptures?: number;
}

export default function CreatorCamera({
  mode,
  onCapture,
  onCaptureBatch,
  onGallery,
  onGalleryLongPress,
  onClose,
  renderBottomOverlay,
  renderTopRightAccessory,
  onViewportChange,
  initialMultiCapture = false,
  maxCaptures }: CreatorCameraProps) {
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
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoomIndex, setZoomIndex] = useState<ZoomStepIndex>(0);
  // ── Real-time camera effect (Skia frame processor) ──
  // The selected effect is applied to the live preview via a GPU Skia
  // frame processor (useSkiaFrameProcessor). The effect is also attached
  // to the captured media payload so the timeline/export engine applies
  // the same color matrix post-capture.
  const [cameraEffect, setCameraEffect] = useState<CameraEffectId>('none');
  const effectFrameProcessor = useCameraEffectProcessor(cameraEffect);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const captureFlash = useSharedValue(0);

  // ── Shared animation values ──
  // Flip animation (double-tap to switch camera) — a quick fade, not a
  // full rotation. The device switch is hidden by a brief opacity dip.
  const flipOpacity = useSharedValue(1);
  // Permission entrance animation
  const permissionEntrance = useSharedValue(0);
  // ── Press-and-hold video: track long-press state to suppress photo on release ──
  // Synchronous hold state — unlike isLongPressRef (reset on a delay to
  // suppress the trailing tap event), this clears the instant the finger
  // lifts so a pending mic-permission await can abort the recording start.
  const pressHeldRef = useRef(false);

  // Capture intent is owned by the studio shell. Entry-mode changes remount
  // the correct canonical composer before media is committed.
  const isPoster = mode === 'poster' || mode === 'moodboard';
  const isVisualSearch = mode === 'visual-search';
  const zoomLabel = ZOOM_STEPS[zoomIndex].label;
  const zoomValue = ZOOM_STEPS[zoomIndex].value;

  // ── Extracted capture hooks ────────────────────────────────────────
  // Session bootstrap (useCameraInit), Tools-sheet state (useCameraTools),
  // gallery thumbnail/carousel (useRecentGallery), quick-review +
  // multi-capture staging tray (useCameraReview), photo/video recording
  // lifecycles with self-timer + hands-free countdowns
  // (useCameraRecording), and the viewfinder gesture grammar — pinch /
  // double-tap / dismiss, shutter tap-vs-hold arbitration, and hold-drag
  // slide-to-zoom / slide-to-lock (useCaptureGestures).
  const cameraInit = useCameraInit({ reducedMotion, haptic, show });
  const {
    cameraReady,
    setCameraReady,
    cameraInitError,
    setCameraInitError,
    showInitLabel,
    spinnerStyle,
    cameraActive,
    setCameraActive,
    handleRetryCameraInit,
    handleCameraStarted,
    handleCameraError,
  } = cameraInit;
  const cameraTools = useCameraTools({
    haptic,
    cameraEffect,
    setCameraEffect,
    setCameraReady,
    setCameraInitError,
  });
  const {
    showToolsSheet,
    openToolsSheet,
    closeToolsSheet,
    timerOption,
    handleTimerChange,
    showGrid,
    toggleGrid,
    framingMode,
    toggleFramingMode,
    speedMode,
    handleSpeedChange,
    showGreenScreenSheet,
    greenScreenSettings,
    handleGreenScreenApply,
    handleGreenScreenCancel,
    handleOpenGreenScreen,
    handleEffectChange,
  } = cameraTools;
  const {
    lastItem,
    recentItems,
    showRecentCarousel,
    handleGalleryLongPress,
  } = useRecentGallery({ haptic, onGalleryLongPress });
  const review = useCameraReview({
    haptic,
    reducedMotion,
    spring,
    isVisualSearch,
    initialMultiCapture,
    speedMode,
    cameraEffect,
    greenScreenSettings,
    onCapture,
    onCaptureBatch,
  });
  const {
    capturedUri,
    capturedKind,
    reviewOpacityStyle,
    handleRetake,
    handleConfirmCapture,
    multiCaptureMode,
    multiCaptures,
    handleFinishMultiCapture,
    toggleMultiCapture,
    handleRemoveCapture,
  } = review;
  const recording = useCameraRecording({
    cameraRef,
    cameraReady,
    photoOutput,
    videoOutput,
    flash,
    timerOption,
    capturePermissions,
    haptic,
    reducedMotion,
    spring,
    show,
    isPoster,
    isVisualSearch,
    speedMode,
    cameraEffect,
    greenScreenSettings,
    onCaptureBatch,
    captureFlash,
    pressHeldRef,
    setCameraActive,
    review,
  });
  const {
    isRecording,
    recordingElapsed,
    isMutedRecording,
    recordingProgress,
    recordingRingScale,
    countdown,
    handsFreeMode,
    handsFreeCountdown,
    toggleHandsFree,
    countdownTextStyle,
  } = recording;

  // ── Measured capture viewport ──────────────────────────────────────
  // The guide frame adapts to real device dimensions via onLayout instead
  // of hardcoded offsets. Brackets/crosshair are shown ONLY for Visual
  // Search or explicit framing mode. The authored aspect ratio insets the
  // guide frame within the available area so brackets describe the actual
  // capture crop.
  const showFramingGuides = isVisualSearch || framingMode;
  const authoredAspectRatio = isPoster ? POSTER_DEFAULT_ASPECT_RATIO : isVisualSearch ? undefined : LOOK_DEFAULT_ASPECT_RATIO;
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

  // ── Framing-guide opacity (crossfade on mode switch) ──

  // ── Flip: quick opacity fade (1→0→1) to hide the device switch ──
  const cameraFlipStyle = useAnimatedStyle(() => ({ opacity: flipOpacity.value }));

  // ── Permission entrance: timing slide-up + fade when denied ──
  // Per §5.14: entrance uses timing (ease-out), not spring.
  useEffect(() => {
    if (!hasPermission) {
      permissionEntrance.value = 0;
      if (!reducedMotion) {
        permissionEntrance.value = withDelay(
          100,
          withTiming(1, { duration: Motion.duration.slow, easing: Motion.easing.entrance }),
        );
      } else {
        permissionEntrance.value = 1;
      }
    }
  }, [hasPermission, reducedMotion, permissionEntrance]);

  // ── Camera controls ──
  const cycleFlash = useCallback(() => {
    haptic.light();
    setFlash((p) => p === 'off' ? 'on' : p === 'on' ? 'auto' : 'off');
  }, [haptic]);

  const toggleFacing = useCallback(() => {
    // Swapping the device mid-take reconfigures the camera session under a
    // live recorder — refuse instead of corrupting the recording.
    if (isRecording) return;
    haptic.selection();
    setCameraReady(false);
    setCameraInitError(false);
    // Quick fade out → swap → fade in. No full rotation; a flip is a
    // device swap, not a spectacle.
    if (!reducedMotion) {
      flipOpacity.value = withSequence(
        withTiming(0, { duration: Motion.duration.fast, easing: Motion.easing.exit }),
        withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance }),
      );
    }
    setFacing((p) => (p === 'back' ? 'front' : 'back'));
    // device is reactive — useCameraDevice(facing) will resolve the new device
  }, [haptic, reducedMotion, flipOpacity, isRecording, setCameraReady, setCameraInitError]);

  const {
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
  } = useCaptureGestures({
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
  });

  const handleOpenSettings = useCallback(() => Linking.openSettings(), []);

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

  // ── Camera init failure — dedicated error overlay with retry ──
  if (cameraInitError) {
    return <CameraInitErrorOverlay isPoster={isPoster} onRetry={handleRetryCameraInit} onGallery={onGallery} />;
  }

  // ── Camera viewfinder ──
  return (
    <GestureDetector gesture={Gesture.Race(pinchGesture, swipeDownDismiss)}>
      <View style={StyleSheet.absoluteFill}>
        {/* Double-tap gesture for camera flip (wrapped around camera feed) */}
        <CameraFeed
          doubleTapGesture={doubleTapGesture}
          onTapFocus={handleTapFocus}
          cameraFlipStyle={cameraFlipStyle}
          cameraEffect={cameraEffect}
          cameraRef={cameraRef}
          device={device}
          cameraActive={cameraActive}
          photoOutput={photoOutput}
          videoOutput={videoOutput}
          flash={flash}
          effectiveZoom={effectiveZoom}
          effectFrameProcessor={effectFrameProcessor}
          cameraReady={cameraReady}
          showInitLabel={showInitLabel}
          spinnerStyle={spinnerStyle}
          onCameraStarted={handleCameraStarted}
          onCameraError={handleCameraError}
        />

      {/* Capture flash — subtle white overlay on capture */}
      <Reanimated.View
        style={[styles.captureFlash, { backgroundColor: colors.scrimTextPrimary }, captureFlashStyle]}
        pointerEvents="none"
      />

      {/* Gradient overlays — 0.18 top, 0.28 bottom (legibility only, not a wash) */}
      <CameraScrimGradients />

      {/* One unobscured capture viewport owns every composition guide. The
          guide frame is measured via onLayout so it adapts to real device
          dimensions instead of hardcoded offsets. Brackets and crosshair
          are shown ONLY for Visual Search or explicit framing mode. For
          ordinary Poster/Look capture, only an optional rule-of-thirds
          grid is shown. */}
      <CaptureGuideOverlay
        insets={insets}
        hasBottomOverlay={!!renderBottomOverlay}
        isVisualSearch={isVisualSearch}
        isPoster={isPoster}
        onViewportLayout={onViewportLayout}
        showGrid={showGrid}
        showFramingGuides={showFramingGuides}
        viewport={viewport}
      />

      {/* Focus reticle — real AE/AF/AWB metering via focusTo() on
          supported devices; visual tap indicator on unsupported ones. */}
      <FocusReticle
        focusPoint={focusPoint}
        size={FOCUS_RETICLE_SIZE}
        onDismiss={() => {
          setFocusPoint(null);
        }}
      />

      {/* Countdown overlay — Reanimated spring scale + fade.
          Shows the self-timer countdown OR the hands-free countdown. */}
      <CameraCountdownOverlay
        countdown={countdown}
        handsFreeCountdown={handsFreeCountdown}
        textStyle={countdownTextStyle}
      />

      {/* Top controls — close (left), flash + tools (right) */}
      <CameraTopBar
        insets={insets}
        onClose={onClose}
        renderTopRightAccessory={renderTopRightAccessory}
        flash={flash}
        onCycleFlash={cycleFlash}
        onOpenTools={openToolsSheet}
      />

      {/* ── Multi-snap staging tray ──
          Whenever captures exist, a persistent horizontal row of captured
          thumbnails is visible on the camera surface so the user sees their
          sequence accumulate while shooting. Each thumbnail is tappable to
          drop that frame. A Done button at the end lets the user finish and
          enter the editor. The tray is visible whenever captures exist,
          regardless of the multi-capture toggle, so accumulated captures
          are never hidden. */}
      {multiCaptures.length > 0 && (
        <CaptureStagingTray
          captures={multiCaptures}
          top={Math.max(insets.top, 16) + 56}
          onRemoveCapture={handleRemoveCapture}
          onDone={handleFinishMultiCapture}
        />
      )}

      {/* Bottom controls — gallery (left), shutter (center), flip (right) */}
      <CameraBottomBar
        insets={insets}
        lastItem={lastItem}
        recentItems={recentItems}
        showRecentCarousel={showRecentCarousel}
        onGallery={onGallery}
        onGalleryLongPress={handleGalleryLongPress}
        isRecording={isRecording}
        recordLocked={recordLocked}
        handsFreeMode={handsFreeMode}
        lockZoneRef={lockZoneRef}
        lockHot={lockHot}
        onShutterPress={handleShutterPress}
        onShutterLongPress={CAMERA_VIDEO_CAPTURE_ENABLED && cameraEffect === 'none' ? handleShutterLongPress : undefined}
        onShutterPressOut={CAMERA_VIDEO_CAPTURE_ENABLED && cameraEffect === 'none' ? handleShutterPressOut : undefined}
        onHoldTouchStart={handleHoldTouchStart}
        onHoldTouchMove={handleHoldTouchMove}
        cameraReady={cameraReady}
        recordingProgress={recordingProgress}
        recordingRingScale={recordingRingScale}
        speedMode={speedMode}
        videoCaptureEnabled={CAMERA_VIDEO_CAPTURE_ENABLED && cameraEffect === 'none'}
        onFlip={toggleFacing}
      />

      {/* ── Consolidated status region ───────────────────────────────────
          One top-center pill shows the single most-relevant status so the
          top area never hosts competing badges. Priority:
          recording > hands-free > green-screen > zoom. The zoom indicator
          is the transient fallback (animated opacity, invisible unless a
          pinch just occurred). One consistent pill style:
          colors.mediaOverlayScrim fill, colors.scrimTextPrimary text,
          Radius.full. */}
      <CameraStatusRegion
        top={Math.max(insets.top, 16) + 60}
        isRecording={isRecording}
        recordingLabel={`${Math.floor(recordingElapsed / 1000)}s${speedMode !== DEFAULT_SPEED ? `  ${speedMode}×` : ''}`}
        isMutedRecording={isMutedRecording}
        handsFreeMode={handsFreeMode}
        handsFreeCountdown={handsFreeCountdown}
        greenScreenSettings={greenScreenSettings}
        showGreenScreenSheet={showGreenScreenSheet}
        zoomIndicatorStyle={zoomIndicatorStyle}
        zoomLabel={zoomLabel}
      />

      {/* Green screen sheet — background image picker, key color,
          tolerance, feather. Settings are saved with the capture and
          the chroma key effect is rendered on the timeline via Skia. */}
      {/* ── Capture tools sheet ──────────────────────────────────────── */}
      {/* Bottom sheet containing all secondary camera tools: Timer, Grid,
          Hands-free, Speed, Green Screen, Multi-capture. Opens from the
          Tools button in the top bar. Camera effects live in this sheet so
          capture intent remains unobstructed. Each supported tool applies
          immediately; the sheet can stay open or be dismissed. */}
      <CameraToolSheets
        greenScreenSheetVisible={showGreenScreenSheet}
        onGreenScreenApply={handleGreenScreenApply}
        onGreenScreenCancel={handleGreenScreenCancel}
        toolsSheetVisible={showToolsSheet}
        onToolsSheetClose={closeToolsSheet}
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
        onOpenGreenScreen={handleOpenGreenScreen}
        multiCaptureMode={multiCaptureMode}
        onToggleMultiCapture={toggleMultiCapture}
        multiCaptureCount={multiCaptures.length}
        hasCapturedUri={!!capturedUri}
        isVisualSearch={isVisualSearch}
        isRecording={isRecording}
        videoCaptureEnabled={CAMERA_VIDEO_CAPTURE_ENABLED && cameraEffect === 'none'}
      />

      {/* Optional bottom overlay (e.g. mode switcher) */}
      {renderBottomOverlay?.()}

      {/* ── Quick-review overlay ── */}
      <CameraReviewOverlay
        uri={capturedUri}
        kind={capturedKind}
        animatedStyle={reviewOpacityStyle}
        insets={insets}
        isVisualSearch={isVisualSearch}
        onRetake={handleRetake}
        onConfirm={handleConfirmCapture}
      />
      </View>
    </GestureDetector>
  );
}
