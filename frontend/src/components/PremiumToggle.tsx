import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { useHaptic } from '../hooks/useHaptic';

interface PremiumToggleProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}

const ReanimatedPressable = Reanimated.createAnimatedComponent(Pressable);

export function PremiumToggle({ value, onValueChange, disabled = false }: PremiumToggleProps) {
  const haptic = useHaptic();
  const progress = useSharedValue(value ? 1 : 0);

  React.useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, {
      stiffness: 500,
      damping: 30,
      mass: 1,
    });
  }, [value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [Colors.surfaceAlt, `${Colors.brand}40`]
    ),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 20 }],
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [Colors.textMuted, Colors.brand]
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
      style={[styles.track, trackStyle]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={value ? 'On' : 'Off'}
    >
      <Reanimated.View style={[styles.knob, knobStyle]} />
    </ReanimatedPressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 52,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  knob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});
