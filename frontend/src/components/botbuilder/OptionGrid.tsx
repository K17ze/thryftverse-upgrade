import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { createBotBuilderStyles } from './botBuilderStyles';

// ---------------------------------------------------------------------------
// Shared layout primitives (preserved from the previous screen)
// ---------------------------------------------------------------------------

export function OptionGrid({
  options,
  selected,
  onSelect }: {
  options: Array<{ value: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createBotBuilderStyles(colors), [colors]);
  return (
    <View style={styles.optionGrid}>
      {options.map((option) => {
        const active = selected === option.value;
        return (
          <AnimatedPressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[styles.option, active && styles.optionActive]}
            scaleValue={0.97}
            hapticFeedback="selection"
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}
