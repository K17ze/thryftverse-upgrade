/**
 * AnimatedNumber — counts between numeric values on the UI thread,
 * committing at most ~40 text updates per transition.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const STEPS = 40;

export interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  /** Animation duration in ms. */
  duration?: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

/** Animates from the previously displayed value to `value` (from 0 on mount). */
export function AnimatedNumber({
  value,
  format,
  duration = 900,
  style,
  testID,
}: AnimatedNumberProps): React.ReactElement {
  const reducedMotion = useReducedMotion();
  const [text, setText] = useState(() => format(reducedMotion ? value : 0));
  const displayed = useRef(0);
  const current = useSharedValue(0);
  const from = useSharedValue(0);
  const to = useSharedValue(0);
  const lastStep = useSharedValue(-1);
  const formatRef = useRef(format);

  const applyValue = useCallback((v: number) => {
    displayed.current = v;
    setText(formatRef.current(v));
  }, []);

  useEffect(() => {
    formatRef.current = format;
    setText(format(displayed.current));
  }, [format]);

  useEffect(() => {
    if (reducedMotion) {
      displayed.current = value;
      setText(formatRef.current(value));
      return;
    }
    from.value = displayed.current;
    to.value = value;
    lastStep.value = -1;
    current.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration, reducedMotion, current, from, to, lastStep]);

  useAnimatedReaction(
    () =>
      to.value === from.value
        ? -1
        : Math.round(
            ((current.value - from.value) / (to.value - from.value)) * STEPS
          ),
    (step) => {
      if (step < 0 || step === lastStep.value) return;
      lastStep.value = step;
      runOnJS(applyValue)(
        from.value + ((to.value - from.value) * step) / STEPS
      );
    }
  );

  return (
    <Text style={style} testID={testID}>
      {text}
    </Text>
  );
}
