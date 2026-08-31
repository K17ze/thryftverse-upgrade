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
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  withTiming,
  withSpring,
  Easing } from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Canvas,
  Group,
  Path as SkiaPath,
  Paint as SkiaPaint,
  Skia,
  Text as SkiaText,
  useFont,
  Image as SkiaImage } from '@shopify/react-native-skia';
import { Image as ExpoImage } from 'expo-image';

import { Space, Radius, FontFamily, Elevation, Stroke as StrokeToken, Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { IconGrammar } from '../../../theme/designTokens';
import { Motion, REDUCED_SPRING } from '../../../theme/motionTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { ConfirmationSheet } from '../../../components/ConfirmationSheet';
import { PressScale } from '../../CreatorAnimations';
import {
  CreatorSlider,
  CreatorSegmentControl,
  CreatorIconButton,
  type SegmentOption } from '../../controls';
import {
  useCreatorColorHistory,
  toHexString,
  fromHexString,
  normalize } from '../../color/';
import type { CreatorColor } from '../../color/';
import type { BrushType, DrawingDocument, EmojiBrushConfig, Stroke } from './DrawingTypes';
import { DrawingPaletteBar } from './DrawingPaletteBar';

// ─────────────────────────────────────────────────────────────────────────────
// Skia availability guard
// ─────────────────────────────────────────────────────────────────────────────
let skiaAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SkiaModule = require('@shopify/react-native-skia');
  skiaAvailable = !!(SkiaModule && SkiaModule.Canvas && SkiaModule.Skia);
} catch {
  skiaAvailable = false;
}

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

const BRUSH_PILLS: { label: string; value: BrushType }[] = [
  { label: 'Pen', value: 'pen' },
  { label: 'Marker', value: 'marker' },
  { label: 'Highlighter', value: 'highlighter' },
  { label: 'Neon', value: 'neon' },
  { label: 'Eraser', value: 'eraser' },
  { label: 'Emoji', value: 'emoji' },
];

// ── Emoji picker catalog (Snapchat emoji-brush parity) ────────────────────
interface EmojiCategory {
  id: string;
  name: string;
  emojis: string[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'faces',
    name: 'Faces',
    emojis: ['😀', '😍', '🥰', '😎', '🤩', '😂', '🥳', '😭', '🤔', '😴', '🤯', '😱'] },
  {
    id: 'hearts',
    name: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💖'] },
  {
    id: 'hands',
    name: 'Hands',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '🤟', '👋', '🤙', '👌', '💪'] },
  {
    id: 'animals',
    name: 'Animals',
    emojis: ['🐶', '🐱', '🦄', '🦋', '🐝', '🦋', '🐢', '🦊', '🐼', '🦁', '🐯', '🐸'] },
  {
    id: 'food',
    name: 'Food',
    emojis: ['🍕', '🍔', '🍟', '🌮', '🍣', '🍩', '🍦', '🍓', '🍉', '🥑', '🌶️', '🍿'] },
  {
    id: 'symbols',
    name: 'Symbols',
    emojis: ['🔥', '✨', '⭐', '💯', '🎉', '👑', '💎', '🚀', '🌈', '☀️', '❄️', '⚡'] },
];

const DEFAULT_EMOJI = '🔥';
const EMOJI_MIN_SIZE = 16;
const EMOJI_MAX_SIZE = 80;
const EMOJI_MIN_SPACING = 8;
const EMOJI_MAX_SPACING = 80;

const MIN_SIZE = 1;
const MAX_SIZE = 50;
const MAX_UNDO_LEVELS = 50;

const SNAP_TIMING = { duration: 120, easing: Easing.out(Easing.cubic) };

// ─────────────────────────────────────────────────────────────────────────────
// Catmull-Rom spline → Skia Path (GPU-smoothed strokes)
// ─────────────────────────────────────────────────────────────────────────────
type SkPath = ReturnType<typeof Skia.Path.Make>;

function smoothPathToSkia(points: { x: number; y: number }[], tension = 0.5): SkPath | null {
  if (!skiaAvailable || points.length === 0) return null;
  const path = Skia.Path.Make();
  if (points.length === 1) {
    path.moveTo(points[0].x, points[0].y);
    return path;
  }
  if (points.length === 2) {
    path.moveTo(points[0].x, points[0].y);
    path.lineTo(points[1].x, points[1].y);
    return path;
  }
  path.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    path.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  return path;
}

// ─────────────────────────────────────────────────────────────────────────────
// Emoji stamp spacing — compute stamp points along a polyline at `spacing` px
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Walk along the polyline `points` and emit stamp positions every `spacing` px.
 * The first point is always stamped; subsequent stamps are placed at cumulative
 * distance `spacing` along the path. This mirrors Snapchat's emoji-brush behavior
 * where stamps are spaced, not placed on every touch sample.
 */
function computeStampPoints(
  points: { x: number; y: number }[],
  spacing: number,
  jitter: number,
  stampSize: number,
): { x: number; y: number; rotation: number }[] {
  if (points.length === 0) return [];
  const stamps: { x: number; y: number; rotation: number }[] = [];
  const jitterRange = jitter * stampSize * 0.5;

  const makeStamp = (x: number, y: number) => ({
    x: x + (Math.random() - 0.5) * jitterRange,
    y: y + (Math.random() - 0.5) * jitterRange,
    rotation: (Math.random() - 0.5) * 30 });

  stamps.push(makeStamp(points[0]!.x, points[0]!.y));

  if (points.length === 1) return stamps;

  let accumulated = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (segLen === 0) continue;
    accumulated += segLen;
    while (accumulated >= spacing) {
      // Back up along the segment to the exact stamp position
      const overshoot = accumulated - spacing;
      const t = 1 - overshoot / segLen;
      stamps.push(makeStamp(prev.x + dx * t, prev.y + dy * t));
      accumulated -= spacing;
    }
  }
  return stamps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-stroke Skia renderer (memoized)
// ─────────────────────────────────────────────────────────────────────────────
interface StrokePathProps {
  stroke: Stroke;
  keyPrefix: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// EmojiStamp — renders a single emoji glyph via Skia text.
// Uses the system emoji font (Apple Color Emoji on iOS, Noto Color Emoji on
// Android). Falls back to a plain RN Text overlay when the font is unavailable.
// ─────────────────────────────────────────────────────────────────────────────
interface EmojiStampProps {
  emoji: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

const EmojiStamp = React.memo(function EmojiStamp({
  emoji,
  x,
  y,
  size,
  rotation }: EmojiStampProps) {
  const { colors } = useAppTheme();
  // useFont returns null until the font is loaded. We request the system
  // emoji font; on iOS this is "Apple Color Emoji", on Android "NotoColorEmoji".
  // Skia resolves these by family name from the platform font collection.
  const font = useFont('Apple Color Emoji', size);
  if (!font) return null;
  // Skia Text baseline: y is the baseline position. Offset by size*0.8 so the
  // emoji is visually centered on the stamp point.
  const baselineY = y + size * 0.8;
  return (
    <SkiaText
      text={emoji}
      x={x - size * 0.4}
      y={baselineY}
      font={font}
      color={colors.scrimTextPrimary}
      transform={[{ rotate: rotation }, { translateX: x }, { translateY: y }]}
    />
  );
});

const StrokePath = React.memo(function StrokePath({ stroke, keyPrefix }: StrokePathProps) {
  if (!skiaAvailable) return null;

  const userOpacity = stroke.opacity ?? 1;

  if (stroke.brushType === 'eraser') {
    const path = smoothPathToSkia(stroke.points);
    if (!path) return null;
    return (
      <SkiaPath
        key={`${keyPrefix}_${stroke.id}`}
        path={path}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        strokeWidth={stroke.size * 2}
      >
        <SkiaPaint color="#000000" blendMode="dstOut" opacity={1} />
      </SkiaPath>
    );
  }

  // ── Emoji brush: render emoji glyphs as text at spaced stamp points ──
  if (stroke.brushType === 'emoji') {
    const cfg = stroke.emojiConfig;
    if (!cfg || !cfg.emoji) return null;
    const stamps = computeStampPoints(stroke.points, cfg.spacing, cfg.jitter, cfg.size);
    if (stamps.length === 0) return null;
    return (
      <Group key={`${keyPrefix}_${stroke.id}`}>
        {stamps.map((stamp, i) => (
          <EmojiStamp
            key={`${keyPrefix}_emoji_${stroke.id}_${i}`}
            emoji={cfg.emoji}
            x={stamp.x}
            y={stamp.y}
            size={cfg.size}
            rotation={stamp.rotation}
          />
        ))}
      </Group>
    );
  }

  const path = smoothPathToSkia(stroke.points);
  if (!path) return null;

  if (stroke.brushType === 'highlighter') {
    return (
      <SkiaPath
        key={`${keyPrefix}_${stroke.id}`}
        path={path}
        style="stroke"
        strokeCap="butt"
        strokeJoin="round"
        strokeWidth={stroke.size * 1.8}
      >
        <SkiaPaint color={stroke.color} blendMode="multiply" opacity={0.3 * userOpacity} />
      </SkiaPath>
    );
  }

  if (stroke.brushType === 'neon') {
    return (
      <Group key={`${keyPrefix}_${stroke.id}`} blendMode="plus">
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.size * 3}>
          <SkiaPaint color={stroke.color} blendMode="plus" opacity={0.15 * userOpacity} />
        </SkiaPath>
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.size * 2}>
          <SkiaPaint color={stroke.color} blendMode="plus" opacity={0.3 * userOpacity} />
        </SkiaPath>
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.size}>
          <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={1 * userOpacity} />
        </SkiaPath>
      </Group>
    );
  }

  if (stroke.brushType === 'marker') {
    return (
      <SkiaPath
        key={`${keyPrefix}_${stroke.id}`}
        path={path}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        strokeWidth={stroke.size * 1.25}
      >
        <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={0.6 * userOpacity} />
      </SkiaPath>
    );
  }

  // pen — solid, full opacity
  return (
    <SkiaPath
      key={`${keyPrefix}_${stroke.id}`}
      path={path}
      style="stroke"
      strokeCap="round"
      strokeJoin="round"
      strokeWidth={stroke.size}
    >
      <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={userOpacity} />
    </SkiaPath>
  );
});

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
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
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
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<string>('faces');

  // ── Emoji category underline indicator (spring-animated, brand color) ──
  const haptic = useHaptic();
  const emojiTabLayouts = useRef<{ x: number; width: number }[]>([]);
  const emojiUnderlineXSV = useSharedValue(0);
  const emojiUnderlineWSV = useSharedValue(0);
  const emojiSpringCfg = reduceMotion ? REDUCED_SPRING : Motion.spring.indicator;

  const applyEmojiUnderline = useCallback(
    (idx: number) => {
      const lay = emojiTabLayouts.current[idx];
      if (!lay) return;
      if (reduceMotion) {
        emojiUnderlineXSV.value = lay.x;
        emojiUnderlineWSV.value = lay.width;
      } else {
        emojiUnderlineXSV.value = withSpring(lay.x, emojiSpringCfg);
        emojiUnderlineWSV.value = withSpring(lay.width, emojiSpringCfg);
      }
    },
    [reduceMotion, emojiSpringCfg, emojiUnderlineXSV, emojiUnderlineWSV],
  );

  const handleSelectEmojiCategory = useCallback(
    (idx: number, id: string) => {
      haptic.selection();
      setActiveEmojiCategory(id);
      applyEmojiUnderline(idx);
    },
    [haptic, applyEmojiUnderline],
  );

  const emojiUnderlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: emojiUnderlineXSV.value }],
    width: emojiUnderlineWSV.value }));

  // Recent color history (persisted via AsyncStorage, spec §4).
  const { recents, commitColor: commitRecentColor } = useCreatorColorHistory();

  // ── Live stroke (UI-thread driven, no per-point React state) ──
  const currentPointsRef = useRef<{ x: number; y: number }[]>([]);
  const currentMetaRef = useRef<Stroke | null>(null);
  const renderTickSV = useSharedValue(0);
  const lastRenderRef = useRef(0);
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);

  const throttledRender = useCallback((tick: number) => {
    const now = Date.now();
    if (now - lastRenderRef.current > 16 || tick === -1) {
      lastRenderRef.current = now;
      if (tick === -1) {
        setLiveStroke(null);
      } else if (currentMetaRef.current && currentPointsRef.current.length > 0) {
        setLiveStroke({
          ...currentMetaRef.current,
          points: currentPointsRef.current });
      }
    }
  }, []);

  useAnimatedReaction(
    () => renderTickSV.value,
    (tick) => {
      runOnJS(throttledRender)(tick);
    },
  );

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
      setStrokes([]);
      setRedoStack([]);
      setLiveStroke(null);
      currentPointsRef.current = [];
      currentMetaRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelTranslateY.value }],
    opacity: panelOpacity.value }));

  const canvasStyle = useAnimatedStyle(() => ({
    opacity: canvasOpacity.value }));

  // ── Stroke lifecycle (called from gesture worklet via runOnJS) ──
  const startStroke = useCallback(
    (x: number, y: number) => {
      currentPointsRef.current = [{ x, y }];
      currentMetaRef.current = {
        id: `stroke_${Date.now()}`,
        brushType,
        color: brushType === 'eraser' ? '#000000' : brushColor,
        size: brushSize,
        opacity: brushOpacity / 100,
        points: [],
        emojiConfig: brushType === 'emoji' ? { ...emojiBrush } : undefined };
      renderTickSV.value = renderTickSV.value + 1;
    },
    [brushType, brushColor, brushSize, brushOpacity, emojiBrush, renderTickSV],
  );

  const addPoint = useCallback(
    (x: number, y: number) => {
      if (!currentMetaRef.current) return;
      const pts = currentPointsRef.current;
      const last = pts[pts.length - 1];
      const dx = x - last.x;
      const dy = y - last.y;
      if (dx * dx + dy * dy > 4) {
        pts.push({ x, y });
        renderTickSV.value = renderTickSV.value + 1;
      }
    },
    [renderTickSV],
  );

  const commitStroke = useCallback(() => {
    if (!currentMetaRef.current) return;
    const stroke: Stroke = {
      ...currentMetaRef.current,
      points: currentPointsRef.current };
    if (stroke.points.length > 0) {
      setStrokes((prev) => [...prev, stroke].slice(-MAX_UNDO_LEVELS));
      setRedoStack([]);
    }
    currentPointsRef.current = [];
    currentMetaRef.current = null;
    renderTickSV.value = -1;
  }, [renderTickSV]);

  // ── Pan gesture ──
  const drawGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(0)
        .onBegin((e) => {
          'worklet';
          runOnJS(startStroke)(e.x, e.y);
        })
        .onChange((e) => {
          'worklet';
          runOnJS(addPoint)(e.x, e.y);
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitStroke)();
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(commitStroke)();
        }),
    [startStroke, addPoint, commitStroke],
  );

  // ── Toolbar actions ──
  const handleUndo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setStrokes((s) => [...s, last]);
      return prev.slice(0, -1);
    });
  }, []);

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
  }, [strokes]);

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

  const livePath = useMemo(
    () => (liveStroke ? <StrokePath stroke={liveStroke} keyPrefix="live" /> : null),
    [liveStroke],
  );

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
            {skiaAvailable ? (
              <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
                {committedPaths}
                {livePath}
              </Canvas>
            ) : (
              <View style={styles.fallbackCanvas}>
                <Text style={styles.fallbackText}>
                  Drawing unavailable
                </Text>
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
            overlay
          />
          <PressScale
            accessibilityLabel="Done"
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
          <View style={styles.toolBar}>
            <CreatorIconButton
              icon="brush-outline"
              size={24}
              hitTarget={Control.hit}
              selected={isDrawBrush}
              onPress={handleBrushTool}
              accessibilityLabel="Brush tool"
            />
            <CreatorIconButton
              icon="backspace-outline"
              size={24}
              hitTarget={Control.hit}
              selected={brushType === 'eraser'}
              onPress={handleEraserTool}
              accessibilityLabel="Eraser tool"
            />
            <CreatorIconButton
              icon="color-palette-outline"
              size={24}
              hitTarget={Control.hit}
              selected={showColorPicker && brushType !== 'emoji'}
              onPress={handleColorTool}
              accessibilityLabel="Color picker"
            />
            <CreatorIconButton
              icon="arrow-undo"
              size={20}
              hitTarget={Control.hit}
              color={colors.textPrimary}
              disabled={strokes.length === 0}
              onPress={handleUndo}
              accessibilityLabel="Undo"
              accessibilityHint="Undo the last stroke"
            />
            <CreatorIconButton
              icon="arrow-redo"
              size={20}
              hitTarget={Control.hit}
              color={colors.textPrimary}
              disabled={redoStack.length === 0}
              onPress={handleRedo}
              accessibilityLabel="Redo"
              accessibilityHint="Redo the last undone stroke"
            />
            <CreatorIconButton
              icon="ellipsis-horizontal"
              size={24}
              hitTarget={Control.hit}
              selected={showOverflow}
              onPress={() => setShowOverflow((v) => !v)}
              accessibilityLabel="More options"
            />
          </View>

          {/* Brush picker — horizontal scroll of 36pt pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.brushPillsContent}
          >
            {BRUSH_PILLS.map((pill) => {
              const selected = pill.value === brushType;
              return (
                <Pressable
                  key={pill.value}
                  onPress={() => handleSelectBrush(pill.value)}
                  accessibilityLabel={`${pill.label} brush`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.brushPill,
                    {
                      backgroundColor: selected ? colors.surfaceAlt : 'transparent' },
                  ]}
                >
                  <Text
                    style={[
                      styles.brushPillText,
                      { color: selected ? colors.textPrimary : colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {pill.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Color picker — DrawingPaletteBar with curated palettes + custom colors */}
          {brushType !== 'emoji' && showColorPicker && (
            <DrawingPaletteBar
              color={brushColorObj}
              onColorChange={handleColorChange}
              onColorCommit={handleColorCommit}
              recents={recents}
              onCommitRecent={commitRecentColor}
              accessibilityLabel="Drawing stroke color palette"
            />
          )}

          {/* ── Emoji brush panel (replaces color/size when emoji mode active) ── */}
          {brushType === 'emoji' ? (
            <View style={styles.emojiPanel}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.emojiTabsContent}
                style={styles.emojiTabs}
              >
                {EMOJI_CATEGORIES.map((cat, idx) => {
                  const active = cat.id === activeEmojiCategory;
                  return (
                    <PressScale
                      key={cat.id}
                      accessibilityLabel={`${cat.name} emoji category`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => handleSelectEmojiCategory(idx, cat.id)}
                      onLayout={(e) => {
                        emojiTabLayouts.current[idx] = {
                          x: e.nativeEvent.layout.x,
                          width: e.nativeEvent.layout.width };
                        if (active) applyEmojiUnderline(idx);
                      }}
                      style={styles.emojiTab}
                    >
                      <Text
                        style={[styles.emojiTabLabel, active && styles.emojiTabLabelActive]}
                        numberOfLines={1}
                      >
                        {cat.name}
                      </Text>
                    </PressScale>
                  );
                })}
                <Reanimated.View
                  style={[styles.emojiTabUnderline, { backgroundColor: colors.brand }, emojiUnderlineStyle]}
                  pointerEvents="none"
                />
              </ScrollView>

              <View style={styles.emojiGrid}>
                {(EMOJI_CATEGORIES.find((c) => c.id === activeEmojiCategory) ?? EMOJI_CATEGORIES[0]!).emojis.map(
                  (em) => {
                    const selected = em === emojiBrush.emoji;
                    return (
                      <Pressable
                        key={em}
                        onPress={() => setEmojiBrush((prev) => ({ ...prev, emoji: em }))}
                        accessibilityLabel={`Select ${em} emoji`}
                        accessibilityRole="button"
                        hitSlop={2}
                        style={[
                          styles.emojiCell,
                          { borderColor: selected ? colors.brand : 'transparent' },
                        ]}
                      >
                        <Text style={styles.emojiCellText}>{em}</Text>
                      </Pressable>
                    );
                  },
                )}
              </View>

              <View style={styles.sizeRow}>
                <Text style={styles.emojiSizePreview}>{emojiBrush.emoji}</Text>
                <CreatorSlider
                  value={emojiBrush.size}
                  min={EMOJI_MIN_SIZE}
                  max={EMOJI_MAX_SIZE}
                  step={2}
                  onValueChange={(v) => setEmojiBrush((prev) => ({ ...prev, size: v }))}
                  onCommit={(v) => setEmojiBrush((prev) => ({ ...prev, size: v }))}
                  accessibilityLabel="Emoji stamp size"
                />
              </View>

              <View style={styles.sizeRow}>
                <Ionicons
                  name="resize-outline"
                  size={IconGrammar.metadata}
                  color={colors.textSecondary}
                  accessibilityLabel="Spacing"
                />
                <CreatorSlider
                  value={emojiBrush.spacing}
                  min={EMOJI_MIN_SPACING}
                  max={EMOJI_MAX_SPACING}
                  step={2}
                  onValueChange={(v) => setEmojiBrush((prev) => ({ ...prev, spacing: v }))}
                  onCommit={(v) => setEmojiBrush((prev) => ({ ...prev, spacing: v }))}
                  accessibilityLabel="Emoji stamp spacing"
                />
              </View>
            </View>
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
    // ── Tool bar ──
    toolBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    // ── Brush picker pills ──
    brushPillsContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xxs },
    brushPill: {
      height: 36,
      paddingHorizontal: Space.md,
      borderRadius: Radius.sm,
      alignItems: 'center',
      justifyContent: 'center' },
    brushPillText: {
      fontFamily: FontFamily.medium,
      fontSize: 13,
      lineHeight: 18 },
    // ── Sliders ──
    sliderRow: {
      gap: Space.xs },
    sliderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between' },
    sliderLabel: {
      fontFamily: FontFamily.regular,
      fontSize: 13,
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
    sizeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
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
      color: colors.textPrimary },
    // ── Emoji brush panel ──
    emojiPanel: {
      gap: Space.sm },
    emojiTabs: {
      flexGrow: 0 },
    emojiTabsContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingRight: Space.md,
      position: 'relative' },
    emojiTab: {
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    emojiTabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      height: StrokeToken.emphasis,
      borderRadius: StrokeToken.emphasis },
    emojiTabLabel: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textSecondary },
    emojiTabLabelActive: {
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary },
    emojiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs },
    emojiCell: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.sm,
      borderWidth: StrokeToken.emphasis,
      alignItems: 'center',
      justifyContent: 'center' },
    emojiCellText: {
      fontSize: TypographyV2.hero.size,
      lineHeight: 32 },
    emojiSizePreview: {
      fontSize: TypographyV2.display.size,
      width: Control.chrome,
      textAlign: 'center' } });
}
