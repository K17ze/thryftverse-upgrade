/**
 * CreatorDestructiveButton — destructive action button with confirmation.
 *
 * Features:
 *   - Red tint, not filled (restrained visual weight for destructive actions)
 *   - Two-press confirmation: first press shows "Are you sure?" state,
 *     second press within 3s confirms the action
 *   - Warning haptic on first press
 *   - Error haptic on confirm
 *   - Press scale 0.97
 *   - Disabled at 0.4 opacity
 *   - Loading spinner replaces label
 *   - Corner radius 12pt
 *   - Auto-resets to initial state after 3s timeout
 *   - Reduced-motion: fade instead of spring
 *
 * Design references:
 *   - 05_ICONS_BUTTONS_CONTROL_CRAFT.md §2
 *   - AGENTS.md §13 (Destructive actions clearly separated and confirmed)
 *   - AGENTS.md §17 (Motion and interaction)
 *   - AGENTS.md §27.3 (Flagship spring configs — tap)
 */
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Pressable, ActivityIndicator, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';

import { Radius, Space, Stroke} from '../../theme/designTokens';
import { Motion, REDUCED_SPRING } from '../../theme/motionTokens';
import { FontFamily } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';

// ── Constants ────────────────────────────────────────────────────────

const MIN_HEIGHT = 48;
const PRESS_SCALE = 0.97;
const DISABLED_OPACITY = 0.4;
const LABEL_SIZE = 15;
const CONFIRM_TIMEOUT_MS = 3000;
const CONFIRM_LABEL = 'Are you sure?';

// ── Props ────────────────────────────────────────────────────────────

export interface CreatorDestructiveButtonProps {
  /** Button label text (e.g. "Delete"). */
  label: string;
  /** Press handler — called only on confirm (second press). */
  onPress?: () => void;
  /** Disabled state. */
  disabled?: boolean;
  /** Loading state — spinner replaces label. */
  loading?: boolean;
  /** Accessibility label override. */
  accessibilityLabel?: string;
  /** Test ID. */
  testID?: string;
}

// ── Component ────────────────────────────────────────────────────────

export function CreatorDestructiveButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  accessibilityLabel,
  testID,
}: CreatorDestructiveButtonProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();

  const [confirming, setConfirming] = useState(false);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pressedSV = useSharedValue(0);
  const confirmSV = useSharedValue(0);
  const springConfig = reduceMotion ? REDUCED_SPRING : Motion.spring.tap;

  const clearConfirmTimeout = useCallback(() => {
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
  }, []);

  const resetConfirm = useCallback(() => {
    setConfirming(false);
    confirmSV.value = withTiming(0, {
      duration: Motion.duration.fast,
      easing: Easing.inOut(Easing.cubic),
    });
    clearConfirmTimeout();
  }, [confirmSV, clearConfirmTimeout]);

  const handlePressIn = useCallback(() => {
    if (disabled || loading) return;
    pressedSV.value = withSpring(1, springConfig);
  }, [disabled, loading, pressedSV, springConfig]);

  const handlePressOut = useCallback(() => {
    if (disabled || loading) return;
    pressedSV.value = withSpring(0, springConfig);
  }, [disabled, loading, pressedSV, springConfig]);

  const handlePress = useCallback(() => {
    if (disabled || loading) return;

    if (!confirming) {
      // First press — enter confirmation state
      haptic.warning();
      setConfirming(true);
      confirmSV.value = withTiming(1, {
        duration: Motion.duration.fast,
        easing: Easing.out(Easing.cubic),
      });
      // Auto-reset after 3s
      clearConfirmTimeout();
      confirmTimeoutRef.current = setTimeout(() => {
        resetConfirm();
      }, CONFIRM_TIMEOUT_MS);
    } else {
      // Second press — confirm the destructive action
      haptic.error();
      clearConfirmTimeout();
      setConfirming(false);
      confirmSV.value = withTiming(0, {
        duration: Motion.duration.fast,
        easing: Easing.inOut(Easing.cubic),
      });
      onPress?.();
    }
  }, [disabled, loading, confirming, haptic, clearConfirmTimeout, resetConfirm, confirmSV, onPress]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => clearConfirmTimeout();
  }, [clearConfirmTimeout]);

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        transform: [{ scale: 1 }],
        opacity: 1 - 0.3 * pressedSV.value,
      };
    }
    return {
      transform: [{ scale: 1 - (1 - PRESS_SCALE) * pressedSV.value }],
    };
  });

  // Background color interpolation: subtle red tint → stronger red tint when confirming
  const bgStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        backgroundColor: confirming ? colors.danger : 'transparent',
        opacity: confirming ? 1 : 1,
      };
    }
    // Animate between tinted and more-filled
    return {
      opacity: 1,
    };
  });

  const isDisabled = disabled || loading;
  const dangerColor = colors.danger;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (confirming ? `${label} — tap again to confirm` : label)}
      accessibilityState={{ disabled: isDisabled || undefined }}
      accessibilityHint={confirming ? 'Tap again within 3 seconds to confirm' : undefined}
      testID={testID}
      style={{ opacity: disabled ? DISABLED_OPACITY : 1 }}
    >
      <Reanimated.View
        style={[
          styles.button,
          {
            borderRadius: Radius.lg,
            backgroundColor: confirming ? dangerColor : 'transparent',
            borderWidth: Stroke.standard,
            borderColor: dangerColor,
          },
          animatedStyle,
          bgStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={dangerColor} />
        ) : (
          <Reanimated.Text
            style={[
              styles.label,
              { color: confirming ? colors.textInverse : dangerColor },
            ]}
            numberOfLines={1}
          >
            {confirming ? CONFIRM_LABEL : label}
          </Reanimated.Text>
        )}
      </Reanimated.View>
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  label: {
    fontFamily: FontFamily.bold,
    fontSize: LABEL_SIZE,
    letterSpacing: 0,
  },
});

export default CreatorDestructiveButton;
