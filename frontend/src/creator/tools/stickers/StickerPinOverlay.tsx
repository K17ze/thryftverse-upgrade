/**
 * StickerPinOverlay — visual overlay shown when sticker pin mode is active.
 *
 * Renders:
 *   - A crosshair at the pin anchor point on the media layer.
 *   - A line from the sticker center to the anchor point.
 *   - A 44pt drag handle on the crosshair to reposition the anchor.
 *
 * The overlay is driven by Reanimated shared values so the crosshair tracks
 * the media layer's transform smoothly without per-frame React state. The
 * anchor is expressed in normalized 0..1 coords within the media layer's
 * local box; dragging converts pixel deltas back to normalized deltas using
 * the media layer's rendered size.
 *
 * Per AGENTS.md §4, §13:
 *   - 44pt minimum touch target on the drag handle.
 *   - Haptics on drag begin and on anchor commit.
 *   - Reanimated for all motion (no Animated loop, no per-frame JS state).
 *   - Reduced-motion aware (instant snap).
 *   - TypeScript strict compatible.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { Radius, Control, Stroke} from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import type { StickerPin } from './StickerPinTracker';

// ── Props ──────────────────────────────────────────────────────────────

export interface StickerPinOverlayProps {
  /** Whether pin mode is active (overlay is rendered only when true). */
  visible: boolean;
  /**
   * The current pin. When the anchor changes via drag, `onAnchorChange` is
   * called with the new normalized anchor so the caller can persist it.
   */
  pin: StickerPin;
  /**
   * The sticker's rendered center in *pixels* relative to the overlay
   * container. Used to draw the connector line from sticker to anchor.
   */
  stickerCenterPx: { x: number; y: number };
  /**
   * The media layer's rendered box in *pixels* relative to the overlay
   * container: `{ x, y, width, height }` where x/y is the top-left. The
   * anchor crosshair is positioned within this box.
   */
  mediaLayerBoxPx: { x: number; y: number; width: number; height: number };
  /** Called with a new normalized anchor (0..1, 0..1) as the user drags. */
  onAnchorChange: (anchor: { x: number; y: number }) => void;
  /** Called when the drag ends and the anchor should be committed. */
  onAnchorCommit: (anchor: { x: number; y: number }) => void;
}

const SNAP_TIMING = { duration: 120, easing: Easing.out(Easing.cubic) };

// ── Component ──────────────────────────────────────────────────────────

export function StickerPinOverlay({
  visible,
  pin,
  stickerCenterPx,
  mediaLayerBoxPx,
  onAnchorChange,
  onAnchorCommit,
}: StickerPinOverlayProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();

  // Anchor in normalized 0..1 within the media layer box. Kept as a shared
  // value so the crosshair tracks without React re-renders.
  const anchorX = useSharedValue(pin.anchor.x);
  const anchorY = useSharedValue(pin.anchor.y);

  // Sync shared values when the pin prop changes externally (e.g. undo/redo
  // or selecting a different sticker).
  useEffect(() => {
    anchorX.value = reduceMotion
      ? pin.anchor.x
      : withTiming(pin.anchor.x, SNAP_TIMING);
    anchorY.value = reduceMotion
      ? pin.anchor.y
      : withTiming(pin.anchor.y, SNAP_TIMING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin.anchor.x, pin.anchor.y]);

  // Crosshair center in pixels relative to the overlay container.
  const crosshairPxX = useDerivedValue(
    () => mediaLayerBoxPx.x + anchorX.value * mediaLayerBoxPx.width,
  );
  const crosshairPxY = useDerivedValue(
    () => mediaLayerBoxPx.y + anchorY.value * mediaLayerBoxPx.height,
  );

  // ── Drag gesture ──
  // The 44pt handle captures the drag; we convert pixel deltas to normalized
  // anchor coords using the media layer's rendered size.
  const handleDragBegin = useCallback(() => {
    haptic.light();
  }, [haptic]);

  const handleDragCommit = useCallback(
    (ax: number, ay: number) => {
      haptic.selection();
      onAnchorCommit({ x: ax, y: ay });
    },
    [haptic, onAnchorCommit],
  );

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(0)
        .onBegin(() => {
          'worklet';
          runOnJS(handleDragBegin)();
        })
        .onChange((e) => {
          'worklet';
          // e.absoluteX / e.absoluteY are relative to the gesture container
          // (the overlay). Convert to normalized anchor within media box.
          const nx =
            (e.absoluteX - mediaLayerBoxPx.x) / mediaLayerBoxPx.width;
          const ny =
            (e.absoluteY - mediaLayerBoxPx.y) / mediaLayerBoxPx.height;
          const cx = nx < 0 ? 0 : nx > 1 ? 1 : nx;
          const cy = ny < 0 ? 0 : ny > 1 ? 1 : ny;
          anchorX.value = cx;
          anchorY.value = cy;
          runOnJS(onAnchorChange)({ x: cx, y: cy });
        })
        .onEnd(() => {
          'worklet';
          runOnJS(handleDragCommit)(anchorX.value, anchorY.value);
        }),
    [
      anchorX,
      anchorY,
      handleDragBegin,
      handleDragCommit,
      onAnchorChange,
      mediaLayerBoxPx.x,
      mediaLayerBoxPx.y,
      mediaLayerBoxPx.width,
      mediaLayerBoxPx.height,
    ],
  );

  // ── Animated styles ──
  const crosshairStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: crosshairPxX.value },
      { translateY: crosshairPxY.value },
    ],
  }));

  // Connector line from sticker center to crosshair. We render a thin View
  // and rotate/scale it via transform. Using animated props on the width
  // would require a native prop; instead we use a fixed-length bar and scale
  // it along its local x-axis, then rotate.
  const lineTransform = useAnimatedStyle(() => {
    const dx = crosshairPxX.value - stickerCenterPx.x;
    const dy = crosshairPxY.value - stickerCenterPx.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return {
      transform: [
        { translateX: stickerCenterPx.x },
        { translateY: stickerCenterPx.y },
        { rotate: `${angle}deg` },
        { scaleX: length },
      ],
    };
  });

  if (!visible) return null;

  const accent = colors.brand;
  const handleSize = Control.hit; // 44pt drag handle

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Connector line: sticker → anchor */}
      <Reanimated.View
        pointerEvents="none"
        style={[
          lineStyles.base,
          { backgroundColor: accent },
          lineTransform,
        ]}
      />

      {/* Crosshair + drag handle */}
      <GestureDetector gesture={dragGesture}>
        <Reanimated.View
          style={[crosshairStyles.root, crosshairStyle]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Pin anchor — drag to reposition"
          accessibilityRole="adjustable"
        >
          {/* Crosshair lines (visible chrome, smaller than the 44pt target) */}
          <View
            style={[crosshairStyles.lineH, { backgroundColor: accent }]}
            pointerEvents="none"
          />
          <View
            style={[crosshairStyles.lineV, { backgroundColor: accent }]}
            pointerEvents="none"
          />
          {/* Center dot */}
          <View
            style={[crosshairStyles.dot, { backgroundColor: accent, borderColor: colors.scrimTextPrimary }]}
            pointerEvents="none"
          />
          {/* 44pt drag handle — transparent so the crosshair reads as the
              visible chrome, but the touch target meets accessibility min. */}
          <View
            style={[
              crosshairStyles.handle,
              { width: handleSize, height: handleSize },
            ]}
          />
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const lineStyles = StyleSheet.create({
  base: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1, // scaled along x by transform scaleX to the measured length
    height: StyleSheet.hairlineWidth,
    opacity: 0.7,
    transformOrigin: 'left center',
  } as ViewStyle,
});

const crosshairStyles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  lineH: {
    position: 'absolute',
    width: 22,
    height: StyleSheet.hairlineWidth,
  } as ViewStyle,
  lineV: {
    position: 'absolute',
    width: StyleSheet.hairlineWidth,
    height: 22,
  } as ViewStyle,
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
  } as ViewStyle,
  handle: {
    // Transparent 44pt target — visible chrome is the crosshair above.
    backgroundColor: 'transparent',
  } as ViewStyle,
});
