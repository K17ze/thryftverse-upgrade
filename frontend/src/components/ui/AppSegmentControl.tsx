import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { Radius, Space, Type, Typography } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';

export interface AppSegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
}

interface AppSegmentControlProps<T extends string> {
  options: AppSegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  style?: StyleProp<ViewStyle>;
  optionStyle?: StyleProp<ViewStyle>;
  optionActiveStyle?: StyleProp<ViewStyle>;
  optionTextStyle?: StyleProp<TextStyle>;
  optionTextActiveStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
}

export function AppSegmentControl<T extends string>({
  options,
  value,
  onChange,
  style,
  optionStyle,
  optionActiveStyle,
  optionTextStyle,
  optionTextActiveStyle,
  fullWidth = false,
}: AppSegmentControlProps<T>) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
        style,
      ]}
      accessibilityRole="tablist"
    >
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <AnimatedPressable
            key={option.value}
            style={[
              styles.option,
              fullWidth && styles.optionFull,
              { backgroundColor: 'transparent', borderColor: 'transparent' },
              optionStyle,
              isActive && {
                backgroundColor: colors.surface,
                borderColor: colors.textMuted,
              },
              isActive && optionActiveStyle,
            ]}
            onPress={() => {
              if (!isActive) {
                onChange(option.value);
              }
            }}
            activeOpacity={0.9}
            hapticFeedback={isActive ? 'none' : 'selection'}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
          >
            {option.icon}
            <Text
              style={[
                styles.optionText,
                { color: colors.textSecondary },
                optionTextStyle,
                isActive && { color: colors.textPrimary },
                isActive && optionTextActiveStyle,
              ]}
              maxFontSizeMultiplier={1.3}
            >
              {option.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  option: {
    minHeight: 44,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Space.xs,
  },
  optionFull: {
    flex: 1,
  },
  optionText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
  },
});
