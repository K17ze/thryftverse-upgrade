/**
 * ReverseToggle — pressable toggle for reversing a video clip.
 *
 * A compact, self-contained button that flips the media layer's `reversed`
 * flag (composition.ts MediaLayerPayloadSchema). When active, the button
 * adopts the brand fill so the state is immediately legible; when inactive
 * it is a flat, transparent 44pt target with a 22pt glyph (AGENTS.md §4:
 * separate hit area from visible shape).
 *
 * Design references:
 *   - AGENTS.md §11: every control performs a real mutation via onToggle.
 *   - AGENTS.md §13 / §27.9: haptic `selection` on toggle.
 *   - designTokens Control.hit (44pt), Stroke.emphasis for the active border.
 */

import React, { useCallback } from 'react';
import { Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressScale } from '../../CreatorAnimations';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import {
  Space,
  Radius,
  Stroke,
  Control,
  FontFamily,
  FontSize,
  LetterSpacing,
} from '../../../theme/designTokens';

export interface ReverseToggleProps {
  /** Current reversed state of the clip. */
  reversed: boolean;
  /** Invoked with the next reversed value on press. */
  onToggle: (reversed: boolean) => void;
  /** Optional accessibility hint override. */
  accessibilityHint?: string;
}

export function ReverseToggle({
  reversed,
  onToggle,
  accessibilityHint,
}: ReverseToggleProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const handlePress = useCallback(() => {
    haptic.selection();
    onToggle(!reversed);
  }, [haptic, reversed, onToggle]);

  return (
    <PressScale
      onPress={handlePress}
      style={[
        styles.container,
        {
          backgroundColor: reversed ? colors.brand : colors.surfaceAlt,
          borderColor: reversed ? colors.brand : colors.borderSubtle,
        },
      ]}
      accessibilityLabel={`Reverse${reversed ? ', on' : ', off'}`}
      accessibilityHint={accessibilityHint ?? 'Reverses the clip so it plays from end to start'}
      accessibilityRole="button"
    >
      <Ionicons
        name={reversed ? 'swap-horizontal' : 'swap-horizontal-outline'}
        size={22}
        color={reversed ? colors.textInverse : colors.textPrimary}
      />
      <Text
        style={[
          styles.label,
          { color: reversed ? colors.textInverse : colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        Reverse
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    minHeight: Control.hit,
    borderRadius: Radius.sm,
    borderWidth: Stroke.standard,
  },
  label: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.caption,
    letterSpacing: LetterSpacing.normal,
  },
});

// Keep ViewStyle referenced for typed style composition without unused-import
// errors at compile time.
export type ReverseToggleViewStyle = ViewStyle;
