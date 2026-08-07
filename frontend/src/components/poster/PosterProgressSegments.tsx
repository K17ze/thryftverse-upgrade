import React, { useEffect } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  useAnimatedStyle,
  Easing as ReEasing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Space } from '../../theme/designTokens';

// Progress bar height — matches Instagram/Snapchat thin-segment convention.
const PROGRESS_HEIGHT = 2;
// Subtle segment rounding — avoids the pill look on a 2px bar.
// Instagram uses a near-imperceptible radius rather than a full capsule.
const SEGMENT_RADIUS = Math.max(0.5, PROGRESS_HEIGHT / 4);

interface PosterProgressSegmentsProps {
  total: number;
  currentIndex: number;
  progress: number;
  isPaused?: boolean;
  isLoading?: boolean;
  reducedMotion?: boolean;
}

/**
 * Segmented story progress bar.
 *
 * Benchmark (Instagram/Snapchat 2026): thin segments across the top, one per
 * frame. Filled segments are full-opacity white, the active segment fills
 * left-to-right, and upcoming segments are dim.
 *
 * Design constraints:
 * - 2px height (matches Instagram/Snapchat thin-segment convention)
 * - 4px gap between segments
 * - Subtle 0.5px corner radius (not a pill)
 * - Active fill driven by a Reanimated shared value on the UI thread for
 *   buttery-smooth progress without React re-renders on every tick
 * - Loading state shows a subtle animated shimmer on all segments
 * - Reduced motion: segments show fill state without animated progress or shimmer
 * - Pause state freezes the fill (no distracting indicator on the bar itself;
 *   the accessibility label still announces "paused")
 *
 * The progress bar always sits on top of media (dark overlay), so it uses
 * white-based rgba colors consistently regardless of theme.
 */
export function PosterProgressSegments({
  total,
  currentIndex,
  progress,
  isPaused,
  isLoading,
  reducedMotion,
}: PosterProgressSegmentsProps) {
  const clampedProgress = Math.max(0, Math.min(1, progress));

  // Shimmer: oscillate opacity 0.3 → 0.7 → 0.3 while loading.
  // Reanimated runs on the UI thread by default (no useNativeDriver needed).
  const shimmerSV = useSharedValue(0.3);

  // Active segment fill — driven on the UI thread for buttery-smooth progress.
  // Value is 0..1 representing the fraction of the active segment filled.
  const activeFillSV = useSharedValue(0);
  // Measured track width (all segments are equal via flex:1). Used to
  // translate a full-width fill so the leading edge stays crisp without
  // distorting the corner radius (unlike scaleX which would squash it).
  const trackWidthSV = useSharedValue(0);

  useEffect(() => {
    if (isLoading && !reducedMotion) {
      shimmerSV.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 700, easing: ReEasing.inOut(ReEasing.ease) }),
          withTiming(0.3, { duration: 700, easing: ReEasing.inOut(ReEasing.ease) }),
        ),
        -1, // infinite
        false,
      );
    } else {
      cancelAnimation(shimmerSV);
      shimmerSV.value = 0.3;
    }
    return () => {
      cancelAnimation(shimmerSV);
    };
  }, [isLoading, reducedMotion, shimmerSV]);

  // Mirror the progress prop into the UI-thread shared value so the fill
  // width updates without triggering a React re-render on every tick.
  // Reduced motion: show a static half-fill for the active segment.
  useEffect(() => {
    activeFillSV.value = reducedMotion ? 0.5 : clampedProgress;
  }, [clampedProgress, reducedMotion, activeFillSV]);

  const handleTrackLayout = React.useCallback((e: LayoutChangeEvent) => {
    trackWidthSV.value = e.nativeEvent.layout.width;
  }, [trackWidthSV]);

  const shimmerStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(255,255,255,${shimmerSV.value})`,
  }));

  // Active segment fill: a full-width fill translated left so only the
  // progress portion is visible inside the (overflow:hidden) track.
  // The fill's own right edge is the leading edge, keeping its rounded
  // corner crisp at every progress value (no scaleX distortion).
  const activeFillStyle = useAnimatedStyle(() => {
    const w = trackWidthSV.value;
    if (w <= 0) return { opacity: 0 };
    return {
      opacity: 1,
      transform: [{ translateX: -w * (1 - activeFillSV.value) }],
    };
  });

  return (
    <View
      style={styles.row}
      accessibilityLabel={`Frame ${currentIndex + 1} of ${total}${isPaused ? ', paused' : ''}`}
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityValue={{ now: currentIndex + 1, max: total }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const isPast = i < currentIndex;
        const isActive = i === currentIndex;

        if (isLoading) {
          return (
            <Reanimated.View
              key={i}
              style={[styles.track, shimmerStyle]}
            />
          );
        }

        return (
          <View key={i} style={styles.track} onLayout={handleTrackLayout}>
            {isPast ? (
              // Past segments are full — static fill, no animation needed.
              <View style={styles.fill} />
            ) : isActive ? (
              // Active segment fills left-to-right on the UI thread.
              <Reanimated.View style={[styles.fill, activeFillStyle]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    marginTop: Space.sm,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  track: {
    flex: 1,
    height: PROGRESS_HEIGHT,
    borderRadius: SEGMENT_RADIUS,
    // Track background — white with 0.35 opacity (always on dark media overlay)
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    borderRadius: SEGMENT_RADIUS,
    backgroundColor: 'rgba(255,255,255,1)',
    // Active segment glow — very subtle white shadow for depth on the fill
    shadowColor: '#fff',
    shadowOpacity: 0.15,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 0 },
  },
});
