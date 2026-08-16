/**
 * GradientEditor — gradient stop editor for background fills and shapes.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §9:
 * - 2-4 stops;
 * - add/remove;
 * - draggable stop positions;
 * - angle;
 * - alpha;
 * - reverse;
 * - linear/radial if supported;
 * - media-derived suggestions.
 *
 * Uses react-native-gesture-handler for drag gestures on stop positions
 * and react-native-reanimated for smooth feedback. Per-stop color editing
 * uses the CreatorColorPicker in a compact popover.
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  LayoutChangeEvent,
  ViewStyle,
  ColorValue,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { Space, Radius, Type, Typography, Stroke, Control } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { PressScale } from '../CreatorAnimations';
import { toHexString, normalize } from './ColorMath';
import { CreatorColorPicker } from './CreatorColorPicker';
import { makeStableId } from '../../utils/createStableId';
import type { GradientDefinition, GradientStop, CreatorColor } from './ColorTypes';

// ── Constants ────────────────────────────────────────────────────────
const MIN_STOPS = 2;
const MAX_STOPS = 4;
const SNAP_TIMING = { duration: 120, easing: Easing.out(Easing.cubic) };
const STOP_THUMB_SIZE = 24;
const GRADIENT_BAR_HEIGHT = 40;

// ── Props ────────────────────────────────────────────────────────────
interface GradientEditorProps {
  gradient: GradientDefinition;
  onChange: (gradient: GradientDefinition) => void;
  onCommit: (gradient: GradientDefinition) => void;
  /** Media URIs for media-derived gradient suggestions */
  mediaUris?: string[];
  style?: ViewStyle | ViewStyle[];
}

// ── Stop thumb (draggable position indicator) ────────────────────────
interface StopThumbProps {
  stop: GradientStop;
  barWidth: number;
  isSelected: boolean;
  onSelect: () => void;
  onDragChange: (position: number) => void;
  onDragCommit: (position: number) => void;
}

function StopThumb({
  stop,
  barWidth,
  isSelected,
  onSelect,
  onDragChange,
  onDragCommit,
}: StopThumbProps) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const layoutRef = useRef({ width: barWidth });

  const thumbX = useSharedValue(stop.position * barWidth);

  React.useEffect(() => {
    thumbX.value = withTiming(stop.position * barWidth, SNAP_TIMING);
  }, [stop.position, barWidth, thumbX]);

  const panGesture = React.useMemo(() => {
    return Gesture.Pan()
      .activateAfterLongPress(0)
      .onBegin((e) => {
        'worklet';
        const w = layoutRef.current.width;
        const pos = Math.max(0, Math.min(1, e.x / w));
        thumbX.value = pos * w;
        runOnJS(onDragChange)(pos);
      })
      .onChange((e) => {
        'worklet';
        const w = layoutRef.current.width;
        const pos = Math.max(0, Math.min(1, e.x / w));
        thumbX.value = pos * w;
        runOnJS(onDragChange)(pos);
      })
      .onEnd(() => {
        'worklet';
        const w = layoutRef.current.width;
        const pos = Math.max(0, Math.min(1, thumbX.value / w));
        runOnJS(onDragCommit)(pos);
      });
  }, [thumbX, onDragChange, onDragCommit]);

  const thumbStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        transform: [{ translateX: thumbX.value - STOP_THUMB_SIZE / 2 }],
      };
    }
    return {
      transform: [
        { translateX: withTiming(thumbX.value - STOP_THUMB_SIZE / 2, SNAP_TIMING) },
      ],
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Reanimated.View
        style={[
          styles.stopThumb,
          thumbStyle,
          {
            backgroundColor: toHexString(stop.color),
            borderColor: isSelected ? colors.brand : colors.textInverse,
            borderWidth: isSelected ? Stroke.emphasis : Stroke.standard,
          },
        ]}
        accessibilityRole="adjustable"
        accessibilityLabel={`Gradient stop at ${Math.round(stop.position * 100)} percent`}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(stop.position * 100),
          text: `Position ${Math.round(stop.position * 100)} percent`,
        }}
      />
    </GestureDetector>
  );
}

// ── Component ────────────────────────────────────────────────────────
export function GradientEditor({
  gradient,
  onChange,
  onCommit,
  style,
}: GradientEditorProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useGradientEditorStyles(colors);
  const reduceMotion = useReducedMotion();

  const [barWidth, setBarWidth] = useState(0);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(
    gradient.stops[0]?.id ?? null,
  );
  const [showColorPicker, setShowColorPicker] = useState(false);

  const handleBarLayout = useCallback((e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
  }, []);

  // ── Stop management ────────────────────────────────────────────────

  const sortedStops = useMemo(
    () => [...gradient.stops].sort((a, b) => a.position - b.position),
    [gradient.stops],
  );

  const gradientColors = useMemo(
    () => sortedStops.map((s) => toHexString(s.color)),
    [sortedStops],
  );

  const gradientPositions = useMemo(
    () => sortedStops.map((s) => s.position),
    [sortedStops],
  );

  const selectedStop = useMemo(
    () => gradient.stops.find((s) => s.id === selectedStopId) ?? null,
    [gradient.stops, selectedStopId],
  );

  const updateGradient = useCallback((newGradient: GradientDefinition, commit = false) => {
    onChange(newGradient);
    if (commit) {
      onCommit(newGradient);
    }
  }, [onChange, onCommit]);

  const handleStopDragChange = useCallback((position: number) => {
    if (!selectedStopId) return;
    const newStops = gradient.stops.map((s) =>
      s.id === selectedStopId ? { ...s, position: normalize({ ...s.color, r: position }).r } : s,
    );
    // Actually just set position directly
    const updatedStops = gradient.stops.map((s) =>
      s.id === selectedStopId ? { ...s, position } : s,
    );
    updateGradient({ ...gradient, stops: updatedStops }, false);
  }, [selectedStopId, gradient, updateGradient]);

  const handleStopDragCommit = useCallback((position: number) => {
    if (!selectedStopId) return;
    const updatedStops = gradient.stops.map((s) =>
      s.id === selectedStopId ? { ...s, position } : s,
    );
    haptic.light();
    updateGradient({ ...gradient, stops: updatedStops }, true);
  }, [selectedStopId, gradient, updateGradient, haptic]);

  const handleAddStop = useCallback(() => {
    if (gradient.stops.length >= MAX_STOPS) return;
    haptic.selection();

    // Find the largest gap between sorted stops and place the new stop there
    const sorted = [...gradient.stops].sort((a, b) => a.position - b.position);
    let bestGap = 0;
    let bestPos = 0.5;
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1]!.position - sorted[i]!.position;
      if (gap > bestGap) {
        bestGap = gap;
        bestPos = (sorted[i]!.position + sorted[i + 1]!.position) / 2;
      }
    }
    if (sorted.length < 2) bestPos = 0.5;

    // Interpolate color at the new position
    const newColor: CreatorColor = interpolateGradientColor(gradient, bestPos);

    const newStop: GradientStop = {
      id: makeStableId('stop'),
      position: bestPos,
      color: newColor,
    };

    const newGradient = {
      ...gradient,
      stops: [...gradient.stops, newStop],
    };
    setSelectedStopId(newStop.id);
    updateGradient(newGradient, true);
  }, [gradient, haptic, updateGradient]);

  const handleRemoveStop = useCallback(() => {
    if (!selectedStopId || gradient.stops.length <= MIN_STOPS) return;
    haptic.light();
    const newStops = gradient.stops.filter((s) => s.id !== selectedStopId);
    const newGradient = { ...gradient, stops: newStops };
    setSelectedStopId(newStops[0]?.id ?? null);
    updateGradient(newGradient, true);
  }, [selectedStopId, gradient, haptic, updateGradient]);

  const handleReverse = useCallback(() => {
    haptic.selection();
    const reversedStops = gradient.stops.map((s) => ({
      ...s,
      position: 1 - s.position,
    }));
    updateGradient({ ...gradient, stops: reversedStops }, true);
  }, [gradient, haptic, updateGradient]);

  const handleAngleChange = useCallback((angle: number) => {
    const clamped = ((angle % 360) + 360) % 360;
    updateGradient({ ...gradient, angle: clamped }, false);
  }, [gradient, updateGradient]);

  const handleAngleCommit = useCallback((angle: number) => {
    const clamped = ((angle % 360) + 360) % 360;
    haptic.light();
    updateGradient({ ...gradient, angle: clamped }, true);
  }, [gradient, updateGradient, haptic]);

  const handleStopColorChange = useCallback((color: CreatorColor) => {
    if (!selectedStopId) return;
    const newStops = gradient.stops.map((s) =>
      s.id === selectedStopId ? { ...s, color } : s,
    );
    updateGradient({ ...gradient, stops: newStops }, false);
  }, [selectedStopId, gradient, updateGradient]);

  const handleStopColorCommit = useCallback((color: CreatorColor) => {
    if (!selectedStopId) return;
    const newStops = gradient.stops.map((s) =>
      s.id === selectedStopId ? { ...s, color } : s,
    );
    haptic.light();
    updateGradient({ ...gradient, stops: newStops }, true);
  }, [selectedStopId, gradient, updateGradient, haptic]);

  const canAddStop = gradient.stops.length < MAX_STOPS;
  const canRemoveStop = gradient.stops.length > MIN_STOPS;

  return (
    <View style={[styles.container, style]}>
      {/* Gradient preview bar with stop thumbs */}
      <View style={styles.barContainer}>
        <View
          onLayout={handleBarLayout}
          style={styles.bar}
        >
          <LinearGradient
            colors={gradientColors as unknown as readonly [ColorValue, ColorValue, ...ColorValue[]]}
            locations={gradientPositions as unknown as readonly [number, number, ...number[]]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
        </View>

        {/* Stop thumbs overlay */}
        {barWidth > 0 && (
          <View style={[styles.thumbsOverlay, { width: barWidth }]}>
            {gradient.stops.map((stop) => (
              <Pressable
                key={`thumb-wrapper-${stop.id}`}
                onPress={() => {
                  haptic.selection();
                  setSelectedStopId(stop.id);
                }}
              >
                <StopThumb
                  stop={stop}
                  barWidth={barWidth}
                  isSelected={stop.id === selectedStopId}
                  onSelect={() => setSelectedStopId(stop.id)}
                  onDragChange={handleStopDragChange}
                  onDragCommit={handleStopDragCommit}
                />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Stop controls */}
      <View style={styles.stopControls}>
        <PressScale
          onPress={handleAddStop}
          style={StyleSheet.flatten([styles.controlBtn, !canAddStop && styles.controlBtnDisabled])}
          disabled={!canAddStop}
          accessibilityLabel="Add gradient stop"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAddStop }}
        >
          <Ionicons name="add-circle-outline" size={20} color={canAddStop ? colors.textPrimary : colors.textMuted} />
        </PressScale>

        <PressScale
          onPress={handleRemoveStop}
          style={StyleSheet.flatten([styles.controlBtn, !canRemoveStop && styles.controlBtnDisabled])}
          disabled={!canRemoveStop}
          accessibilityLabel="Remove selected gradient stop"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canRemoveStop }}
        >
          <Ionicons name="remove-circle-outline" size={20} color={canRemoveStop ? colors.textPrimary : colors.textMuted} />
        </PressScale>

        <PressScale
          onPress={handleReverse}
          style={styles.controlBtn}
          accessibilityLabel="Reverse gradient stops"
          accessibilityRole="button"
        >
          <Ionicons name="swap-horizontal-outline" size={20} color={colors.textPrimary} />
        </PressScale>

        <PressScale
          onPress={() => {
            haptic.selection();
            setShowColorPicker((v) => !v);
          }}
          style={StyleSheet.flatten([
            styles.controlBtn,
            showColorPicker && styles.controlBtnActive,
          ])}
          accessibilityLabel="Edit selected stop color"
          accessibilityRole="button"
          accessibilityState={{ expanded: showColorPicker }}
        >
          <Ionicons
            name="color-palette-outline"
            size={20}
            color={showColorPicker ? colors.brand : colors.textPrimary}
          />
        </PressScale>
      </View>

      {/* Angle control */}
      <View style={styles.angleRow}>
        <Text style={styles.angleLabel}>Angle</Text>
        <AngleSlider
          angle={gradient.angle}
          width={barWidth > 0 ? barWidth : 200}
          onChange={handleAngleChange}
          onCommit={handleAngleCommit}
        />
        <Text style={styles.angleValue}>{Math.round(gradient.angle)}°</Text>
      </View>

      {/* Per-stop color picker */}
      {showColorPicker && selectedStop && (
        <View style={styles.colorPickerSection}>
          <CreatorColorPicker
            color={selectedStop.color}
            onChange={handleStopColorChange}
            onCommit={handleStopColorCommit}
            mode="expanded"
            mediaUris={[]}
            recents={[]}
            projectPalette={[]}
            onCommitRecent={() => {}}
          />
        </View>
      )}
    </View>
  );
}

// ── Angle slider ─────────────────────────────────────────────────────
interface AngleSliderProps {
  angle: number;
  width: number;
  onChange: (angle: number) => void;
  onCommit: (angle: number) => void;
}

function AngleSlider({ angle, width, onChange, onCommit }: AngleSliderProps) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const layoutRef = useRef({ width });
  const THUMB_SIZE = 20;
  const HEIGHT = 28;

  const thumbX = useSharedValue((angle / 360) * width);

  React.useEffect(() => {
    thumbX.value = withTiming((angle / 360) * width, SNAP_TIMING);
  }, [angle, width, thumbX]);

  const panGesture = React.useMemo(() => {
    return Gesture.Pan()
      .activateAfterLongPress(0)
      .onBegin((e) => {
        'worklet';
        const w = layoutRef.current.width;
        const a = Math.max(0, Math.min(1, e.x / w)) * 360;
        thumbX.value = (a / 360) * w;
        runOnJS(onChange)(a);
      })
      .onChange((e) => {
        'worklet';
        const w = layoutRef.current.width;
        const a = Math.max(0, Math.min(1, e.x / w)) * 360;
        thumbX.value = (a / 360) * w;
        runOnJS(onChange)(a);
      })
      .onEnd(() => {
        'worklet';
        const w = layoutRef.current.width;
        const a = Math.max(0, Math.min(1, thumbX.value / w)) * 360;
        runOnJS(onCommit)(a);
      });
  }, [thumbX, onChange, onCommit]);

  const thumbStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        transform: [{ translateX: thumbX.value - THUMB_SIZE / 2 }],
      };
    }
    return {
      transform: [
        { translateX: withTiming(thumbX.value - THUMB_SIZE / 2, SNAP_TIMING) },
      ],
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <View
        onLayout={(e) => { layoutRef.current = { width: e.nativeEvent.layout.width }; }}
        style={[styles.angleSlider, { width, height: HEIGHT }]}
        accessibilityRole="adjustable"
        accessibilityLabel="Gradient angle"
        accessibilityValue={{
          min: 0,
          max: 360,
          now: Math.round(angle),
          text: `${Math.round(angle)} degrees`,
        }}
      >
        <View style={[styles.angleTrack, { backgroundColor: colors.border }]} />
        <Reanimated.View
          style={[
            styles.angleThumb,
            thumbStyle,
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: colors.brand,
              borderColor: colors.textInverse,
            },
          ]}
        />
      </View>
    </GestureDetector>
  );
}

// ── Helper: interpolate gradient color at a position ─────────────────
function interpolateGradientColor(gradient: GradientDefinition, position: number): CreatorColor {
  const sorted = [...gradient.stops].sort((a, b) => a.position - b.position);
  if (sorted.length === 0) return { space: 'srgb', r: 0, g: 0, b: 0, a: 1 };
  if (sorted.length === 1) return sorted[0]!.color;
  if (position <= sorted[0]!.position) return sorted[0]!.color;
  if (position >= sorted[sorted.length - 1]!.position) return sorted[sorted.length - 1]!.color;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (position >= a.position && position <= b.position) {
      const t = (position - a.position) / (b.position - a.position);
      return normalize({
        space: 'srgb',
        r: a.color.r + (b.color.r - a.color.r) * t,
        g: a.color.g + (b.color.g - a.color.g) * t,
        b: a.color.b + (b.color.b - a.color.b) * t,
        a: a.color.a + (b.color.a - a.color.a) * t,
      });
    }
  }
  return sorted[sorted.length - 1]!.color;
}

// ── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    gap: Space.sm,
  },
  barContainer: {
    gap: Space.xs,
  },
  bar: {
    height: GRADIENT_BAR_HEIGHT,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: Stroke.hairline,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  thumbsOverlay: {
    position: 'relative',
    height: STOP_THUMB_SIZE,
    marginTop: 4,
  },
  stopThumb: {
    position: 'absolute',
    top: 0,
    width: STOP_THUMB_SIZE,
    height: STOP_THUMB_SIZE,
    borderRadius: STOP_THUMB_SIZE / 2,
    borderWidth: Stroke.standard,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  stopControls: {
    flexDirection: 'row',
    gap: Space.sm,
    minHeight: Control.hit,
    alignItems: 'center',
  },
  controlBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnDisabled: {
    opacity: 0.4,
  },
  controlBtnActive: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  angleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  angleLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    color: '#666666',
  },
  angleValue: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    minWidth: 40,
    textAlign: 'right',
  },
  angleSlider: {
    flex: 1,
    justifyContent: 'center',
  },
  angleTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
  },
  angleThumb: {
    position: 'absolute',
    top: 4,
    borderWidth: Stroke.emphasis,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  colorPickerSection: {
    marginTop: Space.sm,
  },
});

// ── Theme-dependent styles ───────────────────────────────────────────
function useGradientEditorStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          gap: Space.sm,
        },
        barContainer: {
          gap: Space.xs,
        },
        bar: {
          height: GRADIENT_BAR_HEIGHT,
          borderRadius: Radius.md,
          overflow: 'hidden',
          borderWidth: Stroke.hairline,
          borderColor: 'rgba(0,0,0,0.1)',
        },
        thumbsOverlay: {
          position: 'relative',
          height: STOP_THUMB_SIZE,
          marginTop: 4,
        },
        stopControls: {
          flexDirection: 'row',
          gap: Space.sm,
          minHeight: Control.hit,
          alignItems: 'center',
        },
        controlBtn: {
          width: Control.hit,
          height: Control.hit,
          borderRadius: Radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        controlBtnDisabled: {
          opacity: 0.4,
        },
        controlBtnActive: {
          backgroundColor: 'rgba(0,0,0,0.05)',
        },
        angleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
        },
        angleLabel: {
          fontFamily: Typography.family.semibold,
          fontSize: Type.caption.size,
          color: colors.textSecondary,
        },
        angleValue: {
          fontFamily: Typography.family.medium,
          fontSize: Type.body.size,
          color: colors.textPrimary,
          minWidth: 40,
          textAlign: 'right',
        },
        colorPickerSection: {
          marginTop: Space.sm,
        },
      }),
    [colors],
  );
}
