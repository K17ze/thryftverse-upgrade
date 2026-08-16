/**
 * FreezeFramePicker — set a freeze frame on a video clip.
 *
 * Renders a "Freeze Frame" button (pause-outline). When tapped, an inline
 * panel expands with two sliders:
 *   - Timestamp: 0 to clip duration (where the clip freezes).
 *   - Duration: 0.5s to 5s (how long the frame holds).
 * A "Clear" button removes the freeze frame (passes undefined for both
 * values), restoring normal playback.
 *
 * Mutations route through `onSetFreezeFrame(freezeFrameMs, freezeDurationMs)`
 * which the host maps onto the media layer's `freezeFrameMs` /
 * `freezeDurationMs` fields (composition.ts MediaLayerPayloadSchema).
 *
 * Touch targets are >=44pt (Control.hit). Haptics: `selection` on expand and
 * slider release, `light` on clear (AGENTS.md §13, §27.9).
 *
 * Design references:
 *   - AGENTS.md §11: every control performs a real mutation.
 *   - designTokens Stroke.emphasis for the active button border.
 *   - Matches KeyframeEditor / SpeedCurveEditor visual style.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutChangeEvent,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressScale } from '../../CreatorAnimations';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import {
  Space,
  Radius,
  Stroke,
  Control,
  FontFamily,
  FontSize,
  LetterSpacing,
} from '../../../theme/designTokens';

export interface FreezeFramePickerProps {
  /** Total clip duration in milliseconds (the slider upper bound). */
  clipDurationMs: number;
  /** Current freeze timestamp in ms from clip start, or undefined when none. */
  freezeFrameMs?: number;
  /** Current freeze hold duration in ms, or undefined when none. */
  freezeDurationMs?: number;
  /**
   * Invoked when the user commits a freeze frame or clears it. Passing
   * `undefined` for both values removes the freeze frame entirely.
   */
  onSetFreezeFrame: (
    freezeFrameMs: number | undefined,
    freezeDurationMs: number | undefined,
  ) => void;
}

const MIN_DURATION_MS = 500;
const MAX_DURATION_MS = 5000;
const DEFAULT_DURATION_MS = 1000;
const TIMESTAMP_STEP_MS = 50;
const DURATION_STEP_MS = 100;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function roundToStep(v: number, step: number): number {
  return Math.round(v / step) * step;
}

function formatSeconds(ms: number): string {
  const s = ms / 1000;
  return `${s.toFixed(s >= 10 ? 0 : 1)}s`;
}

export function FreezeFramePicker({
  clipDurationMs,
  freezeFrameMs,
  freezeDurationMs,
  onSetFreezeFrame,
}: FreezeFramePickerProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const hasFreeze = freezeFrameMs != null && freezeDurationMs != null;
  const [expanded, setExpanded] = useState(false);

  // Local live values so the slider thumb tracks the finger before commit.
  const [timestampMs, setTimestampMs] = useState<number>(
    freezeFrameMs ?? 0,
  );
  const [durationMs, setDurationMs] = useState<number>(
    freezeDurationMs ?? DEFAULT_DURATION_MS,
  );

  // Re-sync local state when the committed props change (e.g. undo/redo).
  React.useEffect(() => {
    setTimestampMs(freezeFrameMs ?? 0);
  }, [freezeFrameMs]);
  React.useEffect(() => {
    setDurationMs(freezeDurationMs ?? DEFAULT_DURATION_MS);
  }, [freezeDurationMs]);

  const maxTimestamp = Math.max(0, clipDurationMs);

  const handleToggle = useCallback(() => {
    haptic.selection();
    setExpanded((prev) => !prev);
  }, [haptic]);

  const handleClear = useCallback(() => {
    haptic.light();
    setTimestampMs(0);
    setDurationMs(DEFAULT_DURATION_MS);
    onSetFreezeFrame(undefined, undefined);
  }, [haptic, onSetFreezeFrame]);

  const commitTimestamp = useCallback(
    (next: number) => {
      haptic.selection();
      onSetFreezeFrame(next, durationMs);
    },
    [haptic, onSetFreezeFrame, durationMs],
  );

  const commitDuration = useCallback(
    (next: number) => {
      haptic.selection();
      onSetFreezeFrame(timestampMs, next);
    },
    [haptic, onSetFreezeFrame, timestampMs],
  );

  return (
    <View style={styles.container}>
      <PressScale
        onPress={handleToggle}
        style={[
          styles.button,
          {
            backgroundColor: hasFreeze ? colors.brand : colors.surfaceAlt,
            borderColor: hasFreeze ? colors.brand : colors.borderSubtle,
          },
        ]}
        accessibilityLabel={`Freeze frame${hasFreeze ? ', on' : ', off'}`}
        accessibilityHint="Sets a freeze frame on the clip for dramatic emphasis"
        accessibilityRole="button"
      >
        <Ionicons
          name={hasFreeze ? 'pause' : 'pause-outline'}
          size={22}
          color={hasFreeze ? colors.textInverse : colors.textPrimary}
        />
        <Text
          style={[
            styles.buttonLabel,
            { color: hasFreeze ? colors.textInverse : colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          Freeze Frame
        </Text>
      </PressScale>

      {expanded && (
        <View
          style={[
            styles.panel,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <LabeledSlider
            label="Timestamp"
            valueLabel={formatSeconds(timestampMs)}
            value={timestampMs}
            min={0}
            max={maxTimestamp}
            step={TIMESTAMP_STEP_MS}
            onValueChange={setTimestampMs}
            onRelease={commitTimestamp}
            disabled={maxTimestamp <= 0}
            colors={colors}
          />

          <LabeledSlider
            label="Duration"
            valueLabel={formatSeconds(durationMs)}
            value={durationMs}
            min={MIN_DURATION_MS}
            max={MAX_DURATION_MS}
            step={DURATION_STEP_MS}
            onValueChange={setDurationMs}
            onRelease={commitDuration}
            colors={colors}
          />

          <Pressable
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityLabel="Clear freeze frame"
            accessibilityHint="Removes the freeze frame and resumes normal playback"
            style={[styles.clearButton, { backgroundColor: colors.danger }]}
          >
            <Ionicons name="close-circle-outline" size={16} color="#FFFFFF" />
            <Text style={styles.clearLabel}>Clear</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── LabeledSlider ─────────────────────────────────────────────────────
// A small internal horizontal slider with a label and value readout.
// Uses PanResponder for drag + release semantics; commits on release via
// onRelease so the host performs a single document mutation per gesture.

interface LabeledSliderProps {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (v: number) => void;
  onRelease: (v: number) => void;
  disabled?: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
}

function LabeledSlider({
  label,
  valueLabel,
  value,
  min,
  max,
  step,
  onValueChange,
  onRelease,
  disabled,
  colors,
}: LabeledSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const ratio = useMemo(() => {
    if (max <= min) return 0;
    return clamp((value - min) / (max - min), 0, 1);
  }, [value, min, max]);

  const xToValue = useCallback(
    (x: number) => {
      if (trackWidth <= 0 || max <= min) return min;
      const r = clamp(x / trackWidth, 0, 1);
      return roundToStep(min + r * (max - min), step);
    },
    [trackWidth, min, max, step],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (_e: GestureResponderEvent) => {
          if (disabled) return;
        },
        onPanResponderMove: (
          e: GestureResponderEvent,
          _g: PanResponderGestureState,
        ) => {
          if (disabled) return;
          onValueChange(xToValue(e.nativeEvent.locationX));
        },
        onPanResponderRelease: (
          e: GestureResponderEvent,
          _g: PanResponderGestureState,
        ) => {
          if (disabled) return;
          const v = xToValue(e.nativeEvent.locationX);
          onValueChange(v);
          onRelease(v);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, trackWidth, min, max, step, onValueChange, onRelease],
  );

  const pct = Math.round(ratio * 100);

  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderHeader}>
        <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
        <Text style={[styles.sliderValue, { color: colors.textPrimary }]}>
          {valueLabel}
        </Text>
      </View>
      <View
        style={[styles.sliderTrack, disabled && styles.sliderTrackDisabled]}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{
          min,
          max,
          now: value,
          text: valueLabel,
        }}
      >
        <View
          style={[
            styles.sliderTrackBg,
            { backgroundColor: colors.borderSubtle },
          ]}
        />
        <View
          style={[
            styles.sliderFill,
            { width: `${pct}%`, backgroundColor: colors.brand },
          ]}
        />
        <View
          style={[
            styles.sliderThumb,
            { left: `${pct}%`, backgroundColor: colors.textInverse },
          ]}
        />
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.xs,
    gap: Space.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    minHeight: Control.hit,
    borderRadius: Radius.sm,
    borderWidth: Stroke.standard,
  },
  buttonLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.caption,
    letterSpacing: LetterSpacing.normal,
  },
  panel: {
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
    padding: Space.sm,
    gap: Space.sm,
  },
  sliderRow: {
    gap: Space.xs,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Control.chrome,
  },
  sliderLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.caption,
    letterSpacing: LetterSpacing.normal,
  },
  sliderValue: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    letterSpacing: LetterSpacing.normal,
    minWidth: 40,
    textAlign: 'right',
  },
  sliderTrack: {
    height: Control.hit,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrackDisabled: {
    opacity: 0.4,
  },
  sliderTrackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: Radius.full,
  },
  sliderFill: {
    height: 4,
    borderRadius: Radius.full,
  },
  sliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    marginLeft: -9,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    borderRadius: Radius.sm,
    minHeight: Control.hit,
  },
  clearLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    color: '#FFFFFF',
    letterSpacing: LetterSpacing.normal,
  },
});

// Keep ViewStyle referenced for typed style composition without unused-import
// errors at compile time.
export type FreezeFramePickerViewStyle = ViewStyle;
