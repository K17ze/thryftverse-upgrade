/**
 * useCropConfirm — confirm pipeline for CreatorCropSheet.
 *
 * Extracted verbatim from CreatorCropSheet.tsx. Owns the synchronous
 * double-tap guard and the processing state, and executes the crop via
 * expo-image-manipulator: flip → straighten-rotate → crop → 90° steps,
 * then re-normalizes the stored focal point into output space.
 */
import { useCallback, useRef, useState } from 'react';
import { manipulateAsync, SaveFormat, FlipType, type Action } from 'expo-image-manipulator';
import type { SharedValue } from 'react-native-reanimated';
import type { useHaptic } from '../../../hooks/useHaptic';
import type { ToastType, ToastOptions } from '../../../context/ToastContext';
import { largestInscribedRect, mapFocalToOutput } from './cropSheetShared';

interface UseCropConfirmParams {
  imageUri: string;
  cropRect: { x: number; y: number; width: number; height: number };
  imageSize: { width: number; height: number };
  rotation: number;
  flippedH: boolean;
  flippedV: boolean;
  straighten: number;
  focalPoint?: { x: number; y: number };
  draftFocal: { x: number; y: number } | null;
  onFocalPointChange?: (point: { x: number; y: number }) => void;
  onCropComplete: (newUri: string, width: number, height: number) => void;
  onClose: () => void;
  show: (message: string, type?: ToastType, options?: ToastOptions) => void;
  haptic: ReturnType<typeof useHaptic>;
  imageZoomSV: SharedValue<number>;
  imagePanXSV: SharedValue<number>;
  imagePanYSV: SharedValue<number>;
  displayW: number;
}

export function useCropConfirm({
  imageUri,
  cropRect,
  imageSize,
  rotation,
  flippedH,
  flippedV,
  straighten,
  focalPoint,
  draftFocal,
  onFocalPointChange,
  onCropComplete,
  onClose,
  show,
  haptic,
  imageZoomSV,
  imagePanXSV,
  imagePanYSV,
  displayW }: UseCropConfirmParams) {
  const [isProcessing, setIsProcessing] = useState(false);

  // Synchronous guard against double-tap on confirm. React state
  // (isProcessing) is async — a fast second tap can fire before re-render.
  const confirmGuardRef = useRef(false);

  // ── Execute crop via expo-image-manipulator ──────────────────────
  const handleCrop = useCallback(async () => {
    if (!imageUri || !cropRect.width || !cropRect.height) return;
    if (confirmGuardRef.current) return;
    confirmGuardRef.current = true;
    setIsProcessing(true);
    haptic.medium();
    try {
      // Adjust crop rect for image zoom/pan. When the image is zoomed, the
      // visible portion is smaller by the zoom factor, and the pan offset
      // shifts the visible region center within the source image.
      const zoom = imageZoomSV.value;
      let effectiveCropX = cropRect.x;
      let effectiveCropY = cropRect.y;
      let effectiveCropW = cropRect.width;
      let effectiveCropH = cropRect.height;
      if (zoom > 1.01) {
        // The visible image region is smaller by the zoom factor
        effectiveCropW = cropRect.width / zoom;
        effectiveCropH = cropRect.height / zoom;
        // Pan offset shifts the visible region center
        const panScale = imageSize.width / displayW;
        const panOffsetX = (imagePanXSV.value * panScale) / zoom;
        const panOffsetY = (imagePanYSV.value * panScale) / zoom;
        effectiveCropX = cropRect.x + (cropRect.width - effectiveCropW) / 2 - panOffsetX;
        effectiveCropY = cropRect.y + (cropRect.height - effectiveCropH) / 2 - panOffsetY;
        // Clamp to image bounds
        effectiveCropX = Math.max(0, Math.min(imageSize.width - effectiveCropW, effectiveCropX));
        effectiveCropY = Math.max(0, Math.min(imageSize.height - effectiveCropH, effectiveCropY));
      }
      // Flip first so the crop rect matches the mirrored preview. Then
      // straighten: rotate by the slider angle (expo expands the canvas to
      // the rotated bounding box) and crop the largest centered rect of the
      // current crop aspect — the biggest axis-aligned region of that aspect
      // containing no empty corners. Without straighten the crop is the
      // user's rect in source space; the trailing 90° rotation is unchanged.
      const actions: Action[] = [];
      if (flippedH) actions.push({ flip: FlipType.Horizontal });
      if (flippedV) actions.push({ flip: FlipType.Vertical });
      // The crop rect actually applied, in the canvas the crop runs in —
      // reused below to re-normalize the stored focal point.
      let appliedCrop = { originX: 0, originY: 0, width: 0, height: 0 };
      let rotatedW = 0;
      let rotatedH = 0;
      if (straighten !== 0 && imageSize.width > 0) {
        const theta = (straighten * Math.PI) / 180;
        const sin = Math.abs(Math.sin(theta));
        const cos = Math.cos(theta);
        const inscribed = largestInscribedRect(
          imageSize.width,
          imageSize.height,
          effectiveCropW / effectiveCropH,
          theta );
        rotatedW = imageSize.width * cos + imageSize.height * sin;
        rotatedH = imageSize.width * sin + imageSize.height * cos;
        actions.push({ rotate: straighten });
        appliedCrop = {
          originX: Math.max(0, Math.round((rotatedW - inscribed.width) / 2)),
          originY: Math.max(0, Math.round((rotatedH - inscribed.height) / 2)),
          width: Math.round(inscribed.width),
          height: Math.round(inscribed.height) };
        actions.push({ crop: appliedCrop });
      } else {
        appliedCrop = {
          originX: Math.round(effectiveCropX),
          originY: Math.round(effectiveCropY),
          width: Math.round(effectiveCropW),
          height: Math.round(effectiveCropH) };
        actions.push({ crop: appliedCrop });
      }
      if (rotation !== 0) {
        actions.push({ rotate: rotation });
      }
      // Carry the stored focal through the exact pipeline applied above so
      // it stays on-target relative to the output image, then emit it with
      // the completion so the host persists the final focal.
      const finalFocal = mapFocalToOutput(
        draftFocal ?? focalPoint ?? { x: 0.5, y: 0.5 },
        imageSize.width,
        imageSize.height,
        flippedH,
        flippedV,
        straighten,
        appliedCrop,
        rotatedW,
        rotatedH,
        rotation );
      const result = await manipulateAsync(
        imageUri,
        actions,
        { compress: 0.92, format: SaveFormat.JPEG },
      );
      onFocalPointChange?.(finalFocal);
      onCropComplete(result.uri, result.width, result.height);
      onClose();
    } catch {
      show('Crop failed. Try again.', 'error');
    } finally {
      confirmGuardRef.current = false;
      setIsProcessing(false);
    }
  }, [imageUri, cropRect, imageSize, rotation, flippedH, flippedV, straighten, focalPoint, draftFocal, onFocalPointChange, onCropComplete, onClose, show, haptic, imageZoomSV, imagePanXSV, imagePanYSV, displayW]);

  return { handleCrop, isProcessing };
}
