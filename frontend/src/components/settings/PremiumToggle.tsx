import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { haptics } from '../../utils/haptics';
import { useReducedMotion } from '../../hooks/useReducedMotion';

import { Radius } from '../../theme/designTokens';
interface PremiumToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function PremiumToggle({ value, onValueChange, disabled = false }: PremiumToggleProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const progress = useSharedValue(value ? 1 : 0);

  React.useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: reducedMotion ? 0 : 180 });
  }, [value, progress, reducedMotion]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.border, colors.brand]
    ),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [2, 22]) }],
  }));

  const handlePress = () => {
    if (disabled) return;
    haptics.tap();
    onValueChange(!value);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={value ? 'Toggle on' : 'Toggle off'}
      style={({ pressed }) => [{ opacity: disabled ? 0.5 : 1 }, pressed && { opacity: 0.6 }]}
    >
      <Reanimated.View style={[styles.track, trackStyle]}>
        <Reanimated.View style={[styles.thumb, thumbStyle]} />
      </Reanimated.View>
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  track: {
    width: 50,
    height: 28,
    borderRadius: Radius.xl,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceElevated,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
});
