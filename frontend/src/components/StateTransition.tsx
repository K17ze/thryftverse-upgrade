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
 *
 * Uses `Motion.transitions.mediaLoad` (250ms opacity-only) per the research
 * doc §2.4: "the skeleton-to-content transition must be a crossfade
 * (Motion.transitions.mediaLoad, 250ms opacity-only), never a pop, slide,
 * or layout shift." Under reduced motion the duration collapses to 0
 * (instant opacity swap — state-change communication via opacity is kept,
 * travel is removed per §2.5).
 */
export function StateTransition({ loading, skeleton, children }: Props) {
  const reducedMotion = useReducedMotion();
  const fadeDuration = reducedMotion ? 0 : Motion.transitions.mediaLoad.duration;

  const skeletonStyle = useAnimatedStyle(() => ({
    opacity: withTiming(loading ? 1 : 0, { duration: fadeDuration }),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: withTiming(loading ? 0 : 1, { duration: fadeDuration }),
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
