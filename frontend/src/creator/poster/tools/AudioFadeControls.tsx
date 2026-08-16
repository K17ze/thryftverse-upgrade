/**
 * AudioFadeControls — sliders for audio fade in/out.
 *
 * Two sliders:
 *   - Fade In:  0 to 5000ms (volume ramp at the start of the track).
 *   - Fade Out: 0 to 5000ms (volume ramp at the end of the track).
 * Each slider shows its current value in seconds (e.g. "0.5s"). Values are
 * committed on slider release via `onChange(fadeInMs, fadeOutMs)` so the
 * host performs a single document mutation per gesture.
 *
 * Maps onto AudioConfig.fadeInMs / fadeOutMs (src/creator/tools/audio/AudioTypes.ts).
 *
 * Touch targets are >=44pt (Control.hit). Haptics: `selection` on release
 * (AGENTS.md §13, §27.9).
 *
 * Design references:
 *   - AGENTS.md §11: every control performs a real mutation.
 *   - designTokens Stroke / Control / FontFamily for consistent chrome.
 *   - Matches FreezeFramePicker / KeyframeEditor visual style.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  LayoutChangeEvent,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import {
  Space,
  Radius,
  Control,
  FontFamily,
  FontSize,
  LetterSpacing,
} from '../../../theme/designTokens';

export interface AudioFadeControlsProps {
  /** Current fade-in duration in milliseconds. */
  fadeInMs: number;
  /** Current fade-out duration in milliseconds. */
  fadeOutMs: number;
  /** Invoked on slider release with the committed fade values. */
  onChange: (fadeInMs: number, fadeOutMs: number) => void;
  /** Optional maximum fade value in ms (defaults to 5000). */
  maxMs?: number;
}

const DEFAULT_MAX_MS = 5000;
const STEP_MS = 100;

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

export function AudioFadeControls({
  fadeInMs,
  fadeOutMs,
  onChange,
  maxMs = DEFAULT_MAX_MS,
}: AudioFadeControlsProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  // Local live values so the slider thumb tracks the finger before commit.
  const [localFadeIn, setLocalFadeIn] = useState(fadeInMs);
  const [localFadeOut, setLocalFadeOut] = useState(fadeOutMs);

  // Re-sync local state when the committed props change (e.g. undo/redo).
  React.useEffect(() => {
    setLocalFadeIn(fadeInMs);
  }, [fadeInMs]);
  React.useEffect(() => {
    setLocalFadeOut(fadeOutMs);
  }, [fadeOutMs]);

  const commitFadeIn = useCallback(
    (next: number) => {
      haptic.selection();
      onChange(next, localFadeOut);
    },
    [haptic, onChange, localFadeOut],
  );

  const commitFadeOut = useCallback(
    (next: number) => {
      haptic.selection();
      onChange(localFadeIn, next);
    },
    [haptic, onChange, localFadeIn],
  );

  return (
    <View style={styles.container}>
      <FadeSlider
        label="Fade In"
        value={localFadeIn}
        min={0}
        max={maxMs}
        onValueChange={setLocalFadeIn}
        onRelease={commitFadeIn}
        colors={colors}
      />
      <FadeSlider
        label="Fade Out"
        value={localFadeOut}
        min={0}
        max={maxMs}
        onValueChange={setLocalFadeOut}
        onRelease={commitFadeOut}
        colors={colors}
      />
    </View>
  );
}

// ── FadeSlider ────────────────────────────────────────────────────────
// Internal labelled slider. PanResponder drives live updates; onRelease
// commits a single mutation to the host.

interface FadeSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onValueChange: (v: number) => void;
  onRelease: (v: number) => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}

function FadeSlider({
  label,
  value,
  min,
  max,
  onValueChange,
  onRelease,
  colors,
}: FadeSliderProps) {
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
      return roundToStep(min + r * (max - min), STEP_MS);
    },
    [trackWidth, min, max],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (e: GestureResponderEvent) => {
          onValueChange(xToValue(e.nativeEvent.locationX));
        },
        onPanResponderRelease: (e: GestureResponderEvent) => {
          const v = xToValue(e.nativeEvent.locationX);
          onValueChange(v);
          onRelease(v);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackWidth, min, max, onValueChange, onRelease],
  );

  const pct = Math.round(ratio * 100);

  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderHeader}>
        <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
        <Text style={[styles.sliderValue, { color: colors.textPrimary }]}>
          {formatSeconds(value)}
        </Text>
      </View>
      <View
        style={styles.sliderTrack}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{
          min,
          max,
          now: value,
          text: formatSeconds(value),
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
});

// Keep ViewStyle referenced for typed style composition without unused-import
// errors at compile time.
export type AudioFadeControlsViewStyle = ViewStyle;
