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
  Alert,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Canvas,
  Group,
  Path as SkiaPath,
  Paint as SkiaPaint,
  Skia,
} from '@shopify/react-native-skia';

import { Space, Radius, FontFamily, Type, Elevation } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { PressScale } from '../../CreatorAnimations';
import type { BrushType, DrawingDocument, Stroke } from './DrawingTypes';

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
}

const BRUSH_TYPES: { type: BrushType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: 'pen', label: 'Pen', icon: 'create-outline' },
  { type: 'marker', label: 'Marker', icon: 'brush-outline' },
  { type: 'highlighter', label: 'Highlight', icon: 'color-fill-outline' },
  { type: 'neon', label: 'Neon', icon: 'bulb-outline' },
  { type: 'eraser', label: 'Eraser', icon: 'backspace-outline' },
];

const PRESET_COLORS = [
  '#000000', '#FFFFFF', '#E53935', '#FB8C00',
  '#FDD835', '#43A047', '#1E88E5', '#8E24AA',
];

const MIN_SIZE = 4;
const MAX_SIZE = 40;
const MAX_UNDO_LEVELS = 50;
const SIZE_SLIDER_WIDTH = 180;

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
// Single-stroke Skia renderer (memoized)
// ─────────────────────────────────────────────────────────────────────────────
interface StrokePathProps {
  stroke: Stroke;
  keyPrefix: string;
}

const StrokePath = React.memo(function StrokePath({ stroke, keyPrefix }: StrokePathProps) {
  if (!skiaAvailable) return null;
  if (stroke.brushType === 'eraser') return null; // eraser rendered via blend mode

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
        <SkiaPaint color={stroke.color} blendMode="multiply" opacity={0.3} />
      </SkiaPath>
    );
  }

  if (stroke.brushType === 'neon') {
    return (
      <Group key={`${keyPrefix}_${stroke.id}`} blendMode="plus">
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.size * 3}>
          <SkiaPaint color={stroke.color} blendMode="plus" opacity={0.15} />
        </SkiaPath>
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.size * 2}>
          <SkiaPaint color={stroke.color} blendMode="plus" opacity={0.3} />
        </SkiaPath>
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.size}>
          <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={1} />
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
        <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={0.6} />
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
      <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={1} />
    </SkiaPath>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Size slider — custom PanResponder-based slider (no new deps)
// ─────────────────────────────────────────────────────────────────────────────
interface SizeSliderProps {
  value: number;
  min: number;
  max: number;
  width: number;
  color: string;
  trackColor: string;
  thumbBorderColor: string;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}

function SizeSlider({
  value,
  min,
  max,
  width,
  color,
  trackColor,
  thumbBorderColor,
  onChange,
  onCommit,
}: SizeSliderProps) {
  const sliderRef = useRef<View>(null);
  const dragStateRef = useRef(false);

  const handleX = (v: number) => ((v - min) / (max - min)) * width;

  // Animated thumb position follows the controlled value when not dragging.
  const thumbX = useRef(new Animated.Value(handleX(value))).current;

  useEffect(() => {
    if (!dragStateRef.current) {
      Animated.timing(thumbX, {
        toValue: handleX(value),
        duration: 0,
        useNativeDriver: true,
      }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const updateFromLocation = (locationX: number) => {
    const clamped = Math.max(0, Math.min(width, locationX));
    const v = min + (clamped / width) * (max - min);
    onChange(Math.round(v));
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_, gestureState) => {
          dragStateRef.current = true;
          sliderRef.current?.measure((_ox, _oy, _w, _h, px) => {
            updateFromLocation(gestureState.x0 - px);
          });
        },
        onPanResponderMove: (_, gestureState) => {
          sliderRef.current?.measure((_ox, _oy, _w, _h, px) => {
            updateFromLocation(gestureState.x0 + gestureState.dx - px);
          });
        },
        onPanResponderRelease: () => {
          dragStateRef.current = false;
          onCommit(value);
        },
        onPanResponderTerminate: () => {
          dragStateRef.current = false;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, min, max, value],
  );

  return (
    <View
      ref={sliderRef}
      style={{ width, height: 28, justifyContent: 'center' }}
      {...panResponder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Brush size"
      accessibilityValue={{ min, max, now: value }}
    >
      <View style={[sliderStyles.track, { backgroundColor: trackColor }]} />
      <View
        style={[sliderStyles.fill, { width: handleX(value), backgroundColor: color }]}
      />
      <Animated.View
        style={[
          sliderStyles.thumb,
          { transform: [{ translateX: thumbX }] },
          { backgroundColor: color, borderColor: thumbBorderColor },
        ]}
      />
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    borderWidth: 2,
  },
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
}: DrawingWorkspaceProps) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Tool state ──
  const [brushType, setBrushType] = useState<BrushType>('pen');
  const [brushColor, setBrushColor] = useState<string>(isDark ? '#FFFFFF' : '#000000');
  const [brushSize, setBrushSize] = useState<number>(8);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [customColor, setCustomColor] = useState<string>('#1E88E5');

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
          points: currentPointsRef.current,
        });
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
        panelOpacity.value = withTiming(1, { duration: 160 });
        canvasOpacity.value = withTiming(1, { duration: 200 });
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
    opacity: panelOpacity.value,
  }));

  const canvasStyle = useAnimatedStyle(() => ({
    opacity: canvasOpacity.value,
  }));

  // ── Stroke lifecycle (called from gesture worklet via runOnJS) ──
  const startStroke = useCallback(
    (x: number, y: number) => {
      currentPointsRef.current = [{ x, y }];
      currentMetaRef.current = {
        id: `stroke_${Date.now()}`,
        brushType,
        color: brushType === 'eraser' ? '#000000' : brushColor,
        size: brushSize,
        points: [],
      };
      renderTickSV.value = renderTickSV.value + 1;
    },
    [brushType, brushColor, brushSize, renderTickSV],
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
      points: currentPointsRef.current,
    };
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
    if (strokes.length === 0) return;
    Alert.alert(
      'Clear canvas',
      'Remove every stroke from the canvas? This can be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setRedoStack((r) => [...r, ...strokes].slice(-MAX_UNDO_LEVELS));
            setStrokes([]);
          },
        },
      ],
    );
  }, [strokes]);

  const handleDone = useCallback(() => {
    const doc: DrawingDocument = {
      strokes,
      width: canvasWidth,
      height: canvasHeight,
    };
    onCommit(doc);
  }, [strokes, canvasWidth, canvasHeight, onCommit]);

  const handleSelectColor = useCallback((c: string) => {
    setBrushColor(c);
    if (brushType === 'eraser') setBrushType('pen');
  }, [brushType]);

  const handleCustomColor = useCallback((c: string) => {
    const normalized = c.startsWith('#') ? c : `#${c}`;
    setCustomColor(normalized);
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(normalized)) {
      setBrushColor(normalized);
      if (brushType === 'eraser') setBrushType('pen');
    }
  }, [brushType]);

  const handleSelectBrush = useCallback((t: BrushType) => {
    setBrushType(t);
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

  const canvasBg = isDark ? '#0A0A0A' : '#FFFFFF';

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
        {/* ── Canvas ── */}
        <Reanimated.View style={[StyleSheet.absoluteFill, canvasStyle]}>
          <View
            style={[
              styles.canvasFrame,
              {
                width: canvasWidth,
                height: canvasHeight,
                backgroundColor: canvasBg,
              },
            ]}
          >
            {skiaAvailable ? (
              <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
                {committedPaths}
                {livePath}
              </Canvas>
            ) : (
              <View style={styles.fallbackCanvas}>
                <Text style={styles.fallbackText}>
                  Skia unavailable — drawing preview disabled.
                </Text>
              </View>
            )}

            {/* Gesture capture surface */}
            <GestureDetector gesture={drawGesture}>
              <View
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: canvasWidth,
                  height: canvasHeight,
                }}
              />
            </GestureDetector>
          </View>
        </Reanimated.View>

        {/* ── Top bar ── */}
        <View style={[styles.topBar, { paddingTop: insets.top + Space.xs }]}>
          <PressScale
            accessibilityLabel="Close drawing workspace"
            onPress={onClose}
            style={[styles.iconButton, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </PressScale>

          <View style={styles.topActions}>
            <PressScale
              accessibilityLabel="Undo"
              disabled={strokes.length === 0}
              onPress={handleUndo}
              style={[
                styles.iconButton,
                { backgroundColor: colors.surface, opacity: strokes.length === 0 ? 0.4 : 1 },
              ]}
            >
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            </PressScale>
            <PressScale
              accessibilityLabel="Redo"
              disabled={redoStack.length === 0}
              onPress={handleRedo}
              style={[
                styles.iconButton,
                { backgroundColor: colors.surface, opacity: redoStack.length === 0 ? 0.4 : 1 },
              ]}
            >
              <Ionicons name="arrow-forward" size={20} color={colors.textPrimary} />
            </PressScale>
            <PressScale
              accessibilityLabel="Clear canvas"
              disabled={strokes.length === 0}
              onPress={handleClear}
              style={[
                styles.iconButton,
                { backgroundColor: colors.surface, opacity: strokes.length === 0 ? 0.4 : 1 },
              ]}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </PressScale>
            <PressScale
              accessibilityLabel="Done — commit drawing"
              onPress={handleDone}
              style={[styles.doneButton, { backgroundColor: colors.brand }]}
            >
              <Text style={[styles.doneText, { color: colors.textInverse }]}>Done</Text>
            </PressScale>
          </View>
        </View>

        {/* ── Bottom tool panel ── */}
        <Reanimated.View
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, Space.sm),
              borderColor: colors.border,
            },
            panelStyle,
          ]}
        >
          {/* Brush type selector */}
          <View style={styles.brushRow}>
            {BRUSH_TYPES.map((b) => {
              const selected = brushType === b.type;
              return (
                <PressScale
                  key={b.type}
                  accessibilityLabel={b.label}
                  accessibilityRole="button"
                  onPress={() => handleSelectBrush(b.type)}
                  style={[
                    styles.brushChip,
                    {
                      backgroundColor: selected ? colors.brandSubtle : colors.surfaceAlt,
                      borderColor: selected ? colors.brand : 'transparent',
                    },
                  ]}
                >
                  <Ionicons
                    name={b.icon}
                    size={18}
                    color={selected ? colors.brand : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.brushLabel,
                      {
                        color: selected ? colors.textPrimary : colors.textSecondary,
                        fontFamily: FontFamily.medium,
                      },
                    ]}
                  >
                    {b.label}
                  </Text>
                </PressScale>
              );
            })}
          </View>

          {/* Color picker row */}
          <View style={styles.colorRow}>
            {PRESET_COLORS.map((c) => {
              const selected = brushColor === c && brushType !== 'eraser';
              return (
                <Pressable
                  key={c}
                  onPress={() => handleSelectColor(c)}
                  accessibilityLabel={`Color ${c}`}
                  accessibilityRole="button"
                  hitSlop={4}
                  style={[
                    styles.swatch,
                    { backgroundColor: c, borderColor: selected ? colors.brand : colors.border },
                  ]}
                />
              );
            })}
            {/* Custom color input — hex text entry (cross-platform) */}
            <View style={styles.customColorWrap}>
              <View
                style={[
                  styles.customColorPreview,
                  { backgroundColor: customColor, borderColor: colors.border },
                ]}
              />
              <TextInput
                value={customColor}
                onChangeText={handleCustomColor}
                placeholder="#RRGGBB"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={7}
                style={[
                  styles.customColorInput,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.border,
                  },
                ]}
                accessibilityLabel="Custom hex color"
              />
            </View>
          </View>

          {/* Size slider */}
          <View style={styles.sizeRow}>
            <Text style={[styles.sizeLabel, { color: colors.textSecondary, fontFamily: FontFamily.medium }]}>
              Size
            </Text>
            <SizeSlider
              value={brushSize}
              min={MIN_SIZE}
              max={MAX_SIZE}
              width={SIZE_SLIDER_WIDTH}
              color={colors.brand}
              trackColor={colors.border}
              thumbBorderColor={colors.surface}
              onChange={setBrushSize}
              onCommit={setBrushSize}
            />
            <View style={[styles.sizeDotWrap, { borderColor: colors.border }]}>
              <View
                style={{
                  width: Math.max(MIN_SIZE, Math.min(MAX_SIZE, brushSize)) / 2,
                  height: Math.max(MIN_SIZE, Math.min(MAX_SIZE, brushSize)) / 2,
                  borderRadius: 999,
                  backgroundColor: brushType === 'eraser' ? colors.border : brushColor,
                }}
              />
            </View>
            <Text style={[styles.sizeValue, { color: colors.textPrimary, fontFamily: FontFamily.semibold }]}>
              {brushSize}
            </Text>
          </View>
        </Reanimated.View>
      </View>
    </GestureHandlerRootView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    canvasFrame: {
      alignSelf: 'center',
      marginTop: 120,
      borderRadius: Radius.md,
      overflow: 'hidden',
      ...Elevation.floating,
    },
    fallbackCanvas: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    fallbackText: {
      fontSize: Type.caption.size,
      color: colors.textMuted,
      fontFamily: FontFamily.regular,
    },
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
      zIndex: 10,
    },
    topActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneButton: {
      height: 40,
      paddingHorizontal: Space.md,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneText: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: 0.12,
    },
    panel: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      borderTopWidth: 1,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      gap: Space.sm,
      ...Elevation.modal,
    },
    brushRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      flexWrap: 'wrap',
    },
    brushChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Space.sm,
      height: 34,
      borderRadius: Radius.full,
      borderWidth: 1,
    },
    brushLabel: {
      fontSize: Type.caption.size,
    },
    colorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      flexWrap: 'wrap',
    },
    swatch: {
      width: 28,
      height: 28,
      borderRadius: Radius.full,
      borderWidth: 2,
    },
    customColorWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    customColorPreview: {
      width: 28,
      height: 28,
      borderRadius: Radius.full,
      borderWidth: 2,
    },
    customColorInput: {
      width: 84,
      height: 28,
      borderRadius: Radius.sm,
      borderWidth: 1,
      paddingHorizontal: Space.xs,
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
    },
    sizeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    sizeLabel: {
      fontSize: Type.caption.size,
    },
    sizeDotWrap: {
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sizeValue: {
      fontSize: Type.bodyEmphasis.size,
      minWidth: 24,
      textAlign: 'right',
    },
  });
}
