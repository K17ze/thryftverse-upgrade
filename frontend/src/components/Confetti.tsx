import React, { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAppTheme } from '../theme/ThemeContext';
import { Motion } from '../theme/motionTokens';

interface ParticleProps {
  x: number;
  y: number;
  color: string;
  delay: number;
  screenHeight: number;
}

function Particle({ x, y, color, delay, screenHeight }: ParticleProps) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Pop out
    scale.value = withDelay(delay, withTiming(1, { duration: Motion.duration.normal }));

    // Spread and fall
    translateX.value = withDelay(
      delay,
      withTiming(x, { duration: Motion.duration.crawl, easing: Easing.out(Easing.cubic) })
    );

    translateY.value = withDelay(
      delay,
      withSequence(
        withTiming(-y, { duration: Motion.duration.slow, easing: Easing.out(Easing.quad) }),
        withTiming(screenHeight, { duration: Motion.duration.crawl, easing: Easing.in(Easing.quad) })
      )
    );

    // Spin
    rotate.value = withDelay(
      delay,
      withTiming(Math.random() * 720, { duration: Motion.duration.crawl })
    );

    // Fade out
    opacity.value = withDelay(
      delay + 1000,
      withTiming(0, { duration: Motion.duration.crawl })
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Reanimated.View
      style={[
        {
          position: 'absolute',
          width: 8,
          height: 8,
          backgroundColor: color,
          borderRadius: Math.random() > 0.5 ? 4 : 0,
        },
        style,
      ]}
    />
  );
}

export function Confetti({ count = 40 }: { count?: number }) {
  const reducedMotion = useReducedMotion();
  const { colors } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const confettiColors = [colors.antiqueGold, colors.danger, colors.bronze, colors.surfaceElevated];
  const particles = Array.from({ length: count }).map((_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * width,
    y: Math.random() * 200 + 50,
    color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
    delay: Math.random() * 200,
  }));

  const [active, setActive] = React.useState(true);

  useEffect(() => {
    const t = setTimeout(() => setActive(false), 3000);
    return () => clearTimeout(t);
  }, []);

  // Reduced motion: confetti is purely decorative celebratory motion
  // involving scaling, rotation, and translation — all prohibited under
  // reduced motion (§2.5: "remove parallax/scaling/rotation"). Render
  // nothing so the success moment is communicated via haptics and UI
  // state changes instead.
  if (!active || reducedMotion) return null;

  return (
    <View style={{ position: 'absolute', top: height * 0.4, left: width / 2, zIndex: 100 }} pointerEvents="none">
      {particles.map((p) => (
        <Particle key={p.id} {...p} screenHeight={height} />
      ))}
    </View>
  );
}
