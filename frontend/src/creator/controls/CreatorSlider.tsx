/**
 * CreatorSlider — shared slider using RNGH + Reanimated (NOT PanResponder).
 *
 * Lightroom/Snapseed 2026 visual language:
 *   - 2pt track, surfaceAlt background
 *   - Bidirectional brand fill from neutral (center) to current value
 *   - 16pt solid brand thumb, no shadow, no border
 *   - Thumb shrinks to 14pt on press (tactile, 100ms timing — never bounce)
 *   - Optional neutral tick mark (2pt × 16pt brand) shown when value ≠ neutral
 *   - Clean track — no step marks
 *
 * Features:
 *   - Drag thumb to change value
 *   - Tap on track to jump
 *   - Accessibility: increment/decrement for screen reader users
 *   - Haptic at neutral value (0) if `hapticAtNeutral` is true
 *   - One `onCommit` call on gesture end (for undo history)
 *   - Smooth 60fps via Reanimated worklets (off JS thread)
 *   - Reduced-motion: instant settle
 *
 * Design references:
 *   - AGENTS.md §4 (anti-AI: restraint, one system)
 *   - AGENTS.md §17 (No PanResponder — use RNGH; press physics 90-120ms, no bounce)
 *   - AGENTS.md §27.8 (60fps via Reanimated worklets, off JS thread)
 */
import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  type AccessibilityRole,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';

import { Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { Motion } from '../../theme/motionTokens';
import { useHaptic } from '../../hooks/useHaptic';

// ── Constants ────────────────────────────────────────────────────────

const TRACK_HEIGHT = 2;
const THUMB_SIZE = 16;
const THUMB_PRESS_SCALE = 14 / 16;
const NEUTRAL_TICK_WIDTH = 2;
const NEUTRAL_TICK_HEIGHT = 16;
const MIN_TOUCH_TARGET = 44;
const HAPTIC_DEBOUNCE_MS = 80;
const PRESS_DURATION_MS = 100;

// ── Props ────────────────────────────────────────────────────────────

export interface CreatorSliderProps {
  /** Current value. */
  value: number;
  /** Minimum value (default 0). */
  min?: number;
  /** Maximum value (default 1). */
  max?: number;
  /** Step size (default 0.01). Set to 0 or undefined for continuous. */
  step?: number;
  /**
   * Neutral origin for the bidirectional fill. The brand fill spans from the
   * neutral position to the current thumb — the Lightroom/Snapseed pattern
   * where adjustments read as distance from neutral. Defaults to `min`
   * (left-anchored fill) so sliders without a natural zero keep legacy
   * left-to-right fill behaviour.
   */
  neutral?: number;
  /** Called continuously during drag with the new value. */
  onValueChange?: (value: number) => void;
  /** Called once on gesture end with the final value (for undo history). */
  onCommit?: (value: number) => void;
  /** Optional label shown above the slider. */
  label?: string;
  /** Accessibility label for screen readers. */
  accessibilityLabel?: string;
  /** Accessibility hint for screen readers. */
  accessibilityHint?: string;
  /** When true, fires a selection haptic when the value crosses neutral. */
  hapticAtNeutral?: boolean;
  /**
   * When true, renders a 2pt × 16pt brand tick at the neutral position while
   * the value is away from neutral — a quiet reference for how far the
   * adjustment has travelled from zero.
   */
  showNeutralTick?: boolean;
  /** When true, the slider is non-interactive and dimmed. */
  disabled?: boolean;
  /** Called when drag state changes (true on drag start, false on release). */
  onDragStateChange?: (dragging: boolean) => void;
  /** Test ID. */
  testID?: string;
}

// ── Component ────────────────────────────────────────────────────────

export function CreatorSlider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  neutral,
  onValueChange,
  onCommit,
  label,
  accessibilityLabel,
  accessibilityHint,
  hapticAtNeutral = false,
  showNeutralTick = false,
  disabled = false,
  onDragStateChange,
  testID,
}: CreatorSliderProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();

  const neutralValue = neutral ?? min;
  const hasBidirectionalFill = neutralValue > min && neutralValue < max;

  const widthSV = useSharedValue(0);
  const thumbPos = useSharedValue(0);
  const thumbScale = useSharedValue(1);
  const lastHapticSV = useSharedValue(0);
  const isDraggingSV = useSharedValue(false);
  const prevWasPositiveSV = useSharedValue(true);
  const valueSV = useSharedValue(value);

  const [width, setWidth] = React.useState(0);
  const RANGE = max - min;

  const neutralRatio = RANGE > 0 ? (neutralValue - min) / RANGE : 0;
  const neutralLeft = neutralRatio * width;
  const showTick =
    showNeutralTick && hasBidirectionalFill && Math.abs(value - neutralValue) > 0.001;

  // Update thumb position when value changes externally (not during drag)
  React.useEffect(() => {
    if (width > 0 && !isDraggingSV.value) {
      const ratio = RANGE > 0 ? (value - min) / RANGE : 0;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      // Timing-based settle — no overshoot for utility UI.
      thumbPos.value = reduceMotion
        ? withTiming(clampedRatio * width, { duration: 0 })
        : withTiming(clampedRatio * width, { duration: Motion.duration.fast });
    }
    valueSV.value = value;
  }, [value, width, min, RANGE, reduceMotion, thumbPos, isDraggingSV, valueSV]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthSV.value = w;
  }, [widthSV]);

  const setPressed = useCallback(
    (pressed: boolean) => {
      'worklet';
      thumbScale.value = reduceMotion
        ? pressed
          ? THUMB_PRESS_SCALE
          : 1
        : withTiming(pressed ? THUMB_PRESS_SCALE : 1, { duration: PRESS_DURATION_MS });
    },
    [reduceMotion, thumbScale],
  );

  // Worklet: convert x position to value and update thumb
  const updateFromPosition = useCallback(
    (x: number) => {
      'worklet';
      const w = widthSV.value;
      if (w <= 0) return;
      const ratio = Math.max(0, Math.min(1, x / w));
      let newVal = min + ratio * RANGE;
      if (step && step > 0) {
        newVal = Math.round(newVal / step) * step;
      }
      const newRatio = RANGE > 0 ? (newVal - min) / RANGE : 0;
      thumbPos.value = newRatio * w;
      valueSV.value = newVal;

      if (onValueChange) {
        runOnJS(onValueChange)(newVal);
      }

      // Haptic at neutral (0) crossing
      if (hapticAtNeutral) {
        const isPositive = newVal > 0;
        if (isPositive !== prevWasPositiveSV.value) {
          const now = Date.now();
          if (now - lastHapticSV.value > HAPTIC_DEBOUNCE_MS) {
            lastHapticSV.value = now;
            runOnJS(haptic.selection)();
          }
          prevWasPositiveSV.value = isPositive;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [min, RANGE, step, hapticAtNeutral, onValueChange, haptic],
  );

  // Pan gesture — worklet-based, runs on UI thread
  const panGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(0)
        .enabled(!disabled)
        .onBegin((e) => {
          'worklet';
          isDraggingSV.value = true;
          setPressed(true);
          if (onDragStateChange) runOnJS(onDragStateChange)(true);
          updateFromPosition(e.x);
        })
        .onChange((e) => {
          'worklet';
          updateFromPosition(e.x);
        })
        .onEnd(() => {
          'worklet';
          setPressed(false);
          const w = widthSV.value;
          if (w > 0) {
            // Settle the thumb with timing, not a spring — no overshoot
            // for utility UI per AGENTS.md §4 / Design.md snap physics.
            thumbPos.value = reduceMotion
              ? withTiming(thumbPos.value, { duration: 0 })
              : withTiming(thumbPos.value, { duration: Motion.duration.fast });
          }
          isDraggingSV.value = false;
          if (onDragStateChange) runOnJS(onDragStateChange)(false);
          if (onCommit) {
            const ratio = w > 0 ? Math.max(0, Math.min(1, thumbPos.value / w)) : 0;
            let finalVal = min + ratio * RANGE;
            if (step && step > 0) {
              finalVal = Math.round(finalVal / step) * step;
            }
            // Commit haptic — fires on release, not on press-start.
            runOnJS(haptic.light)();
            runOnJS(onCommit)(finalVal);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, reduceMotion, min, RANGE, step, onCommit, onDragStateChange, updateFromPosition, setPressed, haptic],
  );

  // Tap gesture — tap on track to jump
  const tapGesture = React.useMemo(
    () =>
      Gesture.Tap()
        .enabled(!disabled)
        .onEnd((e) => {
          'worklet';
          updateFromPosition(e.x);
          if (onCommit) {
            const w = widthSV.value;
            const ratio = w > 0 ? Math.max(0, Math.min(1, e.x / w)) : 0;
            let finalVal = min + ratio * RANGE;
            if (step && step > 0) {
              finalVal = Math.round(finalVal / step) * step;
            }
            runOnJS(onCommit)(finalVal);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, min, RANGE, step, onCommit, updateFromPosition],
  );

  const composedGesture = React.useMemo(
    () => Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture],
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: thumbPos.value },
      { scale: thumbScale.value },
    ],
  }));

  // Bidirectional fill: brand span from neutral origin to current thumb.
  // For sliders without an interior neutral, this collapses to the legacy
  // left-anchored fill (neutral at min).
  const fillStyle = useAnimatedStyle(() => {
    const w = widthSV.value;
    if (w <= 0) return { left: 0, width: 0 };
    const neutralX = neutralRatio * w;
    const thumbX = thumbPos.value;
    if (thumbX >= neutralX) {
      return { left: neutralX, width: Math.max(0, thumbX - neutralX) };
    }
    return { left: thumbX, width: Math.max(0, neutralX - thumbX) };
  });

  // Accessibility: increment/decrement
  const handleAccessibilityIncrement = useCallback(() => {
    if (disabled) return;
    const newVal = Math.min(max, value + (step || 0.01));
    onValueChange?.(newVal);
    onCommit?.(newVal);
    haptic.selection();
  }, [disabled, max, value, step, onValueChange, onCommit, haptic]);

  const handleAccessibilityDecrement = useCallback(() => {
    if (disabled) return;
    const newVal = Math.max(min, value - (step || 0.01));
    onValueChange?.(newVal);
    onCommit?.(newVal);
    haptic.selection();
  }, [disabled, min, value, step, onValueChange, onCommit, haptic]);

  const displayValue = step && step >= 1
    ? Math.round(value).toString()
    : value.toFixed(step && step < 0.1 ? 2 : 1);

  return (
    <View style={[styles.container, disabled && styles.disabled]} testID={testID}>
      {label && (
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {label}
          </Text>
          <Text style={[styles.value, { color: colors.textPrimary }]}>
            {displayValue}
          </Text>
        </View>
      )}

      <GestureDetector gesture={composedGesture}>
        <View
          style={styles.trackContainer}
          onLayout={handleLayout}
          accessible
          accessibilityRole={'adjustable' as AccessibilityRole}
          accessibilityLabel={accessibilityLabel ?? label ?? 'Slider'}
          accessibilityHint={accessibilityHint}
          accessibilityValue={{
            min,
            max,
            now: Math.round(value * 100) / 100,
            text: displayValue,
          }}
          accessibilityActions={[
            { name: 'increment', label: 'Increment' },
            { name: 'decrement', label: 'Decrement' },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'increment') {
              handleAccessibilityIncrement();
            } else if (e.nativeEvent.actionName === 'decrement') {
              handleAccessibilityDecrement();
            }
          }}
        >
          {/* Track background */}
          <View
            style={[
              styles.track,
              { backgroundColor: colors.surfaceAlt },
            ]}
          />

          {/* Bidirectional brand fill (neutral → thumb) */}
          <Reanimated.View
            style={[
              styles.fill,
              { backgroundColor: colors.brand },
              fillStyle,
            ]}
            pointerEvents="none"
          />

          {/* Neutral tick — quiet reference mark while adjusted away from zero */}
          {showTick && (
            <View
              style={[
                styles.neutralTick,
                { left: neutralLeft, backgroundColor: colors.brand },
              ]}
              pointerEvents="none"
            />
          )}

          {/* Thumb */}
          <Reanimated.View
            style={[
              styles.thumb,
              { backgroundColor: colors.brand },
              thumbStyle,
            ]}
            pointerEvents="none"
          />
        </View>
      </GestureDetector>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    gap: Space.xs,
  },
  disabled: {
    opacity: 0.4,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  value: {
    fontFamily: TypographyV2.numericMeta.fontFamily,
    fontSize: TypographyV2.numericMeta.size,
    lineHeight: TypographyV2.numericMeta.lineHeight,
    letterSpacing: TypographyV2.numericMeta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  trackContainer: {
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    top: (MIN_TOUCH_TARGET - TRACK_HEIGHT) / 2,
  },
  fill: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    top: (MIN_TOUCH_TARGET - TRACK_HEIGHT) / 2,
  },
  neutralTick: {
    position: 'absolute',
    width: NEUTRAL_TICK_WIDTH,
    height: NEUTRAL_TICK_HEIGHT,
    borderRadius: NEUTRAL_TICK_WIDTH / 2,
    marginLeft: -NEUTRAL_TICK_WIDTH / 2,
    top: (MIN_TOUCH_TARGET - NEUTRAL_TICK_HEIGHT) / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    marginLeft: -THUMB_SIZE / 2,
    top: (MIN_TOUCH_TARGET - THUMB_SIZE) / 2,
  },
});

export default CreatorSlider;
