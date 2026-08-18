/**
 * CreatorToggle — toggle switch with spring animation.
 *
 * Features:
 *   - Spring animation (damping 15, stiffness 200 — "press" config per
 *     AGENTS.md §27.3)
 *   - Selection haptic on change
 *   - 48pt hit target, 44pt visible
 *   - Theme-aware colors
 *   - Reduced-motion: instant toggle
 *   - Accessible role and state
 *
 * Design references:
 *   - 05_ICONS_BUTTONS_CONTROL_CRAFT.md §2 (CreatorToggle)
 *   - AGENTS.md §17 (Motion and interaction — toggle: spring animation)
 *   - AGENTS.md §27.3 (press spring config: damping 15, stiffness 200)
 *   - AGENTS.md §27.9 (toggle: spring animation + selection haptic)
 */
import React, { useCallback } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';

import { Radius, Space } from '../../theme/designTokens';
import { Motion, REDUCED_SPRING } from '../../theme/motionTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';

// ── Constants ────────────────────────────────────────────────────────

const HIT_TARGET = 48;
const VISIBLE_WIDTH = 44;
const VISIBLE_HEIGHT = 26;
const THUMB_SIZE = 22;
const THUMB_TRAVEL = VISIBLE_WIDTH - THUMB_SIZE - 2 * 1; // 2 * border padding

// ── Props ────────────────────────────────────────────────────────────

export interface CreatorToggleProps {
  /** Current toggle state. */
  value: boolean;
  /** Called when the toggle changes. */
  onChange: (value: boolean) => void;
  /** Optional label for screen readers. */
  label?: string;
  /** Accessibility label (required if no visual label). */
  accessibilityLabel?: string;
  /** Disabled state. */
  disabled?: boolean;
  /** Test ID. */
  testID?: string;
}

// ── Component ────────────────────────────────────────────────────────

export function CreatorToggle({
  value,
  onChange,
  label,
  accessibilityLabel,
  disabled = false,
  testID,
}: CreatorToggleProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();

  const toggleSV = useSharedValue(value ? 1 : 0);
  const springConfig = reduceMotion ? REDUCED_SPRING : Motion.spring.press;

  // Sync shared value when prop changes externally
  React.useEffect(() => {
    toggleSV.value = reduceMotion ? (value ? 1 : 0) : withSpring(value ? 1 : 0, springConfig);
  }, [value, reduceMotion, springConfig, toggleSV]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    haptic.selection();
    onChange(!value);
  }, [disabled, haptic, value, onChange]);

  // Track background color interpolation
  const trackStyle = useAnimatedStyle(() => {
    const bgColor = interpolateColor(
      toggleSV.value,
      [0, 1],
      [colors.border, colors.brand],
    );
    return { backgroundColor: bgColor };
  });

  // Thumb position
  const thumbStyle = useAnimatedStyle(() => {
    const x = toggleSV.value * THUMB_TRAVEL;
    return {
      transform: [{ translateX: x }],
    };
  });

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{
        disabled: disabled || undefined,
        checked: value,
      }}
      testID={testID}
      hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
      style={{
        width: HIT_TARGET,
        height: HIT_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Reanimated.View
        style={[
          styles.track,
          {
            width: VISIBLE_WIDTH,
            height: VISIBLE_HEIGHT,
            borderRadius: VISIBLE_HEIGHT / 2,
          },
          trackStyle,
        ]}
      >
        <Reanimated.View
          style={[
            styles.thumb,
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: colors.surfaceElevated,
            },
            thumbStyle,
          ]}
        />
      </Reanimated.View>
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  track: {
    justifyContent: 'center',
    padding: 1,
    // Subtle shadow for depth
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  thumb: {
    // Subtle elevation — thumb lifts above the track
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});

export default CreatorToggle;
