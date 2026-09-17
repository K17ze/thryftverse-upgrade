// ── useCameraRecording ───────────────────────────────────────────────
// Owns the capture lifecycles of CreatorCamera: photo capture with
// self-timer countdown (takePhoto), press-and-hold video recording
// (beginVideoRecording/stopRecording + progress ring + elapsed clock),
// hands-free countdown → auto-record, and the interruption cleanups
// (unmount + app-background) that keep the native Recorder from
// orphaning a take. Extracted verbatim — hook order and dependency
// arrays are unchanged.

import { useRef, useState, useCallback, useEffect } from 'react';
import type { RefObject, Dispatch, SetStateAction } from 'react';
import {
  AppState,
  AppStateStatus,
  type StyleProp,
  type TextStyle } from 'react-native';
import {
  type CameraRef,
  usePhotoOutput,
  useVideoOutput } from 'react-native-vision-camera';
import { type SkiaCameraRef } from 'react-native-vision-camera-skia';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  type SharedValue,
  type AnimatedStyle } from 'react-native-reanimated';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useToast } from '../../context/ToastContext';
import { makeStableId } from '../../utils/createStableId';
import { Motion } from '../../theme/motionTokens';
import { type GreenScreenSettings } from '../camera/GreenScreenSheet';
import type { CameraEffectId } from '../camera/CameraEffectBar';
import { CreatorAnalytics } from '../shared/creatorAnalytics';
import type { CreatorInitialMedia } from '../../navigation/types';
import type { CreatorCapturePermissions } from './useCreatorCapturePermissions';
import type { CapturedMediaMetadata, UseCameraReviewResult } from './useCameraReview';
import {
  RECORDING_MAX_DURATION,
  HANDS_FREE_COUNTDOWN,
  HANDS_FREE_DEFAULT_DURATION,
  HANDS_FREE_MAX_DURATION,
  DEFAULT_SPEED } from './captureConstants';

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

export interface UseCameraRecordingOptions {
  cameraRef: RefObject<CameraRef | SkiaCameraRef | null>;
  cameraReady: boolean;
  photoOutput: ReturnType<typeof usePhotoOutput>;
  videoOutput: ReturnType<typeof useVideoOutput>;
  flash: 'off' | 'on' | 'auto';
  timerOption: number;
  capturePermissions: CreatorCapturePermissions;
  haptic: ReturnType<typeof useHaptic>;
  reducedMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  show: ReturnType<typeof useToast>['show'];
  isPoster: boolean;
  isVisualSearch: boolean;
  speedMode: string;
  cameraEffect: CameraEffectId;
  greenScreenSettings: GreenScreenSettings | null;
  onCaptureBatch?: (captures: CreatorInitialMedia[]) => void;
  captureFlash: SharedValue<number>;
  /** Synchronous hold state — written by the shutter hold grammar in
   *  useCaptureGestures, read here so a pending mic-permission await can
   *  abort the recording start once the finger lifts. */
  pressHeldRef: RefObject<boolean>;
  setCameraActive: Dispatch<SetStateAction<boolean>>;
  review: Pick<
    UseCameraReviewResult,
    | 'multiCaptureMode'
    | 'setMultiCaptures'
    | 'setCapturedUri'
    | 'setCapturedKind'
    | 'setCapturedMetadata'
  >;
}

export interface UseCameraRecordingResult {
  isRecording: boolean;
  /** UI-thread mirror of isRecording so the dismiss gesture can fail fast
   *  on the gesture thread without a runOnJS hop per touch. */
  isRecordingSV: SharedValue<boolean>;
  recordingElapsed: number;
  isMutedRecording: boolean;
  recordingProgress: SharedValue<number>;
  recordingRingScale: SharedValue<number>;
  countdown: number | null;
  setCountdown: Dispatch<SetStateAction<number | null>>;
  photoCountdownTokenRef: RefObject<number>;
  handsFreeMode: boolean;
  handsFreeCountdown: number | null;
  toggleHandsFree: () => void;
  cancelHandsFreeCountdown: () => void;
  startHandsFreeCapture: () => Promise<void>;
  stopRecording: () => void;
  beginVideoRecording: (customMaxDuration?: number) => Promise<void>;
  takePhoto: () => Promise<void>;
  countdownTextStyle: StyleProp<AnimatedStyle<TextStyle>>;
}

export function useCameraRecording({
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
}: UseCameraRecordingOptions): UseCameraRecordingResult {
  const {
    multiCaptureMode,
    setMultiCaptures,
    setCapturedUri,
    setCapturedKind,
    setCapturedMetadata,
  } = review;

  const [countdown, setCountdown] = useState<number | null>(null);
  // Cancellation token for the photo timer countdown — same grammar as the
  // hands-free token: any cancel path increments it and the loop exits.
  const photoCountdownTokenRef = useRef(0);

  // ── Hands-free capture mode ──
  // When enabled, tapping the shutter starts a 3-second countdown, then
  // recording begins automatically and stops at the configured duration.
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [handsFreeCountdown, setHandsFreeCountdown] = useState<number | null>(null);
  // Cancellation token for the hands-free countdown — incremented by any
  // cancel path (toggle off, shutter tap, unmount, close). The async loop
  // checks the token after each tick instead of holding an unkillable timer.
  const handsFreeTokenRef = useRef(0);

  // Recording state + ring progress
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  // Muted recording indicator — true when recording video without audio
  // because microphone permission was denied or not granted.
  const [isMutedRecording, setIsMutedRecording] = useState(false);
  const recordingProgress = useSharedValue(0);
  const recordingRingScale = useSharedValue(1);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // UI-thread mirror of isRecording so the dismiss gesture can fail fast on
  // the gesture thread without a runOnJS hop per touch.
  const isRecordingSV = useSharedValue(false);
  useEffect(() => { isRecordingSV.value = isRecording; }, [isRecording, isRecordingSV]);
  // ── Native recording recorder ref (P0.1 — one recording lifecycle) ──
  // recorderRef is declared in beginVideoRecording scope above.
  // Countdown Reanimated values
  const countdownScale = useSharedValue(1.5);
  const countdownOpacity = useSharedValue(0);

  // ── Countdown: spring scale (1.5→1.0 bouncy) + fade ──
  const countdownTextStyle = useAnimatedStyle(() => ({
    opacity: countdownOpacity.value,
    transform: [{ scale: countdownScale.value }] }));

  // ── Hands-free mode toggle ──
  const cancelHandsFreeCountdown = useCallback(() => {
    handsFreeTokenRef.current += 1;
    setHandsFreeCountdown(null);
  }, []);

  const toggleHandsFree = useCallback(() => {
    haptic.selection();
    setHandsFreeMode((p) => !p);
    // Cancel any in-progress hands-free countdown
    cancelHandsFreeCountdown();
  }, [haptic, cancelHandsFreeCountdown]);

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
    // If the shutter was released while the mic prompt was pending, the
    // hold grammar ended — starting now would record past the release and
    // leave an orphaned take. Hands-free (customMaxDuration) needs no hold.
    if (customMaxDuration === undefined && !pressHeldRef.current) return;
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
        // Auto-stop at max duration — drive the recorder directly. A stale
        // `stopRecording` closure here can observe isRecording=false and
        // silently never fire, letting the take run past the cap.
        void recorderRef.current?.stopRecording();
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
              withTiming(0.8, { duration: Motion.duration.touch, easing: Motion.easing.entrance }),
              withTiming(0, { duration: Motion.duration.fast, easing: Motion.easing.exit }),
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
        (_error) => {
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
  }, [cameraReady, isRecording, haptic, reducedMotion, recordingProgress, recordingRingScale, show, spring, captureFlash, isPoster, multiCaptureMode, isVisualSearch, speedMode, greenScreenSettings, cameraEffect, videoOutput, capturePermissions, pressHeldRef, setMultiCaptures, setCapturedKind, setCapturedMetadata, setCapturedUri]);

  // ── Hands-free countdown → auto-record ──
  // Starts a 3-second countdown with haptic ticks, then begins recording.
  // Recording auto-stops at HANDS_FREE_DEFAULT_DURATION. The user can
  // tap the shutter to stop early.
  const startHandsFreeCapture = useCallback(async () => {
    if (!cameraRef.current || isRecording || handsFreeCountdown !== null) return;
    haptic.medium(); // medium on countdown start
    const token = ++handsFreeTokenRef.current;

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
      if (handsFreeTokenRef.current !== token) {
        // Cancelled mid-countdown — leave without starting a recording.
        setHandsFreeCountdown(null);
        return;
      }
    }
    setHandsFreeCountdown(null);

    // Begin recording with the hands-free duration
    beginVideoRecording(HANDS_FREE_DEFAULT_DURATION);
  }, [cameraRef, isRecording, handsFreeCountdown, haptic, reducedMotion, countdownScale, countdownOpacity, spring, beginVideoRecording]);

  // ── Capture with optional timer ──
  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || !cameraReady || countdown !== null) return;

    if (timerOption > 0) {
      haptic.medium(); // medium on countdown start
      const token = ++photoCountdownTokenRef.current;
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
        if (photoCountdownTokenRef.current !== token) {
          // Cancelled mid-countdown — do not capture.
          setCountdown(null);
          return;
        }
      }
      setCountdown(null);
    }

    try {
      // Immediate haptic the instant the shutter fires — before the async
      // capture completes — so the user feels instant response.
      haptic.medium();
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
        // Capture flash — white overlay 0→0.8→0 over 200ms. This is the
        // capture completion feedback signal (the haptic already fired at
        // shutter press). Runs regardless of whether the capture goes
        // direct-to-editor or through the review overlay.
        if (!reducedMotion) {
          captureFlash.value = withSequence(
            withTiming(0.8, { duration: Motion.duration.touch, easing: Motion.easing.entrance }),
            withTiming(0, { duration: Motion.duration.fast, easing: Motion.easing.exit })
          );
        }
        setCapturedKind('image');
        setCapturedMetadata(photoMetadata);
        // ── Multi-capture: accumulate directly to the staging tray ──
        // When multi-capture is explicitly enabled, photo captures pile up
        // silently — no per-capture review overlay. The user finishes via
        // the Done button in the staging tray. Visual search is excluded
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
  }, [photoOutput, flash, cameraReady, countdown, haptic, reducedMotion, show, timerOption, countdownScale, countdownOpacity, captureFlash, spring, onCaptureBatch, isVisualSearch, multiCaptureMode, isPoster, cameraEffect, greenScreenSettings, setCapturedKind, setCapturedMetadata, setCapturedUri, setMultiCaptures, cameraRef]);

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
      // Cancel any in-progress countdowns
      handsFreeTokenRef.current += 1;
      photoCountdownTokenRef.current += 1;
    };
  }, [setCameraActive]);

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

  return {
    isRecording,
    isRecordingSV,
    recordingElapsed,
    isMutedRecording,
    recordingProgress,
    recordingRingScale,
    countdown,
    setCountdown,
    photoCountdownTokenRef,
    handsFreeMode,
    handsFreeCountdown,
    toggleHandsFree,
    cancelHandsFreeCountdown,
    startHandsFreeCapture,
    stopRecording,
    beginVideoRecording,
    takePhoto,
    countdownTextStyle,
  };
}
