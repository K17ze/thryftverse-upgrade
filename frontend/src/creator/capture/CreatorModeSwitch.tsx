import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring } from 'react-native-reanimated';
import { Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppTheme } from '../../theme/ThemeContext';
import { setStoredCreateMode } from '../../preferences/createModePreferences';

// ── CreatorModeSwitch ──────────────────────────────────────────────────
// A minimal Look / Poster / Search switch that sits at the bottom of the
// camera preview. This is NOT a bulky rounded segmented control — it is a
// simple text-based switch with a subtle active indicator (a small dot
// beneath the active label) that springs between modes.
//
// Per the human-flow reconstruction spec: "Creation is a continuous state,
// not a wizard." The mode switch lets the user reframe their intent without
// leaving the camera — no route transition, just a mode change.
//
// Look/Poster preference is persisted by the canonical Create preference
// owner. Visual Search is intentionally transient.

export type CreatorCaptureMode = 'look' | 'poster' | 'visual-search';

export interface CreatorModeSwitchProps {
  /** Currently active mode. */
  mode: CreatorCaptureMode;
  /** Called when the user taps a different mode. */
  onModeChange: (mode: CreatorCaptureMode) => void;
}

const MODES: { key: CreatorCaptureMode; label: string }[] = [
  { key: 'look', label: 'Look' },
  { key: 'poster', label: 'Poster' },
  { key: 'visual-search', label: 'Search' },
];

// Fixed-width label slots so the active-indicator dot position is
// deterministic without per-label layout measurement.
const SLOT_WIDTH = 72;
const DOT_SIZE = 5;

export function CreatorModeSwitch({ mode, onModeChange }: CreatorModeSwitchProps) {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const { colors } = useAppTheme();

  // Active-indicator x-offset (animated dot). Each slot is SLOT_WIDTH wide;
  // the dot centres under the active slot.
  const initialModeIndex = Math.max(0, MODES.findIndex((item) => item.key === mode));
  const dotX = useSharedValue(initialModeIndex * SLOT_WIDTH + SLOT_WIDTH / 2 - DOT_SIZE / 2);

  const updateDot = useCallback((activeMode: CreatorCaptureMode) => {
    const idx = MODES.findIndex((m) => m.key === activeMode);
    if (idx >= 0) {
      const target = idx * SLOT_WIDTH + SLOT_WIDTH / 2 - DOT_SIZE / 2;
      dotX.value = reducedMotion ? target : withSpring(target, spring.tap);
    }
  }, [dotX, reducedMotion, spring.tap]);

  // Position the dot whenever the mode changes.
  useEffect(() => {
    updateDot(mode);
  }, [mode, updateDot]);

  const handlePress = (next: CreatorCaptureMode) => {
    if (next === mode) return;
    haptic.selection();
    if (next !== 'visual-search') {
      void setStoredCreateMode(next);
    }
    onModeChange(next);
  };

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dotX.value }] }));

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.row}>
        {MODES.map((m) => {
          const active = m.key === mode;
          return (
            <Pressable
              key={m.key}
              style={styles.labelBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              onPress={() => handlePress(m.key)}
              accessibilityLabel={`${m.label} mode`}
              accessibilityHint={`Switches the camera to ${m.label.toLowerCase()} mode`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Reanimated.Text
                style={[
                  styles.label,
                  active
                    ? { color: colors.scrimTextPrimary, fontFamily: Typography.family.semibold }
                    : { color: colors.scrimTextSecondary, fontFamily: Typography.family.regular },
                ]}
              >
                {m.label}
              </Reanimated.Text>
            </Pressable>
          );
        })}
      </View>
      {/* Active indicator — a small dot that springs beneath the active label.
          The track matches the row width so translateX maps 1:1 to slots. */}
      <View style={styles.indicatorTrack} pointerEvents="none">
        <Reanimated.View style={[styles.dot, { backgroundColor: colors.scrimTextPrimary }, dotStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center' },
  // Fixed-width slot; 44pt minHeight satisfies the touch-target minimum
  // while the visible text remains compact.
  labelBtn: {
    width: SLOT_WIDTH,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center' },
  label: {
    fontSize: TypographyV2.body.size,
    // color + fontFamily applied inline via scrim text tokens (active/inactive)
  },
  labelActive: {
    // Applied inline via colors.scrimTextPrimary + Typography.family.semibold
  },
  // The dot track is exactly the row width (3 × SLOT_WIDTH).
  indicatorTrack: {
    position: 'relative',
    height: DOT_SIZE + 4,
    width: SLOT_WIDTH * MODES.length,
    alignItems: 'flex-start' },
  dot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    // backgroundColor applied inline via colors.scrimTextPrimary (theme token)
  } });

export default CreatorModeSwitch;
