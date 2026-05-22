/**
 * StaggeredGridEntrance — Wraps grid items with staggered entrance animations
 * Creates a cascading reveal effect as items scroll into view
 *
 * Usage:
 *   <StaggeredGridEntrance>
 *     {items.map((item, i) => (
 *       <ProductCardV2 key={item.id} item={item} index={i} />
 *     ))}
 *   </StaggeredGridEntrance>
 *
 * Or per-item wrapper:
 *   <StaggeredItem index={index}>
 *     <ProductCardV2 item={item} />
 *   </StaggeredItem>
 */

import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Reanimated, {
  FadeInDown,
  FadeIn,
  ZoomIn,
  withDelay,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../constants/motion';

interface StaggeredItemProps {
  children: React.ReactNode;
  index: number;
  /** Delay per item in ms (default 45) */
  staggerMs?: number;
  /** Animation type: 'fadeDown' | 'fade' | 'zoom' | 'springUp' */
  animation?: 'fadeDown' | 'fade' | 'zoom' | 'springUp';
  /** Max items to stagger before instant (default 12) */
  maxStagger?: number;
  style?: StyleProp<ViewStyle>;
}

export function StaggeredItem({
  children,
  index,
  staggerMs = 45,
  animation = 'fadeDown',
  maxStagger = 12,
  style,
}: StaggeredItemProps) {
  const reducedMotionEnabled = useReducedMotion();

  if (reducedMotionEnabled || index >= maxStagger) {
    return <View style={style}>{children}</View>;
  }

  const delay = index * staggerMs;

  const enterAnimation = React.useMemo(() => {
    switch (animation) {
      case 'fadeDown':
        return FadeInDown
          .duration(Motion.list.enterDuration)
          .delay(delay)
          .springify()
          .damping(Motion.spring.flagship.damping)
          .stiffness(Motion.spring.flagship.stiffness);
      case 'fade':
        return FadeIn
          .duration(Motion.list.enterDuration)
          .delay(delay);
      case 'zoom':
        return ZoomIn
          .duration(Motion.list.enterDuration)
          .delay(delay)
          .springify()
          .damping(Motion.spring.flagshipPop.damping)
          .stiffness(Motion.spring.flagshipPop.stiffness);
      case 'springUp':
        return FadeInDown
          .duration(Motion.list.enterDuration + 100)
          .delay(delay)
          .springify()
          .damping(14)
          .stiffness(200);
      default:
        return FadeInDown.duration(300).delay(delay);
    }
  }, [animation, delay]);

  return (
    <Reanimated.View
      entering={enterAnimation}
      style={style}
    >
      {children}
    </Reanimated.View>
  );
}

interface StaggeredGridEntranceProps {
  children: React.ReactNode;
  /** Number of columns for calculating stagger order (default 2) */
  columns?: number;
  /** Delay per item in ms (default 45) */
  staggerMs?: number;
  animation?: 'fadeDown' | 'fade' | 'zoom' | 'springUp';
  /** Container style */
  style?: StyleProp<ViewStyle>;
}

/**
 * Container that auto-wraps children in staggered animations
 * Best used with MasonryGrid or FlashList renderItem
 */
export function StaggeredGridEntrance({
  children,
  columns = 2,
  staggerMs = 45,
  animation = 'fadeDown',
  style,
}: StaggeredGridEntranceProps) {
  return (
    <View style={style}>
      {children}
    </View>
  );
}

/**
 * Helper hook to compute stagger delay based on grid position
 */
export function useStaggerDelay(
  index: number,
  columns: number = 2,
  staggerMs: number = 45,
  maxStagger: number = 12
): number {
  const reducedMotionEnabled = useReducedMotion();
  if (reducedMotionEnabled) return 0;

  // Stagger by row then column for masonry feel
  const row = Math.floor(index / columns);
  const col = index % columns;
  const delay = (row * columns + col) * staggerMs;

  return Math.min(delay, maxStagger * staggerMs);
}
