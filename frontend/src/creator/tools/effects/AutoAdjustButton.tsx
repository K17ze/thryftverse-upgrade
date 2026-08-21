/**
 * AutoAdjustButton — a one-tap enhancement button.
 *
 * When real image analysis is available (via `computeAutoAdjust`), this
 * button is labeled "Auto" and shows a loading spinner while analyzing
 * pixel data. When the analysis pipeline falls back to a curated preset,
 * the button honestly labels itself "Enhance" — never "Auto" or
 * "intelligent" for static constants (AGENTS.md §11, spec 07 §6).
 *
 * Tapping applies the auto/enhance adjustment (via `onApply`). When an
 * auto-adjust is already active, tapping removes it (toggle behavior) —
 * the parent owns that logic and reflects state through `isActive`.
 *
 * After a successful apply, the button briefly shows a checkmark +
 * "Applied" confirmation for 1.5s before returning to the active state.
 *
 * Per AGENTS.md §4: visible containment only for the active/selected
 * state — a subtle brand-tinted pill. Resting state is a transparent
 * 44pt touch target with no chrome.
 * Per AGENTS.md §13/§18: medium haptic on apply, suppressed under reduced
 * motion, accessibility label and state.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Space,
  FontSize,
  FontFamily,
  Radius,
  Stroke,
  Control,
} from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

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

  const showingApplied = justApplied;
  const active = isActive || showingApplied;

  // Icon + label swap based on state.
  // Loading: spinner + "Analyzing…"
  // Applied: checkmark + "Applied"
  // Active (real analysis): wand + "Auto"
  // Active (fallback): wand + "Enhance"
  // Resting (real analysis): wand + "Auto"
  // Resting (fallback): wand + "Enhance"
  const label = isLoading
    ? 'Analyzing…'
    : showingApplied
      ? 'Applied'
      : isRealAnalysis
        ? 'Auto'
        : 'Enhance';

  const accentColor = active ? colors.brand : colors.textSecondary;
  const labelColor = active ? colors.brand : colors.textMuted;

  const accessibilityLabel = isRealAnalysis
    ? 'Auto color correction'
    : 'Enhance — curated preset';

  const accessibilityHint = isLoading
    ? 'Analyzing image, please wait'
    : active
      ? isRealAnalysis
        ? 'Removes the auto color correction from the selected media'
        : 'Removes the enhance preset from the selected media'
      : isRealAnalysis
        ? 'Analyzes the image and applies one-tap color correction'
        : 'Applies a curated enhance preset to the selected media';

  return (
    <Pressable
      onPress={handlePress}
      disabled={isLoading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: isActive, disabled: isLoading }}
      style={({ pressed }) => [
        styles.touch,
        { opacity: pressed && !isLoading ? 0.7 : isLoading ? 0.6 : 1 },
      ]}
    >
      <View
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.brandSubtle : 'transparent',
            borderColor: active ? colors.brand : 'transparent',
            borderWidth: active ? Stroke.standard : 0,
          },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={accentColor} style={styles.spinner} />
        ) : (
          <Ionicons
            name={showingApplied ? 'checkmark-circle' : 'bulb-outline'}
            size={Control.icon}
            color={accentColor}
          />
        )}
        <Text
          style={[
            styles.label,
            { color: labelColor, fontFamily: FontFamily.medium },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    minWidth: Control.hit,
    minHeight: Control.hit,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.full,
  },
  spinner: {
    width: Control.icon,
    height: Control.icon,
  },
  label: {
    fontSize: FontSize.caption,
  },
});
