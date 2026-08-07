import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Space } from '../../theme/designTokens';

interface TypingIndicatorProps {
  dotColor?: string;
  dotSize?: number;
  style?: ViewStyle;
}

const DOT_COUNT = 3;
const DOT_SPACING = 4;
const CYCLE_DURATION = 600;
const OPACITY_MIN = 0.3;
const OPACITY_MAX = 1;
const SCALE_MIN = 0.8;
const SCALE_MAX = 1.3;

function TypingDot({
  index,
  dotColor,
  dotSize,
  isEnabled,
}: {
  index: number;
  dotColor: string;
  dotSize: number;
  isEnabled: boolean;
}) {
  const opacity = useSharedValue(OPACITY_MIN);
  const scale = useSharedValue(SCALE_MIN);

  useEffect(() => {
    if (!isEnabled) {
      opacity.value = OPACITY_MAX;
      scale.value = SCALE_MAX;
      return;
    }

    const halfCycle = CYCLE_DURATION / 2;
    const staggerDelay = index * (CYCLE_DURATION / DOT_COUNT);

    opacity.value = withDelay(
      staggerDelay,
      withRepeat(
        withSequence(
          withTiming(OPACITY_MAX, { duration: halfCycle }),
          withTiming(OPACITY_MIN, { duration: halfCycle }),
        ),
        -1,
        false,
      ),
    );

    scale.value = withDelay(
      staggerDelay,
      withRepeat(
        withSequence(
          withTiming(SCALE_MAX, { duration: halfCycle }),
          withTiming(SCALE_MIN, { duration: halfCycle }),
        ),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [index, isEnabled, opacity, scale]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Reanimated.View
      style={[
        {
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: dotColor,
          marginHorizontal: DOT_SPACING / 2,
        },
        animStyle,
      ]}
    />
  );
}

export function TypingIndicator({
  dotColor,
  dotSize = 7,
  style,
}: TypingIndicatorProps) {
  const { colors } = useAppTheme();
  const { isEnabled } = useMotionConfig();
  const resolvedColor = dotColor ?? colors.textMuted;

  return (
    <View
      style={StyleSheet.flatten([styles.container, style])}
      accessibilityLabel="Typing..."
      accessibilityRole="text"
    >
      {Array.from({ length: DOT_COUNT }, (_, i) => (
        <TypingDot
          key={i}
          index={i}
          dotColor={resolvedColor}
          dotSize={dotSize}
          isEnabled={isEnabled}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: 20,
    paddingHorizontal: Space.sm,
  },
});
