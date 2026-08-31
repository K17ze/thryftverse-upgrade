/**
 * InCanvasCropOverlay — non-destructive in-canvas crop mode.
 *
 * Per spec 07_MEDIA_TOOLCHAIN §6: "live crop UI should remain
 * non-destructive until commit/export" and spec 04 §1: "tap photo →
 * quick actions appear → Crop enters in-canvas crop mode while
 * composition remains visible."
 *
 * Renders crop handles directly over the canvas instead of opening a
 * separate full-screen sheet. The composition stays visible underneath
 * so the user can see how the crop affects the overall layout.
 *
 * All gesture tracking runs on the UI thread via Reanimated shared
 * values — no React state churn during drag.
 */
import React, { useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
  useReducedMotion } from 'react-native-reanimated';
import { Space, Radius, FontFamily, Control, Stroke, ZIndex, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { Motion } from '../../theme/motionTokens';

// ── Types ────────────────────────────────────────────────────────────

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AspectRatioPreset {
  id: string;
  label: string;
  /** null = free / unconstrained */
  ratio: number | null;
}

interface InCanvasCropOverlayProps {
  visible: boolean;
  /** Layer bounds in normalized 0-1 coordinates relative to the canvas. */
  layerBounds: CropRect;
  aspectRatios?: AspectRatioPreset[];
  onConfirm: (cropRect: CropRect) => void;
  onCancel: () => void;
}

// ── Default aspect ratio presets ─────────────────────────────────────

const DEFAULT_ASPECT_RATIOS: AspectRatioPreset[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

// ── Constants ────────────────────────────────────────────────────────



/** Visible handle glyph size (the touch target is larger via hitSlop). */
const HANDLE_VISIBLE = 8;
/** Touch target for handles — 44pt per AGENTS.md §13. */
const HANDLE_HIT = Control.hit;
/** Minimum crop region size in normalized coords — prevents collapse. */
const MIN_CROP = 0.05;
const TIMING_FADE = { duration: 180, easing: Easing.out(Easing.ease) } as const;

// ── Handle identifiers ───────────────────────────────────────────────
type HandleId =
  | 'tl' | 'tr' | 'bl' | 'br'     // corners
  | 'top' | 'bottom' | 'left' | 'right' // edges
  | 'move';                         // inside region

// ── Component ────────────────────────────────────────────────────────

export function InCanvasCropOverlay({
  visible,
  layerBounds,
  aspectRatios = DEFAULT_ASPECT_RATIOS,
  onConfirm,
  onCancel }: InCanvasCropOverlayProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // ── Crop region shared values (normalized 0-1) ───────────────────
  const cropX = useSharedValue(layerBounds.x);
  const cropY = useSharedValue(layerBounds.y);
  const cropW = useSharedValue(layerBounds.width);
  const cropH = useSharedValue(layerBounds.height);

  // Locked aspect ratio (null = free). Stored on UI thread via a SV so
  // gesture updates can enforce it without crossing to JS.
  const lockedRatioSV = useSharedValue<number | null>(null);

  // Overlay entrance opacity
  const overlayOpacity = useSharedValue(0);
  const mountedRef = React.useRef(false);

  // Selected preset id (JS state — only changes on tap, not during drag)
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>('free');

  // Underline indicator for aspect-ratio tabs (spring-animated, brand color).
  // Tab layouts are measured onLayout so the underline can slide to the
  // selected tab's exact position/width.
  const tabLayouts = React.useRef<Map<string, { x: number; width: number }>>(new Map());
  const underlineXSV = useSharedValue(0);
  const underlineWSV = useSharedValue(0);

  // ── Initialize / reset crop region when layer bounds change ───────
  useEffect(() => {
    if (!visible) return;
    cropX.value = layerBounds.x;
    cropY.value = layerBounds.y;
    cropW.value = layerBounds.width;
    cropH.value = layerBounds.height;
    lockedRatioSV.value = null;
    setSelectedPresetId('free');
    // Reset underline to the 'free' tab (instant, not animated).
    const freeLayout = tabLayouts.current.get('free');
    if (freeLayout) {
      underlineXSV.value = freeLayout.x;
      underlineWSV.value = freeLayout.width;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, layerBounds.x, layerBounds.y, layerBounds.width, layerBounds.height]);

  // ── Entrance / exit animation ────────────────────────────────────
  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      overlayOpacity.value = reduceMotion ? 1 : withTiming(1, TIMING_FADE);
    } else if (mountedRef.current) {
      overlayOpacity.value = reduceMotion ? 0 : withTiming(0, { duration: 140 });
    }
  }, [visible, reduceMotion, overlayOpacity]);

  // ── Helper: clamp crop region into [0,1] bounds ──────────────────
  // Runs on UI thread.
  const clampCrop = (nx: number, ny: number, nw: number, nh: number) => {
    'worklet';
    const w = Math.max(MIN_CROP, Math.min(1, nw));
    const h = Math.max(MIN_CROP, Math.min(1, nh));
    const x = Math.max(0, Math.min(1 - w, nx));
    const y = Math.max(0, Math.min(1 - h, ny));
    return { x, y, w, h };
  };

  // ── Apply aspect ratio preset (called from JS on tap) ────────────
  const applyPreset = useCallback(
    (preset: AspectRatioPreset) => {
      haptic.selection();
      setSelectedPresetId(preset.id);
      lockedRatioSV.value = preset.ratio;

      // Animate underline indicator to the selected tab.
      const layout = tabLayouts.current.get(preset.id);
      if (layout) {
        if (reduceMotion) {
          underlineXSV.value = layout.x;
          underlineWSV.value = layout.width;
        } else {
          underlineXSV.value = withSpring(layout.x, Motion.spring.indicator);
          underlineWSV.value = withSpring(layout.width, Motion.spring.indicator);
        }
      }

      if (preset.ratio == null) {
        // Free — restore to full layer bounds
        const target = clampCropJS(
          layerBounds.x,
          layerBounds.y,
          layerBounds.width,
          layerBounds.height,
        );
        animateTo(target.x, target.y, target.w, target.h);
        return;
      }

      // Compute largest rect with this ratio inside the layer bounds,
      // centered on the current crop center.
      const cx = cropX.value + cropW.value / 2;
      const cy = cropY.value + cropH.value / 2;
      const maxW = layerBounds.width;
      const maxH = layerBounds.height;
      const layerRatio = maxW / maxH;

      let w: number, h: number;
      if (layerRatio > preset.ratio) {
        h = maxH;
        w = h * preset.ratio;
      } else {
        w = maxW;
        h = w / preset.ratio;
      }
      let x = cx - w / 2;
      let y = cy - h / 2;
      // Clamp within layer bounds
      const minX = layerBounds.x;
      const minY = layerBounds.y;
      const maxX = layerBounds.x + layerBounds.width - w;
      const maxY = layerBounds.y + layerBounds.height - h;
      x = Math.max(minX, Math.min(maxX, x));
      y = Math.max(minY, Math.min(maxY, y));

      animateTo(x, y, w, h);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [haptic, layerBounds],
  );

  // JS-side clamp (for preset computation)
  const clampCropJS = (nx: number, ny: number, nw: number, nh: number) => {
    const w = Math.max(MIN_CROP, Math.min(1, nw));
    const h = Math.max(MIN_CROP, Math.min(1, nh));
    const x = Math.max(0, Math.min(1 - w, nx));
    const y = Math.max(0, Math.min(1 - h, ny));
    return { x, y, w, h };
  };

  // Animate shared values to a target (respects reduced motion)
  const animateTo = (x: number, y: number, w: number, h: number) => {
    if (reduceMotion) {
      cropX.value = x;
      cropY.value = y;
      cropW.value = w;
      cropH.value = h;
    } else {
      cropX.value = withSpring(x, Motion.spring.glide);
      cropY.value = withSpring(y, Motion.spring.glide);
      cropW.value = withSpring(w, Motion.spring.glide);
      cropH.value = withSpring(h, Motion.spring.glide);
    }
  };

  // ── Gesture: move the whole crop region ──────────────────────────
  const moveStartX = useSharedValue(0);
  const moveStartY = useSharedValue(0);

  const moveGesture = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      moveStartX.value = cropX.value;
      moveStartY.value = cropY.value;
    })
    .onStart(() => {
      runOnJS(haptic.light)();
    })
    .onUpdate((e) => {
      'worklet';
      const nx = moveStartX.value + e.translationX / screenWidth;
      const ny = moveStartY.value + e.translationY / screenHeight;
      const clamped = clampCrop(nx, ny, cropW.value, cropH.value);
      cropX.value = clamped.x;
      cropY.value = clamped.y;
    });

  // ── Resize handle shared values (start-of-gesture snapshots) ─────
  // Declared at top level so hooks rules are satisfied. Each handle
  // gets its own set so concurrent gestures don't clobber each other.
  const rStartX = useSharedValue(0);
  const rStartY = useSharedValue(0);
  const rStartW = useSharedValue(0);
  const rStartH = useSharedValue(0);

  // ── Gesture factory for resize handles ───────────────────────────
  // Each handle adjusts specific edges. Corner handles optionally
  // maintain aspect ratio. Edge handles resize one dimension.
  const makeResizeGesture = (handleId: HandleId) => {
    return Gesture.Pan()
      .onBegin(() => {
        'worklet';
        rStartX.value = cropX.value;
        rStartY.value = cropY.value;
        rStartW.value = cropW.value;
        rStartH.value = cropH.value;
      })
      .onStart(() => {
        runOnJS(haptic.light)();
      })
      .onUpdate((e) => {
        'worklet';
        const dx = e.translationX / screenWidth;
        const dy = e.translationY / screenHeight;
        let nx = rStartX.value;
        let ny = rStartY.value;
        let nw = rStartW.value;
        let nh = rStartH.value;

        const ratio = lockedRatioSV.value;

        switch (handleId) {
          case 'tl':
            nx = rStartX.value + dx;
            ny = rStartY.value + dy;
            nw = rStartW.value - dx;
            nh = rStartH.value - dy;
            if (ratio != null) {
              // Maintain ratio: derive height from width
              nh = nw / ratio;
              ny = rStartY.value + (rStartH.value - nh);
            }
            break;
          case 'tr':
            ny = rStartY.value + dy;
            nw = rStartW.value + dx;
            nh = rStartH.value - dy;
            if (ratio != null) {
              nh = nw / ratio;
              ny = rStartY.value + (rStartH.value - nh);
            }
            break;
          case 'bl':
            nx = rStartX.value + dx;
            nw = rStartW.value - dx;
            nh = rStartH.value + dy;
            if (ratio != null) {
              nh = nw / ratio;
            }
            break;
          case 'br':
            nw = rStartW.value + dx;
            nh = rStartH.value + dy;
            if (ratio != null) {
              nh = nw / ratio;
            }
            break;
          case 'top':
            ny = rStartY.value + dy;
            nh = rStartH.value - dy;
            break;
          case 'bottom':
            nh = rStartH.value + dy;
            break;
          case 'left':
            nx = rStartX.value + dx;
            nw = rStartW.value - dx;
            break;
          case 'right':
            nw = rStartW.value + dx;
            break;
          default:
            return;
        }

        const clamped = clampCrop(nx, ny, nw, nh);
        cropX.value = clamped.x;
        cropY.value = clamped.y;
        cropW.value = clamped.w;
        cropH.value = clamped.h;
      });
  };

  const tlGesture = useMemo(() => makeResizeGesture('tl'), [screenWidth, screenHeight]);
  const trGesture = useMemo(() => makeResizeGesture('tr'), [screenWidth, screenHeight]);
  const blGesture = useMemo(() => makeResizeGesture('bl'), [screenWidth, screenHeight]);
  const brGesture = useMemo(() => makeResizeGesture('br'), [screenWidth, screenHeight]);
  const topGesture = useMemo(() => makeResizeGesture('top'), [screenWidth, screenHeight]);
  const bottomGesture = useMemo(() => makeResizeGesture('bottom'), [screenWidth, screenHeight]);
  const leftGesture = useMemo(() => makeResizeGesture('left'), [screenWidth, screenHeight]);
  const rightGesture = useMemo(() => makeResizeGesture('right'), [screenWidth, screenHeight]);

  // ── Confirm / Cancel ─────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    haptic.medium();
    onConfirm({
      x: cropX.value,
      y: cropY.value,
      width: cropW.value,
      height: cropH.value });
  }, [haptic, onConfirm, cropX, cropY, cropW, cropH]);

  const handleCancel = useCallback(() => {
    haptic.light();
    onCancel();
  }, [haptic, onCancel]);

  // ── Animated styles ──────────────────────────────────────────────
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value }));

  // Crop frame position — normalized → screen pixels
  const frameStyle = useAnimatedStyle(() => ({
    left: cropX.value * screenWidth,
    top: cropY.value * screenHeight,
    width: cropW.value * screenWidth,
    height: cropH.value * screenHeight }));

  // Mask pieces (4 rectangles around the crop region)
  const maskTopStyle = useAnimatedStyle(() => ({
    height: cropY.value * screenHeight }));
  const maskBottomStyle = useAnimatedStyle(() => ({
    top: (cropY.value + cropH.value) * screenHeight }));
  const maskLeftStyle = useAnimatedStyle(() => ({
    top: cropY.value * screenHeight,
    height: cropH.value * screenHeight,
    width: cropX.value * screenWidth }));
  const maskRightStyle = useAnimatedStyle(() => ({
    top: cropY.value * screenHeight,
    height: cropH.value * screenHeight,
    left: (cropX.value + cropW.value) * screenWidth }));

  // Underline indicator position/width (spring-animated on tab change).
  const underlineStyle = useAnimatedStyle(() => ({
    left: underlineXSV.value,
    width: underlineWSV.value }));

  if (!visible && !mountedRef.current) return null;

  // ── Handle position helper ───────────────────────────────────────
  const handleWrap = (id: HandleId): ViewStyle => {
    const base: ViewStyle = {
      position: 'absolute',
      width: HANDLE_HIT,
      height: HANDLE_HIT,
      alignItems: 'center',
      justifyContent: 'center' };
    const off = -(HANDLE_HIT - HANDLE_VISIBLE) / 2;
    switch (id) {
      case 'tl': return { ...base, top: off, left: off };
      case 'tr': return { ...base, top: off, right: off };
      case 'bl': return { ...base, bottom: off, left: off };
      case 'br': return { ...base, bottom: off, right: off };
      case 'top': return { ...base, top: off, left: '50%', marginLeft: -HANDLE_HIT / 2 };
      case 'bottom': return { ...base, bottom: off, left: '50%', marginLeft: -HANDLE_HIT / 2 };
      case 'left': return { ...base, top: '50%', left: off, marginTop: -HANDLE_HIT / 2 };
      case 'right': return { ...base, top: '50%', right: off, marginTop: -HANDLE_HIT / 2 };
      default: return base;
    }
  };

  // Minimal visible handle — small 8pt square, no shadow.
  // 44pt hit target is provided by the handleWrap positioning.
  const handleVisible: ViewStyle = {
    width: HANDLE_VISIBLE,
    height: HANDLE_VISIBLE,
    backgroundColor: colors.scrimTextPrimary,
  };

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Reanimated.View style={[StyleSheet.absoluteFill, overlayStyle, { zIndex: ZIndex.overlay }]}>
        {/* ── Dark mask outside crop region (4 pieces) ─────────────── */}
        <Reanimated.View style={[styles.maskPiece, maskTopStyle, { backgroundColor: colors.mediaOverlayScrim }]} pointerEvents="none" />
        <Reanimated.View style={[styles.maskPiece, maskBottomStyle, { backgroundColor: colors.mediaOverlayScrim }]} pointerEvents="none" />
        <Reanimated.View style={[styles.maskPiece, maskLeftStyle, { backgroundColor: colors.mediaOverlayScrim }]} pointerEvents="none" />
        <Reanimated.View style={[styles.maskPiece, maskRightStyle, { backgroundColor: colors.mediaOverlayScrim }]} pointerEvents="none" />

        {/* ── Crop frame (border + grid + handles) ─────────────────── */}
        <Reanimated.View style={[styles.cropFrame, frameStyle, { borderColor: colors.scrimTextPrimary }]}>
          {/* Rule-of-thirds grid */}
          <View style={[styles.gridV, { left: '33.333%', backgroundColor: colors.scrimTextTertiary }]} pointerEvents="none" />
          <View style={[styles.gridV, { left: '66.666%', backgroundColor: colors.scrimTextTertiary }]} pointerEvents="none" />
          <View style={[styles.gridH, { top: '33.333%', backgroundColor: colors.scrimTextTertiary }]} pointerEvents="none" />
          <View style={[styles.gridH, { top: '66.666%', backgroundColor: colors.scrimTextTertiary }]} pointerEvents="none" />

          {/* Move gesture area (inside the frame) */}
          <GestureDetector gesture={moveGesture}>
            <View style={StyleSheet.absoluteFill} accessibilityLabel="Move crop region" accessibilityRole="adjustable" />
          </GestureDetector>

          {/* Corner handles */}
          <GestureDetector gesture={tlGesture}>
            <View style={handleWrap('tl')} accessibilityLabel="Top-left crop handle" accessibilityRole="adjustable">
              <View style={handleVisible} />
            </View>
          </GestureDetector>
          <GestureDetector gesture={trGesture}>
            <View style={handleWrap('tr')} accessibilityLabel="Top-right crop handle" accessibilityRole="adjustable">
              <View style={handleVisible} />
            </View>
          </GestureDetector>
          <GestureDetector gesture={blGesture}>
            <View style={handleWrap('bl')} accessibilityLabel="Bottom-left crop handle" accessibilityRole="adjustable">
              <View style={handleVisible} />
            </View>
          </GestureDetector>
          <GestureDetector gesture={brGesture}>
            <View style={handleWrap('br')} accessibilityLabel="Bottom-right crop handle" accessibilityRole="adjustable">
              <View style={handleVisible} />
            </View>
          </GestureDetector>

          {/* Edge handles */}
          <GestureDetector gesture={topGesture}>
            <View style={handleWrap('top')} accessibilityLabel="Top edge crop handle" accessibilityRole="adjustable">
              <View style={handleVisible} />
            </View>
          </GestureDetector>
          <GestureDetector gesture={bottomGesture}>
            <View style={handleWrap('bottom')} accessibilityLabel="Bottom edge crop handle" accessibilityRole="adjustable">
              <View style={handleVisible} />
            </View>
          </GestureDetector>
          <GestureDetector gesture={leftGesture}>
            <View style={handleWrap('left')} accessibilityLabel="Left edge crop handle" accessibilityRole="adjustable">
              <View style={handleVisible} />
            </View>
          </GestureDetector>
          <GestureDetector gesture={rightGesture}>
            <View style={handleWrap('right')} accessibilityLabel="Right edge crop handle" accessibilityRole="adjustable">
              <View style={handleVisible} />
            </View>
          </GestureDetector>
        </Reanimated.View>

        {/* ── Top corner buttons: Cancel (X) / Confirm (checkmark) ── */}
        <View style={[styles.topBar, { top: insets.top + Space.sm }]}>
          <Pressable
            onPress={handleCancel}
            style={[styles.iconBtn, { backgroundColor: colors.overlay }]}
            accessibilityLabel="Cancel crop"
            accessibilityRole="button"
            hitSlop={Space.xs}
          >
            <Ionicons name="close" size={22} color={colors.scrimTextPrimary} />
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            style={[styles.iconBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Confirm crop"
            accessibilityRole="button"
            hitSlop={Space.xs}
          >
            <Ionicons name="checkmark" size={22} color={colors.textInverse} />
          </Pressable>
        </View>

        {/* ── Aspect ratio rail (bottom) — text-only tabs with underline ── */}
        <View style={[styles.ratioRailWrap, { bottom: insets.bottom + Space.md }]}>
          <View style={styles.ratioRail}>
            {aspectRatios.map((preset) => {
              const active = selectedPresetId === preset.id;
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => applyPreset(preset)}
                  onLayout={(e) => {
                    tabLayouts.current.set(preset.id, {
                      x: e.nativeEvent.layout.x,
                      width: e.nativeEvent.layout.width });
                    if (selectedPresetId === preset.id) {
                      underlineXSV.value = e.nativeEvent.layout.x;
                      underlineWSV.value = e.nativeEvent.layout.width;
                    }
                  }}
                  style={styles.ratioTab}
                  accessibilityLabel={`Aspect ratio ${preset.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.ratioText,
                      { color: active ? colors.scrimTextPrimary : colors.scrimTextSecondary },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
            {/* Spring-animated underline indicator (brand color, 2pt) */}
            <Reanimated.View
              style={[styles.ratioUnderline, underlineStyle, { backgroundColor: colors.brand }]}
              pointerEvents="none"
            />
          </View>
        </View>
      </Reanimated.View>
    </GestureHandlerRootView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  maskPiece: {
    position: 'absolute',
    left: 0,
    right: 0 },
  cropFrame: {
    position: 'absolute',
    borderWidth: Stroke.emphasis,
    overflow: 'visible' },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1 },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1 },
  topBar: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    flexDirection: 'row',
    justifyContent: 'space-between' },
  iconBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  ratioRailWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center' },
  ratioRail: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    gap: Space.md,
    position: 'relative' },
  ratioTab: {
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs,
    alignItems: 'center' },
  ratioUnderline: {
    position: 'absolute',
    bottom: 0,
    height: Stroke.emphasis,
    borderRadius: Radius.full },
  ratioText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.2 } });
