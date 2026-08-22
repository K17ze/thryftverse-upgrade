import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';

import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useHaptics } from '../../platform/haptics';
import { REDUCED_SPRING } from '../../theme/motionTokens';
import { Space, Type, Typography } from '../../theme/designTokens';

const ReanimatedView = Reanimated.View;

const OUTER_SIZE = 24;
const OUTER_BORDER_WIDTH = 2;
const DOT_SIZE = 12;

export interface AppRadioProps {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  label?: string;
  testID?: string;
}

/**
 * AppRadio — the canonical radio button for ThryftVerse.
 *
 * A 24pt outer circle with a 2pt border that shifts from `Colors.border`
 * (unselected) to `Colors.brand` (selected). When selected, a 12pt inner
 * dot springs in from scale 0 in `Colors.brand`. A selection haptic fires
 * on select, gated by reduced-motion and the haptics rate limiter.
 *
 * Fully accessible: `accessibilityRole="radio"` with a selected state, and
 * the optional label is exposed as the accessibility label.
 */
export function AppRadio({
  selected,
  onSelect,
  disabled = false,
  label,
  testID,
}: AppRadioProps) {
  const { colors } = useAppTheme();
  const { spring } = useMotionConfig();
  const haptics = useHaptics();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const progress = useSharedValue(selected ? 1 : 0);

  React.useEffect(() => {
    progress.value = withSpring(
      selected ? 1 : 0,
      disabled ? REDUCED_SPRING : spring.press,
    );
  }, [selected, disabled, spring.press, progress]);

  const dotScale = useDerivedValue(() => progress.value);

  const outerStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.border, colors.brand],
    ),
  }));

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
  }));

  const handlePress = React.useCallback(() => {
    if (disabled) return;
    if (selected) return;
    haptics.selection();
    onSelect();
  }, [disabled, selected, haptics, onSelect]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      accessibilityHint={selected ? 'Selected' : 'Double tap to select'}
      style={[styles.row, disabled && styles.disabled]}
    >
      <ReanimatedView style={[styles.outer, outerStyle]}>
        <ReanimatedView style={[styles.dot, dotStyle]} />
      </ReanimatedView>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
    },
    disabled: {
      opacity: 0.5,
    },
    outer: {
      width: OUTER_SIZE,
      height: OUTER_SIZE,
      borderRadius: OUTER_SIZE / 2,
      borderWidth: OUTER_BORDER_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Space.sm,
    },
    dot: {
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: DOT_SIZE / 2,
      backgroundColor: colors.brand,
    },
    label: {
      flex: 1,
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
      letterSpacing: Type.body.letterSpacing,
      lineHeight: Type.body.lineHeight,
    },
  });
}
