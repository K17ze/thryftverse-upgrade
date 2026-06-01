import React from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
} from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

function Dot({ delay }: { delay: number }) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0.3);
  const scale = useSharedValue(0.8);

  React.useEffect(() => {
    if (reducedMotion) {
      opacity.value = 0.6;
      scale.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(1, { duration: 400 })),
        withTiming(0.3, { duration: 400 })
      ),
      -1,
      true
    );
    scale.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(1.2, { duration: 400 })),
        withTiming(0.8, { duration: 400 })
      ),
      -1,
      true
    );
  }, [delay, opacity, scale, reducedMotion]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Reanimated.View style={[styles.dot, animStyle]} />
  );
}

interface TypingIndicatorProps {
  style?: object;
}

export function TypingIndicator({ style }: TypingIndicatorProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.bubble}>
        <View style={styles.dotsRow}>
          <Dot delay={0} />
          <Dot delay={200} />
          <Dot delay={400} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    marginVertical: Space.xs,
    alignItems: 'flex-end',
  },
  bubble: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderBottomLeftRadius: Radius.sm,
    paddingHorizontal: Space.md - 2,
    paddingVertical: Space.sm + 4,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
    maxWidth: 72,
    minHeight: 36,
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textMuted,
  },
});
