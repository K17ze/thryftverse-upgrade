import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';

interface RadioButtonProps {
  selected: boolean;
  onPress?: () => void;
  size?: number;
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    radio: {
      borderWidth: 2,
      borderColor: colors.textMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: {
      borderColor: colors.brand,
    },
    dot: {
      backgroundColor: colors.brand,
    },
  });

export function RadioButton({ selected, onPress, size = 22 }: RadioButtonProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

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
