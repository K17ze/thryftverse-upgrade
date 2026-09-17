/**
 * CutoutPreviewSkeleton — loading skeletons for CutoutPreviewSheet:
 * SkeletonBlock (one-time shimmer sweep) and the preview-area
 * placeholder. Extracted verbatim from CutoutPreviewSheet.tsx.
 */
import React, { useEffect } from 'react';
import { View, Text, type DimensionValue } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { Space, Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Motion } from '../../../theme/motionTokens';

// ── SkeletonBlock — one-time shimmer sweep ──────
function SkeletonBlock({ width, height, radius }: { width: DimensionValue; height: number; radius?: number }) {
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

// ── CutoutPreviewSkeleton — placeholder rectangle matching the preview area ──
export function CutoutPreviewSkeleton({ width, height }: { width: number; height: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: Space.sm }}>
      <SkeletonBlock width={width} height={height} radius={Radius.md} />
      <Text style={{ fontFamily: TypographyV2.bodyStrong.fontFamily, fontSize: TypographyV2.bodyStrong.size, color: colors.textPrimary, marginTop: Space.md }}>
        Removing background…
      </Text>
      <Text style={{ fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textSecondary, textAlign: 'center', marginTop: Space.xs }}>
        Generating alpha mask.
      </Text>
    </View>
  );
}
