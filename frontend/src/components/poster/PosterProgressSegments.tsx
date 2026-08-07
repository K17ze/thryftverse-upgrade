import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  useAnimatedStyle,
  Easing as ReEasing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Space } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';

// Progress bar height — matches Instagram/Snapchat thin-segment convention.
const PROGRESS_HEIGHT = 2;
// Pause indicator geometry — local constants keep the magic numbers traceable.
const PAUSE_INDICATOR_SIZE = 14;
const PAUSE_ICON_SIZE = 12;

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
 * - No pause-bar artifact (pause simply freezes the fill)
 * - Loading state shows a subtle animated shimmer on all segments
 * - Reduced motion: segments show fill state without animated progress or shimmer
 * - Pause indicator: a subtle pause icon at the right edge of the active segment
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

  // Pause indicator opacity — fades in/out smoothly.
  const pauseOpacitySV = useSharedValue(0);

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

  // Pause indicator fade in/out
  useEffect(() => {
    pauseOpacitySV.value = withTiming(isPaused ? 1 : 0, { duration: Motion.duration.normal });
  }, [isPaused, pauseOpacitySV]);

  const shimmerStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(255,255,255,${shimmerSV.value})`,
  }));

  const pauseIconStyle = useAnimatedStyle(() => ({
    opacity: pauseOpacitySV.value * 0.7,
  }));

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
        // Past segments are full; active fills with progress; future are empty.
        // Reduced motion: show full fill for past, half for active (no animation).
        const fillPercent = isPast
          ? 100
          : isActive
            ? reducedMotion
              ? 50
              : Math.round(clampedProgress * 100)
            : 0;

        if (isLoading) {
          return (
            <Reanimated.View
              key={i}
              style={[styles.track, shimmerStyle]}
            />
          );
        }

        return (
          <View key={i} style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${fillPercent}%` },
              ]}
            />
            {/* Pause indicator at the right edge of the active segment */}
            {isActive && (
              <Reanimated.View style={[styles.pauseIndicator, pauseIconStyle]} pointerEvents="none">
                <Ionicons name="pause" size={PAUSE_ICON_SIZE} color="#fff" />
              </Reanimated.View>
            )}
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
    borderRadius: PROGRESS_HEIGHT / 2,
    // Track background — white with 0.35 opacity (always on dark media overlay)
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  fill: {
    height: '100%',
    borderRadius: PROGRESS_HEIGHT / 2,
    backgroundColor: 'rgba(255,255,255,1)',
    // Active segment glow — subtle white shadow for depth on the fill
    shadowColor: '#fff',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 0 },
  },
  pauseIndicator: {
    position: 'absolute',
    right: -1,
    top: '50%',
    marginTop: -(PAUSE_INDICATOR_SIZE / 2),
    width: PAUSE_INDICATOR_SIZE,
    height: PAUSE_INDICATOR_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
