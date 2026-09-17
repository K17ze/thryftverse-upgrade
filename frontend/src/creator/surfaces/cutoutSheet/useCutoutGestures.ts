/**
 * useCutoutGestures — pinch/drag gesture cluster for CreatorCutoutSheet's
 * cutout preview positioning.
 *
 * Extracted verbatim from CreatorCutoutSheet.tsx. Owns the gesture-local
 * shared values (pinch start scale, drag starts) and keeps every worklet
 * byte-identical to the original.
 */
import {
  useSharedValue,
  withSpring,
  runOnJS,
  cancelAnimation,
  type SharedValue } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { useHaptic } from '../../../hooks/useHaptic';
import type { useMotionConfig } from '../../../hooks/useMotionConfig';

interface UseCutoutGesturesParams {
  cutoutScaleSV: SharedValue<number>;
  cutoutXSV: SharedValue<number>;
  cutoutYSV: SharedValue<number>;
  reduceMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
}

export function useCutoutGestures({
  cutoutScaleSV,
  cutoutXSV,
  cutoutYSV,
  reduceMotion,
  spring }: UseCutoutGesturesParams) {
  const haptic = useHaptic();

  // ── Pinch to scale cutout preview ────────────────────────────────
  const pinchStartScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      runOnJS(haptic.selection)();
      pinchStartScale.value = cutoutScaleSV.value;
    })
    .onUpdate((e) => {
      cutoutScaleSV.value = Math.max(0.5, Math.min(3, pinchStartScale.value * e.scale));
    })
    .onEnd(() => {
      runOnJS(haptic.light)();
    });

  // ── Drag to position cutout with spring follow ───────────────────
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);

  // Two-finger drag repositions the preview; single-finger pan is owned
  // by the trace gesture — otherwise both pans race for the same touch.
  const dragGesture = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      runOnJS(haptic.selection)();
      dragStartX.value = cutoutXSV.value;
      dragStartY.value = cutoutYSV.value;
      cancelAnimation(cutoutXSV);
      cancelAnimation(cutoutYSV);
    })
    .onUpdate((e) => {
      cutoutXSV.value = dragStartX.value + e.translationX;
      cutoutYSV.value = dragStartY.value + e.translationY;
    })
    .onEnd(() => {
      // Spring back toward center with slight offset for natural feel
      if (!reduceMotion) {
        cutoutXSV.value = withSpring(cutoutXSV.value * 0.3, spring.entrance);
        cutoutYSV.value = withSpring(cutoutYSV.value * 0.3, spring.entrance);
      }
      runOnJS(haptic.light)();
    });

  return { pinchGesture, dragGesture };
}
