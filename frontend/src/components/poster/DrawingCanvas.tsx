import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Modal,
  Platform,
} from 'react-native';
// Skia provides GPU-accelerated 2D rendering for all brush strokes.
// The try/catch prevents a hard runtime crash if the package is missing.
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Canvas,
  Path as SkiaPath,
  Paint as SkiaPaint,
  Skia,
  Group,
} from '@shopify/react-native-skia';
import { Typography, Radius, Space, Stroke } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { AnimatedPressable } from '../AnimatedPressable';
import { hslToHex, hexToHsl, isLightColor } from './shared/colorUtils';
import { BrushPicker } from './drawing/BrushPicker';
import { ColorPickerPanel } from './drawing/ColorPickerPanel';
import { SizePickerPanel } from './drawing/SizePickerPanel';

export type BrushType = 'marker' | 'highlighter' | 'neon' | 'pencil' | 'eraser' | 'arrow';

export interface BrushStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  brushType?: BrushType;
}

interface DrawingCanvasProps {
  strokes: BrushStroke[];
  onStrokesChange: (strokes: BrushStroke[]) => void;
  canvasSize: { width: number; height: number };
  isActive: boolean;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level Skia availability flag — the try/catch prevents a hard runtime
// crash if @shopify/react-native-skia is not installed. When unavailable we
// render a harmless fallback so the app can still run.
// ─────────────────────────────────────────────────────────────────────────────
let skiaAvailable = false;
try {
  // Skia is imported at the top-level via ES module syntax; this runtime
  // check simply verifies the native module is present.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const SkiaModule = require('@shopify/react-native-skia');
  skiaAvailable = !!(SkiaModule && SkiaModule.Canvas && SkiaModule.Skia);
} catch (e) {
  skiaAvailable = false;
}

// BRUSH_TYPE_OPTIONS is defined in ./drawing/BrushPicker.tsx (single source of truth).
// BrushPicker, ColorPickerPanel, and SizePickerPanel components are imported from
// ./drawing/ and use the shared ColorSlider primitives from ./shared/ColorSlider.tsx.

// 12 preset color swatches — used only in this file's inline preset palette,
// so kept local rather than extracted to a shared module.
const PRESET_COLORS = [
  '#000000', '#FFFFFF', '#E53935', '#FB8C00', '#FDD835',
  '#43A047', '#00ACC1', '#1E88E5', '#8E24AA', '#EC407A',
  '#795548', '#9E9E9E',
];

const MAX_UNDO_LEVELS = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Catmull-Rom spline → Skia Path
// Smoothing factor 0.5 — balanced between smooth and responsive.
// This is the #1 thing that makes drawing feel "premium" vs "cheap".
// Uses Skia.Path.Make() with cubicTo for GPU-accelerated smooth curves.
// ─────────────────────────────────────────────────────────────────────────────
function smoothPathToSkia(points: { x: number; y: number }[], tension = 0.5): any {
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

// Arrowhead triangle at the end of a stroke — returns a Skia Path
function arrowheadSkiaPath(points: { x: number; y: number }[], headSize: number): any {
  if (!skiaAvailable || points.length < 2) return null;
  const p1 = points[points.length - 2];
  const p2 = points[points.length - 1];
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const a1 = angle + Math.PI - 0.4;
  const a2 = angle + Math.PI + 0.4;
  const x1 = p2.x + Math.cos(a1) * headSize;
  const y1 = p2.y + Math.sin(a1) * headSize;
  const x2 = p2.x + Math.cos(a2) * headSize;
  const y2 = p2.y + Math.sin(a2) * headSize;
  const path = Skia.Path.Make();
  path.moveTo(p2.x, p2.y);
  path.lineTo(x1, y1);
  path.lineTo(x2, y2);
  path.close();
  return path;
}

// ─────────────────────────────────────────────────────────────────────────────
// Memoized single-stroke Skia renderer — avoids re-rendering all strokes when
// only the in-progress stroke changes. Uses GPU-accelerated Skia paths with
// blend modes for each brush type.
// ─────────────────────────────────────────────────────────────────────────────
interface StrokePathProps {
  stroke: BrushStroke;
  keyPrefix: string;
}

const StrokePath = React.memo(function StrokePath({ stroke, keyPrefix }: StrokePathProps) {
  if (!skiaAvailable) return null;
  const type = stroke.brushType ?? 'marker';
  if (type === 'eraser') return null; // eraser strokes are rendered via blend mode

  const path = smoothPathToSkia(stroke.points);
  if (!path) return null;

  // ── Highlighter: multiply blend, 0.4 opacity, flat cap ──
  if (type === 'highlighter') {
    return (
      <SkiaPath
        key={`${keyPrefix}_${stroke.id}`}
        path={path}
        style="stroke"
        strokeCap="butt"
        strokeJoin="round"
        strokeWidth={stroke.width}
      >
        <SkiaPaint color={stroke.color} blendMode="multiply" opacity={0.4} />
      </SkiaPath>
    );
  }

  // ── Neon: additive blend with glow halo (3-layer: wide faint + medium + core) ──
  if (type === 'neon') {
    return (
      <Group key={`${keyPrefix}_${stroke.id}`} blendMode="plus">
        {/* Wide faint halo */}
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.width * 3}>
          <SkiaPaint color={stroke.color} blendMode="plus" opacity={0.15} />
        </SkiaPath>
        {/* Medium glow */}
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.width * 2}>
          <SkiaPaint color={stroke.color} blendMode="plus" opacity={0.3} />
        </SkiaPath>
        {/* Bright inner core */}
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.width}>
          <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={1} />
        </SkiaPath>
      </Group>
    );
  }

  // ── Pencil: normal blend, 0.8 opacity, thinner ──
  if (type === 'pencil') {
    return (
      <SkiaPath
        key={`${keyPrefix}_${stroke.id}`}
        path={path}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        strokeWidth={stroke.width * 0.7}
      >
        <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={0.8} />
      </SkiaPath>
    );
  }

  // ── Arrow: stroke + filled arrowhead triangle at end ──
  if (type === 'arrow') {
    const headSize = Math.max(stroke.width * 2.5, 12);
    const headPath = arrowheadSkiaPath(stroke.points, headSize);
    return (
      <Group key={`${keyPrefix}_${stroke.id}`}>
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.width}>
          <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={1} />
        </SkiaPath>
        {headPath && (
          <SkiaPath path={headPath} style="fill" strokeJoin="round" strokeWidth={1}>
            <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={1} />
          </SkiaPath>
        )}
      </Group>
    );
  }

  // ── Marker: normal blend, opaque, rounded (default) ──
  return (
    <SkiaPath
      key={`${keyPrefix}_${stroke.id}`}
      path={path}
      style="stroke"
      strokeCap="round"
      strokeJoin="round"
      strokeWidth={stroke.width}
    >
      <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={1} />
    </SkiaPath>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// HSL color slider + size slider sub-components have been extracted to:
//   - poster/drawing/BrushPicker.tsx   (brush type selector)
//   - poster/drawing/ColorPickerPanel.tsx (custom HSL color picker)
//   - poster/drawing/SizePickerPanel.tsx   (brush size slider)
//   - poster/shared/ColorSlider.tsx        (HueSlider, SaturationLightnessSlider, SizeSlider)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Clear confirmation ActionSheet — Modal-based, spring entrance
// ─────────────────────────────────────────────────────────────────────────────
interface ClearConfirmationSheetProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  colors: any;
  styles: ReturnType<typeof createStyles>;
  reducedMotion: boolean;
}

function ClearConfirmationSheet({
  visible,
  onCancel,
  onConfirm,
  colors,
  styles,
  reducedMotion,
}: ClearConfirmationSheetProps) {
  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);

  React.useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, {
        damping: reducedMotion ? 100 : 22,
        stiffness: reducedMotion ? 1000 : 180,
        mass: 1.0,
      });
      backdropOpacity.value = withTiming(1, { duration: reducedMotion ? 0 : Motion.duration.normal });
    } else {
      translateY.value = withSpring(400, {
        damping: reducedMotion ? 100 : 22,
        stiffness: reducedMotion ? 1000 : 180,
        mass: 1.0,
      });
      backdropOpacity.value = withTiming(0, { duration: reducedMotion ? 0 : Motion.duration.normal });
    }
  }, [visible, reducedMotion, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Reanimated.View style={[styles.confirmBackdrop, backdropStyle]}>
        <PressableBackdrop onPress={onCancel} styles={styles} />
        <Reanimated.View style={[styles.confirmSheet, { backgroundColor: colors.surface }, sheetStyle]}>
          <View style={[styles.confirmHandle, { backgroundColor: colors.borderSubtle }]} />
          <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
            Clear all drawings?
          </Text>
          <Text style={[styles.confirmSubtitle, { color: colors.textSecondary }]}>
            This will remove every stroke from the canvas. You can undo afterwards.
          </Text>
          <View style={styles.confirmActions}>
            <AnimatedPressable
              style={[styles.confirmCancelBtn, { backgroundColor: colors.surfaceAlt }]}
              onPress={onCancel}
              scaleValue={0.96}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityLabel="Cancel clearing"
              accessibilityRole="button"
            >
              <Text style={[styles.confirmCancelText, { color: colors.textPrimary }]}>Cancel</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.confirmClearBtn, { backgroundColor: colors.danger }]}
              onPress={onConfirm}
              scaleValue={0.96}
              activeOpacity={0.85}
              hapticFeedback="medium"
              accessibilityLabel="Confirm clear all drawings"
              accessibilityRole="button"
            >
              <Text style={styles.confirmClearText}>Clear</Text>
            </AnimatedPressable>
          </View>
        </Reanimated.View>
      </Reanimated.View>
    </Modal>
  );
}

function PressableBackdrop({ onPress, styles }: { onPress: () => void; styles: ReturnType<typeof createStyles> }) {
  return (
    <AnimatedPressable
      style={styles.confirmBackdropPress}
      onPress={onPress}
      activeOpacity={1}
      hapticFeedback="light"
      accessibilityLabel="Cancel clearing"
      accessibilityRole="button"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main DrawingCanvas component
// ─────────────────────────────────────────────────────────────────────────────
export default function DrawingCanvas({ strokes, onStrokesChange, canvasSize, isActive, onClose }: DrawingCanvasProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring, isEnabled } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // ── Brush state ──
  const [brushColor, setBrushColor] = React.useState(colors.danger);
  const [brushWidth, setBrushWidth] = React.useState(6);
  const [brushType, setBrushType] = React.useState<BrushType>('marker');
  const [redoStack, setRedoStack] = React.useState<BrushStroke[]>([]);
  const [recentColors, setRecentColors] = React.useState<string[]>([]);
  const [showCustomColor, setShowCustomColor] = React.useState(false);
  const [hsl, setHsl] = React.useState(() => hexToHsl(colors.danger));
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);

  // ── Drawing performance: refs for in-progress stroke (avoid re-renders) ──
  // Points accumulate in a mutable ref — no O(n²) array copying on each move.
  // A Reanimated shared value acts as a render trigger; an animated reaction
  // bridges to a throttled JS state update so the live stroke is visible.
  const currentPointsRef = React.useRef<{ x: number; y: number }[]>([]);
  const currentStrokeMetaRef = React.useRef<BrushStroke | null>(null);
  const renderTickSV = useSharedValue(0);
  const [, setRenderTick] = React.useState(0);
  const lastRenderRef = React.useRef(0);

  // throttledRender must be stable — defined via useCallback before the
  // animated reaction that references it (avoids temporal dead zone).
  const throttledRender = React.useCallback((tick: number) => {
    const now = Date.now();
    if (now - lastRenderRef.current > 16 || tick === -1) {
      lastRenderRef.current = now;
      setRenderTick(tick === -1 ? 0 : tick + 1);
    }
  }, []);

  // Bridge shared-value render tick → throttled React state update
  useAnimatedReaction(
    () => renderTickSV.value,
    (tick) => {
      runOnJS(throttledRender)(tick);
    }
  );

  // ── Tool panel spring entrance ──
  const panelTranslateY = useSharedValue(300);
  const panelOpacity = useSharedValue(0);

  React.useEffect(() => {
    if (isActive) {
      panelTranslateY.value = withSpring(0, spring.entrance);
      panelOpacity.value = withTiming(1, { duration: isEnabled ? Motion.duration.normal : 0 });
      haptic.light();
    }
  }, [isActive, panelTranslateY, panelOpacity, spring, isEnabled, haptic]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelTranslateY.value }],
    opacity: panelOpacity.value,
  }));

  // ── Undo/Redo button spring visibility ──
  const undoScale = useSharedValue(0);
  const redoScale = useSharedValue(0);

  React.useEffect(() => {
    undoScale.value = withSpring(strokes.length > 0 ? 1 : 0, spring.tap);
  }, [strokes.length, undoScale, spring]);

  React.useEffect(() => {
    redoScale.value = withSpring(redoStack.length > 0 ? 1 : 0, spring.tap);
  }, [redoStack.length, redoScale, spring]);

  const undoBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: undoScale.value }],
    opacity: undoScale.value,
  }));

  const redoBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: redoScale.value }],
    opacity: redoScale.value,
  }));

  // ── Color helpers ──
  const pushRecentColor = React.useCallback((c: string) => {
    setRecentColors((prev) => {
      const filtered = prev.filter((x) => x !== c);
      return [c, ...filtered].slice(0, 6);
    });
  }, []);

  const handleBrushColor = React.useCallback((c: string) => {
    setBrushColor(c);
    pushRecentColor(c);
    haptic.light();
  }, [haptic, pushRecentColor]);

  const handleBrushWidth = React.useCallback((w: number) => {
    setBrushWidth(w);
  }, []);

  const handleBrushType = React.useCallback((t: BrushType) => {
    setBrushType(t);
    haptic.light();
  }, [haptic]);

  const handleHslChange = React.useCallback((newHsl: { h: number; s: number; l: number }) => {
    setHsl(newHsl);
    const hex = hslToHex(newHsl.h, newHsl.s, newHsl.l);
    setBrushColor(hex);
  }, []);

  const handleHslComplete = React.useCallback(() => {
    const hex = hslToHex(hsl.h, hsl.s, hsl.l);
    pushRecentColor(hex);
    haptic.light();
  }, [hsl, pushRecentColor, haptic]);

  // ── Drawing stroke callbacks (called from GestureHandler worklet via runOnJS) ──
  // These accumulate points in refs (no re-renders during drawing).
  // Only commitStroke pushes to parent state on gesture end.
  const startStroke = React.useCallback((x: number, y: number) => {
    currentPointsRef.current = [{ x, y }];
    currentStrokeMetaRef.current = {
      id: `stroke_${Date.now()}`,
      points: [],
      color: brushColor,
      width: brushWidth,
      brushType,
    };
    renderTickSV.value = renderTickSV.value + 1;
    haptic.light();
  }, [brushColor, brushWidth, brushType, haptic, renderTickSV]);

  const addPoint = React.useCallback((x: number, y: number) => {
    if (!currentStrokeMetaRef.current) return;
    const pts = currentPointsRef.current;
    const last = pts[pts.length - 1];
    const dx = x - last.x;
    const dy = y - last.y;
    if (dx * dx + dy * dy > 4) {
      pts.push({ x, y });
      // Trigger throttled re-render via shared value
      renderTickSV.value = renderTickSV.value + 1;
    }
  }, [renderTickSV]);

  const commitStroke = React.useCallback(() => {
    if (!currentStrokeMetaRef.current) return;
    const stroke: BrushStroke = {
      ...currentStrokeMetaRef.current,
      points: currentPointsRef.current,
    };
    // Cap undo stack at MAX_UNDO_LEVELS (oldest dropped)
    const newStrokes = [...strokes, stroke].slice(-MAX_UNDO_LEVELS);
    onStrokesChange(newStrokes);
    currentPointsRef.current = [];
    currentStrokeMetaRef.current = null;
    renderTickSV.value = -1;
    setRedoStack([]);
  }, [strokes, onStrokesChange, renderTickSV]);

  // ── GestureHandler Pan for drawing ──
  // Uses refs for point accumulation (no re-renders during drawing).
  // Only commits to parent state on gesture end.
  // Shared values drive the live render trigger without setState.
  const drawGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(0)
        .onBegin((e) => {
          'worklet';
          if (!isActive) return;
          // Initialize stroke on press — worklet-safe via shared refs
          runOnJS(startStroke)(e.x, e.y);
        })
        .onChange((e) => {
          'worklet';
          if (!isActive) return;
          // Add point if moved enough (distance threshold > 2px)
          runOnJS(addPoint)(e.x, e.y);
        })
        .onEnd(() => {
          'worklet';
          if (!isActive) return;
          runOnJS(commitStroke)();
        })
        .onFinalize(() => {
          'worklet';
          // Handle gesture termination (interruption)
          if (!isActive) return;
          runOnJS(commitStroke)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isActive, brushColor, brushWidth, brushType, strokes, onStrokesChange, haptic]
  );

  // ── Undo / Redo / Clear ──
  const handleUndo = React.useCallback(() => {
    if (strokes.length === 0) return;
    const removed = strokes[strokes.length - 1];
    onStrokesChange(strokes.slice(0, -1));
    setRedoStack((prev) => [...prev, removed]);
    haptic.light();
  }, [strokes, onStrokesChange, haptic]);

  // ── Two-finger tap to undo (gesture shortcut) ──
  // Defined after handleUndo so the closure captures an initialized binding.
  const twoFingerTap = React.useMemo(
    () =>
      Gesture.Tap()
        .minPointers(2)
        .maxDistance(20)
        .maxDuration(400)
        .onEnd(() => {
          'worklet';
          runOnJS(handleUndo)();
        }),
    [handleUndo]
  );

  const handleRedo = React.useCallback(() => {
    if (redoStack.length === 0) return;
    const restored = redoStack[redoStack.length - 1];
    onStrokesChange([...strokes, restored]);
    setRedoStack((prev) => prev.slice(0, -1));
    haptic.light();
  }, [redoStack, onStrokesChange, haptic]);

  const handleClearTap = React.useCallback(() => {
    if (strokes.length === 0) return;
    haptic.warning();
    setShowClearConfirm(true);
  }, [strokes.length, haptic]);

  const handleClearConfirm = React.useCallback(() => {
    onStrokesChange([]);
    setRedoStack([]);
    setShowClearConfirm(false);
    haptic.success();
  }, [onStrokesChange, haptic]);

  // ── Compose all strokes for rendering ──
  // currentStrokeRender reads from refs on every render (triggered by the
  // throttled renderTick state). Not memoized — the refs are stable but their
  // .current contents change during drawing, and we need the latest points.
  const currentStrokeRender: BrushStroke | null = currentStrokeMetaRef.current
    ? { ...currentStrokeMetaRef.current, points: currentPointsRef.current }
    : null;

  const allStrokes = currentStrokeRender ? [...strokes, currentStrokeRender] : strokes;

  // ── Skia Canvas rendering ──
  // GPU-accelerated rendering with blend modes for each brush type.
  // Eraser strokes use BlendMode.Clear (destination-out) to cut through
  // previously drawn strokes — no SVG mask needed.
  let renderCanvas: React.ReactNode = null;
  if (skiaAvailable) {
    // Separate eraser strokes from normal strokes for proper layering
    const normalStrokes = allStrokes.filter((s) => (s.brushType ?? 'marker') !== 'eraser');
    const eraserStrokes = allStrokes.filter((s) => s.brushType === 'eraser');

    renderCanvas = (
      <Canvas style={[StyleSheet.absoluteFill, { width: canvasSize.width, height: canvasSize.height }]}>
        {/* Normal strokes rendered first */}
        {normalStrokes.map((stroke) => (
          <StrokePath key={stroke.id} stroke={stroke} keyPrefix="main" />
        ))}
        {/* Eraser strokes rendered with Clear blend mode to cut through */}
        {eraserStrokes.map((stroke) => {
          const eraserPath = smoothPathToSkia(stroke.points, 0.5);
          if (!eraserPath) return null;
          return (
            <SkiaPath
              key={`eraser_${stroke.id}`}
              path={eraserPath}
              style="stroke"
              strokeCap="round"
              strokeJoin="round"
              strokeWidth={stroke.width * 1.5}
            >
              <SkiaPaint color="#000000" blendMode="clear" opacity={1} />
            </SkiaPath>
          );
        })}
      </Canvas>
    );
  }

  // If Skia rendering isn't available, provide a non-crashing placeholder.
  if (!renderCanvas) {
    renderCanvas = <View style={StyleSheet.absoluteFill} pointerEvents="none" />;
  }

  if (!isActive) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {renderCanvas}
      </View>
    );
  }

  // ── Render ──
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Drawing surface — Gesture.Pan for drawing composed with two-finger tap undo */}
      <GestureDetector gesture={Gesture.Race(drawGesture, twoFingerTap)}>
        <View style={StyleSheet.absoluteFill} pointerEvents="auto" />
      </GestureDetector>

      {/* Rendered strokes — Skia Canvas (GPU-accelerated) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {renderCanvas}
      </View>

      {/* Top bar for drawing */}
      <View style={styles.drawTopBar} pointerEvents="box-none">
        <AnimatedPressable
          style={styles.drawIconBtn}
          onPress={onClose}
          scaleValue={0.9}
          activeOpacity={0.85}
          hapticFeedback="light"
          accessibilityLabel="Close drawing"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </AnimatedPressable>
        <View style={styles.drawActions}>
          {/* Undo — spring scale in after first stroke */}
          <Reanimated.View style={[styles.actionBtnWrap, undoBtnStyle]}>
            <AnimatedPressable
              style={styles.drawIconBtn}
              onPress={handleUndo}
              scaleValue={0.9}
              activeOpacity={0.85}
              hapticFeedback="light"
              disabled={strokes.length === 0}
              accessibilityLabel="Undo stroke"
              accessibilityRole="button"
            >
              <Ionicons
                name="arrow-undo-outline"
                size={20}
                color={strokes.length === 0 ? colors.textMuted : colors.textPrimary}
              />
            </AnimatedPressable>
          </Reanimated.View>
          {/* Redo — spring scale in after first undo */}
          <Reanimated.View style={[styles.actionBtnWrap, redoBtnStyle]}>
            <AnimatedPressable
              style={styles.drawIconBtn}
              onPress={handleRedo}
              scaleValue={0.9}
              activeOpacity={0.85}
              hapticFeedback="light"
              disabled={redoStack.length === 0}
              accessibilityLabel="Redo stroke"
              accessibilityRole="button"
            >
              <Ionicons
                name="arrow-redo-outline"
                size={20}
                color={redoStack.length === 0 ? colors.textMuted : colors.textPrimary}
              />
            </AnimatedPressable>
          </Reanimated.View>
          <AnimatedPressable
            style={styles.drawIconBtn}
            onPress={handleClearTap}
            scaleValue={0.9}
            activeOpacity={0.85}
            hapticFeedback="medium"
            disabled={strokes.length === 0}
            accessibilityLabel="Clear all strokes"
            accessibilityRole="button"
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={strokes.length === 0 ? colors.textMuted : colors.textPrimary}
            />
          </AnimatedPressable>
        </View>
      </View>

      {/* Bottom tool options panel — BlurView with spring slide-up */}
      <Reanimated.View style={[styles.drawControlsWrap, panelStyle]} pointerEvents="box-none">
        <BlurView
          intensity={Platform.OS === 'ios' ? 40 : 60}
          tint={colors.textPrimary === '#FFFFFF' ? 'dark' : 'light'}
          style={styles.drawControlsBlur}
        >
          <View style={styles.drawControlsInner} pointerEvents="box-none">
            {/* Brush type selector — shared BrushPicker component */}
            <BrushPicker brushType={brushType} onSelect={handleBrushType} />

            {/* Brush size slider with preview — shared SizePickerPanel component */}
            <SizePickerPanel
              value={brushWidth}
              onValueChange={handleBrushWidth}
              color={brushColor}
              brushType={brushType}
            />

            {/* Color palette */}
            {!showCustomColor ? (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.drawColorRow}
                  accessibilityRole="list"
                  accessibilityLabel="Brush colors"
                >
                  {PRESET_COLORS.map((c) => (
                    <AnimatedPressable
                      key={c}
                      style={[
                        styles.drawColorOrb,
                        { backgroundColor: c },
                        brushColor === c && styles.drawColorOrbActive,
                      ]}
                      onPress={() => handleBrushColor(c)}
                      scaleValue={0.9}
                      activeOpacity={0.85}
                      hapticFeedback="light"
                      accessibilityLabel={`Brush color ${c}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: brushColor === c }}
                    >
                      {brushColor === c && (
                        <Ionicons
                          name="checkmark"
                          size={12}
                          color={isLightColor(c) ? '#000' : '#fff'}
                        />
                      )}
                    </AnimatedPressable>
                  ))}
                  {/* Custom color picker toggle */}
                  <AnimatedPressable
                    style={[styles.drawColorOrb, styles.addColorOrb]}
                    onPress={() => {
                      setShowCustomColor(true);
                      setHsl(hexToHsl(brushColor));
                      haptic.light();
                    }}
                    scaleValue={0.9}
                    activeOpacity={0.85}
                    hapticFeedback="light"
                    accessibilityLabel="Custom color picker"
                    accessibilityHint="Opens HSL sliders to pick a custom color"
                    accessibilityRole="button"
                  >
                    <Ionicons name="color-palette-outline" size={16} color={colors.textPrimary} />
                  </AnimatedPressable>
                </ScrollView>

                {/* Recent colors row */}
                {recentColors.length > 0 && (
                  <View style={styles.recentColorRow} accessibilityRole="list" accessibilityLabel="Recent colors">
                    {recentColors.map((c) => (
                      <AnimatedPressable
                        key={`recent_${c}`}
                        style={[
                          styles.recentColorOrb,
                          { backgroundColor: c },
                          brushColor === c && styles.drawColorOrbActive,
                        ]}
                        onPress={() => handleBrushColor(c)}
                        scaleValue={0.9}
                        activeOpacity={0.85}
                        hapticFeedback="light"
                        accessibilityLabel={`Recent color ${c}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: brushColor === c }}
                      />
                    ))}
                  </View>
                )}
              </>
            ) : (
              /* HSL custom color picker — shared ColorPickerPanel component */
              <ColorPickerPanel
                hsl={hsl}
                onHslChange={handleHslChange}
                onHslComplete={handleHslComplete}
                onBack={() => {
                  setShowCustomColor(false);
                  haptic.light();
                }}
                onApply={(hex) => {
                  handleBrushColor(hex);
                  setShowCustomColor(false);
                }}
              />
            )}

            <AnimatedPressable
              style={styles.doneDrawBtn}
              onPress={onClose}
              scaleValue={0.96}
              activeOpacity={0.9}
              hapticFeedback="light"
              accessibilityLabel="Done drawing"
              accessibilityRole="button"
            >
              <Text style={styles.doneDrawText}>Done</Text>
            </AnimatedPressable>
          </View>
        </BlurView>
      </Reanimated.View>

      {/* Clear confirmation ActionSheet */}
      <ClearConfirmationSheet
        visible={showClearConfirm}
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={handleClearConfirm}
        colors={colors}
        styles={styles}
        reducedMotion={reducedMotion}
      />
    </View>
    </GestureHandlerRootView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  drawTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: 52,
    paddingBottom: 12,
    zIndex: 20,
  },
  drawIconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawActions: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
  },
  actionBtnWrap: {
    // Wraps undo/redo for spring scale-in
  },
  // ── Tool panel ──
  drawControlsWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    overflow: 'hidden',
  },
  drawControlsBlur: {
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.glassBorder,
  },
  drawControlsInner: {
    paddingHorizontal: Space.md,
    paddingBottom: 28,
    paddingTop: Space.sm,
    gap: Space.sm,
  },
  // ── Color palette ──
  drawColorRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 4,
    paddingTop: 4,
  },
  drawColorOrb: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawColorOrbActive: {
    borderWidth: Stroke.emphasis,
    borderColor: colors.textPrimary,
  },
  addColorOrb: {
    backgroundColor: colors.glassBg,
    borderColor: colors.borderSubtle,
  },
  // ── Recent colors ──
  recentColorRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 2,
  },
  recentColorOrb: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: Stroke.hairline,
    borderColor: colors.borderSubtle,
  },
  // ── Done button ──
  doneDrawBtn: {
    alignSelf: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.xl,
    paddingVertical: 10,
    marginTop: 4,
  },
  doneDrawText: {
    color: colors.textInverse,
    fontSize: 14,
    fontFamily: Typography.family.bold,
  },
  // ── Clear confirmation ActionSheet ──
  confirmBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  confirmBackdropPress: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  confirmSheet: {
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Space.md,
    paddingBottom: 36,
    paddingTop: Space.sm,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.glassBorder,
  },
  confirmHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: 'center',
  },
  confirmTitle: {
    fontSize: 17,
    fontFamily: Typography.family.bold,
    textAlign: 'center',
  },
  confirmSubtitle: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    paddingHorizontal: Space.md,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: 4,
  },
  confirmCancelBtn: {
    flex: 1,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
  },
  confirmClearBtn: {
    flex: 1,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmClearText: {
    color: colors.textInverse,
    fontSize: 15,
    fontFamily: Typography.family.bold,
  },
});
}
