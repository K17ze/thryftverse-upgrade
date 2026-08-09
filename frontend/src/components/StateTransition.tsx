import React from 'react';
import Reanimated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../theme/motionTokens';

interface Props {
  /** Whether the loading (skeleton) state is active */
  loading: boolean;
  /** The skeleton content shown while loading */
  skeleton: React.ReactNode;
  /** The real content shown when loaded */
  children: React.ReactNode;
}

/**
 * Crossfades between skeleton and content states.
 * Opacities always sum to 1 (skeletonOpacity + contentOpacity = 1)
 * so the container never dims mid-transition.
 */
export function StateTransition({ loading, skeleton, children }: Props) {
  const reducedMotion = useReducedMotion();

  const skeletonStyle = useAnimatedStyle(() => ({
    opacity: withTiming(loading ? 1 : 0, { duration: reducedMotion ? 0 : Motion.duration.normal }),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: withTiming(loading ? 0 : 1, { duration: reducedMotion ? 0 : Motion.duration.normal }),
  }));

  return (
    <>
      <Reanimated.View
        style={[{ position: loading ? 'relative' : 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, skeletonStyle]}
        pointerEvents={loading ? 'auto' : 'none'}
      >
        {skeleton}
      </Reanimated.View>
      <Reanimated.View
        style={[{ position: loading ? 'absolute' : 'relative', top: 0, left: 0, right: 0, bottom: 0 }, contentStyle]}
        pointerEvents={loading ? 'none' : 'auto'}
      >
        {children}
      </Reanimated.View>
    </>
  );
}
