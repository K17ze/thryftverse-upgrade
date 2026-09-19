// ── Selection handles ──────────────────────────────────────────────
// 11pt square handles, white fill, 1pt brand border, no shadow.
// 44pt hit area via hitSlop. Rotation handle above top-center
// connected by a 1pt brand line (16pt length).
//
// Each handle owns its own press-scale SharedValue so simultaneous
// multi-touch on two corners does not cross-talk. Haptic fires on
// touch-down (selection) and again on commit (light).
//
// Resize is 1:1: the new scale is derived from the actual
// finger-to-centre distance ratio, not a fixed multiplier, so the
// corner tracks the finger exactly. Rotation is 1:1: translationX
// maps directly to degrees; 15° snap is applied only on commit.
//
// Extracted verbatim from CreatorCanvas.tsx.
import React, { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
  type SharedValue } from 'react-native-reanimated';
import { Radius, Stroke } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { normaliseDegrees } from './layerGeometry';

export function SelectionHandles({
  handleScaleSV,
  colors,
  layerLocked,
  scaleSV,
  rotationSV,
  layerWidth,
  layerHeight,
  onCommit }: {
  handleScaleSV: ReturnType<typeof useSharedValue<number>>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  layerLocked: boolean;
  scaleSV: ReturnType<typeof useSharedValue<number>>;
  rotationSV: ReturnType<typeof useSharedValue<number>>;
  /** Rendered layer width in pixels (base, before scale). */
  layerWidth: number;
  /** Rendered layer height in pixels (base, before scale). */
  layerHeight: number;
  onCommit: () => void;
}) {
  const handleColor = layerLocked ? colors.warningText : colors.brand;
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);

  // Per-handle press-scale shared values — one per handle so they
  // never share state (fixes the single-SharedValue tell).
  const touchTL = useSharedValue(1);
  const touchTR = useSharedValue(1);
  const touchBL = useSharedValue(1);
  const touchBR = useSharedValue(1);
  const touchRot = useSharedValue(1);

  const animatedHandleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: handleScaleSV.value }] }));

  const touchStyleTL = useAnimatedStyle(() => ({ transform: [{ scale: touchTL.value }] }));
  const touchStyleTR = useAnimatedStyle(() => ({ transform: [{ scale: touchTR.value }] }));
  const touchStyleBL = useAnimatedStyle(() => ({ transform: [{ scale: touchBL.value }] }));
  const touchStyleBR = useAnimatedStyle(() => ({ transform: [{ scale: touchBR.value }] }));
  const touchStyleRot = useAnimatedStyle(() => ({ transform: [{ scale: touchRot.value }] }));

  // Per-corner resize gestures. Each corner knows its sign multipliers so
  // dragging away from the layer centre enlarges and dragging toward the
  // centre shrinks. Scale is computed from the actual finger-to-centre
  // distance ratio for true 1:1 tracking.
  //   top-left:     -X / -Y  (centre is bottom-right; drag up-left enlarges)
  //   top-right:    +X / -Y  (centre is bottom-left;  drag up-right enlarges)
  //   bottom-left:  -X / +Y  (centre is top-right;    drag down-left enlarges)
  //   bottom-right: +X / +Y  (centre is top-left;     drag down-right enlarges)
  const useMakeCornerPan = (signX: number, signY: number, touchSV: SharedValue<number>) =>
    useMemo(
      () =>
        Gesture.Pan()
          .enabled(!layerLocked)
          .minDistance(3)
          .onStart(() => {
            startScale.value = scaleSV.value;
            touchSV.value = withSpring(1.15, spring.press);
            runOnJS(haptic.selection)();
          })
          .onUpdate((e) => {
            // 1:1 resize: compare the new finger-to-centre distance to
            // the initial distance. The corner stays under the finger.
            const halfW = (layerWidth * startScale.value) / 2;
            const halfH = (layerHeight * startScale.value) / 2;
            const d0 = Math.sqrt(halfW * halfW + halfH * halfH);
            if (d0 === 0) return;
            const cornerX = halfW * signX + e.translationX;
            const cornerY = halfH * signY + e.translationY;
            const d1 = Math.sqrt(cornerX * cornerX + cornerY * cornerY);
            const newScale = Math.max(0.2, Math.min(5, startScale.value * (d1 / d0)));
            scaleSV.value = newScale;
          })
          .onEnd(() => {
            touchSV.value = withSpring(1, spring.press);
            runOnJS(haptic.light)();
            runOnJS(onCommit)();
          }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [layerLocked, scaleSV, startScale, onCommit, layerWidth, layerHeight, touchSV]
    );

  const cornerPanTL = useMakeCornerPan(-1, -1, touchTL);
  const cornerPanTR = useMakeCornerPan(1, -1, touchTR);
  const cornerPanBL = useMakeCornerPan(-1, 1, touchBL);
  const cornerPanBR = useMakeCornerPan(1, 1, touchBR);

  // Rotation: 1:1 finger tracking — translationX maps directly to
  // degrees. The 15° snap is applied only on commit (in onCommit →
  // handleTransformCommit), not during the live drag.
  const rotationPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!layerLocked)
        .minDistance(3)
        .onStart(() => {
          startRotation.value = rotationSV.value;
          touchRot.value = withSpring(1.15, spring.press);
          runOnJS(haptic.selection)();
        })
        .onUpdate((e) => {
          const newRotation = normaliseDegrees(startRotation.value + e.translationX);
          rotationSV.value = newRotation;
        })
        .onEnd(() => {
          touchRot.value = withSpring(1, spring.press);
          runOnJS(haptic.light)();
          runOnJS(onCommit)();
        }),
    [layerLocked, rotationSV, startRotation, onCommit, touchRot, haptic, spring]
  );

  const handleSize = 11;
  const halfHandle = handleSize / 2;
  const handleHitSlop = { top: 17, bottom: 17, left: 17, right: 17 };

  const handleBase: ViewStyle = {
    position: 'absolute',
    width: handleSize,
    height: handleSize,
    borderRadius: Radius.sm,
    backgroundColor: colors.scrimTextPrimary,
    borderWidth: Stroke.standard,
    borderColor: handleColor };

  return (
    <Reanimated.View style={[StyleSheet.absoluteFill, animatedHandleStyle]} accessibilityLabel="Layer selection handles" accessibilityRole="adjustable" accessibilityHint="Drag a corner to resize; drag the top handle to rotate">
      <GestureDetector gesture={cornerPanTL}>
        <Reanimated.View style={[handleBase, { top: -halfHandle, left: -halfHandle }, touchStyleTL]} hitSlop={handleHitSlop} accessibilityLabel="Resize handle, top left" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer" />
      </GestureDetector>
      <GestureDetector gesture={cornerPanTR}>
        <Reanimated.View style={[handleBase, { top: -halfHandle, right: -halfHandle }, touchStyleTR]} hitSlop={handleHitSlop} accessibilityLabel="Resize handle, top right" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer" />
      </GestureDetector>
      <GestureDetector gesture={cornerPanBL}>
        <Reanimated.View style={[handleBase, { bottom: -halfHandle, left: -halfHandle }, touchStyleBL]} hitSlop={handleHitSlop} accessibilityLabel="Resize handle, bottom left" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer" />
      </GestureDetector>
      <GestureDetector gesture={cornerPanBR}>
        <Reanimated.View style={[handleBase, { bottom: -halfHandle, right: -halfHandle }, touchStyleBR]} hitSlop={handleHitSlop} accessibilityLabel="Resize handle, bottom right" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer" />
      </GestureDetector>

      <View
        style={{
          position: 'absolute',
          top: -16,
          left: '50%',
          marginLeft: -0.5,
          width: Stroke.standard,
          height: 16,
          backgroundColor: handleColor }}
        pointerEvents="none"
      />
      <GestureDetector gesture={rotationPan}>
        <Reanimated.View
          style={[handleBase, { top: -16 - halfHandle, left: '50%', marginLeft: -halfHandle }, touchStyleRot]}
          hitSlop={handleHitSlop}
          accessibilityLabel="Rotation handle"
          accessibilityRole="adjustable"
          accessibilityHint="Drag to rotate the layer"
        />
      </GestureDetector>
    </Reanimated.View>
  );
}
