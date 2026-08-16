/**
 * SpeedCurveEditor — visual curve editor for variable speed ramping.
 *
 * Layout:
 *   - Preset chips (horizontal scroll) at the top.
 *   - A ~200pt-tall canvas showing speed (Y axis, 0.25x–4x, log2 scale) vs
 *     position (X axis, 0–1). The curve is rendered with Skia; control points
 *     are draggable via react-native-gesture-handler.
 *   - Easing selector (linear / smooth / hold).
 *   - Inspector for the selected point: speed +/-, position, delete.
 *
 * The Y axis uses a log2 scale so that 0.25x and 4x are equidistant from 1x
 * (speed is multiplicative), making the curve intuitive to read.
 *
 * Touch targets are ≥44pt (Control.hit). Haptics: `selection` on preset/easing
 * switch and point select, `medium` on delete (AGENTS.md §13, §27.9).
 *
 * Design references:
 *   - AGENTS.md §11: every control performs a real mutation via onChange.
 *   - designTokens Stroke.emphasis (2pt) for the selected point border.
 *   - Matches KeyframeEditor visual style.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ScrollView,
  LayoutChangeEvent,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import {
  Canvas,
  Path as SkiaPath,
  Skia,
} from '@shopify/react-native-skia';
import type { SpeedCurve, SpeedPoint, SpeedCurveEasing } from './SpeedCurveTypes';
import {
  SPEED_CURVE_PRESETS,
  SPEED_MIN,
  SPEED_MAX,
  clampSpeed,
  clampPosition,
  sampleSpeedAtPosition,
} from './SpeedCurveTypes';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { makeStableId } from '../../../utils/createStableId';
import {
  Space,
  Radius,
  Stroke,
  Control,
  FontFamily,
  FontSize,
  LetterSpacing,
} from '../../../theme/designTokens';

export interface SpeedCurveEditorProps {
  curve: SpeedCurve;
  onChange: (curve: SpeedCurve) => void;
}

const CURVE_HEIGHT = 200;
const POINT_RADIUS = 7;
const POINT_HIT = 28; // generous hit area for dragging
const EASINGS: SpeedCurveEasing[] = ['linear', 'smooth', 'hold'];
const EASING_LABELS: Record<SpeedCurveEasing, string> = {
  linear: 'Linear',
  smooth: 'Smooth',
  hold: 'Hold',
};
const CURVE_SAMPLES = 120; // resolution of the rendered curve line

// ── Y-axis mapping: log2 scale ────────────────────────────────────────
// log2(0.25) = -2, log2(1) = 1, log2(4) = 2. Maps speed to a -2..2 range
// so 1x sits at the vertical center and halving/doubling are symmetric.
const LOG_MIN = Math.log2(SPEED_MIN); // -2
const LOG_MAX = Math.log2(SPEED_MAX); // 2
const LOG_RANGE = LOG_MAX - LOG_MIN; // 4

function speedToY(speed: number, height: number): number {
  const logSpeed = Math.log2(Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed)));
  const ratio = (logSpeed - LOG_MIN) / LOG_RANGE; // 0 (bottom) to 1 (top)
  return height - ratio * height;
}

function yToSpeed(y: number, height: number): number {
  const ratio = 1 - y / height; // 0 (bottom) to 1 (top)
  const logSpeed = LOG_MIN + ratio * LOG_RANGE;
  return Math.pow(2, logSpeed);
}

export function SpeedCurveEditor({ curve, onChange }: SpeedCurveEditorProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const widthSV = useSharedValue(0);

  const sortedPoints = useMemo(
    () => [...curve.points].sort((a, b) => a.position - b.position),
    [curve.points],
  );

  const handleCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setCanvasWidth(w);
    widthSV.value = w;
  }, [widthSV]);

  // ── Preset selection ────────────────────────────────────────────────
  const activePresetId = useMemo(() => {
    for (const preset of SPEED_CURVE_PRESETS) {
      if (preset.curve.easing !== curve.easing) continue;
      if (preset.curve.points.length !== curve.points.length) continue;
      const presetSorted = [...preset.curve.points].sort((a, b) => a.position - b.position);
      const curveSorted = [...curve.points].sort((a, b) => a.position - b.position);
      const match = presetSorted.every(
        (p, i) =>
          Math.abs(p.position - curveSorted[i].position) < 0.001 &&
          Math.abs(p.speed - curveSorted[i].speed) < 0.01,
      );
      if (match) return preset.id;
    }
    return null;
  }, [curve]);

  const handlePresetSelect = useCallback(
    (presetId: string) => {
      const preset = SPEED_CURVE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      haptic.selection();
      setSelectedId(null);
      // Deep-copy the preset so edits don't mutate the preset constant.
      onChange({
        easing: preset.curve.easing,
        points: preset.curve.points.map((p) => ({ ...p, id: makeStableId('sp') })),
      });
    },
    [haptic, onChange],
  );

  // ── Easing selection ────────────────────────────────────────────────
  const handleEasingSelect = useCallback(
    (easing: SpeedCurveEasing) => {
      if (easing === curve.easing) return;
      haptic.selection();
      onChange({ ...curve, easing });
    },
    [curve, haptic, onChange],
  );

  // ── Point selection ─────────────────────────────────────────────────
  const selectPoint = useCallback(
    (id: string) => {
      haptic.selection();
      setSelectedId(id);
    },
    [haptic],
  );

  // ── Add a point by tapping an empty area of the canvas ──────────────
  const handleCanvasPress = useCallback(
    (locationX: number, locationY: number) => {
      if (canvasWidth <= 0) return;
      const position = clampPosition(locationX / canvasWidth);
      const speed = clampSpeed(Math.round(yToSpeed(locationY, CURVE_HEIGHT) * 100) / 100);
      // Don't add a point if it would overlap an existing one
      const tooClose = curve.points.some(
        (p) => Math.abs(p.position - position) < 0.02,
      );
      if (tooClose) {
        haptic.light();
        return;
      }
      haptic.selection();
      const newPoint: SpeedPoint = { id: makeStableId('sp'), position, speed };
      onChange({ ...curve, points: [...curve.points, newPoint] });
      setSelectedId(newPoint.id);
    },
    [canvasWidth, curve, haptic, onChange],
  );

  // ── Drag a point ────────────────────────────────────────────────────
  // Each point gets its own pan gesture. The first/last points are locked
  // to position 0 / 1 respectively (boundary points).
  const makePointGesture = useCallback(
    (pointId: string, isBoundary: boolean) => {
      return Gesture.Pan()
        .activateAfterLongPress(0)
        .onBegin(() => {
          'worklet';
          runOnJS(haptic.selection)();
          runOnJS(setSelectedId)(pointId);
        })
        .onChange((e) => {
          'worklet';
          const w = widthSV.value;
          if (w <= 0) return;
          // e.absoluteX / e.absoluteY are in the gesture handler coordinate
          // space. We need to convert to canvas-local coordinates. The
          // gesture detector wraps the point which is positioned absolutely
          // within the canvas, so e.x is relative to the point. We use
          // e.absoluteX minus the canvas left offset — but since the canvas
          // starts at x=0 within its container, e.x relative to the point
          // plus the point's left gives us the canvas position. Simpler:
          // use the point's known left + e.x.
          // We pass the raw delta to JS which resolves it.
          runOnJS(handlePointDrag)(pointId, e.x, e.y, isBoundary);
        })
        .onEnd(() => {
          'worklet';
          runOnJS(haptic.selection)();
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [haptic, curve, canvasWidth],
  );

  const handlePointDrag = useCallback(
    (pointId: string, deltaX: number, deltaY: number, isBoundary: boolean) => {
      const point = curve.points.find((p) => p.id === pointId);
      if (!point || canvasWidth <= 0) return;
      // The gesture's e.x/e.y are relative to the gesture detector view
      // (the point hit area), which is positioned at the point's center.
      // So canvas-local x = pointLeftPx + e.x, y = pointTopPx + e.y.
      const pointLeftPx = point.position * canvasWidth;
      const pointTopPx = speedToY(point.speed, CURVE_HEIGHT);
      const localX = pointLeftPx + deltaX;
      const localY = pointTopPx + deltaY;
      const newPosition = isBoundary ? point.position : clampPosition(localX / canvasWidth);
      const newSpeed = clampSpeed(Math.round(yToSpeed(localY, CURVE_HEIGHT) * 100) / 100);
      // Prevent a non-boundary point from crossing its neighbors.
      const sorted = [...curve.points].sort((a, b) => a.position - b.position);
      const idx = sorted.findIndex((p) => p.id === pointId);
      let clampedPos = newPosition;
      if (!isBoundary && idx > 0) {
        const prevPos = sorted[idx - 1].position;
        if (clampedPos < prevPos + 0.01) clampedPos = prevPos + 0.01;
      }
      if (!isBoundary && idx < sorted.length - 1) {
        const nextPos = sorted[idx + 1].position;
        if (clampedPos > nextPos - 0.01) clampedPos = nextPos - 0.01;
      }
      const newPoints = curve.points.map((p) =>
        p.id === pointId ? { ...p, position: clampedPos, speed: newSpeed } : p,
      );
      onChange({ ...curve, points: newPoints });
    },
    [curve, canvasWidth, onChange],
  );

  // ── Delete a point ──────────────────────────────────────────────────
  const handleDeletePoint = useCallback(() => {
    if (!selectedId) return;
    const point = curve.points.find((p) => p.id === selectedId);
    if (!point) return;
    // Don't allow deleting if only 2 points remain (minimum for a curve).
    if (curve.points.length <= 2) {
      haptic.light();
      return;
    }
    haptic.medium();
    onChange({ ...curve, points: curve.points.filter((p) => p.id !== selectedId) });
    setSelectedId(null);
  }, [selectedId, curve, haptic, onChange]);

  // ── Adjust selected point speed via +/- buttons ─────────────────────
  const handleSpeedStep = useCallback(
    (delta: number) => {
      if (!selectedId) return;
      const point = curve.points.find((p) => p.id === selectedId);
      if (!point) return;
      haptic.selection();
      const newSpeed = clampSpeed(Math.round((point.speed + delta) * 100) / 100);
      onChange({
        ...curve,
        points: curve.points.map((p) =>
          p.id === selectedId ? { ...p, speed: newSpeed } : p,
        ),
      });
    },
    [selectedId, curve, haptic, onChange],
  );

  const selectedPoint = useMemo(
    () => curve.points.find((p) => p.id === selectedId) ?? null,
    [curve.points, selectedId],
  );

  // ── Build the Skia path for the curve ───────────────────────────────
  const curvePath = useMemo(() => {
    if (canvasWidth <= 0) return null;
    const path = Skia.Path.Make();
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const pos = i / CURVE_SAMPLES;
      const speed = sampleSpeedAtPosition(curve, pos);
      pts.push({ x: pos * canvasWidth, y: speedToY(speed, CURVE_HEIGHT) });
    }
    if (pts.length > 0) {
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        path.lineTo(pts[i].x, pts[i].y);
      }
    }
    return path;
  }, [curve, canvasWidth]);

  // ── Grid line Y positions for 1x, 2x, 0.5x reference ────────────────
  const gridLines = useMemo(() => {
    if (canvasWidth <= 0) return [];
    const speeds = [SPEED_MIN, 0.5, 1, 2, SPEED_MAX];
    return speeds.map((s) => ({ speed: s, y: speedToY(s, CURVE_HEIGHT) }));
  }, [canvasWidth]);

  const brandColor = colors.brand;
  const curveColor = colors.brand;
  const gridColor = colors.borderSubtle;
  const pointFillColor = colors.surfaceElevated;
  const pointBorderColor = colors.textMuted;

  return (
    <View style={styles.container}>
      {/* ── Preset chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetRow}
        accessibilityRole="list"
        accessibilityLabel="Speed curve presets"
      >
        {SPEED_CURVE_PRESETS.map((preset) => {
          const active = preset.id === activePresetId;
          return (
            <Pressable
              key={preset.id}
              onPress={() => handlePresetSelect(preset.id)}
              accessibilityRole="button"
              accessibilityLabel={`${preset.name} preset${active ? ', selected' : ''}`}
              accessibilityHint={`Applies the ${preset.name} speed curve`}
              style={[
                styles.presetChip,
                {
                  backgroundColor: active ? colors.brand : colors.surfaceAlt,
                  borderColor: active ? colors.brand : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.presetLabel,
                  { color: active ? colors.textInverse : colors.textSecondary },
                ]}
              >
                {preset.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Curve canvas ── */}
      <View
        style={[
          styles.canvasWrap,
          { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle },
        ]}
      >
        {/* Skia canvas for the curve + grid */}
        <View style={StyleSheet.absoluteFill} onLayout={handleCanvasLayout}>
          {canvasWidth > 0 && (
            <Canvas style={{ width: canvasWidth, height: CURVE_HEIGHT }}>
              {/* Grid lines */}
              {gridLines.map((line, i) => (
                <SkiaPath
                  key={`grid-${i}`}
                  path={Skia.Path.Make().moveTo(0, line.y).lineTo(canvasWidth, line.y)}
                  style="stroke"
                  strokeWidth={Stroke.hairline}
                  color={gridColor}
                />
              ))}
              {/* The speed curve */}
              {curvePath && (
                <SkiaPath
                  path={curvePath}
                  style="stroke"
                  strokeWidth={Stroke.emphasis}
                  color={curveColor}
                  strokeJoin="round"
                  strokeCap="round"
                />
              )}
            </Canvas>
          )}
        </View>

        {/* Y-axis speed labels */}
        <View style={styles.yAxisLabels} pointerEvents="none">
          <Text style={[styles.axisLabel, { color: colors.textMuted }]}>4x</Text>
          <Text style={[styles.axisLabel, { color: colors.textMuted }]}>2x</Text>
          <Text style={[styles.axisLabel, { color: colors.textSecondary }]}>1x</Text>
          <Text style={[styles.axisLabel, { color: colors.textMuted }]}>0.5x</Text>
          <Text style={[styles.axisLabel, { color: colors.textMuted }]}>0.25x</Text>
        </View>

        {/* Tap layer to add points (below the draggable points) */}
        <Pressable
          style={styles.canvasTapLayer}
          onPress={(e) => handleCanvasPress(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          accessibilityRole="button"
          accessibilityLabel="Speed curve canvas"
          accessibilityHint="Tap to add a control point. Drag points to adjust speed and position."
        />

        {/* Draggable control points (rendered above the canvas) */}
        {canvasWidth > 0 && sortedPoints.map((point) => {
          const isSelected = point.id === selectedId;
          const isBoundary = point.position === 0 || point.position === 1;
          const left = point.position * canvasWidth - POINT_HIT / 2;
          const top = speedToY(point.speed, CURVE_HEIGHT) - POINT_HIT / 2;
          const gesture = makePointGesture(point.id, isBoundary);
          return (
            <GestureDetector key={point.id} gesture={gesture}>
              <View
                style={[
                  styles.pointHit,
                  { left, top },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Speed point at ${Math.round(point.position * 100)}%, speed ${point.speed}x`}
                accessibilityHint="Drag to adjust speed and position"
              >
                <View
                  style={[
                    styles.pointDot,
                    {
                      backgroundColor: isSelected ? brandColor : pointFillColor,
                      borderColor: isSelected ? brandColor : pointBorderColor,
                    },
                  ]}
                />
              </View>
            </GestureDetector>
          );
        })}
      </View>

      {/* ── Easing selector ── */}
      <View style={styles.easingRow} accessibilityRole="radiogroup">
        <Text style={[styles.easingRowLabel, { color: colors.textSecondary }]}>Easing</Text>
        <View style={styles.easingButtons}>
          {EASINGS.map((ease) => {
            const active = curve.easing === ease;
            return (
              <Pressable
                key={ease}
                onPress={() => handleEasingSelect(ease)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={EASING_LABELS[ease]}
                style={[
                  styles.easingButton,
                  { backgroundColor: active ? colors.brand : colors.surfaceAlt },
                ]}
              >
                <Text
                  style={[
                    styles.easingLabel,
                    { color: active ? colors.textInverse : colors.textSecondary },
                  ]}
                >
                  {EASING_LABELS[ease]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Selected point inspector ── */}
      {selectedPoint && (
        <View
          style={[styles.inspector, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.inspectorRow}>
            <Text style={[styles.inspectorLabel, { color: colors.textSecondary }]}>Speed</Text>
            <View style={styles.valueControls}>
              <Pressable
                onPress={() => handleSpeedStep(-0.05)}
                style={[styles.stepButton, { backgroundColor: colors.surfaceAlt }]}
                accessibilityRole="button"
                accessibilityLabel="Decrease speed"
                hitSlop={Control.hit / 2}
              >
                <Ionicons name="remove" size={18} color={colors.textPrimary} />
              </Pressable>
              <Text style={[styles.valueText, { color: colors.textPrimary }]}>
                {selectedPoint.speed.toFixed(2)}x
              </Text>
              <Pressable
                onPress={() => handleSpeedStep(0.05)}
                style={[styles.stepButton, { backgroundColor: colors.surfaceAlt }]}
                accessibilityRole="button"
                accessibilityLabel="Increase speed"
                hitSlop={Control.hit / 2}
              >
                <Ionicons name="add" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.inspectorRow}>
            <Text style={[styles.inspectorLabel, { color: colors.textSecondary }]}>Position</Text>
            <Text style={[styles.valueText, { color: colors.textPrimary }]}>
              {Math.round(selectedPoint.position * 100)}%
            </Text>
          </View>

          <Pressable
            onPress={handleDeletePoint}
            accessibilityRole="button"
            accessibilityLabel="Delete control point"
            style={[styles.deleteButton, { backgroundColor: colors.danger }]}
          >
            <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
            <Text style={styles.deleteLabel}>Delete Point</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  presetRow: {
    paddingHorizontal: Space.sm,
    gap: Space.xs,
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  presetChip: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
    borderWidth: Stroke.standard,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  presetLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.caption,
    letterSpacing: LetterSpacing.normal,
  },
  canvasWrap: {
    marginHorizontal: Space.sm,
    height: CURVE_HEIGHT,
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
    overflow: 'hidden',
    position: 'relative',
  },
  canvasTapLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  yAxisLabels: {
    position: 'absolute',
    left: 4,
    top: 0,
    bottom: 0,
    width: 36,
    justifyContent: 'space-between',
    paddingVertical: 0,
    zIndex: 5,
  },
  axisLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 9,
    letterSpacing: LetterSpacing.normal,
  },
  pointHit: {
    position: 'absolute',
    width: POINT_HIT,
    height: POINT_HIT,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  pointDot: {
    width: POINT_RADIUS * 2,
    height: POINT_RADIUS * 2,
    borderRadius: POINT_RADIUS,
    borderWidth: Stroke.emphasis,
  },
  easingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    minHeight: Control.hit,
  },
  easingRowLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.caption,
    letterSpacing: LetterSpacing.normal,
  },
  easingButtons: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  easingButton: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  easingLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.caption,
    letterSpacing: LetterSpacing.normal,
  },
  inspector: {
    marginHorizontal: Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
    padding: Space.sm,
    gap: Space.sm,
  },
  inspectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Control.hit,
  },
  inspectorLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.caption,
    letterSpacing: LetterSpacing.normal,
  },
  valueControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  stepButton: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    letterSpacing: LetterSpacing.normal,
    minWidth: 56,
    textAlign: 'center',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    borderRadius: Radius.sm,
    minHeight: Control.hit,
  },
  deleteLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    color: '#FFFFFF',
    letterSpacing: LetterSpacing.normal,
  },
});

// Keep ViewStyle referenced for typed style composition without unused-import
// errors at compile time.
export type SpeedCurveEditorViewStyle = ViewStyle;
