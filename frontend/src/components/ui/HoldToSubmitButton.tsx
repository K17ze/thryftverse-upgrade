/**
 * HoldToSubmitButton — press-and-hold confirmation button with progress ring.
 *
 * Spec §05: Orders > 5,000 1ZE OR > 5% of public float require hold-to-submit
 * (600ms hold with progress ring + haptic heavy on completion).
 * Below threshold: tap-to-submit with haptic medium.
 * Reduced motion: tap-to-confirm with a confirmation dialog fallback.
 *
 * See docs/coown/flagship-exchange-upgrade/05 §Review & Confirm + 07 §Motion.
 */

import React, { useRef, useCallback, useState } from 'react';
import { View, Pressable, StyleSheet, AccessibilityInfo } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Typography, Type } from '../../theme/designTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useHaptic } from '../../hooks/useHaptic';
import { Ionicons } from '@expo/vector-icons';

const HOLD_DURATION_MS = 600;

export interface HoldToSubmitButtonProps {
  /** Whether hold-to-submit is required (above threshold). */
  requireHold: boolean;
  /** Button label (e.g. "Confirm buy"). */
  title: string;
  /** Icon name to show inside the button. */
  iconName?: string;
  /** Whether the button is disabled. */
  disabled?: boolean;
  /** Called when the hold completes (or tap, if below threshold). */
  onSubmit: () => void;
  /** Accessibility label. */
  accessibilityLabel?: string;
}

export function HoldToSubmitButton({
  requireHold,
  title,
  iconName,
  disabled,
  onSubmit,
  accessibilityLabel,
}: HoldToSubmitButtonProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();
  const progress = useSharedValue(0);
  const [isHolding, setIsHolding] = useState(false);
  const completedRef = useRef(false);

  const triggerSubmit = useCallback(() => {
    haptic.heavy();
    onSubmit();
  }, [haptic, onSubmit]);

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    if (!requireHold || reducedMotion) {
      // Tap-to-submit path
      return;
    }
    completedRef.current = false;
    setIsHolding(true);
    progress.value = withTiming(
      1,
      { duration: HOLD_DURATION_MS, easing: Easing.linear },
      (finished) => {
        if (finished && !completedRef.current) {
          completedRef.current = true;
          runOnJS(triggerSubmit)();
        }
      }
    );
  }, [disabled, requireHold, reducedMotion, progress, triggerSubmit]);

  const handlePressOut = useCallback(() => {
    if (disabled) return;
    if (!requireHold || reducedMotion) {
      return;
    }
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: 120 });
    setIsHolding(false);
  }, [disabled, requireHold, reducedMotion, progress]);

  const handleTap = useCallback(() => {
    if (disabled) return;
    if (!requireHold || reducedMotion) {
      triggerSubmit();
    }
  }, [disabled, requireHold, reducedMotion, triggerSubmit]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: progress.value }],
  }));

  const bgColor = disabled ? colors.surfaceAlt : colors.brand;
  const textColor = disabled ? colors.textMuted : colors.background;

  const a11yHint = requireHold && !reducedMotion
    ? 'Press and hold to confirm'
    : 'Double tap to confirm';

  return (
    <Pressable
      onPress={handleTap}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={a11yHint}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.button, { backgroundColor: bgColor }]}
    >
      {/* Progress ring — scales from 0 to 1 during hold */}
      {requireHold && !reducedMotion && (
        <Reanimated.View
          style={[styles.ring, ringStyle, { borderColor: textColor }]}
          pointerEvents="none"
        />
      )}

      <View style={styles.content}>
        {iconName && (
          <Ionicons name={iconName as any} size={16} color={textColor} />
        )}
        <Reanimated.Text
          style={[styles.label, { color: textColor }]}
          numberOfLines={1}
        >
          {isHolding && requireHold && !reducedMotion ? 'Hold to confirm…' : title}
        </Reanimated.Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderRadius: Radius.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
});
