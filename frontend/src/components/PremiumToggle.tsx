import React from 'react';
import { StyleSheet, Pressable } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';

import { Radius } from '../theme/designTokens';
interface PremiumToggleProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  /** Accessibility label — should include the setting name and current state. */
  accessibilityLabel?: string;
}

const ReanimatedPressable = Reanimated.createAnimatedComponent(Pressable);

export function PremiumToggle({ value, onValueChange, disabled = false, accessibilityLabel }: PremiumToggleProps) {
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const { spring } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const progress = useSharedValue(value ? 1 : 0);
  const scale = useSharedValue(1);

  React.useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, spring.tap);
  }, [value, progress, spring]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.surfaceAlt, `${colors.brand}40`]
    ),
    transform: [{ scale: scale.value }],
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 22 }],
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.textMuted, colors.brand]
    ),
  }));

  const handlePress = () => {
    if (disabled) return;
    haptic.light();
    onValueChange(!value);
  };

  return (
    <ReanimatedPressable
      onPress={handlePress}
      disabled={disabled}
      style={[styles.track, trackStyle, disabled && { opacity: 0.5 }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel ?? (value ? 'On' : 'Off')}
      accessibilityHint="Double tap to toggle"
      onPressIn={() => {
        if (!disabled) scale.value = withSpring(0.97, spring.press);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, spring.press);
      }}
    >
      <Reanimated.View style={[styles.knob, knobStyle]} />
    </ReanimatedPressable>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  track: {
    width: 52,
    height: 30,
    borderRadius: Radius.xl,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  knob: {
    width: 26,
    height: 26,
    borderRadius: Radius.xl,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});
