import React, { useEffect } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';

const AnimatedText = Reanimated.createAnimatedComponent(Text);

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export function AnimatedCounter({
  value,
  duration = 800,
  style,
  prefix = '',
  suffix = '',
  decimals = 0,
}: AnimatedCounterProps) {
  const reducedMotion = useReducedMotion();
  const animatedValue = useSharedValue(0);
  const [display, setDisplay] = React.useState(`${prefix}0${suffix}`);

  useEffect(() => {
    animatedValue.value = withTiming(value, {
      duration: reducedMotion ? 0 : duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration, animatedValue, reducedMotion]);

  // Use a JS-side running update via requestAnimationFrame for simplicity and reliability
  useEffect(() => {
    // Reduced motion: collapse travel to zero — set the final value instantly
    // (§2.5). State-change communication via the displayed value is kept; the
    // animated count-up (decorative motion) is removed.
    if (reducedMotion) {
      const finalDisplay = decimals > 0
        ? `${prefix}${value.toFixed(decimals)}${suffix}`
        : `${prefix}${Math.round(value)}${suffix}`;
      setDisplay(finalDisplay);
      return;
    }

    let frame: number;
    const startTime = Date.now();
    const startVal = 0;
    const endVal = value;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (endVal - startVal) * eased;

      if (decimals > 0) {
        setDisplay(`${prefix}${current.toFixed(decimals)}${suffix}`);
      } else {
        setDisplay(`${prefix}${Math.round(current)}${suffix}`);
      }

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, prefix, suffix, decimals]);

  return <Text style={style}>{display}</Text>;
}