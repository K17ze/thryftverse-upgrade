import React, { useEffect } from 'react';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { Motion } from '../../../theme/motionTokens';

// ── SlideUpSurface — wraps a bottom surface with a slide-up entrance ──
// Per spec: "Reanimated for surface transitions (slide in/out)." Each
// bottom surface (items, layout, effects) slides up from below when it
// mounts. Under reduced motion, the transition is instant.
// Per §5.14: entrance uses timing (ease-out), not spring — spring is
// reserved for direct manipulation or mode selection.
export function SlideUpSurface({ children }: { children: React.ReactNode }) {
  const motionConfig = useMotionConfig();
  const translateY = useSharedValue(1);
  useEffect(() => {
    if (motionConfig.isReducedMotion) {
      translateY.value = 0;
    } else {
      translateY.value = withTiming(0, { duration: Motion.tier.deliberate, easing: Motion.easing.entrance });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value * 300 }] }));
  return <Reanimated.View style={animStyle}>{children}</Reanimated.View>;
}
