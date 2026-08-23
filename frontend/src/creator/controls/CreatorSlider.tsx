/**
 * CreatorSlider — shared slider using RNGH + Reanimated (NOT PanResponder).
 *
 * Features:
 *   - Drag thumb to change value
 *   - Tap on track to jump
 *   - Accessibility: increment/decrement for screen reader users
 *   - Haptic at neutral value (0) if `hapticAtNeutral` is true
 *   - Numeric label
 *   - One `onCommit` call on gesture end (for undo history)
 *   - Smooth 60fps via Reanimated worklets (off JS thread)
 *   - Track: 4pt height, 28pt thumb
 *   - Theme-aware colors
 *   - Reduced-motion: instant settle
 *
 * Design references:
 *   - 05_ICONS_BUTTONS_CONTROL_CRAFT.md §2 (CreatorSlider)
 *   - AGENTS.md §17 (No PanResponder — use RNGH)
 *   - AGENTS.md §27.3 (Flagship spring configs — tap for settle)
 *   - AGENTS.md §27.8 (60fps via Reanimated worklets, off JS thread)
 *   - Codebase pattern: ColorSlider.tsx (Gesture.Pan + runOnJS)
 */
import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  type LayoutChangeEvent,
  type AccessibilityRole,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';

import { Radius, Space, Stroke } from '../../theme/designTokens';
import { Motion, REDUCED_SPRING } from '../../theme/motionTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';

// ── Constants ────────────────────────────────────────────────────────

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 28;
const MIN_TOUCH_TARGET = 44;
const HAPTIC_DEBOUNCE_MS = 80;

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
  /** Called continuously during drag with the new value. */
  onValueChange?: (value: number) => void;
  /** Called once on gesture end with the final value (for undo history). */
  onCommit?: (value: number) => void;
  /** Optional label shown above the slider. */
  label?: string;
  /** Accessibility label for screen readers. */
  accessibilityLabel?: string;
  /** When true, fires a selection haptic when the value crosses 0. */
  hapticAtNeutral?: boolean;
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
  onValueChange,
  onCommit,
  label,
  accessibilityLabel,
  hapticAtNeutral = false,
  disabled = false,
  onDragStateChange,
  testID,
}: CreatorSliderProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();

  const widthSV = useSharedValue(0);
  const thumbPos = useSharedValue(0);
  const lastHapticSV = useSharedValue(0);
  const isDraggingSV = useSharedValue(false);
  const prevWasPositiveSV = useSharedValue(true);
  const valueSV = useSharedValue(value);

  const [width, setWidth] = React.useState(0);
  const RANGE = max - min;

  // Update thumb position when value changes externally (not during drag)
  React.useEffect(() => {
    if (width > 0 && !isDraggingSV.value) {
      const ratio = RANGE > 0 ? (value - min) / RANGE : 0;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      const springConfig = reduceMotion ? REDUCED_SPRING : Motion.spring.tap;
      thumbPos.value = withSpring(clampedRatio * width, springConfig);
    }
    valueSV.value = value;
  }, [value, width, min, RANGE, reduceMotion, thumbPos, isDraggingSV, valueSV]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthSV.value = w;
  }, [widthSV]);

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
          if (onDragStateChange) runOnJS(onDragStateChange)(true);
          updateFromPosition(e.x);
        })
        .onChange((e) => {
          'worklet';
          updateFromPosition(e.x);
        })
        .onEnd(() => {
          'worklet';
          const w = widthSV.value;
          if (w > 0) {
            const springConfig = reduceMotion
              ? REDUCED_SPRING
              : Motion.spring.tap;
            thumbPos.value = withSpring(thumbPos.value, springConfig);
          }
          isDraggingSV.value = false;
          if (onDragStateChange) runOnJS(onDragStateChange)(false);
          if (onCommit) {
            const ratio = w > 0 ? Math.max(0, Math.min(1, thumbPos.value / w)) : 0;
            let finalVal = min + ratio * RANGE;
            if (step && step > 0) {
              finalVal = Math.round(finalVal / step) * step;
            }
            runOnJS(onCommit)(finalVal);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, reduceMotion, min, RANGE, step, onCommit, onDragStateChange, updateFromPosition],
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
    transform: [{ translateX: thumbPos.value }],
  }));

  // Fill track (from min to current value)
  const fillStyle = useAnimatedStyle(() => ({
    width: thumbPos.value + THUMB_SIZE / 2,
  }));

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
          accessibilityValue={{
            min,
            max,
            now: value,
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
              { backgroundColor: colors.borderSubtle },
            ]}
          />

          {/* Filled portion */}
          <Reanimated.View
            style={[
              styles.fill,
              { backgroundColor: colors.brand },
              fillStyle,
            ]}
            pointerEvents="none"
          />

          {/* Thumb */}
          <Reanimated.View
            style={[
              styles.thumb,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.brand,
              },
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
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    left: 0,
    top: (MIN_TOUCH_TARGET - TRACK_HEIGHT) / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: Stroke.standard,
    marginLeft: -THUMB_SIZE / 2,
    top: (MIN_TOUCH_TARGET - THUMB_SIZE) / 2,
    // Subtle elevation — thumb lifts above the track
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});

export default CreatorSlider;
