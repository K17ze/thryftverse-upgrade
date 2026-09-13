import { useSharedValue, useAnimatedStyle, withSequence, withTiming, Layout } from 'react-native-reanimated';
import { useReducedMotion } from '../useReducedMotion';
import { Motion } from '../../theme/motionTokens';

/**
 * Error/status feedback for the login screen — the scale pulse fired on
 * every failed attempt plus the shared layout animation used by the primary
 * action wrapper. Reduce Motion swaps the pulse for a no-op reset
 * (WCAG 2.2 §2.3.3), verbatim from the original screen.
 */
export function useLoginStatusFeedback() {
  const reducedMotionEnabled = useReducedMotion();
  const errorPulse = useSharedValue(1);

  const triggerErrorFeedback = () => {
    if (reducedMotionEnabled) {
      // WCAG 2.2 §2.3.3 — no motion animation when Reduce Motion is on
      errorPulse.value = 1;
      return;
    }
    errorPulse.value = withSequence(
      withTiming(0.95, { duration: Motion.duration.fast }),
      withTiming(1, { duration: Motion.duration.normal })
    );
  };

  const errorPulseStyle = useAnimatedStyle(() => ({
    opacity: errorPulse.value
  }));

  const layoutAnimation = reducedMotionEnabled ? undefined : Layout.springify();

  return { triggerErrorFeedback, errorPulseStyle, layoutAnimation };
}
