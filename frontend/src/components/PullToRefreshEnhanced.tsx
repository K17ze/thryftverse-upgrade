import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { ScrollView } from 'react-native-gesture-handler';
import type { ScrollViewProps } from 'react-native';

import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useMotionConfig } from '../hooks/useMotionConfig';

// ─── Constants (2026 micro-interaction research) ──────────────────────────

/** Resistance ratio — rubber-band feel. 0.4–0.5 range; 0.45 chosen. */
const RESISTANCE_RATIO = 0.45;
/** Pull distance (px) at which refresh triggers. 60–80px range; 64px chosen. */
const TRIGGER_THRESHOLD = 64;
/** Minimum time (ms) the refresh indicator stays visible, even if the
 *  refresh callback resolves instantly. Prevents a jarring flash. */
const MIN_DISPLAY_MS = 600;
/** Indicator spinner size. */
const INDICATOR_SIZE = 24;
/** Max visual pull displacement (px) — prevents the indicator from
 *  travelling unboundedly during an aggressive over-drag. */
const MAX_PULL_DISPLACEMENT = 120;

// ─── Types ────────────────────────────────────────────────────────────────

export interface PullToRefreshEnhancedProps
  extends Omit<ScrollViewProps, 'onRefresh' | 'refreshControl'> {
  /** Async refresh handler. The indicator stays visible for at least
   *  MIN_DISPLAY_MS even if this resolves instantly. */
  onRefresh: () => Promise<void> | void;
  /** The content to scroll — typically a FlashList or a column of rows. */
  children: React.ReactNode;
  /** Style applied to the ScrollView. */
  style?: ViewStyle;
  /** Style applied to the content container. */
  contentContainerStyle?: ViewStyle;
}

// ─── PullToRefreshEnhanced ────────────────────────────────────────────────

/**
 * PullToRefreshEnhanced — a pull-to-refresh wrapper with progressive
 * haptics and a Reanimated-driven indicator.
 *
 * Design (2026 micro-interaction research + AGENTS.md §4 / §13):
 * - Resistance ratio 0.45 (rubber-band feel: 40px pull → ~18px displacement).
 * - Trigger threshold 64px.
 * - Haptic at threshold crossing (light impact).
 * - Success haptic on refresh complete.
 * - Minimum display time 600ms (even if refresh is instant).
 * - Reduced motion: no spring, instant snap to fixed position.
 * - Indicator: 24pt spinner that fades in during pull.
 * - Uses design tokens for all colors.
 *
 * Wraps a gesture-handler ScrollView so the pull gesture doesn't conflict
 * with nested gesture-handler children (FlashList, Swipeable, etc.).
 */
export function PullToRefreshEnhanced({
  onRefresh,
  children,
  style,
  contentContainerStyle,
  ...rest
}: PullToRefreshEnhancedProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring, isEnabled } = useMotionConfig();

  // ── State ─────────────────────────────────────────────────────────────
  const isRefreshing = useRef(false);
  const thresholdHapticFired = useRef(false);
  const refreshStartTs = useRef(0);

  // Reanimated shared values — all driven on the UI thread.
  const pullDisplacement = useSharedValue(0);
  const indicatorOpacity = useSharedValue(0);
  const isRefreshingSV = useSharedValue(0); // 0 or 1 — drives indicator spin

  // ── Haptic helpers (JS thread, called from worklet via runOnJS) ───────
  const fireThresholdHaptic = useCallback(() => {
    if (reducedMotion) return;
    if (thresholdHapticFired.current) return;
    thresholdHapticFired.current = true;
    haptic.light();
  }, [haptic, reducedMotion]);

  const fireCompleteHaptic = useCallback(() => {
    if (reducedMotion) return;
    // Success haptic communicates the outcome (fires even under reduced
    // motion in the useHaptic implementation, but we gate here for
    // consistency with the rest of the gesture grammar).
    haptic.success();
  }, [haptic, reducedMotion]);

  const resetThresholdFlag = useCallback(() => {
    thresholdHapticFired.current = false;
  }, []);

  // ── Refresh execution ─────────────────────────────────────────────────
  const executeRefresh = useCallback(async () => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    isRefreshingSV.value = 1;
    refreshStartTs.current = Date.now();

    // Snap the indicator to the threshold position (resting refresh state).
    if (reducedMotion) {
      pullDisplacement.value = withTiming(TRIGGER_THRESHOLD, { duration: 0 });
    } else {
      pullDisplacement.value = withSpring(TRIGGER_THRESHOLD, spring.settle);
    }

    try {
      await onRefresh();
    } catch {
      // Swallow — the caller is responsible for surfacing errors.
    }

    // Enforce minimum display time so the indicator doesn't flash.
    const elapsed = Date.now() - refreshStartTs.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }

    // Snap back to rest.
    if (reducedMotion) {
      pullDisplacement.value = withTiming(0, { duration: 0 });
    } else {
      pullDisplacement.value = withSpring(0, spring.settle);
    }
    indicatorOpacity.value = withTiming(0, { duration: isEnabled ? 200 : 0 });
    isRefreshingSV.value = 0;
    isRefreshing.current = false;
    runOnJS(resetThresholdFlag)();
    runOnJS(fireCompleteHaptic)();
  }, [
    onRefresh,
    pullDisplacement,
    indicatorOpacity,
    isRefreshingSV,
    reducedMotion,
    spring,
    isEnabled,
    resetThresholdFlag,
    fireCompleteHaptic,
  ]);

  // ── Scroll handler (worklet) ──────────────────────────────────────────
  // We use the gesture-handler ScrollView's onScroll to detect over-drag
  // at the top. The native offset is in event.nativeEvent.contentOffset.y;
  // when it's negative, the user is pulling down past the top.
  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const offsetY = event.nativeEvent.contentOffset.y;

      // Only track pull when at or above the top and not already refreshing.
      if (offsetY > 0 || isRefreshing.current) {
        if (offsetY > 0 && !thresholdHapticFired.current) {
          // Reset threshold flag when user scrolls back down.
          thresholdHapticFired.current = false;
        }
        return;
      }

      // Apply resistance ratio (rubber-band feel).
      const rawPull = -offsetY;
      const resisted = rawPull * RESISTANCE_RATIO;
      const clamped = Math.min(resisted, MAX_PULL_DISPLACEMENT);

      pullDisplacement.value = clamped;

      // Fade in the indicator as the pull progresses.
      const fadeProgress = interpolate(
        clamped,
        [0, TRIGGER_THRESHOLD],
        [0, 1],
        Extrapolation.CLAMP,
      );
      indicatorOpacity.value = fadeProgress;

      // Fire threshold haptic once when crossing the trigger point.
      if (clamped >= TRIGGER_THRESHOLD) {
        runOnJS(fireThresholdHaptic)();
      } else if (clamped < TRIGGER_THRESHOLD * 0.5) {
        // Reset the flag when the user pulls back below half-threshold so
        // the haptic can fire again on a new attempt.
        runOnJS(resetThresholdFlag)();
      }
    },
    [pullDisplacement, indicatorOpacity, fireThresholdHaptic, resetThresholdFlag],
  );

  // ── Release handler — trigger refresh if past threshold ───────────────
  const handleRelease = useCallback(() => {
    if (isRefreshing.current) return;
    if (pullDisplacement.value >= TRIGGER_THRESHOLD) {
      runOnJS(executeRefresh)();
    } else {
      // Snap back without refreshing.
      if (reducedMotion) {
        pullDisplacement.value = withTiming(0, { duration: 0 });
      } else {
        pullDisplacement.value = withSpring(0, spring.settle);
      }
      indicatorOpacity.value = withTiming(0, { duration: isEnabled ? 200 : 0 });
    }
  }, [pullDisplacement, indicatorOpacity, reducedMotion, spring, isEnabled, executeRefresh]);

  // ── Animated styles ───────────────────────────────────────────────────
  const indicatorStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateY: pullDisplacement.value - INDICATOR_SIZE / 2 }],
      opacity: indicatorOpacity.value,
    };
  });

  const contentStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateY: pullDisplacement.value }],
    };
  });

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      isRefreshing.current = false;
    };
  }, []);

  return (
    <View style={[styles.container, style]}>
      {/* Pull indicator — positioned above the content, centred horizontally */}
      <Reanimated.View style={[styles.indicatorContainer, indicatorStyle]} pointerEvents="none">
        <ActivityIndicator
          size="small"
          color={colors.brand}
          animating={true}
          style={{ width: INDICATOR_SIZE, height: INDICATOR_SIZE }}
        />
      </Reanimated.View>

      {/* Scrollable content — wrapped in a Reanimated.View for the
          pull-down displacement. We use gesture-handler's ScrollView so
          nested gesture-handler children (Swipeable, FlashList) coexist. */}
      <Reanimated.View style={[styles.contentWrapper, contentStyle]}>
        <ScrollView
          {...rest}
          onScroll={handleScroll}
          onScrollEndDrag={handleRelease}
          scrollEventThrottle={16}
          contentContainerStyle={contentContainerStyle}
          // Disable the native bounce so our custom resistance controls the feel.
          bounces={false}
          alwaysBounceVertical={false}
        >
          {children}
        </ScrollView>
      </Reanimated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  indicatorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  contentWrapper: {
    flex: 1,
  },
});
