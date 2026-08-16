/**
 * AutoAdjustButton — a one-tap "Auto" color correction button.
 *
 * Shows a wand glyph + "Auto" label. Tapping applies the auto-adjust
 * effect (via {@link AutoAdjustButtonProps.onApply}). When an auto-adjust
 * is already active, tapping removes it (toggle behavior) — the parent
 * owns that logic and reflects state through `isActive`.
 *
 * After a successful apply, the button briefly shows a checkmark +
 * "Applied" confirmation for 1.5s before returning to the active state.
 *
 * Per AGENTS.md §4: visible containment only for the active/selected
 * state — a subtle brand-tinted pill. Resting state is a transparent
 * 44pt touch target with no chrome.
 * Per AGENTS.md §13/§18: medium haptic on apply, suppressed under reduced
 * motion.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
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
}

/** How long the "Applied" confirmation state remains visible. */
const APPLIED_CONFIRMATION_MS = 1500;

export function AutoAdjustButton({ onApply, isActive }: AutoAdjustButtonProps) {
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
    if (!reducedMotion) haptic.medium();
    onApply();
    // Only show the "Applied" confirmation when turning the effect on.
    if (!isActive) {
      setJustApplied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setJustApplied(false), APPLIED_CONFIRMATION_MS);
    }
  }, [reducedMotion, haptic, onApply, isActive]);

  const showingApplied = justApplied;
  const active = isActive || showingApplied;

  // Icon + label swap to a checkmark while the apply confirmation is visible.
  const iconName: React.ComponentProps<typeof Ionicons>['name'] = showingApplied
    ? 'checkmark-circle'
    : 'color-wand-outline';
  const label = showingApplied ? 'Applied' : 'Auto';
  const accentColor = active ? colors.brand : colors.textSecondary;
  const labelColor = active ? colors.brand : colors.textMuted;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Auto color correction"
      accessibilityHint={
        active
          ? 'Removes the auto color correction from the selected media'
          : 'Applies one-tap intelligent color correction to the selected media'
      }
      accessibilityState={{ selected: isActive }}
      style={({ pressed }) => [
        styles.touch,
        { opacity: pressed ? 0.7 : 1 },
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
        <Ionicons name={iconName} size={Control.icon} color={accentColor} />
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
  label: {
    fontSize: FontSize.caption,
  },
});
