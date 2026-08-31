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

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { CreatorSlider } from '../../controls/CreatorSlider';
import {
  Space,
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
      />
      <FadeSlider
        label="Fade Out"
        value={localFadeOut}
        min={0}
        max={maxMs}
        onValueChange={setLocalFadeOut}
        onRelease={commitFadeOut}
      />
    </View>
  );
}

// ── FadeSlider ────────────────────────────────────────────────────────
// Internal labelled slider. Delegates the track to the shared
// CreatorSlider (RNGH + Reanimated); onCommit fires on release so the
// host performs a single document mutation per gesture.

interface FadeSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onValueChange: (v: number) => void;
  onRelease: (v: number) => void;
}

function FadeSlider({
  label,
  value,
  min,
  max,
  onValueChange,
  onRelease,
}: FadeSliderProps) {
  const { colors } = useAppTheme();
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
      <CreatorSlider
        value={value}
        min={min}
        max={max}
        step={STEP_MS}
        onValueChange={onValueChange}
        onCommit={onRelease}
        accessibilityLabel={label}
      />
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
});

// Keep ViewStyle referenced for typed style composition without unused-import
// errors at compile time.
export type AudioFadeControlsViewStyle = ViewStyle;
