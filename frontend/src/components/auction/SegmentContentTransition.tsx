import React from 'react';
import { View } from 'react-native';

interface Props {
  /** Unique key for the current content — kept for API compatibility */
  segmentKey: string;
  children: React.ReactNode;
}

/**
 * Instant segment swap — no animation.
 * The previous fade + slide transition was disruptive and annoying.
 * Content now swaps immediately when the segment changes.
 */
export function SegmentContentTransition({ segmentKey, children }: Props) {
  return (
    <View>
      {children}
    </View>
  );
}

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
