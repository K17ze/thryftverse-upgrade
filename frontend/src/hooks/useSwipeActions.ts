import React from 'react';
import {
  PanResponder,
  type PanResponderInstance,
  type PanResponderGestureState,
} from 'react-native';

import { useHaptic } from './useHaptic';
import { useReducedMotion } from './useReducedMotion';

/**
 * SwipeActionsConfig — compound swipe gesture configuration.
 *
 * Left/right swipes map to product actions (archive, mark-read, etc.) and a
 * long-press maps to a quick-actions reveal. Haptic feedback fires once when
 * the swipe crosses the threshold so the user feels the commitment point
 * (AGENTS.md §13: correct haptic level for every interactive gesture).
 */
export interface SwipeActionsConfig {
  /** Fired when a swipe completes past threshold travelling left. */
  onSwipeLeft?: () => void;
  /** Fired when a swipe completes past threshold travelling right. */
  onSwipeRight?: () => void;
  /** Fired on a long-press dwell. */
  onLongPress?: () => void;
  /** Whether to fire haptic feedback when crossing the threshold. Default true. */
  hapticOnSwipe?: boolean;
  /** Horizontal distance (px) required to trigger a swipe action. Default 80. */
  threshold?: number;
}

export interface SwipeActionsResult {
  /**
   * The PanResponder instance. Spread `panHandlers.panHandlers` on any View
   * to attach the compound gesture recogniser.
   */
  panHandlers: PanResponderInstance;
  /** True while a recognised swipe gesture is in progress. */
  isSwiping: boolean;
  /** The current dominant swipe direction, or null when idle. */
  swipeDirection: 'left' | 'right' | null;
}

const DEFAULT_THRESHOLD = 80;
const LONG_PRESS_DELAY = 400;

/**
 * useSwipeActions — compound swipe gesture handler with haptic feedback.
 *
 * Uses React Native's built-in PanResponder (not react-native-gesture-handler)
 * to avoid dependency/version friction. Tracks horizontal swipe direction and
 * distance, fires a selection haptic the moment the gesture crosses the
 * threshold (so the user feels the trigger commit), and invokes the matching
 * callback on release when the threshold has been crossed.
 *
 * Haptics are suppressed when the user has enabled Reduce Motion
 * (AGENTS.md §4 / §14: respect reduced-motion across all motion + haptics).
 */
export function useSwipeActions({
  onSwipeLeft,
  onSwipeRight,
  onLongPress,
  hapticOnSwipe = true,
  threshold = DEFAULT_THRESHOLD,
}: SwipeActionsConfig): SwipeActionsResult {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  // Keep the latest callbacks in refs so the PanResponder (created once) always
  // sees fresh closures without being rebuilt on every render.
  const onSwipeLeftRef = React.useRef(onSwipeLeft);
  const onSwipeRightRef = React.useRef(onSwipeRight);
  const onLongPressRef = React.useRef(onLongPress);
  const hapticOnSwipeRef = React.useRef(hapticOnSwipe);
  const thresholdRef = React.useRef(threshold);
  const reducedMotionRef = React.useRef(reducedMotion);

  React.useEffect(() => {
    onSwipeLeftRef.current = onSwipeLeft;
    onSwipeRightRef.current = onSwipeRight;
    onLongPressRef.current = onLongPress;
    hapticOnSwipeRef.current = hapticOnSwipe;
    thresholdRef.current = threshold;
    reducedMotionRef.current = reducedMotion;
  }, [onSwipeLeft, onSwipeRight, onLongPress, hapticOnSwipe, threshold, reducedMotion]);

  const [isSwiping, setIsSwiping] = React.useState(false);
  const [swipeDirection, setSwipeDirection] = React.useState<'left' | 'right' | null>(null);

  // Track whether the threshold has been crossed during the current gesture so
  // the haptic fires exactly once per crossing and the callback only runs on
  // release when the user genuinely committed.
  const crossedRef = React.useRef(false);
  const directionRef = React.useRef<'left' | 'right' | null>(null);
  const longPressFiredRef = React.useRef(false);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const fireHaptic = React.useCallback(() => {
    if (!hapticOnSwipeRef.current || reducedMotionRef.current) return;
    // Selection tick marks the moment the swipe action commits — a light,
    // native-feeling confirmation rather than a blunt impact.
    haptic.selection();
  }, [haptic]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e: any, g: PanResponderGestureState) =>
          Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onPanResponderGrant: (_e: any, _g: PanResponderGestureState) => {
          crossedRef.current = false;
          directionRef.current = null;
          longPressFiredRef.current = false;
          // Schedule a long-press reveal. Cancelled on any decisive move or release.
          if (onLongPressRef.current) {
            clearLongPressTimer();
            longPressTimerRef.current = setTimeout(() => {
              longPressFiredRef.current = true;
              if (!reducedMotionRef.current) {
                haptic.patterns.longPress();
              }
              onLongPressRef.current?.();
            }, LONG_PRESS_DELAY);
          }
        },
        onPanResponderMove: (_e: any, g: PanResponderGestureState) => {
          // Once the user moves decisively, this is a swipe — cancel long-press.
          if (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) {
            clearLongPressTimer();
          }
          const dx = g.dx;
          if (Math.abs(dx) < 4) return;

          const dir: 'left' | 'right' = dx < 0 ? 'left' : 'right';
          if (directionRef.current !== dir) {
            directionRef.current = dir;
            setSwipeDirection(dir);
          }
          if (!isSwiping) {
            setIsSwiping(true);
          }

          const thr = thresholdRef.current;
          const hasCrossed =
            (dir === 'left' && dx <= -thr) || (dir === 'right' && dx >= thr);
          if (hasCrossed && !crossedRef.current) {
            crossedRef.current = true;
            fireHaptic();
          } else if (!hasCrossed && crossedRef.current) {
            // User pulled back below threshold — reset so the haptic can re-fire
            // if they push past again.
            crossedRef.current = false;
          }
        },
        onPanResponderRelease: (_e: any, g: PanResponderGestureState) => {
          clearLongPressTimer();
          setIsSwiping(false);
          setSwipeDirection(null);

          // If a long-press already fired, don't also trigger a swipe action.
          if (longPressFiredRef.current) {
            crossedRef.current = false;
            directionRef.current = null;
            return;
          }

          const thr = thresholdRef.current;
          if (crossedRef.current) {
            if (g.dx <= -thr) {
              onSwipeLeftRef.current?.();
            } else if (g.dx >= thr) {
              onSwipeRightRef.current?.();
            }
          }
          crossedRef.current = false;
          directionRef.current = null;
        },
        onPanResponderTerminate: () => {
          clearLongPressTimer();
          setIsSwiping(false);
          setSwipeDirection(null);
          crossedRef.current = false;
          directionRef.current = null;
        },
      }),
    // PanResponder is created once; refs carry the latest values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearLongPressTimer, fireHaptic, haptic]
  );

  React.useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  return {
    panHandlers: panResponder,
    isSwiping,
    swipeDirection,
  };
}
