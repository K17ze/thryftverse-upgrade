/**
 * DraftListSkeleton — loading skeletons for CreatorDraftListScreen.
 * Extracted verbatim from CreatorDraftListScreen.tsx.
 */
import React, { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { Space, Radius, Control, Stroke } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Motion } from '../../../theme/motionTokens';

// ── SkeletonBlock — one-time shimmer sweep (AGENTS.md §14, §17) ──────
// A single shimmering placeholder block. The sweep runs once (0→1)
// then holds — no continuous pulse. Uses colors.surfaceAlt.
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

// ── DraftListSkeleton — matches draft row layout (thumbnail + 2 text lines) ──
export function DraftListSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: undefined }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Space.md,
            padding: Space.md,
            borderBottomWidth: Stroke.hairline,
            borderBottomColor: 'transparent' }}
        >
          {/* Thumbnail rectangle */}
          <SkeletonBlock width={48} height={48} radius={Radius.md} />
          {/* Two text lines */}
          <View style={{ flex: 1, gap: Space.xs }}>
            <SkeletonBlock width={'60%'} height={TypographyV2.bodyStrong.size + 4} radius={Radius.sm} />
            <SkeletonBlock width={'40%'} height={TypographyV2.meta.size + 2} radius={Radius.sm} />
          </View>
          {/* Action icons placeholder */}
          <View style={{ flexDirection: 'row', gap: Space.xs }}>
            <SkeletonBlock width={Control.hit} height={Control.hit} radius={Radius.sm} />
            <SkeletonBlock width={Control.hit} height={Control.hit} radius={Radius.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}
