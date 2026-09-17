// ── useCameraTools ───────────────────────────────────────────────────
// Owns the secondary camera tools surfaced through the Tools sheet and
// green-screen sheet: timer option, rule-of-thirds grid, explicit
// framing mode, hands-free-adjacent speed mode, green screen settings,
// and the live Skia camera-effect selection. Extracted verbatim from
// CreatorCamera — handlers and dependency arrays unchanged.

import { useState, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useHaptic } from '../../hooks/useHaptic';
import { type GreenScreenSettings } from '../camera/GreenScreenSheet';
import { type TimerOption as SheetTimerOption } from '../camera/CaptureToolsSheet';
import type { CameraEffectId } from '../camera/CameraEffectBar';
import { CreatorAnalytics } from '../shared/creatorAnalytics';
import { DEFAULT_SPEED } from './captureConstants';

export interface UseCameraToolsOptions {
  haptic: ReturnType<typeof useHaptic>;
  cameraEffect: CameraEffectId;
  setCameraEffect: Dispatch<SetStateAction<CameraEffectId>>;
  setCameraReady: Dispatch<SetStateAction<boolean>>;
  setCameraInitError: Dispatch<SetStateAction<boolean>>;
}

export interface UseCameraToolsResult {
  showToolsSheet: boolean;
  setShowToolsSheet: Dispatch<SetStateAction<boolean>>;
  openToolsSheet: () => void;
  closeToolsSheet: () => void;
  timerOption: 0 | 3 | 5 | 10;
  handleTimerChange: (option: SheetTimerOption) => void;
  showGrid: boolean;
  toggleGrid: () => void;
  framingMode: boolean;
  toggleFramingMode: () => void;
  speedMode: string;
  handleSpeedChange: (value: string) => void;
  showGreenScreenSheet: boolean;
  setShowGreenScreenSheet: Dispatch<SetStateAction<boolean>>;
  greenScreenSettings: GreenScreenSettings | null;
  toggleGreenScreen: () => void;
  handleGreenScreenApply: (settings: GreenScreenSettings) => void;
  handleGreenScreenCancel: () => void;
  handleOpenGreenScreen: () => void;
  handleEffectChange: (nextEffect: CameraEffectId) => void;
}

export function useCameraTools({
  haptic,
  cameraEffect,
  setCameraEffect,
  setCameraReady,
  setCameraInitError,
}: UseCameraToolsOptions): UseCameraToolsResult {
  // ── Tools sheet (secondary tools behind a Tools button in the top bar) ──
  const [showToolsSheet, setShowToolsSheet] = useState(false);
  const [timerOption, setTimerOption] = useState<0 | 3 | 5 | 10>(0);
  const [showGrid, setShowGrid] = useState(false);
  // ── Explicit framing mode ──
  // Brackets and crosshair are NOT shown for ordinary capture — only for
  // Visual Search or when the user explicitly enables framing mode via Tools.
  const [framingMode, setFramingMode] = useState(false);

  // ── Capture speed mode ──
  // Stored as a string for CreatorSegmentControl; converted to number
  // when building CreatorInitialMedia metadata.
  const [speedMode, setSpeedMode] = useState<string>(DEFAULT_SPEED);

  // ── Green screen (post-capture) ──
  // Settings are preserved in CreatorInitialMedia.greenScreen so the
  // timeline can re-render the composite.
  const [showGreenScreenSheet, setShowGreenScreenSheet] = useState(false);
  const [greenScreenSettings, setGreenScreenSettings] = useState<GreenScreenSettings | null>(null);

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
      setCameraInitError(false);
    }
    setCameraEffect(nextEffect);
    CreatorAnalytics.cameraEffectSelected(nextEffect);
  }, [cameraEffect, setCameraReady, setCameraInitError, setCameraEffect]);

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

  const handleOpenGreenScreen = useCallback(() => {
    setShowToolsSheet(false);
    if (!greenScreenSettings) {
      setShowGreenScreenSheet(true);
    } else {
      // Toggle off — clear settings
      toggleGreenScreen();
    }
  }, [greenScreenSettings, toggleGreenScreen]);

  const toggleGrid = useCallback(() => {
    haptic.selection();
    setShowGrid((p) => !p);
  }, [haptic]);

  // ── Framing mode toggle ──
  // Explicit framing shows brackets + crosshair for ordinary Poster/Look
  // capture. Visual Search always shows framing guides regardless of this
  // toggle. Framing chrome is opt-in, not default.
  const toggleFramingMode = useCallback(() => {
    haptic.selection();
    setFramingMode((p) => !p);
  }, [haptic]);

  return {
    showToolsSheet,
    setShowToolsSheet,
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
    setShowGreenScreenSheet,
    greenScreenSettings,
    toggleGreenScreen,
    handleGreenScreenApply,
    handleGreenScreenCancel,
    handleOpenGreenScreen,
    handleEffectChange,
  };
}
