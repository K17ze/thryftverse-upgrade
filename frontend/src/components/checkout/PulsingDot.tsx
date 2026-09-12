import React, { useEffect } from 'react';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { Motion } from '../../theme/motionTokens';

// PulsingDot — replaces ActivityIndicator in buttons with a calm pulsing dot.
// Respects reduced motion (static dot when enabled). The pulse is bounded:
// three beats, then the dot settles at full opacity — status indication
// without a perpetual heartbeat (audit F15).
export function PulsingDot({
  color,
  reducedMotion,
  size = 8,
}: {
  color: string;
  reducedMotion: boolean;
  size?: number;
}) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: Motion.duration.slower, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: Motion.duration.slower, easing: Easing.inOut(Easing.ease) }),
      ),
      3,
      false,
    );
    return () => {
      opacity.value = 1;
    };
  }, [opacity, reducedMotion]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Reanimated.View
      style={[
        { width: size, height: size, borderRadius: RadiusRoleValue.pillAvatar, backgroundColor: color },
        reducedMotion ? undefined : dotStyle,
      ]}
    />
  );
}
