/**
 * DrawingWorkspace — full-screen freehand drawing canvas for the creator
 * department.
 *
 * Per spec 07_MEDIA_TOOLCHAIN: strokes are normalized 0–1 against the canvas
 * bounds so a DrawingDocument can be rendered at any resolution.
 *
 * PERFORMANCE ARCHITECTURE
 *   The active stroke is kept on the UI thread via Reanimated shared values.
 *   Points accumulate in a mutable ref (no O(n²) array copying) and a shared
 *   render-tick drives a throttled React state update for the live preview
 *   stroke only. The committed `strokes` array is updated ONCE, on gesture end
 *   — never point-by-point from JS at high frequency.
 *
 * RENDERING
 *   @shopify/react-native-skia is available in this project, so the canvas uses
 *   GPU-accelerated Skia paths with per-brush blend modes. A runtime
 *   availability guard prevents a hard crash if the native module is missing.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Canvas } from '@shopify/react-native-skia';
import { Image as ExpoImage } from 'expo-image';
import { layoutEmojiStamps } from './emojiStampLayout';

import { Space, Radius, FontFamily, Elevation, Stroke as StrokeToken } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Motion } from '../../../theme/motionTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { ConfirmationSheet } from '../../../components/ConfirmationSheet';
import { PressScale } from '../../shared/CreatorAnimations';
import { CreatorSlider, CreatorIconButton } from '../../controls';
import {
  useCreatorColorHistory,
  toHexString,
  fromHexString,
  normalize } from '../../color/';
import type { CreatorColor } from '../../color/';
import type { BrushType, DrawingDocument, EmojiBrushConfig } from './DrawingTypes';
import { DrawingPaletteBar } from './DrawingPaletteBar';
import { skiaAvailable, probeSkiaAvailability, StrokePath, LiveStrokePath } from './drawingSkia';
import { useDrawingStrokes, MAX_UNDO_LEVELS } from './useDrawingStrokes';
import { DrawingEmojiPanel } from './drawingEmojiPanel';
import { DrawingToolBar, DrawingBrushPills } from './drawingToolbar';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
interface DrawingWorkspaceProps {
  visible: boolean;
  onClose: () => void;
  onCommit: (drawing: DrawingDocument) => void;
  canvasWidth: number;
  canvasHeight: number;
  /** Media URI to render as the drawing background (Snapchat/Instagram
   *  pattern: draw directly ON the photo/video, not on a blank canvas).
   *  When omitted, falls back to a solid color background. */
  backgroundUri?: string;
}

const DEFAULT_EMOJI = '🔥';

const MIN_SIZE = 1;
const MAX_SIZE = 50;

const SNAP_TIMING = { duration: Motion.duration.snapToGuide, easing: Motion.easing.entrance };

// ─────────────────────────────────────────────────────────────────────────────
// Main DrawingWorkspace
// ─────────────────────────────────────────────────────────────────────────────
export function DrawingWorkspace({
  visible,
  onClose,
  onCommit,
  canvasWidth,
  canvasHeight,
  backgroundUri }: DrawingWorkspaceProps) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [skiaReady, setSkiaReady] = useState(skiaAvailable);
  const handleRetrySkia = useCallback(() => {
    setSkiaReady(probeSkiaAvailability());
  }, []);

  // ── Tool state ──
  const [brushType, setBrushType] = useState<BrushType>('pen');
  const lastDrawBrushRef = useRef<BrushType>('pen');
  // CreatorColor is the canonical color state (spec 04_COLOR_SYSTEM_ZERO_GAP §1).
  // brushColorHex is derived from it for the Skia renderer and DrawStrokeSchema.
  const [brushColorObj, setBrushColorObj] = useState<CreatorColor>(
    () => fromHexString(isDark ? '#FFFFFF' : '#000000') ?? { space: 'srgb', r: 0, g: 0, b: 0, a: 1 },
  );
  const brushColor = useMemo(() => toHexString(brushColorObj), [brushColorObj]);
  const [brushSize, setBrushSize] = useState<number>(8);
  const [brushOpacity, setBrushOpacity] = useState<number>(100);
  const [showColorPicker, setShowColorPicker] = useState<boolean>(true);
  const [showOverflow, setShowOverflow] = useState<boolean>(false);
  const [panelHeight, setPanelHeight] = useState<number>(0);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  // ── Emoji brush state ──
  const [emojiBrush, setEmojiBrush] = useState<EmojiBrushConfig>({
    emoji: DEFAULT_EMOJI,
    size: 32,
    spacing: 24,
    rotation: 0,
    jitter: 0 });

  // Recent color history (persisted via AsyncStorage, spec §4).
  const { recents, commitColor: commitRecentColor } = useCreatorColorHistory();

  // ── Stroke lifecycle + history (see useDrawingStrokes) ──
  const {
    strokes,
    setStrokes,
    redoStack,
    setRedoStack,
    liveStroke,
    liveMeta,
    livePathSV,
    drawGesture,
    handleUndo,
    handleRedo,
    resetStrokes } = useDrawingStrokes({
    brushType,
    brushColor,
    brushSize,
    brushOpacity,
    emojiBrush,
  });

  // ── Panel entrance ──
  const panelTranslateY = useSharedValue(400);
  const panelOpacity = useSharedValue(0);
  const canvasOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      if (reduceMotion) {
        panelTranslateY.value = 0;
        panelOpacity.value = 1;
        canvasOpacity.value = 1;
      } else {
        panelTranslateY.value = withTiming(0, SNAP_TIMING);
        panelOpacity.value = withTiming(1, { duration: Motion.duration.normal });
        canvasOpacity.value = withTiming(1, { duration: Motion.duration.normal });
      }
    } else {
      panelTranslateY.value = 400;
      panelOpacity.value = 0;
      canvasOpacity.value = 0;
      // reset state when hidden
      resetStrokes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelTranslateY.value }],
    opacity: panelOpacity.value }));

  const canvasStyle = useAnimatedStyle(() => ({
    opacity: canvasOpacity.value }));

  // ── Toolbar actions ──
  const handleClear = useCallback(() => {
    setShowOverflow(false);
    if (strokes.length === 0) return;
    setConfirmSheet({
      visible: true,
      title: 'Clear drawing?',
      message: 'Clear all strokes? Undoable.',
      confirmLabel: 'Clear',
      variant: 'danger',
      onConfirm: () => {
        setRedoStack((r) => [...r, ...strokes].slice(-MAX_UNDO_LEVELS));
        setStrokes([]);
      } });
  }, [strokes, setRedoStack, setStrokes]);

  const handleDone = useCallback(() => {
    const doc: DrawingDocument = {
      strokes,
      width: canvasWidth,
      height: canvasHeight };
    onCommit(doc);
  }, [strokes, canvasWidth, canvasHeight, onCommit]);

  // ── Color selection (CreatorColorPicker) ──
  // Transient change — updates the live color without creating a history entry.
  const handleColorChange = useCallback((color: CreatorColor) => {
    setBrushColorObj(color);
    if (brushType === 'eraser') setBrushType('pen');
  }, [brushType]);

  // Commit — updates color and adds to recent history.
  const handleColorCommit = useCallback((color: CreatorColor) => {
    const normalizedColor = normalize(color);
    setBrushColorObj(normalizedColor);
    commitRecentColor(normalizedColor);
    if (brushType === 'eraser') setBrushType('pen');
  }, [brushType, commitRecentColor]);

  const handleSelectBrush = useCallback((t: BrushType) => {
    setBrushType(t);
    if (t !== 'eraser' && t !== 'emoji') {
      lastDrawBrushRef.current = t;
    }
  }, []);

  const handleBrushTool = useCallback(() => {
    setBrushType(lastDrawBrushRef.current);
  }, []);

  const handleEraserTool = useCallback(() => {
    setBrushType('eraser');
  }, []);

  const handleColorTool = useCallback(() => {
    setShowColorPicker((v) => !v);
  }, []);

  // ── Rendered strokes (committed) + live preview ──
  const committedPaths = useMemo(
    () =>
      strokes.map((s, i) => (
        <StrokePath key={`committed_${s.id}_${i}`} stroke={s} keyPrefix="committed" />
      )),
    [strokes],
  );

  // Live stroke renders from the UI-thread derived path (non-emoji brushes).
  // Emoji strokes preview through the RN-Text stamp overlay below instead.
  const livePath = liveMeta ? (
    <LiveStrokePath meta={liveMeta} path={livePathSV} />
  ) : null;

  // Emoji-brush stamps render as RN Text over the canvas — the shared
  // deterministic layout matches the committed-layer replay and export.
  const emojiStamps = useMemo(() => {
    const all = liveStroke ? [...strokes, liveStroke] : strokes;
    const out: { key: string; x: number; y: number; size: number; rotation: number; emoji: string }[] = [];
    all.forEach((stroke, i) => {
      if (stroke.brushType !== 'emoji' || !stroke.emojiConfig?.emoji) return;
      const cfg = stroke.emojiConfig;
      layoutEmojiStamps(stroke.points, Math.max(4, cfg.spacing), cfg.jitter, cfg.size, i)
        .forEach((pt, j) => {
          out.push({ key: `${stroke.id}_${j}`, x: pt.x, y: pt.y, size: cfg.size, rotation: pt.rotation, emoji: cfg.emoji });
        });
    });
    return out;
  }, [strokes, liveStroke]);

  if (!visible) return null;

  const brushOpacityFactor =
    brushType === 'marker' ? 0.6 :
    brushType === 'highlighter' ? 0.3 :
    1;
  const isDrawBrush = brushType !== 'eraser' && brushType !== 'emoji';
  const previewBarHeight = Math.min(
    brushType === 'highlighter' ? brushSize * 1.8 : brushSize,
    16,
  );

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
        {/* ── Canvas — full-bleed, no border/shadow/card ── */}
        <Reanimated.View style={[StyleSheet.absoluteFill, canvasStyle]}>
          {backgroundUri ? (
            <ExpoImage
              source={{ uri: backgroundUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : null}

          <View style={styles.canvasCenter}>
            {skiaReady ? (
              <View style={{ width: canvasWidth, height: canvasHeight }}>
                <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
                  {committedPaths}
                  {livePath}
                </Canvas>
                {emojiStamps.length > 0 ? (
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    {emojiStamps.map((s) => (
                      <Text
                        key={s.key}
                        style={{
                          position: 'absolute',
                          left: s.x - s.size / 2,
                          top: s.y - s.size / 2,
                          fontSize: s.size,
                          lineHeight: s.size * 1.15,
                          width: s.size * 1.2,
                          textAlign: 'center',
                          transform: [{ rotate: `${s.rotation}deg` }] }}>
                        {s.emoji}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.fallbackCanvas}>
                <Text style={styles.fallbackText}>
                  Drawing unavailable
                </Text>
                <PressScale
                  onPress={handleRetrySkia}
                  style={[styles.fallbackRetryBtn, { backgroundColor: colors.brand }]}
                  accessibilityLabel="Try again"
                  accessibilityHint="Re-attempts loading the drawing engine"
                  accessibilityRole="button"
                >
                  <Text style={[styles.fallbackRetryText, { color: colors.textInverse }]}>
                    Try again
                  </Text>
                </PressScale>
              </View>
            )}

            <GestureDetector gesture={drawGesture}>
              <View
                style={{
                  position: 'absolute',
                  width: canvasWidth,
                  height: canvasHeight }}
              />
            </GestureDetector>
          </View>
        </Reanimated.View>

        {/* ── Top bar — Close + Done only ── */}
        <View style={[styles.topBar, { paddingTop: insets.top + Space.xs }]}>
          <CreatorIconButton
            icon="close"
            onPress={onClose}
            accessibilityLabel="Close drawing"
            accessibilityHint="Exits the drawing workspace"
            overlay
          />
          <PressScale
            accessibilityLabel="Done"
            accessibilityHint="Saves the drawing and exits"
            onPress={handleDone}
            style={[styles.doneButton, { backgroundColor: colors.brand }]}
          >
            <Text style={[styles.doneText, { color: colors.textInverse }]}>Done</Text>
          </PressScale>
        </View>

        {/* ── Bottom tool panel ── */}
        <Reanimated.View
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, Space.sm),
              borderColor: colors.border },
            panelStyle,
          ]}
          onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
        >
          {/* Tool bar — primary tools, 44pt targets, no labels */}
          <DrawingToolBar
            isDrawBrush={isDrawBrush}
            eraserSelected={brushType === 'eraser'}
            colorPickerSelected={showColorPicker && brushType !== 'emoji'}
            undoDisabled={strokes.length === 0}
            redoDisabled={redoStack.length === 0}
            overflowSelected={showOverflow}
            onBrushTool={handleBrushTool}
            onEraserTool={handleEraserTool}
            onColorTool={handleColorTool}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onToggleOverflow={() => setShowOverflow((v) => !v)}
          />

          {/* Brush picker — horizontal scroll of 36pt pills */}
          <DrawingBrushPills brushType={brushType} onSelectBrush={handleSelectBrush} />

          {/* Color picker — DrawingPaletteBar with curated palettes + custom colors */}
          {brushType !== 'emoji' && showColorPicker && (
            <DrawingPaletteBar
              color={brushColorObj}
              onColorChange={handleColorChange}
              onColorCommit={handleColorCommit}
              recents={recents}
              onCommitRecent={commitRecentColor}
              accessibilityLabel="Drawing stroke color palette"
              accessibilityHint="Choose a stroke color"
            />
          )}

          {/* ── Emoji brush panel (replaces color/size when emoji mode active) ── */}
          {brushType === 'emoji' ? (
            <DrawingEmojiPanel emojiBrush={emojiBrush} setEmojiBrush={setEmojiBrush} />
          ) : (
            <>
              {/* Size slider — label + value + live stroke preview */}
              <View style={styles.sliderRow}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.sliderLabel}>Size</Text>
                  <Text style={styles.sliderValue}>{brushSize}pt</Text>
                </View>
                <View style={styles.sliderWithPreview}>
                  <View style={styles.strokePreview}>
                    <View
                      style={[
                        styles.strokePreviewBar,
                        {
                          height: previewBarHeight,
                          borderRadius: previewBarHeight / 2,
                          backgroundColor: brushType === 'eraser' ? 'transparent' : brushColor,
                          borderWidth: brushType === 'eraser' ? StrokeToken.standard : 0,
                          borderColor: colors.border,
                          opacity: brushType === 'eraser' ? 1 : (brushOpacity / 100) * brushOpacityFactor,
                        },
                      ]}
                    />
                  </View>
                  <CreatorSlider
                    value={brushSize}
                    min={MIN_SIZE}
                    max={MAX_SIZE}
                    step={1}
                    onValueChange={setBrushSize}
                    onCommit={setBrushSize}
                    accessibilityLabel="Brush size"
                    accessibilityHint="Adjusts the stroke width"
                  />
                </View>
              </View>

              {/* Opacity slider — label + value */}
              <View style={styles.sliderRow}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.sliderLabel}>Opacity</Text>
                  <Text style={styles.sliderValue}>{brushOpacity}%</Text>
                </View>
                <CreatorSlider
                  value={brushOpacity}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={setBrushOpacity}
                  onCommit={setBrushOpacity}
                  accessibilityLabel="Brush opacity"
                  accessibilityHint="Adjusts the stroke opacity"
                />
              </View>
            </>
          )}
        </Reanimated.View>

        {/* ── Overflow menu — Clear ── */}
        {showOverflow && (
          <Pressable
            style={styles.overflowBackdrop}
            onPress={() => setShowOverflow(false)}
            accessibilityLabel="Dismiss menu"
            accessibilityHint="Closes the overflow menu"
            accessibilityRole="button"
          >
            <View
              style={[
                styles.overflowMenu,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                  bottom: panelHeight + Space.xs },
              ]}
            >
              <Pressable
                onPress={handleClear}
                style={styles.overflowItem}
                accessibilityLabel="Clear drawing"
                accessibilityHint="Erases all strokes"
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.overflowItemText}>Clear</Text>
              </Pressable>
            </View>
          </Pressable>
        )}
      </View>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
      />
    </GestureHandlerRootView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    canvasCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center' },
    fallbackCanvas: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt },
    fallbackText: {
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      fontFamily: FontFamily.regular },
    fallbackRetryBtn: {
      marginTop: Space.md,
      height: 44,
      paddingHorizontal: Space.lg,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center' },
    fallbackRetryText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size },
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm,
      zIndex: 10 },
    doneButton: {
      height: 50,
      paddingHorizontal: Space.lg,
      borderRadius: Radius.lg,
      alignItems: 'center',
      justifyContent: 'center' },
    doneText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    panel: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      borderTopWidth: StrokeToken.standard,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      gap: Space.sm },
    // ── Sliders ──
    sliderRow: {
      gap: Space.xs },
    sliderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between' },
    sliderLabel: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.captionElevated.size,
      lineHeight: 18,
      color: colors.textSecondary },
    sliderValue: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textMuted },
    sliderWithPreview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    strokePreview: {
      width: 40,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center' },
    strokePreviewBar: {
      width: 40 },
    // ── Overflow menu ──
    overflowBackdrop: {
      ...StyleSheet.absoluteFill,
      zIndex: 20 },
    overflowMenu: {
      position: 'absolute',
      right: Space.md,
      borderRadius: Radius.md,
      borderWidth: StrokeToken.standard,
      ...Elevation.floating },
    overflowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    overflowItemText: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textPrimary } });
}
