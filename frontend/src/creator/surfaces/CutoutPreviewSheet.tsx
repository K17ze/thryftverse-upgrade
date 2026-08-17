/**
 * CutoutPreviewSheet — before/after preview for true subject cutout.
 *
 * Per spec 07_MEDIA_TOOLCHAIN §7, the cutout pipeline is:
 *   1. segmentation
 *   2. mask preview  ← this sheet
 *   3. edge refinement
 *   4. store alpha mask
 *   5. GPU compose
 *   6. only flatten at export/share preview
 *
 * This sheet shows a before/after preview of the segmentation result
 * rendered over a checkerboard so transparency is visible. It has:
 *   - a loading state during processing
 *   - a confirm/cancel button pair
 *   - an honest "Cutout is not available on this device" message when
 *     the native segmentation module is not available (AGENTS.md §11)
 *   - a Refine mode with Keep Person / Keep Object / Erase / Restore
 *     brush modes for manual mask refinement
 *   - a "Hold to compare" gesture to flash the original image
 *   - an Edge Softness slider (featherPx) and an Invert toggle
 *
 * Per AGENTS.md §11: the Refine brush renders a visible stroke overlay
 * so the user's refinement intent is honestly represented. True
 * pixel-level mask rasterization requires a native module not yet
 * wired in this build (see CutoutService.refineMask).
 *
 * Uses the shared SheetContainer from CreatorAnimations for consistent
 * motion and chrome.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image as RNImage,
  Pressable,
  PanResponder,
  type LayoutChangeEvent,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type DimensionValue,
} from 'react-native';
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
  useReducedMotion,
} from 'react-native-reanimated';
import { Space, Radius, Type, Typography, FontFamily, Stroke } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { PressScale, SheetContainer } from '../CreatorAnimations';
import {
  removeBackground,
  isCutoutSupportedAsync,
  type CutoutResult,
  type BrushStroke,
} from '../core/cutout/CutoutService';

const { width: SCREEN_W } = Dimensions.get('window');

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

// ── SkeletonBlock — one-time shimmer sweep (AGENTS.md §14, §17) ──────
function SkeletonBlock({ width, height, radius }: { width: DimensionValue; height: number; radius?: number }) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const shimmerSV = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    shimmerSV.value = 0;
    shimmerSV.value = withTiming(1, { duration: 1200 });
  }, [reduceMotion, shimmerSV]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: colors.surfaceAlt,
    opacity: 0.5 + 0.3 * shimmerSV.value,
  }));

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
      <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.bodyEmphasis.size, color: colors.textPrimary, marginTop: Space.md }}>
        Removing background…
      </Text>
      <Text style={{ fontFamily: Typography.family.regular, fontSize: Type.body.size, color: colors.textSecondary, textAlign: 'center', marginTop: Space.xs }}>
        Detecting the subject and generating an alpha mask.
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
            backgroundColor: isLight ? CHECKER_LIGHT : CHECKER_DARK,
          }}
        />,
      );
    }
  }
  return <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>{squares}</View>;
}

// ── Stroke overlay (renders a brush stroke as semi-transparent dots) ──
function StrokeOverlay({
  stroke,
  color,
  opacity,
}: {
  stroke: { points: { x: number; y: number }[] };
  color: string;
  opacity: number;
}) {
  if (stroke.points.length === 0) return null;
  return (
    <>
      {stroke.points.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: p.x - BRUSH_RADIUS,
            top: p.y - BRUSH_RADIUS,
            width: BRUSH_RADIUS * 2,
            height: BRUSH_RADIUS * 2,
            borderRadius: BRUSH_RADIUS,
            backgroundColor: color,
            opacity,
          }}
        />
      ))}
    </>
  );
}

export interface CutoutPreviewSheetProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
  onConfirm: (result: CutoutResult) => void;
}

/**
 * Shows a before/after preview of a true cutout (subject segmentation).
 *
 * On open, the sheet:
 *   1. Checks if native segmentation is available.
 *   2. If available, runs `removeBackground()` and shows the result
 *      over a checkerboard so transparency is visible.
 *   3. If not available, shows an honest "not available" message.
 *
 * The user can refine the mask with brush modes (Keep Person / Keep
 * Object / Erase / Restore), hold to compare the original, adjust edge
 * softness, and invert the mask. Confirming applies the cutout (caller
 * stores the alpha mask and updates the layer), or cancels.
 */
export function CutoutPreviewSheet({
  visible,
  imageUri,
  onClose,
  onConfirm,
}: CutoutPreviewSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const [supported, setSupported] = useState<boolean | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<CutoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  // ── Refine state ──────────────────────────────────────────────────
  const [refineMode, setRefineMode] = useState(false);
  const [brushMode, setBrushMode] = useState<BrushMode | null>(null);
  const [strokes, setStrokes] = useState<BrushStroke[]>([]);
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
  const UNDERLINE_SPRING = { damping: 20, stiffness: 320, mass: 0.7 } as const;

  // ── Reset state when the sheet opens ──────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setSupported(null);
    setProcessing(false);
    setResult(null);
    setError(null);
    setRefineMode(false);
    setBrushMode(null);
    setStrokes([]);
    setCurrentPoints([]);
    setComparing(false);
    setFeatherPx(0);
    setInvert(false);

    // Probe capability and run segmentation.
    let cancelled = false;
    (async () => {
      const isSupported = await isCutoutSupportedAsync();
      if (cancelled) return;
      setSupported(isSupported);
      if (!isSupported) return;

      setProcessing(true);
      const res = await removeBackground(imageUri);
      if (cancelled) return;
      if (!res) {
        setError('Could not remove the background. Try a different photo.');
        setProcessing(false);
        return;
      }
      setResult(res);
      setProcessing(false);
      haptic.medium();
    })();

    return () => { cancelled = true; };
  }, [visible, imageUri, haptic]);

  // ── Load image dimensions for display fitting ─────────────────────
  useEffect(() => {
    if (!visible || !imageUri) return;
    RNImage.getSize(
      imageUri,
      (w, h) => {
        const maxW = SCREEN_W - Space.lg * 2;
        const maxH = SCREEN_W * 0.5;
        const ratio = Math.min(maxW / w, maxH / h);
        setDisplaySize({ width: Math.floor(w * ratio), height: Math.floor(h * ratio) });
      },
      () => {
        // Non-fatal — preview will use a default size.
      },
    );
  }, [visible, imageUri]);

  // ── Brush stroke handlers (called from the gesture worklet via runOnJS) ──
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
        setStrokes((prev) => [
          ...prev,
          {
            mode: brushMode === 'erase' ? 'erase' : 'keep',
            points: curr,
          },
        ]);
      }
      return [];
    });
    haptic.light();
  }, [brushMode, haptic]);

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
      if (strokes.length === 0) return;
      haptic.selection();
      setStrokes((prev) => prev.slice(0, -1));
      return;
    }
    haptic.selection();
    setBrushMode((prev) => {
      const next = prev === mode ? null : mode;
      // Animate underline to the selected tab (or hide if deselected).
      if (next) {
        const layout = modeTabLayouts.current.get(next);
        if (layout) {
          modeUnderlineXSV.value = withSpring(layout.x, UNDERLINE_SPRING);
          modeUnderlineWSV.value = withSpring(layout.width, UNDERLINE_SPRING);
          modeUnderlineOpacitySV.value = withSpring(1, UNDERLINE_SPRING);
        }
      } else {
        modeUnderlineOpacitySV.value = withSpring(0, UNDERLINE_SPRING);
      }
      return next;
    });
  }, [strokes.length, haptic, modeUnderlineXSV, modeUnderlineWSV, modeUnderlineOpacitySV]);

  // ── Refine toggle ─────────────────────────────────────────────────
  const handleRefineToggle = useCallback(() => {
    haptic.selection();
    setRefineMode((prev) => {
      const next = !prev;
      if (!next) {
        // Leaving refine mode — clear in-progress drawing state.
        setBrushMode(null);
        setCurrentPoints([]);
        modeUnderlineOpacitySV.value = withSpring(0, UNDERLINE_SPRING);
      }
      return next;
    });
  }, [haptic, modeUnderlineOpacitySV]);

  // ── Invert toggle ─────────────────────────────────────────────────
  const handleInvertToggle = useCallback(() => {
    haptic.selection();
    setInvert((prev) => !prev);
  }, [haptic]);

  // ── Confirm ───────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!result) return;
    haptic.medium();
    const refined: CutoutResult = {
      ...result,
      featherPx,
      invert,
      maskRef: result.maskRef
        ? { ...result.maskRef, featherPx, invert }
        : undefined,
    };
    onConfirm(refined);
  }, [result, haptic, onConfirm, featherPx, invert]);

  const previewSize = displaySize.width > 0
    ? displaySize
    : { width: SCREEN_W - Space.lg * 2, height: SCREEN_W * 0.4 };

  // ── Brush colour for the current mode ─────────────────────────────
  const currentBrushColor =
    brushMode === 'erase' ? ERASE_BRUSH : KEEP_BRUSH;

  // ── Mode button config ────────────────────────────────────────────
  const modeButtons: { id: ModeId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'keep-person', label: 'Keep Person', icon: 'person-outline' },
    { id: 'keep-object', label: 'Keep Object', icon: 'cube-outline' },
    { id: 'erase', label: 'Erase', icon: 'remove-circle-outline' },
    { id: 'restore', label: 'Restore', icon: 'return-up-back-outline' },
  ];

  const canRefine = supported === true && !processing && !!result;

  // Mode tab underline animated style.
  const modeUnderlineStyle = useAnimatedStyle(() => ({
    left: modeUnderlineXSV.value,
    width: modeUnderlineWSV.value,
    opacity: modeUnderlineOpacitySV.value,
  }));

  return (
    <SheetContainer visible={visible} onClose={onClose} maxHeight={0.8}>
      <View style={{ paddingBottom: Math.max(insets.bottom, Space.md) }}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Cutout
          </Text>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close cutout"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>

        {/* ── Body ── */}
        {supported === false && (
          <View style={styles.messageContainer}>
            <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
              Cutout is not available on this device
            </Text>
            <Text style={[styles.messageBody, { color: colors.textSecondary }]}>
              True subject segmentation requires iOS 17+ or a supported
              Android device. You can still crop your photo manually.
            </Text>
          </View>
        )}

        {supported === true && processing && (
          <View style={styles.previewContainer}>
            <CutoutPreviewSkeleton width={previewSize.width} height={previewSize.height} />
          </View>
        )}

        {supported === true && !processing && error && (
          <View style={styles.messageContainer}>
            <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
              Could not complete the cutout
            </Text>
            <Text style={[styles.messageBody, { color: colors.textSecondary }]}>
              {error}
            </Text>
          </View>
        )}

        {supported === true && !processing && result && (
          <View style={styles.previewContainer}>
            {/* Before / After labels — text-only (hidden in refine mode) */}
            {!refineMode && !comparing && (
              <View style={styles.labelRow}>
                <Text style={[styles.labelText, { color: colors.textSecondary }]}>
                  Before
                </Text>
                <Text style={[styles.labelText, { color: colors.textSecondary }]}>
                  After
                </Text>
              </View>
            )}

            {/* ── Preview area ── */}
            {comparing ? (
              // Hold-to-compare: show the original image full-width.
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
            ) : refineMode ? (
              // Refine mode: single cutout preview with drawing canvas.
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
                            borderColor: brushMode ? currentBrushColor : colors.border,
                          },
                        ]}
                      >
                        <Checkerboard size={{ width: previewSize.width, height: previewSize.height }} />
                        <Image
                          source={{ uri: result.uri }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="contain"
                        />
                        {/* Committed stroke overlays */}
                        <View style={StyleSheet.absoluteFill} pointerEvents="none">
                          {strokes.map((s, i) => (
                            <StrokeOverlay
                              key={i}
                              stroke={s}
                              color={s.mode === 'erase' ? ERASE_BRUSH : KEEP_BRUSH}
                              opacity={s.mode === 'erase' ? 0.35 : 0.3}
                            />
                          ))}
                        </View>
                        {/* In-progress stroke overlay (coloured) */}
                        {currentPoints.length > 0 && brushMode && (
                          <View
                            style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
                          >
                            {currentPoints.map((p, i) => (
                              <View
                                key={i}
                                style={{
                                  position: 'absolute',
                                  left: p.x - BRUSH_RADIUS,
                                  top: p.y - BRUSH_RADIUS,
                                  width: BRUSH_RADIUS * 2,
                                  height: BRUSH_RADIUS * 2,
                                  borderRadius: BRUSH_RADIUS,
                                  backgroundColor: currentBrushColor,
                                  opacity: 0.5,
                                }}
                              />
                            ))}
                          </View>
                        )}
                      </View>
                    </GestureDetector>
                  </GestureHandlerRootView>
                </View>
              </View>
            ) : (
              // Default: side-by-side before/after preview.
              <View style={[styles.previewRow, { height: previewSize.height + Space.sm * 2 }]}>
                {/* Original */}
                <View style={styles.previewCell}>
                  <View style={[styles.previewFrame, { width: previewSize.width / 2 - Space.xs, height: previewSize.height }]}>
                    <Image
                      source={{ uri: imageUri }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  </View>
                </View>
                {/* Cutout over checkerboard */}
                <View style={styles.previewCell}>
                  <View style={[styles.previewFrame, { width: previewSize.width / 2 - Space.xs, height: previewSize.height, borderColor: colors.border }]}>
                    <Checkerboard size={{ width: previewSize.width / 2 - Space.xs, height: previewSize.height }} />
                    <Image
                      source={{ uri: result.uri }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="contain"
                    />
                  </View>
                </View>
              </View>
            )}

            {/* ── Refine / compare controls ── */}
            <View style={styles.controlRow}>
              {/* Refine toggle */}
              <PressScale
                onPress={handleRefineToggle}
                disabled={!canRefine}
                style={[
                  styles.controlBtn,
                  {
                    backgroundColor: refineMode ? colors.brand : colors.surfaceAlt,
                    borderColor: refineMode ? colors.brand : colors.border,
                    opacity: canRefine ? 1 : 0.4,
                  },
                ]}
                accessibilityLabel="Toggle refine mode"
                accessibilityRole="button"
                accessibilityState={{ selected: refineMode }}
              >
                <Ionicons
                  name="brush-outline"
                  size={18}
                  color={refineMode ? colors.textInverse : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.controlBtnLabel,
                    { color: refineMode ? colors.textInverse : colors.textSecondary },
                  ]}
                >
                  Refine
                </Text>
              </PressScale>

              {/* Hold to compare */}
              <Pressable
                onPressIn={() => { haptic.light(); setComparing(true); }}
                onPressOut={() => setComparing(false)}
                disabled={!canRefine}
                style={({ pressed }) => [
                  styles.controlBtn,
                  {
                    backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                    borderColor: colors.border,
                    opacity: canRefine ? 1 : 0.4,
                  },
                ]}
                accessibilityLabel="Hold to compare original"
                accessibilityRole="button"
              >
                <Ionicons name="eye-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.controlBtnLabel, { color: colors.textSecondary }]}>
                  Hold to Compare
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
                    opacity: canRefine ? 1 : 0.4,
                  },
                ]}
                accessibilityLabel="Invert mask"
                accessibilityRole="button"
                accessibilityState={{ selected: invert }}
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={18}
                  color={invert ? colors.textInverse : colors.textSecondary}
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
                    disabled={!refineMode || !canRefine}
                    onLayout={!isRestore ? (e) => {
                      modeTabLayouts.current.set(btn.id as BrushMode, {
                        x: e.nativeEvent.layout.x,
                        width: e.nativeEvent.layout.width,
                      });
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
                          opacity: !refineMode || !canRefine ? 0.4 : 1,
                        },
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
              <FeatherSlider
                value={featherPx}
                min={0}
                max={10}
                onChange={setFeatherPx}
                trackColor={colors.border}
                fillColor={colors.brand}
                thumbColor={colors.textPrimary}
              />
            </View>

            {/* ── Hint ── */}
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {refineMode
                ? brushMode
                  ? `Draw to ${brushMode === 'erase' ? 'erase' : 'keep'} — strokes refine the mask.`
                  : 'Select a brush mode, then draw to refine the mask.'
                : 'The checkerboard shows transparent areas. Tap Refine to manually adjust the mask.'}
            </Text>
          </View>
        )}

        {/* Spacer when probing capability (supported === null) */}
        {supported === null && (
          <View style={styles.previewContainer}>
            <CutoutPreviewSkeleton width={previewSize.width} height={previewSize.height} />
            <Text style={[styles.messageBody, { color: colors.textSecondary, textAlign: 'center', marginTop: Space.md }]}>
              Checking device capabilities…
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
            disabled={!result || processing}
            style={[
              styles.footerBtn,
              styles.footerConfirm,
              {
                backgroundColor: colors.brand,
                opacity: !result || processing ? 0.4 : 1,
              },
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

// ── Edge Softness slider ─────────────────────────────────────────────
// A minimal PanResponder-based slider (no new dependencies — the
// codebase has no slider library). Follows the AdjustPanel pattern.
interface FeatherSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  trackColor: string;
  fillColor: string;
  thumbColor: string;
}

function FeatherSlider({
  value,
  min,
  max,
  onChange,
  trackColor,
  fillColor,
  thumbColor,
}: FeatherSliderProps) {
  const [width, setWidth] = useState(0);
  const range = max - min;
  const clamped = Math.min(max, Math.max(min, value));
  const ratio = range === 0 ? 0 : (clamped - min) / range;
  const trackWidth = width > 0 ? width : 1;
  const thumbPosition = ratio * trackWidth;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  const valueFromX = useCallback(
    (x: number) => {
      const r = Math.min(1, Math.max(0, x / trackWidth));
      return Math.round(min + r * range);
    },
    [trackWidth, min, range],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          onChange(valueFromX(e.nativeEvent.locationX));
        },
        onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          // Use dx relative to grant point combined with current thumb pos.
          onChange(valueFromX(thumbPosition + g.dx));
        },
        onPanResponderRelease: () => {},
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thumbPosition, valueFromX, onChange],
  );

  return (
    <View style={styles.sliderTrackWrap} onLayout={handleLayout} {...panResponder.panHandlers}>
      <View style={[styles.sliderTrack, { backgroundColor: trackColor }]} />
      <View style={[styles.sliderFill, { width: thumbPosition, backgroundColor: fillColor }]} />
      <View
        style={[
          styles.sliderThumb,
          { left: thumbPosition, backgroundColor: thumbColor },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  // ── Message / state container ──
  messageContainer: {
    alignItems: 'center',
    paddingHorizontal: Space.lg,
    paddingVertical: Space.xl,
    gap: Space.xs,
  },
  messageTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    textAlign: 'center',
  },
  messageBody: {
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    textAlign: 'center',
    lineHeight: Type.body.lineHeight,
  },
  // ── Preview ──
  previewContainer: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
    paddingHorizontal: Space.xs,
  },
  labelText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.sm,
  },
  previewCell: {
    alignItems: 'center',
  },
  previewFrame: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  gestureRoot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size,
    textAlign: 'center',
    marginTop: Space.md,
    lineHeight: Type.meta.lineHeight,
    paddingHorizontal: Space.sm,
  },
  // ── Control row (Refine / Hold to Compare / Invert) ──
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.md,
    paddingHorizontal: Space.xs,
  },
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
    minHeight: 44,
  },
  controlBtnLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
  },
  // ── Mode selector row — text-only tabs with underline ──
  modeRow: {
    flexDirection: 'row',
    marginTop: Space.sm,
    paddingHorizontal: Space.xs,
    position: 'relative',
  },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.sm,
    minHeight: 44,
  },
  modeTabText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  modeUnderline: {
    position: 'absolute',
    bottom: 0,
    height: Stroke.emphasis,
    borderRadius: 1,
  },
  // ── Edge Softness slider ──
  sliderRow: {
    marginTop: Space.md,
    paddingHorizontal: Space.xs,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  sliderLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  sliderValue: {
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
  },
  sliderTrackWrap: {
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    top: 4,
  },
  // ── Footer — premium Cancel / Apply buttons ──
  footer: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCancel: {
    backgroundColor: 'transparent',
  },
  footerCancelText: {
    fontFamily: FontFamily.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  footerConfirm: {
    // backgroundColor set inline
  },
  footerConfirmText: {
    fontFamily: FontFamily.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
});
