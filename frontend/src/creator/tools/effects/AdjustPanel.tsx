/**
 * AdjustPanel — a panel of sliders for fine-tuning image adjustments.
 *
 * One slider per parameter from ADJUST_PARAMETERS. Each row shows the
 * parameter name (left), the current value (right), and a full-width
 * slider. A reset button sits at the top. The panel is transparent — no
 * card surface — so it composes cleanly into any host sheet.
 *
 * Uses react-native-gesture-handler + react-native-reanimated for smooth
 * 60fps slider dragging (replaces the legacy PanResponder approach per
 * spec 07 §4). Features:
 * - drag to adjust
 * - tap to jump
 * - haptic at neutral (0)
 * - one history commit on release (onCommit)
 * - numeric label
 * - reset button per slider
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13: 44pt touch targets for reset buttons.
 * Per AGENTS.md §17: spring/timing respects reduced motion.
 * Per AGENTS.md §18: accessibility role adjustable, value announced.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  Space,
  FontSize,
  FontFamily,
  Radius,
  Stroke,
  Control,
} from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { ADJUST_PARAMETERS } from './EffectPresets';
import type { AdjustNode } from './EffectTypes';

export interface AdjustPanelProps {
  /** Current adjustment values (partial — missing keys default to 0). */
  values: Partial<AdjustNode>;
  /** Live callback while dragging (no history commit). */
  onChange: (parameter: string, value: number) => void;
  /** Commit callback on slider release (one history entry). */
  onCommit?: (parameter: string, value: number) => void;
  /** Reset all adjustments to defaults. */
  onReset: () => void;
}

/**
 * Render one slider row per adjustment parameter.
 */
export function AdjustPanel({ values, onChange, onCommit, onReset }: AdjustPanelProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const handleReset = useCallback(() => {
    if (!reducedMotion) haptic.light();
    onReset();
  }, [haptic, onReset, reducedMotion]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text
          style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: FontFamily.semibold }]}
        >
          Adjust
        </Text>
        <Pressable
          onPress={handleReset}
          hitSlop={Space.sm}
          accessibilityRole="button"
          accessibilityLabel="Reset all adjustments"
          style={({ pressed }) => [
            styles.resetButton,
            { opacity: pressed ? 0.6 : 1, minHeight: Control.hit, minWidth: Control.hit },
          ]}
        >
          <Text
            style={[styles.resetLabel, { color: colors.textSecondary, fontFamily: FontFamily.medium }]}
          >
            Reset
          </Text>
        </Pressable>
      </View>

      {ADJUST_PARAMETERS.map((param) => {
        const raw = values?.[param.id as keyof Omit<AdjustNode, 'type'>];
        const value = raw ?? param.default;
        return (
          <AdjustSliderRow
            key={param.id}
            paramId={param.id}
            label={param.name}
            min={param.min}
            max={param.max}
            value={value}
            trackColor={colors.border}
            fillColor={colors.brand}
            thumbColor={colors.textPrimary}
            labelColor={colors.textPrimary}
            valueColor={colors.textMuted}
            resetColor={colors.textMuted}
            onChange={(v) => onChange(param.id, v)}
            onCommit={onCommit ? (v) => onCommit(param.id, v) : undefined}
            reducedMotion={reducedMotion}
            haptic={haptic}
          />
        );
      })}
    </View>
  );
}

// ── Internal slider row ────────────────────────────────────────────────

interface AdjustSliderRowProps {
  paramId: string;
  label: string;
  min: number;
  max: number;
  value: number;
  trackColor: string;
  fillColor: string;
  thumbColor: string;
  labelColor: string;
  valueColor: string;
  resetColor: string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  reducedMotion: boolean;
  haptic: ReturnType<typeof useHaptic>;
}

function AdjustSliderRow({
  paramId,
  label,
  min,
  max,
  value,
  trackColor,
  fillColor,
  thumbColor,
  labelColor,
  valueColor,
  resetColor,
  onChange,
  onCommit,
  reducedMotion,
  haptic,
}: AdjustSliderRowProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const range = max - min;
  const ratio = range === 0 ? 0 : (Math.min(max, Math.max(min, value)) - min) / range;

  // Shared value for the thumb position (pixels from left).
  const thumbPosition = useSharedValue(ratio * trackWidth);
  const isDragging = useSharedValue(false);
  const lastHapticValue = useSharedValue(value);

  // Sync shared value when prop changes externally.
  React.useEffect(() => {
    if (!isDragging.value && trackWidth > 0) {
      const targetRatio = range === 0 ? 0 : (Math.min(max, Math.max(min, value)) - min) / range;
      thumbPosition.value = reducedMotion
        ? targetRatio * trackWidth
        : withTiming(targetRatio * trackWidth, {
            duration: 120,
            easing: Easing.out(Easing.quad),
          });
    }
  }, [value, trackWidth, min, max, range, thumbPosition, isDragging, reducedMotion]);

  const handleLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      const w = e.nativeEvent.layout.width;
      setTrackWidth(w);
      const r = range === 0 ? 0 : (Math.min(max, Math.max(min, value)) - min) / range;
      thumbPosition.value = r * w;
    },
    [range, min, max, value, thumbPosition],
  );

  const valueFromPosition = useCallback(
    (pos: number): number => {
      const w = trackWidth > 0 ? trackWidth : 1;
      const r = Math.min(1, Math.max(0, pos / w));
      return Math.round((min + r * range) * 1000) / 1000;
    },
    [trackWidth, min, range],
  );

  // ── Pan gesture ──────────────────────────────────────────────────────
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          isDragging.value = true;
        })
        .onUpdate((e) => {
          const w = trackWidth > 0 ? trackWidth : 1;
          const clamped = Math.min(w, Math.max(0, e.absoluteX));
          thumbPosition.value = clamped;
          const v = valueFromPosition(clamped);

          // Haptic at neutral (0) — fire once when crossing.
          if (lastHapticValue.value !== 0 && v === 0) {
            runOnJS(haptic.selection)();
          }
          lastHapticValue.value = v;

          runOnJS(onChange)(v);
        })
        .onEnd(() => {
          isDragging.value = false;
          const w = trackWidth > 0 ? trackWidth : 1;
          const v = valueFromPosition(thumbPosition.value);
          if (onCommit) {
            runOnJS(onCommit)(v);
          }
          runOnJS(haptic.light)();
        }),
    [trackWidth, thumbPosition, isDragging, lastHapticValue, valueFromPosition, onChange, onCommit, haptic],
  );

  // ── Tap to jump ──────────────────────────────────────────────────────
  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        const w = trackWidth > 0 ? trackWidth : 1;
        const clamped = Math.min(w, Math.max(0, e.x));
        thumbPosition.value = reducedMotion
          ? clamped
          : withTiming(clamped, { duration: 120 });
        const v = valueFromPosition(clamped);

        if (lastHapticValue.value !== 0 && v === 0) {
          runOnJS(haptic.selection)();
        }
        lastHapticValue.value = v;

        runOnJS(onChange)(v);
        if (onCommit) {
          runOnJS(onCommit)(v);
        }
        runOnJS(haptic.light)();
      }),
    [trackWidth, thumbPosition, reducedMotion, valueFromPosition, onChange, onCommit, haptic, lastHapticValue],
  );

  // ── Reset per slider ─────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    haptic.light();
    onChange(0);
    if (onCommit) onCommit(0);
    if (trackWidth > 0) {
      const resetRatio = range === 0 ? 0 : (0 - min) / range;
      thumbPosition.value = reducedMotion
        ? resetRatio * trackWidth
        : withTiming(resetRatio * trackWidth, { duration: 150 });
    }
  }, [haptic, onChange, onCommit, trackWidth, min, range, thumbPosition, reducedMotion]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbPosition.value - 8 }],
  }));

  const fillStyle = useAnimatedStyle(() => {
    // For bidirectional sliders (min < 0 < max), fill from center to thumb.
    if (min < 0 && max > 0) {
      const center = trackWidth / 2;
      const pos = thumbPosition.value;
      if (pos >= center) {
        return { left: center, width: pos - center };
      }
      return { left: pos, width: center - pos };
    }
    return { left: 0, width: thumbPosition.value };
  });

  const clamped = Math.min(max, Math.max(min, value));
  const displayValue = formatValue(clamped);
  const isNonZero = Math.abs(clamped) > 0.001;

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={[styles.rowLabel, { color: labelColor, fontFamily: FontFamily.regular }]}>
          {label}
        </Text>
        <View style={styles.rowRight}>
          {isNonZero && (
            <Pressable
              onPress={handleReset}
              hitSlop={Space.xs}
              accessibilityRole="button"
              accessibilityLabel={`Reset ${label}`}
              style={({ pressed }) => [
                styles.rowReset,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <Text style={[styles.rowResetText, { color: resetColor }]}>
                Reset
              </Text>
            </Pressable>
          )}
          <Text style={[styles.rowValue, { color: valueColor, fontFamily: FontFamily.medium }]}>
            {displayValue}
          </Text>
        </View>
      </View>
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <Animated.View
          style={styles.trackWrap}
          onLayout={handleLayout}
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{
            min: min * 100,
            max: max * 100,
            now: Math.round(clamped * 100),
          }}
          accessibilityHint={`Drag to adjust ${label}. Double-tap to reset.`}
        >
          <View style={[styles.track, { backgroundColor: trackColor }]} />
          <Animated.View style={[styles.fill, fillStyle, { backgroundColor: fillColor }]} />
          {/* Center marker for bidirectional sliders */}
          {min < 0 && max > 0 && trackWidth > 0 && (
            <View style={[styles.centerMark, { left: trackWidth / 2 - 0.5 }]} />
          )}
          <Animated.View
            style={[styles.thumb, thumbStyle, { backgroundColor: thumbColor }]}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function formatValue(v: number): string {
  if (v === 0) return '0';
  const rounded = Math.round(v * 100) / 100;
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  headerTitle: {
    fontSize: FontSize.body,
  },
  resetButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.sm,
  },
  resetLabel: {
    fontSize: FontSize.caption,
  },
  row: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  rowLabel: {
    fontSize: FontSize.caption,
  },
  rowValue: {
    fontSize: FontSize.caption,
    fontVariant: ['tabular-nums'],
    minWidth: 32,
    textAlign: 'right',
  },
  rowReset: {
    paddingVertical: 2,
    paddingHorizontal: Space.xs,
  },
  rowResetText: {
    fontSize: FontSize.micro,
    fontFamily: FontFamily.regular,
  },
  trackWrap: {
    height: Control.hit,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: Radius.full,
  },
  fill: {
    position: 'absolute',
    height: 3,
    borderRadius: Radius.full,
  },
  centerMark: {
    position: 'absolute',
    width: 1,
    height: 8,
    top: (Control.hit - 8) / 2,
    backgroundColor: 'rgba(128,128,128,0.3)',
  },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: 'rgba(0,0,0,0)',
  },
});
