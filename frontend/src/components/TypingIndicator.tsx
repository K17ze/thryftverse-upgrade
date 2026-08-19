import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

import { Space } from '../theme/designTokens';
interface TypingIndicatorProps {
  dotCount?: number;
  dotSize?: number;
  dotColor?: string;
  dotSpacing?: number;
  animationDuration?: number;
  style?: ViewStyle;
}

/**
 * TypingIndicator — animated chat typing dots.
 *
 * Migrated from the legacy React Native `Animated` API (JS-thread driver)
 * to Reanimated 4 worklets (UI-thread) per the research doc §5/§3d:
 * "no synchronous work on the JS thread during scroll" and "Reanimated
 * worklets run on the UI thread." The typing indicator runs continuously
 * during chat sessions — keeping it on the UI thread prevents JS-thread
 * contention that causes scroll jank in conversation lists.
 *
 * Each dot owns its own shared value and animation with a staggered delay
 * so they bounce in sequence, matching the original behaviour exactly.
 */
export function TypingIndicator({
  dotCount = 3,
  dotSize = 8,
  dotColor,
  dotSpacing = 4,
  animationDuration = 600,
  style,
}: TypingIndicatorProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const resolvedDotColor = dotColor ?? colors.textMuted;

  return (
    <View style={StyleSheet.flatten([styles.container, style])}>
      {Array.from({ length: dotCount }, (_, index) => (
        <TypingDot
          key={index}
          index={index}
          dotSize={dotSize}
          dotColor={resolvedDotColor}
          dotSpacing={dotSpacing}
          animationDuration={animationDuration}
          reducedMotion={reducedMotion}
        />
      ))}
    </View>
  );
}

/**
 * Single typing dot — memoized so it only re-renders when its own props
 * change. Owns its own shared value and runs a staggered bounce animation
 * on the UI thread via Reanimated worklets.
 */
const TypingDot = React.memo(function TypingDot({
  index,
  dotSize,
  dotColor,
  dotSpacing,
  animationDuration,
  reducedMotion,
}: {
  index: number;
  dotSize: number;
  dotColor: string;
  dotSpacing: number;
  animationDuration: number;
  reducedMotion: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(progress);
      progress.value = 0.6;
      return;
    }

    const halfDuration = animationDuration / 2;
    const staggerDelay = index * (animationDuration / 3);

    progress.value = 0;
    progress.value = withDelay(
      staggerDelay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: halfDuration, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: halfDuration, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(progress);
    };
  }, [progress, index, animationDuration, reducedMotion]);

  const dotStyle = useAnimatedStyle(() => {
    const v = progress.value;
    const translateY = -8 * v;
    const scale = 1 + 0.2 * v;
    const opacity = 0.4 + 0.6 * v;

    return {
      width: dotSize,
      height: dotSize,
      borderRadius: dotSize / 2,
      backgroundColor: dotColor,
      marginHorizontal: dotSpacing / 2,
      transform: [{ translateY }, { scale }],
      opacity,
    };
  });

  return <Reanimated.View style={[styles.dot, dotStyle]} />;
});

// Compact version for use inside message bubbles
export function CompactTypingIndicator({
  dotSize = 6,
  dotColor,
  style,
}: Omit<TypingIndicatorProps, 'dotCount' | 'dotSpacing' | 'animationDuration'> & {
  dotColor?: string;
}) {
  const { colors } = useAppTheme();
  const resolvedDotColor = dotColor ?? colors.surfaceElevated;
  return (
    <TypingIndicator
      dotCount={3}
      dotSize={dotSize}
      dotColor={resolvedDotColor}
      dotSpacing={3}
      animationDuration={500}
      style={StyleSheet.flatten([styles.compactContainer, style])}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    paddingHorizontal: Space.md,
  },
  dot: {
    // Base styles applied via animated style
  },
  compactContainer: {
    height: 20,
    paddingHorizontal: Space.sm,
  },
});
