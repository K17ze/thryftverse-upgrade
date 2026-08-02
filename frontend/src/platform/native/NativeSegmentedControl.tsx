import React from 'react';
import { StyleSheet, View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography } from '../../theme/designTokens';

export interface NativeSegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface NativeSegmentedControlProps<T extends string> {
  options: NativeSegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function NativeSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
}: NativeSegmentedControlProps<T>) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.container, style]} testID={testID}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.option, isActive && styles.optionActive]}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={opt.label}
          >
            <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  option: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  optionText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
  },
  optionTextActive: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  });
}
