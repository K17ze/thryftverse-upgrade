/**
 * useCropGestures — pan/pinch gesture cluster for CreatorCropSheet.
 *
 * Extracted verbatim from CreatorCropSheet.tsx. Owns the gesture-local
 * shared values (drag starts, image-pan starts, pinch start, active flag),
 * composes the simultaneous pan+pinch gesture, and keeps every worklet
 * byte-identical to the original. The gesture is suspended while
 * straightening (the frame is owned by the inscribed-rect math until the
 * angle returns to 0).
 */
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  useSharedValue,
  withSpring,
  runOnJS,
  type SharedValue } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import type { useMotionConfig } from '../../../hooks/useMotionConfig';

interface UseCropGesturesParams {
  // Crop frame shared values (source of truth for the frame)
  cropXSV: SharedValue<number>;
  cropYSV: SharedValue<number>;
  cropWSV: SharedValue<number>;
  cropHSV: SharedValue<number>;
  // Image zoom/pan shared values
  imageZoomSV: SharedValue<number>;
  imagePanXSV: SharedValue<number>;
  imagePanYSV: SharedValue<number>;
  imageSize: { width: number; height: number };
  displayW: number;
  displayH: number;
  straighten: number;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  setCropRect: Dispatch<SetStateAction<{ x: number; y: number; width: number; height: number }>>;
  beginUndoTransaction: () => void;
  commitUndoTransaction: () => void;
}

export function useCropGestures({
  cropXSV,
  cropYSV,
  cropWSV,
  cropHSV,
  imageZoomSV,
  imagePanXSV,
  imagePanYSV,
  imageSize,
  displayW,
  displayH,
  straighten,
  spring,
  setCropRect,
  beginUndoTransaction,
  commitUndoTransaction }: UseCropGesturesParams) {
  // Gesture-local shared values (extracted from the sheet's zoom/pan and
  // drag blocks — they are read and written only inside these gestures).
  const panStartImageX = useSharedValue(0);
  const panStartImageY = useSharedValue(0);
  const pinchStartZoom = useSharedValue(1);

  // ── Drag to reposition crop frame (1:1, clamped) ─────────────────
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const isGestureActive = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isGestureActive.value = 1;
      runOnJS(beginUndoTransaction)();
      dragStartX.value = cropXSV.value;
      dragStartY.value = cropYSV.value;
      panStartImageX.value = imagePanXSV.value;
      panStartImageY.value = imagePanYSV.value;
    })
    .onUpdate((e) => {
      if (imageZoomSV.value > 1.01) {
        // Image pan mode: move the image within the frame
        const maxPanX = (imageZoomSV.value - 1) * displayW / 2;
        const maxPanY = (imageZoomSV.value - 1) * displayH / 2;
        imagePanXSV.value = Math.max(-maxPanX, Math.min(maxPanX, panStartImageX.value + e.translationX));
        imagePanYSV.value = Math.max(-maxPanY, Math.min(maxPanY, panStartImageY.value + e.translationY));
      } else {
        // Frame pan mode: move the crop frame within the image (existing behavior)
        if (!imageSize.width) return;
        const scale = imageSize.width / displayW;
        const dx = e.translationX * scale;
        const dy = e.translationY * scale;
        const maxX = imageSize.width - cropWSV.value;
        const maxY = imageSize.height - cropHSV.value;
        cropXSV.value = Math.max(0, Math.min(maxX, dragStartX.value + dx));
        cropYSV.value = Math.max(0, Math.min(maxY, dragStartY.value + dy));
      }
    })
    .onEnd(() => {
      isGestureActive.value = 0;
      if (imageZoomSV.value <= 1.01) {
        runOnJS(setCropRectFromSV)();
      }
      runOnJS(commitUndoTransaction)();
    });

  const setCropRectFromSV = useCallback(() => {
    setCropRect((prev) => ({
      ...prev,
      x: cropXSV.value,
      y: cropYSV.value }));
  }, [setCropRect, cropXSV, cropYSV]);

  // ── Pinch to zoom the image within the frame (Instagram-style) ───
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      pinchStartZoom.value = imageZoomSV.value;
      runOnJS(beginUndoTransaction)();
    })
    .onUpdate((e) => {
      const next = Math.max(1, Math.min(4, pinchStartZoom.value * e.scale));
      imageZoomSV.value = next;
    })
    .onEnd(() => {
      if (imageZoomSV.value < 1.01) {
        imageZoomSV.value = withSpring(1, spring.tap);
        imagePanXSV.value = withSpring(0, spring.tap);
        imagePanYSV.value = withSpring(0, spring.tap);
      }
      runOnJS(commitUndoTransaction)();
    });

  // Compose pan + pinch. Suspended while straightening — the frame is owned
  // by the inscribed-rect math until the angle returns to 0.
  const cropGesture = Gesture.Simultaneous(
    panGesture.enabled(straighten === 0),
    pinchGesture.enabled(straighten === 0) );

  return { cropGesture, isGestureActive };
}
