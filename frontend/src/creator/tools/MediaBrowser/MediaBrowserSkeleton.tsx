/**
 * Loading skeletons for the MediaBrowser grid.
 *
 * Extracted from MediaBrowserSheet — pure extraction, no behavior change.
 */
import React, { useEffect } from 'react';
import { View, useWindowDimensions, type DimensionValue } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming } from 'react-native-reanimated';
import { Space, Radius } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Motion } from '../../../theme/motionTokens';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { GRID_COLUMNS } from './mediaBrowserTypes';

// ── SkeletonBlock — one-time shimmer sweep (AGENTS.md §14, §17) ──────
export function SkeletonBlock({ width, height, radius }: { width: DimensionValue; height: number; radius?: number }) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const shimmerSV = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    shimmerSV.value = 0;
    shimmerSV.value = withTiming(1, { duration: Motion.duration.crawl });
  }, [reduceMotion, shimmerSV]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: colors.surfaceAlt,
    opacity: 0.5 + 0.3 * shimmerSV.value }));

  return (
    <Reanimated.View style={[{ width, height, borderRadius: radius ?? Radius.sm }, style]} />
  );
}

// ── MediaGridSkeleton — 3 columns of square thumbnail skeletons ──────
export function MediaGridSkeleton() {
  const rows = 4;
  const { width: screenWidth } = useWindowDimensions();
  const thumbSize = Math.floor(
    (screenWidth - Space.md * 2 - Space.xs * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );
  return (
    <View style={{ paddingHorizontal: Space.md, paddingVertical: Space.sm }}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: Space.xs, marginBottom: Space.xs }}>
          {Array.from({ length: GRID_COLUMNS }).map((_, c) => (
            <SkeletonBlock key={c} width={thumbSize} height={thumbSize} radius={Radius.md} />
          ))}
        </View>
      ))}
    </View>
  );
}
