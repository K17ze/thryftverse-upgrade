/**
 * AutoAdjustButton — one-tap enhancement button.
 * Labeled "Auto" with real analysis, "Enhance" with curated presets.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import {
  Space,
  FontFamily,
  Radius,
  Control,
} from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';

export interface AutoAdjustButtonProps {
  /** Called when the button is tapped — toggles the auto-adjust effect. */
  onApply: () => void;
  /** True when an auto-adjust effect is currently applied to the layer. */
  isActive: boolean;
  /** True while the image analysis is running (loading state). */
  isLoading?: boolean;
  /**
   * Whether real pixel-level analysis is available. When false, the button
   * is labeled "Enhance" instead of "Auto" (AGENTS.md §11 truth).
   * Defaults to true (real analysis is the primary path).
   */
  isRealAnalysis?: boolean;
}

/** How long the "Applied" confirmation state remains visible. */
const APPLIED_CONFIRMATION_MS = 1500;
const PRESS_SCALE = 0.97;
const PRESS_DURATION_MS = 100;
const ICON_SIZE = 16;

export function AutoAdjustButton({
  onApply,
  isActive,
  isLoading = false,
  isRealAnalysis = true,
}: AutoAdjustButtonProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const [justApplied, setJustApplied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleSV = useSharedValue(1);

  // Clear any pending confirmation timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handlePress = useCallback(() => {
    if (isLoading) return; // Ignore presses while analyzing.
    if (!reducedMotion) haptic.medium();
    onApply();
    // Only show the "Applied" confirmation when turning the effect on.
    if (!isActive) {
      setJustApplied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setJustApplied(false), APPLIED_CONFIRMATION_MS);
    }
  }, [reducedMotion, haptic, onApply, isActive, isLoading]);

  const handlePressIn = useCallback(() => {
    scaleSV.value = reducedMotion
      ? PRESS_SCALE
      : withTiming(PRESS_SCALE, { duration: PRESS_DURATION_MS });
  }, [reducedMotion, scaleSV]);

  const handlePressOut = useCallback(() => {
    scaleSV.value = reducedMotion
      ? 1
      : withTiming(1, { duration: PRESS_DURATION_MS });
  }, [reducedMotion, scaleSV]);

  const showingApplied = justApplied;
  const active = isActive || showingApplied;

  // Icon + label swap based on state.
  const label = isLoading
    ? 'Analyzing…'
    : showingApplied
      ? 'Applied'
      : isRealAnalysis
        ? 'Auto'
        : 'Enhance';

  const accentColor = active ? colors.brand : colors.textSecondary;

  const accessibilityLabel = isRealAnalysis
    ? 'Auto color correction'
    : 'Enhance — curated preset';

  const accessibilityHint = isLoading
    ? 'Analyzing image…'
    : active
      ? isRealAnalysis
        ? 'Remove auto color correction'
        : 'Remove enhance preset'
      : isRealAnalysis
        ? 'Apply one-tap color correction'
        : 'Apply enhance preset';

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleSV.value }],
  }));

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isLoading}
      hitSlop={Space.xs}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: isActive, disabled: isLoading }}
      style={styles.touch}
    >
      <Animated.View
        style={[
          styles.chip,
          chipStyle,
          {
            backgroundColor: active ? colors.brandSubtle : colors.surfaceAlt,
            opacity: isLoading ? 0.6 : 1,
          },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={accentColor} style={styles.spinner} />
        ) : (
          <AppIcon
            name={showingApplied ? 'check' : 'sparkles'}
            size={IconSize.sm}
            color={active ? 'brand' : 'textSecondary'}
            focused={showingApplied}
            opticalCenter={true}
            accessible={false}
          />
        )}
        <Text
          style={[
            styles.label,
            { color: active ? colors.brand : colors.textSecondary, fontFamily: FontFamily.medium },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    alignSelf: 'flex-end',
    minHeight: Control.hit,
    minWidth: Control.hit,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    height: 36,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
  },
  spinner: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  label: {
    fontSize: TypographyV2.captionElevated.size,
  },
});
