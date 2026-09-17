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
  useWindowDimensions,
  Image as RNImage } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS } from 'react-native-reanimated';
import { Space } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { Motion } from '../../theme/motionTokens';
import { PressScale, SheetContainer } from '../shared/CreatorAnimations';
import { AppIcon } from '../../components/common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import {
  cutoutService,
  sourceChecksum,
  type CutoutResult,
  type CutoutMask,
  type CutoutCapability } from '../core/cutout/CutoutService';
import type { MaskStroke } from '../core/cutout/MaskRenderer';
import {
  BRUSH_RADIUS,
  type BrushMode,
  type ModeId,
  type ModeButton } from './cutoutPreview/cutoutPreviewShared';
import { styles } from './cutoutPreview/cutoutPreviewStyles';
import { CutoutPreviewSkeleton } from './cutoutPreview/CutoutPreviewSkeleton';
import { CutoutPreviewStatus } from './cutoutPreview/CutoutPreviewStatus';
import { CutoutPreviewStage } from './cutoutPreview/CutoutPreviewStage';
import { CutoutPreviewControls } from './cutoutPreview/CutoutPreviewControls';

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
  const [, setRefineMode] = useState(true);
  const [brushMode, setBrushMode] = useState<BrushMode | null>(null);
  const [strokes, setStrokes] = useState<MaskStroke[]>([]);
  // Live brush points live on the UI thread — the gesture accumulates
  // into this shared value and MaskedPreview derives the stroke path
  // there; JS is touched once per stroke (commit), not per move event.
  const livePointsSV = useSharedValue<{ x: number; y: number }[]>([]);

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
    livePointsSV.value = [];
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
  }, [visible, imageUri, haptic, livePointsSV]);

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
  }, [visible, imageUri, screenWidth]);

  // ── Brush stroke handlers ─────────────────────────────────────────
  // Points accumulate on the UI thread; the JS thread is touched once per
  // stroke — at commit — with the full point array. Committed strokes are
  // rasterized into the CutoutService mask surface AND added to the
  // strokes array for the Skia MaskedPreview. The mask coordinates are in
  // the preview's local space (scaled to match the mask resolution).
  const endStroke = useCallback((points: { x: number; y: number }[]) => {
    if (!brushMode || points.length === 0) return;
    const mode: 'keep' | 'erase' = brushMode === 'erase' ? 'erase' : 'keep';
    const stroke: MaskStroke = {
      mode,
      points,
      brushSize: BRUSH_RADIUS * 2 };
    setStrokes((prev) => [...prev, stroke]);
    // Rasterize into the CutoutService mask surface for export.
    if (mask) {
      const scaledPoints = points.map((p) => ({
        x: (p.x / displaySize.width) * mask.width,
        y: (p.y / displaySize.height) * mask.height }));
      if (mode === 'erase') {
        cutoutService.eraseStroke(mask, scaledPoints, BRUSH_RADIUS * 2 * (mask.width / displaySize.width));
      } else {
        cutoutService.keepStroke(mask, scaledPoints, BRUSH_RADIUS * 2 * (mask.width / displaySize.width));
      }
    }
    haptic.light();
  }, [brushMode, haptic, mask, displaySize]);

  // ── Drawing gesture ───────────────────────────────────────────────
  // Recreated each render so the worklet captures the latest brushMode.
  const panGesture = Gesture.Pan()
    .onBegin((e) => {
      'worklet';
      if (!brushMode) return;
      livePointsSV.value = [{ x: e.x, y: e.y }];
    })
    .onUpdate((e) => {
      'worklet';
      if (!brushMode) return;
      livePointsSV.value = [...livePointsSV.value, { x: e.x, y: e.y }];
    })
    .onEnd(() => {
      'worklet';
      if (!brushMode) return;
      const pts = livePointsSV.value;
      livePointsSV.value = [];
      runOnJS(endStroke)(pts);
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
  }, [strokes, haptic, modeUnderlineXSV, modeUnderlineWSV, modeUnderlineOpacitySV, displaySize.width, displaySize.height, mask]);

  // ── Reset mask — clears all strokes and recreates the mask ────────
  const handleResetMask = useCallback(() => {
    if (!mask) return;
    haptic.selection();
    setStrokes([]);
    livePointsSV.value = [];
    setBrushMode(null);
    modeUnderlineOpacitySV.value = withSpring(0, Motion.spring.indicator);
    // Recreate the mask surface (fully opaque — everything kept).
    const mediaAssetId = mask.mediaAssetId;
    const w = mask.width;
    const h = mask.height;
    cutoutService.disposeMask(mask);
    setMask(null);
    cutoutService.createBrushMask(mediaAssetId, w, h).then(setMask);
  }, [mask, haptic, modeUnderlineOpacitySV, livePointsSV]);

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
    brushMode === 'erase' ? colors.danger : colors.success;

  // ── Mode button config ────────────────────────────────────────────
  const modeButtons: ModeButton[] = [
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
            accessibilityHint="Closes the preview"
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
        <CutoutPreviewStatus
          capability={capability}
          processing={processing}
          error={error}
          onRetry={handleRetry}
          colors={colors}
        />

        {capability?.brushRefinement && processing && (
          <View style={styles.previewContainer}>
            <CutoutPreviewSkeleton width={previewSize.width} height={previewSize.height} />
          </View>
        )}

        {capability?.brushRefinement && !processing && mask && (
          <View style={styles.previewContainer}>
            <CutoutPreviewStage
              comparing={comparing}
              previewSize={previewSize}
              imageUri={imageUri}
              panGesture={panGesture}
              brushMode={brushMode}
              currentBrushColor={currentBrushColor}
              strokes={strokes}
              livePointsSV={livePointsSV}
              colors={colors}
            />
            <CutoutPreviewControls
              colors={colors}
              canRefine={canRefine}
              strokesCount={strokes.length}
              invert={invert}
              brushMode={brushMode}
              featherPx={featherPx}
              modeButtons={modeButtons}
              modeTabLayouts={modeTabLayouts}
              modeUnderlineXSV={modeUnderlineXSV}
              modeUnderlineWSV={modeUnderlineWSV}
              modeUnderlineOpacitySV={modeUnderlineOpacitySV}
              modeUnderlineStyle={modeUnderlineStyle}
              onResetMask={handleResetMask}
              onCompareIn={() => { haptic.light(); setComparing(true); }}
              onCompareOut={() => setComparing(false)}
              onInvertToggle={handleInvertToggle}
              onModeSelect={handleModeSelect}
              onFeatherChange={setFeatherPx}
            />
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
            accessibilityHint="Closes without applying"
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
            accessibilityHint="Applies the cutout to the canvas"
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
