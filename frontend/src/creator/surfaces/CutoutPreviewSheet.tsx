/**
 * CutoutPreviewSheet — brush-based cutout mask editor with real-time
 * Skia preview. Uses the CutoutService brush API for pixel-level mask
 * rasterization and MaskedPreview for GPU compositing. The cutout is
 * a sheet that leaves the top of the canvas visible.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Image as RNImage,
  Pressable,
  type DimensionValue } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  useReducedMotion } from 'react-native-reanimated';
import { Space, Radius, Typography, FontFamily, Stroke, IconGrammar, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { Motion } from '../../theme/motionTokens';
import { PressScale, SheetContainer } from '../CreatorAnimations';
import { CreatorSlider } from '../controls/CreatorSlider';
import { AppIcon } from '../../components/common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import {
  cutoutService,
  sourceChecksum,
  type CutoutResult,
  type CutoutMask,
  type CutoutCapability } from '../core/cutout/CutoutService';
import { MaskedPreview } from '../core/cutout/MaskCompositor';
import type { MaskStroke } from '../core/cutout/MaskRenderer';



// ── Brush colours ──────────────────────────────────────────────────
// Green = keep (add to mask), red = erase (remove from mask).
const KEEP_BRUSH = '#34C759';
const ERASE_BRUSH = '#FF3B30';
const BRUSH_RADIUS = 18;

// ── Brush mode ids ─────────────────────────────────────────────────
type BrushMode = 'keep-person' | 'keep-object' | 'erase';
type ModeId = BrushMode | 'restore';

// ── Checkerboard pattern for transparency preview ──────────────────
// A 2-tone checkerboard so the user can see transparent regions in the
// cutout result. Rendered as a repeating grid of squares.
const CHECKER_SIZE = 16;
const CHECKER_LIGHT = '#E8E8E8';
const CHECKER_DARK = '#C8C8C8';

// ── SkeletonBlock — one-time shimmer sweep ──────
function SkeletonBlock({ width, height, radius }: { width: DimensionValue; height: number; radius?: number }) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const shimmerSV = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    shimmerSV.value = 0;
    shimmerSV.value = withTiming(1, { duration: Motion.duration.crawl });
  }, [reduceMotion, shimmerSV]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: colors.surfaceAlt,
    opacity: 0.5 + 0.3 * shimmerSV.value }));

  return (
    <Reanimated.View style={[{ width, height, borderRadius: radius ?? Radius.sm }, style]} />
  );
}

// ── CutoutPreviewSkeleton — placeholder rectangle matching the preview area ──
function CutoutPreviewSkeleton({ width, height }: { width: number; height: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: Space.sm }}>
      <SkeletonBlock width={width} height={height} radius={Radius.md} />
      <Text style={{ fontFamily: TypographyV2.bodyStrong.fontFamily, fontSize: TypographyV2.bodyStrong.size, color: colors.textPrimary, marginTop: Space.md }}>
        Removing background…
      </Text>
      <Text style={{ fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textSecondary, textAlign: 'center', marginTop: Space.xs }}>
        Generating alpha mask.
      </Text>
    </View>
  );
}

function Checkerboard({ size }: { size: { width: number; height: number } }) {
  const cols = Math.ceil(size.width / CHECKER_SIZE);
  const rows = Math.ceil(size.height / CHECKER_SIZE);
  const squares: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isLight = (r + c) % 2 === 0;
      squares.push(
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: c * CHECKER_SIZE,
            top: r * CHECKER_SIZE,
            width: CHECKER_SIZE,
            height: CHECKER_SIZE,
            backgroundColor: isLight ? CHECKER_LIGHT : CHECKER_DARK }}
        />,
      );
    }
  }
  return <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>{squares}</View>;
}

export interface CutoutPreviewSheetProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
  onConfirm: (result: CutoutResult) => void;
}

/**
 * Shows a real-time Skia preview of the brush-based cutout mask.
 *
 * On open, the sheet:
 *   1. Checks if Skia brush refinement is available (cutoutService).
 *   2. If available, creates a brush mask (fully opaque) and shows the
 *      image over a checkerboard with real-time alpha-masked preview.
 *   3. If not available, shows an honest "not available" message.
 *
 * The user erases the background with brush modes (Keep / Erase /
 * Restore), holds Compare to see the original, adjusts edge softness,
 * and inverts the mask. Confirming exports the mask PNG and builds a
 * MaskRef with dimensions, source checksum, and stroke count (§8.3).
 * The original image is NEVER replaced — the mask is applied
 * non-destructively at render time.
 */
export function CutoutPreviewSheet({
  visible,
  imageUri,
  onClose,
  onConfirm }: CutoutPreviewSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();

  const [capability, setCapability] = useState<CutoutCapability | null>(null);
  const [processing, setProcessing] = useState(false);
  const [mask, setMask] = useState<CutoutMask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  // ── Refine state ──────────────────────────────────────────────────
  // strokes are MaskStroke[] (keep/erase) for the Skia MaskedPreview.
  const [refineMode, setRefineMode] = useState(true);
  const [brushMode, setBrushMode] = useState<BrushMode | null>(null);
  const [strokes, setStrokes] = useState<MaskStroke[]>([]);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);

  // ── Compare / feather / invert state ──────────────────────────────
  const [comparing, setComparing] = useState(false);
  const [featherPx, setFeatherPx] = useState(0);
  const [invert, setInvert] = useState(false);

  // ── Mode tab underline indicator (spring-animated, brand color) ──
  const modeTabLayouts = useRef<Map<BrushMode, { x: number; width: number }>>(new Map());
  const modeUnderlineXSV = useSharedValue(0);
  const modeUnderlineWSV = useSharedValue(0);
  const modeUnderlineOpacitySV = useSharedValue(0);

  // ── Reset state when the sheet opens ──────────────────────────────
  // Probe Skia capability and create a brush mask. The mask starts
  // fully opaque (everything kept). The user erases background regions
  // with the Erase brush and restores with the Keep brush.
  useEffect(() => {
    if (!visible) return;
    setCapability(null);
    setProcessing(false);
    setMask(null);
    setError(null);
    setRefineMode(true);
    setBrushMode(null);
    setStrokes([]);
    setCurrentPoints([]);
    setComparing(false);
    setFeatherPx(0);
    setInvert(false);

    // Probe capability and create a brush mask.
    let cancelled = false;
    (async () => {
      const cap = cutoutService.getCapability();
      if (cancelled) return;
      setCapability(cap);
      if (!cap.brushRefinement) return;

      // Need display dimensions to create the mask surface. We'll use
      // the image's natural dimensions, capped to a reasonable mask
      // resolution for performance.
      setProcessing(true);
      try {
        const dims = await new Promise<{ w: number; h: number }>((resolve) => {
          RNImage.getSize(
            imageUri,
            (w, h) => resolve({ w, h }),
            () => resolve({ w: 512, h: 512 }),
          );
        });
        if (cancelled) return;
        // Cap mask resolution to 1024px on the longest side for perf.
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(dims.w, dims.h));
        const maskW = Math.round(dims.w * scale);
        const maskH = Math.round(dims.h * scale);
        const brushMask = await cutoutService.createBrushMask(
          imageUri,
          maskW,
          maskH,
        );
        if (cancelled) {
          cutoutService.disposeMask(brushMask);
          return;
        }
        setMask(brushMask);
        setProcessing(false);
        haptic.medium();
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Could not initialise the brush mask.',
        );
        setProcessing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, imageUri, haptic]);

  // ── Retry mask creation after a failure ──────────────────────────────
  const handleRetry = useCallback(async () => {
    if (processing) return;
    haptic.light();
    setError(null);
    setProcessing(true);
    try {
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        RNImage.getSize(
          imageUri,
          (w, h) => resolve({ w, h }),
          () => resolve({ w: 512, h: 512 }),
        );
      });
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(dims.w, dims.h));
      const maskW = Math.round(dims.w * scale);
      const maskH = Math.round(dims.h * scale);
      const brushMask = await cutoutService.createBrushMask(imageUri, maskW, maskH);
      setMask(brushMask);
      setProcessing(false);
      haptic.medium();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not initialise the brush mask.',
      );
      setProcessing(false);
    }
  }, [processing, imageUri, haptic]);

  // ── Dispose mask on unmount/close ───────────────────────────────────
  useEffect(() => {
    if (!visible && mask) {
      cutoutService.disposeMask(mask);
      setMask(null);
    }
  }, [visible, mask]);

  // ── Load image dimensions for display fitting ─────────────────────
  useEffect(() => {
    if (!visible || !imageUri) return;
    RNImage.getSize(
      imageUri,
      (w, h) => {
        const maxW = screenWidth - Space.lg * 2;
        const maxH = screenWidth * 0.5;
        const ratio = Math.min(maxW / w, maxH / h);
        setDisplaySize({ width: Math.floor(w * ratio), height: Math.floor(h * ratio) });
      },
      () => {
        // Non-fatal — preview will use a default size.
      },
    );
  }, [visible, imageUri]);

  // ── Brush stroke handlers (called from the gesture worklet via runOnJS) ──
  // Strokes are rasterized into the CutoutService mask surface AND added
  // to the strokes array for the Skia MaskedPreview. The mask coordinates
  // are in the preview's local space (scaled to match the mask resolution).
  const startStroke = useCallback((x: number, y: number) => {
    if (!brushMode) return;
    setCurrentPoints([{ x, y }]);
  }, [brushMode]);

  const addStrokePoint = useCallback((x: number, y: number) => {
    if (!brushMode) return;
    setCurrentPoints((prev) => [...prev, { x, y }]);
  }, [brushMode]);

  const endStroke = useCallback(() => {
    if (!brushMode) return;
    setCurrentPoints((curr) => {
      if (curr.length > 0) {
        const mode: 'keep' | 'erase' = brushMode === 'erase' ? 'erase' : 'keep';
        const stroke: MaskStroke = {
          mode,
          points: curr,
          brushSize: BRUSH_RADIUS * 2 };
        setStrokes((prev) => [...prev, stroke]);
        // Rasterize into the CutoutService mask surface for export.
        if (mask) {
          const scaledPoints = curr.map((p) => ({
            x: (p.x / displaySize.width) * mask.width,
            y: (p.y / displaySize.height) * mask.height }));
          if (mode === 'erase') {
            cutoutService.eraseStroke(mask, scaledPoints, BRUSH_RADIUS * 2 * (mask.width / displaySize.width));
          } else {
            cutoutService.keepStroke(mask, scaledPoints, BRUSH_RADIUS * 2 * (mask.width / displaySize.width));
          }
        }
      }
      return [];
    });
    haptic.light();
  }, [brushMode, haptic, mask, displaySize]);

  // ── Drawing gesture ───────────────────────────────────────────────
  // Recreated each render so the worklet captures the latest brushMode.
  const panGesture = Gesture.Pan()
    .onBegin((e) => {
      runOnJS(startStroke)(e.x, e.y);
    })
    .onUpdate((e) => {
      runOnJS(addStrokePoint)(e.x, e.y);
    })
    .onEnd(() => {
      runOnJS(endStroke)();
    });

  // ── Mode selection ────────────────────────────────────────────────
  const handleModeSelect = useCallback((mode: ModeId) => {
    if (mode === 'restore') {
      // Restore = undo the last refine stroke (action, not a persistent mode).
      // The mask is rebuilt from the remaining strokes on export.
      if (strokes.length === 0) return;
      haptic.selection();
      setStrokes((prev) => prev.slice(0, -1));
      // Rebuild the mask from scratch with remaining strokes.
      if (mask) {
        // Recreate the mask surface and re-apply all remaining strokes.
        cutoutService.disposeMask(mask);
        cutoutService.createBrushMask(mask.mediaAssetId, mask.width, mask.height).then((newMask) => {
          setMask(newMask);
          strokes.slice(0, -1).forEach((s) => {
            const scaledPoints = s.points.map((p) => ({
              x: (p.x / displaySize.width) * newMask.width,
              y: (p.y / displaySize.height) * newMask.height }));
            const scaledBrush = s.brushSize * (newMask.width / displaySize.width);
            if (s.mode === 'erase') {
              cutoutService.eraseStroke(newMask, scaledPoints, scaledBrush);
            } else {
              cutoutService.keepStroke(newMask, scaledPoints, scaledBrush);
            }
          });
        });
      }
      return;
    }
    haptic.selection();
    setBrushMode((prev) => {
      const next = prev === mode ? null : mode;
      // Animate underline to the selected tab (or hide if deselected).
      if (next) {
        const layout = modeTabLayouts.current.get(next);
        if (layout) {
          modeUnderlineXSV.value = withSpring(layout.x, Motion.spring.indicator);
          modeUnderlineWSV.value = withSpring(layout.width, Motion.spring.indicator);
          modeUnderlineOpacitySV.value = withSpring(1, Motion.spring.indicator);
        }
      } else {
        modeUnderlineOpacitySV.value = withSpring(0, Motion.spring.indicator);
      }
      return next;
    });
  }, [strokes.length, haptic, modeUnderlineXSV, modeUnderlineWSV, modeUnderlineOpacitySV]);

  // ── Reset mask — clears all strokes and recreates the mask ────────
  const handleResetMask = useCallback(() => {
    if (!mask) return;
    haptic.selection();
    setStrokes([]);
    setCurrentPoints([]);
    setBrushMode(null);
    modeUnderlineOpacitySV.value = withSpring(0, Motion.spring.indicator);
    // Recreate the mask surface (fully opaque — everything kept).
    const mediaAssetId = mask.mediaAssetId;
    const w = mask.width;
    const h = mask.height;
    cutoutService.disposeMask(mask);
    setMask(null);
    cutoutService.createBrushMask(mediaAssetId, w, h).then(setMask);
  }, [mask, haptic, modeUnderlineOpacitySV]);

  // ── Invert toggle ─────────────────────────────────────────────────
  const handleInvertToggle = useCallback(() => {
    haptic.selection();
    setInvert((prev) => !prev);
  }, [haptic]);

  // ── Confirm ───────────────────────────────────────────────────────
  // Export the mask as a PNG, apply feather/invert, and build a MaskRef
  // with dimensions, source checksum, model version, and stroke count.
  // The original image URI is preserved — the mask is applied
  // non-destructively at render time (§8.3).
  const handleConfirm = useCallback(async () => {
    if (!mask) return;
    haptic.medium();
    try {
      // Apply feather and invert to the mask surface before export.
      if (featherPx > 0) {
        await cutoutService.featherEdge(mask, featherPx);
      }
      if (invert) {
        await cutoutService.invertMask(mask);
      }
      const maskUri = await cutoutService.exportMask(mask);
      const maskRef = cutoutService.buildMaskRef(mask, featherPx, invert, {
        sourceChecksum: sourceChecksum(imageUri),
        strokeCount: strokes.length });
      const result: CutoutResult = {
        uri: imageUri, // original image — NOT replaced
        maskUri,
        maskRef,
        featherPx,
        invert };
      onConfirm(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not export the mask.',
      );
    }
  }, [mask, haptic, featherPx, invert, imageUri, strokes.length, onConfirm]);

  const previewSize = displaySize.width > 0
    ? displaySize
    : { width: screenWidth - Space.lg * 2, height: screenWidth * 0.4 };

  // ── Brush colour for the current mode ─────────────────────────────
  const currentBrushColor =
    brushMode === 'erase' ? ERASE_BRUSH : KEEP_BRUSH;

  // ── Mode button config ────────────────────────────────────────────
  const modeButtons: { id: ModeId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'keep-person', label: 'Keep Person', icon: 'person-outline' },
    { id: 'keep-object', label: 'Keep Object', icon: 'image-outline' },
    { id: 'erase', label: 'Erase', icon: 'remove-circle-outline' },
    { id: 'restore', label: 'Restore', icon: 'return-up-back-outline' },
  ];

  const canRefine = !!capability?.brushRefinement && !processing && !!mask;

  // Mode tab underline animated style.
  const modeUnderlineStyle = useAnimatedStyle(() => ({
    left: modeUnderlineXSV.value,
    width: modeUnderlineWSV.value,
    opacity: modeUnderlineOpacitySV.value }));

  return (
    <SheetContainer visible={visible} onClose={onClose} maxHeight={0.8}>
      <View style={{ paddingBottom: Math.max(insets.bottom, Space.md) }}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close cutout"
            accessibilityRole="button"
          >
            <AppIcon name="close" size={IconSize.lg} color="textPrimary" opticalCenter={true} accessible={false} />
          </PressScale>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Cutout
          </Text>
          <View style={styles.closeBtn} />
        </View>

        {/* ── Body ── */}
        {capability && !capability.brushRefinement && (
          <View style={styles.messageContainer}>
            <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
              Cutout unavailable
            </Text>
            <Text style={[styles.messageBody, { color: colors.textSecondary }]}>
              Brush cutout requires Skia, which isn&rsquo;t linked in this build.
            </Text>
          </View>
        )}

        {capability?.brushRefinement && processing && (
          <View style={styles.previewContainer}>
            <CutoutPreviewSkeleton width={previewSize.width} height={previewSize.height} />
          </View>
        )}

        {capability?.brushRefinement && !processing && error && (
          <View style={styles.messageContainer}>
            <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
              Could not initialise the cutout
            </Text>
            <Text style={[styles.messageBody, { color: colors.textSecondary }]}>
              {error}
            </Text>
            <PressScale
              onPress={handleRetry}
              style={[styles.retryBtn, { backgroundColor: colors.brand }]}
              accessibilityLabel="Retry cutout"
              accessibilityHint="Attempts to create the brush mask again"
              accessibilityRole="button"
            >
              <Text style={[styles.retryBtnText, { color: colors.textInverse }]}>
                Retry
              </Text>
            </PressScale>
          </View>
        )}

        {capability?.brushRefinement && !processing && mask && (
          <View style={styles.previewContainer}>
            {/* ── Preview area ── */}
            {comparing ? (
              // Hold-to-compare: show the original image full-width.
              // Reduce Motion-safe: no animation, just an instant swap.
              <View style={[styles.previewRow, { height: previewSize.height + Space.sm * 2 }]}>
                <View style={styles.previewCell}>
                  <View style={[styles.previewFrame, { width: previewSize.width, height: previewSize.height, borderColor: colors.border }]}>
                    <Image
                      source={{ uri: imageUri }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="contain"
                    />
                  </View>
                </View>
              </View>
            ) : (
              // Real-time Skia MaskedPreview with brush drawing.
              // The checkerboard shows through erased regions.
              <View style={[styles.previewRow, { height: previewSize.height + Space.sm * 2 }]}>
                <View style={styles.previewCell}>
                  <GestureHandlerRootView style={styles.gestureRoot}>
                    <GestureDetector gesture={panGesture}>
                      <View
                        style={[
                          styles.previewFrame,
                          {
                            width: previewSize.width,
                            height: previewSize.height,
                            borderColor: brushMode ? currentBrushColor : colors.border },
                        ]}
                      >
                        <Checkerboard size={{ width: previewSize.width, height: previewSize.height }} />
                        {/* Skia MaskedPreview — real-time alpha-masked cutout */}
                        <MaskedPreview
                          imageUri={imageUri}
                          width={previewSize.width}
                          height={previewSize.height}
                          strokes={strokes}
                          livePoints={currentPoints}
                          liveMode={brushMode === 'erase' ? 'erase' : brushMode ? 'keep' : null}
                          brushSize={BRUSH_RADIUS * 2}
                          showLiveOverlay={!!brushMode}
                        />
                      </View>
                    </GestureDetector>
                  </GestureHandlerRootView>
                </View>
              </View>
            )}

            {/* ── Compare / reset / invert controls ── */}
            <View style={styles.controlRow}>
              {/* Reset — clears all strokes and recreates the mask */}
              <PressScale
                onPress={handleResetMask}
                disabled={!canRefine || strokes.length === 0}
                style={[
                  styles.controlBtn,
                  {
                    backgroundColor: 'transparent',
                    borderColor: colors.border,
                    opacity: canRefine && strokes.length > 0 ? 1 : 0.4 },
                ]}
                accessibilityLabel="Reset mask"
                accessibilityHint="Clears all brush strokes and starts over"
                accessibilityRole="button"
              >
                <AppIcon
                  name="refresh"
                  size={IconSize.sm}
                  color="textSecondary"
                  opticalCenter={true}
                  accessible={false}
                />
                <Text
                  style={[
                    styles.controlBtnLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  Reset
                </Text>
              </PressScale>

              {/* Hold to compare — shows the original image. Reduce Motion-safe:
                  instant swap, no animation. */}
              <Pressable
                onPressIn={() => { haptic.light(); setComparing(true); }}
                onPressOut={() => setComparing(false)}
                disabled={!canRefine}
                style={({ pressed }) => [
                  styles.controlBtn,
                  {
                    backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                    borderColor: colors.border,
                    opacity: canRefine ? 1 : 0.4 },
                ]}
                accessibilityLabel="Hold to compare original"
                accessibilityRole="button"
              >
                <AppIcon name="eye" size={IconSize.sm} color="textSecondary" opticalCenter={true} accessible={false} />
                <Text style={[styles.controlBtnLabel, { color: colors.textSecondary }]}>
                  Compare
                </Text>
              </Pressable>

              {/* Invert toggle */}
              <PressScale
                onPress={handleInvertToggle}
                disabled={!canRefine}
                style={[
                  styles.controlBtn,
                  {
                    backgroundColor: invert ? colors.brand : 'transparent',
                    borderColor: invert ? colors.brand : colors.border,
                    opacity: canRefine ? 1 : 0.4 },
                ]}
                accessibilityLabel="Invert mask"
                accessibilityRole="button"
                accessibilityState={{ selected: invert }}
              >
                <AppIcon
                  name="swap-horizontal-outline"
                  size={IconSize.sm}
                  color={invert ? 'textInverse' : 'textSecondary'}
                  opticalCenter={true}
                  accessible={false}
                />
                <Text
                  style={[
                    styles.controlBtnLabel,
                    { color: invert ? colors.textInverse : colors.textSecondary },
                  ]}
                >
                  Invert
                </Text>
              </PressScale>
            </View>

            {/* ── Mode selector — text-only tabs with spring underline ── */}
            <View style={styles.modeRow}>
              {modeButtons.map((btn) => {
                const isRestore = btn.id === 'restore';
                const selected = !isRestore && brushMode === btn.id;
                return (
                  <PressScale
                    key={btn.id}
                    onPress={() => handleModeSelect(btn.id)}
                    disabled={!canRefine}
                    onLayout={!isRestore ? (e) => {
                      modeTabLayouts.current.set(btn.id as BrushMode, {
                        x: e.nativeEvent.layout.x,
                        width: e.nativeEvent.layout.width });
                      if (brushMode === btn.id) {
                        modeUnderlineXSV.value = e.nativeEvent.layout.x;
                        modeUnderlineWSV.value = e.nativeEvent.layout.width;
                        modeUnderlineOpacitySV.value = 1;
                      }
                    } : undefined}
                    style={styles.modeTab}
                    accessibilityLabel={btn.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.modeTabText,
                        {
                          color: selected ? colors.brand : colors.textSecondary,
                          opacity: !canRefine ? 0.4 : 1 },
                      ]}
                      numberOfLines={1}
                    >
                      {btn.label}
                    </Text>
                  </PressScale>
                );
              })}
              {/* Spring-animated underline indicator (brand color, 2pt) */}
              <Reanimated.View
                style={[styles.modeUnderline, modeUnderlineStyle, { backgroundColor: colors.brand }]}
                pointerEvents="none"
              />
            </View>

            {/* ── Edge Softness slider ── */}
            <View style={styles.sliderRow}>
              <View style={styles.sliderHeader}>
                <Text style={[styles.sliderLabel, { color: colors.textPrimary }]}>
                  Edge Softness
                </Text>
                <Text style={[styles.sliderValue, { color: colors.textMuted }]}>
                  {featherPx}px
                </Text>
              </View>
              <CreatorSlider
                value={featherPx}
                min={0}
                max={10}
                step={1}
                onValueChange={setFeatherPx}
                onCommit={setFeatherPx}
                accessibilityLabel="Edge softness"
              />
            </View>

            {/* ── Hint ── */}
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {brushMode
                ? `Draw to ${brushMode === 'erase' ? 'erase' : 'keep'}.`
                : 'Select a brush mode, then draw.'}
            </Text>
          </View>
        )}

        {/* Spacer when probing capability (capability === null) */}
        {capability === null && (
          <View style={styles.previewContainer}>
            <CutoutPreviewSkeleton width={previewSize.width} height={previewSize.height} />
            <Text style={[styles.messageBody, { color: colors.textSecondary, textAlign: 'center', marginTop: Space.md }]}>
              Checking capabilities…
            </Text>
          </View>
        )}

        {/* ── Footer — premium Cancel / Apply buttons ── */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <PressScale
            onPress={onClose}
            style={[styles.footerBtn, styles.footerCancel]}
            accessibilityLabel="Cancel cutout"
            accessibilityRole="button"
          >
            <Text style={[styles.footerCancelText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </PressScale>
          <PressScale
            onPress={handleConfirm}
            disabled={!mask || processing}
            style={[
              styles.footerBtn,
              styles.footerConfirm,
              {
                backgroundColor: colors.brand,
                opacity: !mask || processing ? 0.4 : 1 },
            ]}
            accessibilityLabel="Apply cutout"
            accessibilityRole="button"
          >
            <Text style={[styles.footerConfirmText, { color: colors.textInverse }]}>
              Apply
            </Text>
          </PressScale>
        </View>
      </View>
    </SheetContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    height: 44 },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    textAlign: 'center' },
  closeBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  // ── Message / state container ──
  messageContainer: {
    alignItems: 'center',
    paddingHorizontal: Space.lg,
    paddingVertical: Space.xl,
    gap: Space.xs },
  messageTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    textAlign: 'center' },
  messageBody: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size,
    textAlign: 'center',
    lineHeight: TypographyV2.body.lineHeight },
  retryBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    marginTop: Space.sm,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center' },
  retryBtnText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  // ── Preview ──
  previewContainer: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.sm },
  previewCell: {
    alignItems: 'center' },
  previewFrame: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent' },
  gestureRoot: {
    alignItems: 'center',
    justifyContent: 'center' },
  hint: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    textAlign: 'center',
    marginTop: Space.md,
    lineHeight: TypographyV2.meta.lineHeight,
    paddingHorizontal: Space.sm },
  // ── Control row (Refine / Hold to Compare / Invert) ──
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.md,
    paddingHorizontal: Space.xs },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44 },
  controlBtnLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  // ── Mode selector row — text-only tabs with underline ──
  modeRow: {
    flexDirection: 'row',
    marginTop: Space.sm,
    paddingHorizontal: Space.xs,
    position: 'relative' },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.sm,
    minHeight: 44 },
  modeTabText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  modeUnderline: {
    position: 'absolute',
    bottom: 0,
    height: Stroke.emphasis,
    borderRadius: Radius.full },
  // ── Edge Softness slider ──
  sliderRow: {
    marginTop: Space.md,
    paddingHorizontal: Space.xs },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs },
  sliderLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  sliderValue: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  // ── Footer — premium Cancel / Apply buttons ──
  footer: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth },
  footerBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center' },
  footerCancel: {
    backgroundColor: 'transparent' },
  footerCancelText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  footerConfirm: {
    // backgroundColor set inline
  },
  footerConfirmText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size } });
