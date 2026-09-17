// ── useCameraReview ──────────────────────────────────────────────────
// Owns the post-capture quick-review state (captured uri/kind/metadata,
// review overlay opacity, retake/confirm) and the multi-capture staging
// tray (mode toggle, accumulation, per-frame removal, finish batch).
// Extracted from CreatorCamera — logic is verbatim; the hook only
// relocates the state and handlers.

import { useState, useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  type AnimatedStyle } from 'react-native-reanimated';
import { makeStableId } from '../../utils/createStableId';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { type GreenScreenSettings } from '../camera/GreenScreenSheet';
import type { CameraEffectId } from '../camera/CameraEffectBar';
import type { CreatorInitialMedia } from '../../navigation/types';
import { DEFAULT_SPEED } from './captureConstants';

export type CapturedMediaMetadata = Pick<
  CreatorInitialMedia,
  'width' | 'height' | 'durationMs' | 'mimeType'
>;

export interface UseCameraReviewOptions {
  haptic: ReturnType<typeof useHaptic>;
  reducedMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  isVisualSearch: boolean;
  /** Arm multi-capture (staging tray) on mount — listing flows open with
   *  Multi Snap accumulation rather than the single-capture review. */
  initialMultiCapture: boolean;
  speedMode: string;
  cameraEffect: CameraEffectId;
  greenScreenSettings: GreenScreenSettings | null;
  onCapture: (uri: string) => void;
  onCaptureBatch?: (captures: CreatorInitialMedia[]) => void;
}

export interface UseCameraReviewResult {
  capturedUri: string | null;
  capturedKind: 'image' | 'video';
  capturedMetadata: CapturedMediaMetadata;
  setCapturedUri: Dispatch<SetStateAction<string | null>>;
  setCapturedKind: Dispatch<SetStateAction<'image' | 'video'>>;
  setCapturedMetadata: Dispatch<SetStateAction<CapturedMediaMetadata>>;
  reviewOpacityStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  handleRetake: () => void;
  handleConfirmCapture: () => void;
  multiCaptureMode: boolean;
  multiCaptures: CreatorInitialMedia[];
  setMultiCaptures: Dispatch<SetStateAction<CreatorInitialMedia[]>>;
  handleFinishMultiCapture: () => void;
  toggleMultiCapture: () => void;
  handleRemoveCapture: (captureId: string) => void;
}

export function useCameraReview({
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
}: UseCameraReviewOptions): UseCameraReviewResult {
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  // Track whether the current capture is a photo or video so the
  // confirmed capture is sent with the correct kind. Without this, video
  // recordings are misclassified as images, breaking playback in the
  // poster/look canvas.
  const [capturedKind, setCapturedKind] = useState<'image' | 'video'>('image');
  const [capturedMetadata, setCapturedMetadata] = useState<CapturedMediaMetadata>({});
  const reviewOpacity = useSharedValue(0);

  // ── Multi-capture mode ──
  // Every capture is retained as a CreatorInitialMedia entry. Poster maps
  // captures to frames; Look maps captures to layers. Single capture is the
  // default; multi-capture is an explicit mode in Tools that accumulates
  // into the staging tray.
  const [multiCaptureMode, setMultiCaptureMode] = useState(initialMultiCapture);
  const [multiCaptures, setMultiCaptures] = useState<CreatorInitialMedia[]>([]);

  // ── Quick-review overlay opacity ──
  const reviewOpacityStyle = useAnimatedStyle(() => ({ opacity: reviewOpacity.value }));

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
  // Triggered from the Done button in the staging tray.
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

  return {
    capturedUri,
    capturedKind,
    capturedMetadata,
    setCapturedUri,
    setCapturedKind,
    setCapturedMetadata,
    reviewOpacityStyle,
    handleRetake,
    handleConfirmCapture,
    multiCaptureMode,
    multiCaptures,
    setMultiCaptures,
    handleFinishMultiCapture,
    toggleMultiCapture,
    handleRemoveCapture,
  };
}
