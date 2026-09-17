// ── useCameraInit ────────────────────────────────────────────────────
// Owns the camera session bootstrap state of CreatorCamera: ready/error
// flags, the delayed "Starting camera" label, the init spinner rotation,
// the isActive lifecycle flag (deactivated on unmount so the native
// CameraSession releases promptly), and the retry/started/error
// handlers shared by the Camera and SkiaCamera feeds. Extracted
// verbatim from CreatorCamera.

import { useState, useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
  type AnimatedStyle } from 'react-native-reanimated';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';

export interface UseCameraInitOptions {
  reducedMotion: boolean;
  haptic: ReturnType<typeof useHaptic>;
  show: ReturnType<typeof useToast>['show'];
}

export interface UseCameraInitResult {
  cameraReady: boolean;
  setCameraReady: Dispatch<SetStateAction<boolean>>;
  cameraInitError: boolean;
  setCameraInitError: Dispatch<SetStateAction<boolean>>;
  showInitLabel: boolean;
  spinnerStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  cameraActive: boolean;
  setCameraActive: Dispatch<SetStateAction<boolean>>;
  handleRetryCameraInit: () => void;
  handleCameraStarted: () => void;
  handleCameraError: () => void;
}

export function useCameraInit({
  reducedMotion,
  haptic,
  show,
}: UseCameraInitOptions): UseCameraInitResult {
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraInitError, setCameraInitError] = useState(false);
  // "Starting camera" label is delayed so a fast init never flashes text.
  // Only surfaces if the camera takes more than 800ms to report ready.
  const [showInitLabel, setShowInitLabel] = useState(false);
  // Camera init spinner rotation — 1.2s linear loop
  const spinnerRotation = useSharedValue(0);
  // Deactivate the camera on unmount to release the native CameraSession
  // promptly. Without this, the native session can linger until GC, causing
  // "A resource failed to call release" warnings and blocking other camera
  // consumers (e.g. VisualSearchCamera) from acquiring the device.
  const [cameraActive, setCameraActive] = useState(true);
  // Reveal the "Starting camera" label only when init exceeds 800ms.
  // A fast init never shows the label, keeping the overlay a pure spinner.
  // The spinner rotates continuously at 1.2s/rev while the camera initializes.
  useEffect(() => {
    if (cameraReady) {
      setShowInitLabel(false);
      spinnerRotation.value = 0;
      return;
    }
    const t = setTimeout(() => setShowInitLabel(true), 800);
    if (!reducedMotion) {
      spinnerRotation.value = withRepeat(
        withTiming(360, { duration: 1200, easing: Easing.linear }),
        -1,
        false,
      );
    }
    return () => clearTimeout(t);
  }, [cameraReady, reducedMotion, spinnerRotation]);

  // ── Camera init spinner rotation — 1.2s linear loop ──
  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinnerRotation.value}deg` }] }));

  const handleCameraStarted = useCallback(() => {
    setCameraReady(true);
    setCameraInitError(false);
  }, []);

  const handleCameraError = useCallback(() => {
    setCameraReady(false);
    setCameraInitError(true);
    show('Camera could not start. Try again or use your gallery.', 'error');
  }, [show]);

  const handleRetryCameraInit = useCallback(() => {
    haptic.light();
    setCameraInitError(false);
    setCameraReady(false);
    setCameraActive(false);
    setTimeout(() => setCameraActive(true), 100);
  }, [haptic]);

  return {
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
  };
}
