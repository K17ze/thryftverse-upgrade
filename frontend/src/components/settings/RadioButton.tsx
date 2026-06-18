import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { AnimatedPressable } from '../AnimatedPressable';

interface RadioButtonProps {
  selected: boolean;
  onPress?: () => void;
  size?: number;
}

export function RadioButton({ selected, onPress, size = 22 }: RadioButtonProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.radio,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        selected && styles.radioSelected,
      ]}
      hapticFeedback="light"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      {selected && (
        <View
          style={[
            styles.dot,
            {
              width: size * 0.45,
              height: size * 0.45,
              borderRadius: size * 0.225,
            },
          ]}
        />
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  radio: {
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.brand,
  },
  dot: {
    backgroundColor: Colors.brand,
  },
});