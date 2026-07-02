import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface Props {
  /** Unique key for the current content — changes trigger transition */
  segmentKey: string;
  children: React.ReactNode;
}

/**
 * Wraps segment content with a restrained fade + directional slide
 * when the segment changes. Transition direction follows segment
 * order (left-to-right segments slide left, right-to-left slide right).
 */
export function SegmentContentTransition({ segmentKey, children }: Props) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const translateX = useSharedValue(0);
  const prevKeyRef = React.useRef(segmentKey);

  useEffect(() => {
    const prevKey = prevKeyRef.current;
    if (prevKey === segmentKey) return;
    prevKeyRef.current = segmentKey;

    if (reducedMotion) {
      opacity.value = 1;
      translateX.value = 0;
      return;
    }

    // Fade out → swap → fade in with slight directional slide
    opacity.value = 0;
    translateX.value = 8;

    const timer = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 200 });
      translateX.value = withSpring(0, { damping: 18, stiffness: 260 });
    }, 120);

    return () => clearTimeout(timer);
  }, [segmentKey, reducedMotion, opacity, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Reanimated.View style={animatedStyle}>
      {children}
    </Reanimated.View>
  );
}
