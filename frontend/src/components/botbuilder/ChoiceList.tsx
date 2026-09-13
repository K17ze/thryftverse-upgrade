import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { createBotBuilderStyles } from './botBuilderStyles';

export function ChoiceList({
  options,
  selected,
  onSelect }: {
  options: Array<{ value: string; label: string; detail: string }>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createBotBuilderStyles(colors), [colors]);
  return (
    <View style={styles.choiceList}>
      {options.map((option, index) => {
        const active = selected === option.value;
        return (
          <View key={option.value}>
            <AnimatedPressable
              onPress={() => onSelect(option.value)}
              style={styles.choiceRow}
              scaleValue={0.985}
              hapticFeedback="selection"
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: active }}
            >
              <View style={styles.choiceCopy}>
                <Text style={styles.choiceTitle}>{option.label}</Text>
                <Text style={styles.choiceDetail}>{option.detail}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active ? <View style={styles.radioDot} /> : null}
              </View>
            </AnimatedPressable>
            {index < options.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        );
      })}
    </View>
  );
}
