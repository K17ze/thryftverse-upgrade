import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface DoubleTapHandlerProps {
  children: React.ReactNode;
  onDoubleTap: () => void;
}

export function DoubleTapHandler({ children, onDoubleTap }: DoubleTapHandlerProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const triggerAnimation = useCallback(() => {
    if (reducedMotion) return;
    scale.value = 0;
    opacity.value = 1;

    // Pop up fast, stay a bit, then quickly dissolve and shrink
    scale.value = withSequence(
      withTiming(1, { duration: 140 }),
      withDelay(400, withTiming(0.8, { duration: 150 }))
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(400, withTiming(0, { duration: 150 }))
    );
  }, [scale, opacity, reducedMotion]);

  const onDoubleTapJS = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    triggerAnimation();
    onDoubleTap();
  }, [onDoubleTap, triggerAnimation]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      runOnJS(onDoubleTapJS)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={doubleTap}>
      <View style={styles.container}>
        {children}
        <View style={styles.heartOverlay} pointerEvents="none">
          <Reanimated.View style={animatedStyle}>
            <Ionicons name="heart" size={100} color="#fff" style={styles.shadow} />
          </Reanimated.View>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  heartOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 20,
  },
});