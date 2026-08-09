import React, { useEffect, useRef } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { AnimatedPressable } from '../AnimatedPressable';
import { useMotionConfig } from '../../hooks/useMotionConfig';
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
  const { spring } = useMotionConfig();
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const optionLayouts = useRef<Array<{ x: number; width: number }>>([]);

  useEffect(() => {
    const activeIndex = options.findIndex((o) => o.value === value);
    if (activeIndex >= 0 && optionLayouts.current[activeIndex]) {
      const layout = optionLayouts.current[activeIndex];
      indicatorX.value = withSpring(layout.x, spring.tap);
      indicatorWidth.value = withSpring(layout.width, spring.tap);
    }
  }, [value, options, spring, indicatorX, indicatorWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
        style,
      ]}
      accessibilityRole="tablist"
    >
      <Reanimated.View
        style={[
          styles.indicator,
          { backgroundColor: colors.surface },
          indicatorStyle,
        ]}
        pointerEvents="none"
      />
      {options.map((option, index) => {
        const isActive = option.value === value;

        return (
          <AnimatedPressable
            key={option.value}
            onLayout={(e) => {
              optionLayouts.current[index] = {
                x: e.nativeEvent.layout.x,
                width: e.nativeEvent.layout.width,
              };
              // Set initial indicator position without animation on first layout
              if (isActive && indicatorWidth.value === 0) {
                indicatorX.value = e.nativeEvent.layout.x;
                indicatorWidth.value = e.nativeEvent.layout.width;
              }
            }}
            style={[
              styles.option,
              fullWidth && styles.optionFull,
              { backgroundColor: 'transparent' },
              optionStyle,
              isActive && { backgroundColor: 'transparent' },
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
  indicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
    borderRadius: Radius.sm,
  },
  option: {
    minHeight: 44,
    borderRadius: Radius.sm,
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
