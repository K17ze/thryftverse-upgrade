import React, { useEffect } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnUI,
} from 'react-native-reanimated';
import { Typography, Type } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useReducedMotion } from '../../hooks/useReducedMotion';

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
// The last-used mode is persisted to AsyncStorage so the camera reopens in
// the mode the user last chose.

export type CreatorCaptureMode = 'look' | 'poster' | 'search';

export interface CreatorModeSwitchProps {
  /** Currently active mode. */
  mode: CreatorCaptureMode;
  /** Called when the user taps a different mode. */
  onModeChange: (mode: CreatorCaptureMode) => void;
}

const STORAGE_KEY = 'creatorCaptureMode';

const MODES: { key: CreatorCaptureMode; label: string }[] = [
  { key: 'look', label: 'Look' },
  { key: 'poster', label: 'Poster' },
  { key: 'search', label: 'Search' },
];

// Fixed-width label slots so the active-indicator dot position is
// deterministic without per-label layout measurement.
const SLOT_WIDTH = 72;
const DOT_SIZE = 5;

export function CreatorModeSwitch({ mode, onModeChange }: CreatorModeSwitchProps) {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();

  // Active-indicator x-offset (animated dot). Each slot is SLOT_WIDTH wide;
  // the dot centres under the active slot.
  const dotX = useSharedValue(0);

  const updateDot = (activeMode: CreatorCaptureMode) => {
    'worklet';
    const idx = MODES.findIndex((m) => m.key === activeMode);
    if (idx >= 0) {
      const target = idx * SLOT_WIDTH + SLOT_WIDTH / 2 - DOT_SIZE / 2;
      dotX.value = withSpring(target, spring.tap);
    }
  };

  // Persist the mode to AsyncStorage (best-effort).
  const persistMode = (next: CreatorCaptureMode) => {
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best-effort — the camera still functions if persistence fails.
    });
  };

  // On mount, read the persisted mode and apply it once (so the camera
  // reopens in the last-used mode). The parent's `mode` prop is the initial
  // value; the persisted value overrides it only when present and different.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const normalized = raw.trim().toLowerCase();
        const valid: CreatorCaptureMode[] = ['look', 'poster', 'search'];
        if (valid.includes(normalized as CreatorCaptureMode) && normalized !== mode) {
          onModeChange(normalized as CreatorCaptureMode);
        }
      })
      .catch(() => {
        // Best-effort — ignore storage failures.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Position the dot whenever the mode changes.
  useEffect(() => {
    runOnUI(updateDot)(mode);
  }, [mode]);

  const handlePress = (next: CreatorCaptureMode) => {
    if (next === mode) return;
    haptic.selection();
    persistMode(next);
    onModeChange(next);
  };

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dotX.value }],
  }));

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
                  active && styles.labelActive,
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
        <Reanimated.View style={[styles.dot, dotStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fixed-width slot; 44pt minHeight satisfies the touch-target minimum
  // while the visible text remains compact.
  labelBtn: {
    width: SLOT_WIDTH,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: 'rgba(255,255,255,0.55)',
  },
  labelActive: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
  },
  // The dot track is exactly the row width (3 × SLOT_WIDTH).
  indicatorTrack: {
    position: 'relative',
    height: DOT_SIZE + 4,
    width: SLOT_WIDTH * MODES.length,
    alignItems: 'flex-start',
  },
  dot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#fff',
  },
});

export default CreatorModeSwitch;
