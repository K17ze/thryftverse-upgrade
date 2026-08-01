/**
 * DoubleTapHeart - Instagram-style double-tap to like
 * Shows animated heart overlay on double tap
 */

import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAppTheme } from '../theme/ThemeContext';

interface Props {
  /** Whether the item is already liked */
  isLiked: boolean;
  /** Callback when like is triggered */
  onLike: () => void;
  /** Children to render inside the gesture detector */
  children: React.ReactNode;
  /** Size of the heart animation */
  heartSize?: number;
}

export function DoubleTapHeart({
  isLiked,
  onLike,
  children,
  heartSize = 80,
}: Props) {
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();
  const { colors } = useAppTheme();
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  const triggerLike = useCallback(() => {
    if (!isLiked) {
      haptic.medium();
      onLike();
    }

    if (reducedMotionEnabled) {
      return;
    }

    // Reset and trigger animation
    heartScale.value = 0;
    heartOpacity.value = 1;

    // Clean scale-up with ease-out, hold, then fade out
    heartScale.value = withSequence(
      withTiming(1.2, { duration: 160, easing: Easing.out(Easing.quad) }),
      withTiming(1.2, { duration: 500 }),
      withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) })
    );
    heartOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(620, withTiming(0, { duration: 180 }))
    );
  }, [isLiked, onLike, haptic, reducedMotionEnabled, heartScale, heartOpacity]);

  const gesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(triggerLike)();
    });

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container}>
        {children}

        {/* Animated heart overlay */}
        <Animated.View style={[styles.heartOverlay, heartStyle]} pointerEvents="none">
          <Ionicons name="heart" size={heartSize} color={colors.danger} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  heartOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});

export default DoubleTapHeart;
