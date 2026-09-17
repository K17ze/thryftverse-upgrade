import React from 'react';
import { GreenScreenSheet, type GreenScreenSettings } from '../../camera/GreenScreenSheet';
import { CaptureToolsSheet, type TimerOption as SheetTimerOption } from '../../camera/CaptureToolsSheet';
import type { CameraEffectId } from '../../camera/CameraEffectBar';

// ── Camera sheets ────────────────────────────────────────────────────
// Green screen sheet — background image picker, key color, tolerance,
// feather. Settings are saved with the capture and the chroma key
// effect is rendered on the timeline via Skia.
//
// Capture tools sheet — bottom sheet containing all secondary camera
// tools: Timer, Grid, Hands-free, Speed, Green Screen, Multi-capture.
// Opens from the Tools button in the top bar. Camera effects live in
// this sheet so capture intent remains unobstructed. Each supported
// tool applies immediately; the sheet can stay open or be dismissed.

export interface CameraToolSheetsProps {
  greenScreenSheetVisible: boolean;
  onGreenScreenApply: (settings: GreenScreenSettings) => void;
  onGreenScreenCancel: () => void;
  toolsSheetVisible: boolean;
  onToolsSheetClose: () => void;
  timerOption: SheetTimerOption;
  onTimerChange: (option: SheetTimerOption) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  framingMode: boolean;
  onToggleFramingMode: () => void;
  activeEffect: CameraEffectId;
  onEffectChange: (effect: CameraEffectId) => void;
  handsFreeMode: boolean;
  onToggleHandsFree: () => void;
  speedMode: string;
  onSpeedChange: (value: string) => void;
  greenScreenActive: boolean;
  onOpenGreenScreen: () => void;
  multiCaptureMode: boolean;
  onToggleMultiCapture: () => void;
  multiCaptureCount: number;
  hasCapturedUri: boolean;
  isVisualSearch: boolean;
  isRecording: boolean;
  videoCaptureEnabled: boolean;
}

export function CameraToolSheets({
  greenScreenSheetVisible,
  onGreenScreenApply,
  onGreenScreenCancel,
  toolsSheetVisible,
  onToolsSheetClose,
  timerOption,
  onTimerChange,
  showGrid,
  onToggleGrid,
  framingMode,
  onToggleFramingMode,
  activeEffect,
  onEffectChange,
  handsFreeMode,
  onToggleHandsFree,
  speedMode,
  onSpeedChange,
  greenScreenActive,
  onOpenGreenScreen,
  multiCaptureMode,
  onToggleMultiCapture,
  multiCaptureCount,
  hasCapturedUri,
  isVisualSearch,
  isRecording,
  videoCaptureEnabled }: CameraToolSheetsProps) {
  return (
    <>
      <GreenScreenSheet
        visible={greenScreenSheetVisible}
        onApply={onGreenScreenApply}
        onCancel={onGreenScreenCancel}
      />
      <CaptureToolsSheet
        visible={toolsSheetVisible}
        onClose={onToolsSheetClose}
        timerOption={timerOption}
        onTimerChange={onTimerChange}
        showGrid={showGrid}
        onToggleGrid={onToggleGrid}
        framingMode={framingMode}
        onToggleFramingMode={onToggleFramingMode}
        activeEffect={activeEffect}
        onEffectChange={onEffectChange}
        handsFreeMode={handsFreeMode}
        onToggleHandsFree={onToggleHandsFree}
        speedMode={speedMode}
        onSpeedChange={onSpeedChange}
        greenScreenActive={greenScreenActive}
        onOpenGreenScreen={onOpenGreenScreen}
        multiCaptureMode={multiCaptureMode}
        onToggleMultiCapture={onToggleMultiCapture}
        multiCaptureCount={multiCaptureCount}
        hasCapturedUri={hasCapturedUri}
        isVisualSearch={isVisualSearch}
        isRecording={isRecording}
        videoCaptureEnabled={videoCaptureEnabled}
      />
    </>
  );
}
