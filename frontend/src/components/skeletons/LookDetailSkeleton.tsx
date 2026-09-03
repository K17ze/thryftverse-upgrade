import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Control, AvatarSize, AspectRatio } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/**
 * LookDetailSkeleton — zero-layout-shift loading skeleton for LookDetailScreen.
 * Mirrors the canonical 1-surface FlashList layout:
 *   1. Full-bleed 4:5 hero container
 *   2. Expandable caption + creator row with follow affordance
 *   3. Social actions row (Like, Comment, Save, Share)
 *   4. Labeled soft seam ("More looks you might like")
 *   5. 3-column Instagram-style explore grid
 */
export function LookDetailSkeleton() {
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();

  const heroHeight = Math.round(SCREEN_W / AspectRatio.marketplace);
  const exploreGap = Space.xs;
  const colWidth = Math.floor((SCREEN_W - Space.md * 2 - exploreGap * 2) / 3);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 1. Hero — matches heroWrap: SCREEN_W x (SCREEN_W / AspectRatio.marketplace) */}
      <SkeletonLoader width={SCREEN_W} height={heroHeight} borderRadius={Radius.none} />

      {/* 2. Info section — matches infoSection padding and gap */}
      <View style={styles.infoSection}>
        {/* Caption lines */}
        <SkeletonLoader width="92%" height={TypographyV2.body.size} borderRadius={Radius.sm} />
        <SkeletonLoader width="65%" height={TypographyV2.body.size} borderRadius={Radius.sm} />

        {/* Creator row */}
        <View style={styles.creatorRow}>
          <SkeletonLoader
            width={Space.xl + Space.sm}
            height={Space.xl + Space.sm}
            borderRadius={Radius.xxl}
          />
          <View style={styles.creatorInfo}>
            <SkeletonLoader width={120} height={TypographyV2.bodyStrong.size} borderRadius={Radius.sm} />
            <SkeletonLoader width={80} height={TypographyV2.meta.size} borderRadius={Radius.sm} />
          </View>
          <View style={{ flex: 1 }} />
          <SkeletonLoader width={76} height={28} borderRadius={Radius.full} />
        </View>
      </View>

      {/* 3. Social actions row — matches LookSocialActions layout */}
      <View style={styles.socialRow}>
        <SkeletonLoader width={48} height={20} borderRadius={Radius.sm} />
        <SkeletonLoader width={48} height={20} borderRadius={Radius.sm} />
        <SkeletonLoader width={48} height={20} borderRadius={Radius.sm} />
        <View style={{ flex: 1 }} />
        <SkeletonLoader width={32} height={20} borderRadius={Radius.sm} />
      </View>

      {/* 4. Labeled soft seam (detail → explore transition) */}
      <View style={styles.exploreSeam}>
        <View style={[styles.exploreSeamDivider, { backgroundColor: colors.borderSubtle }]} />
        <SkeletonLoader width={160} height={TypographyV2.meta.size} borderRadius={Radius.sm} />
      </View>

      {/* 5. 3-column Instagram-style explore grid skeleton */}
      <View style={styles.exploreGrid}>
        <View style={[styles.exploreCol, { width: colWidth, gap: exploreGap }]}>
          <SkeletonLoader width={colWidth} height={Math.round(colWidth * 1.25)} borderRadius={Radius.md} />
          <SkeletonLoader width={colWidth} height={colWidth} borderRadius={Radius.md} />
          <SkeletonLoader width={colWidth} height={Math.round(colWidth * 1.33)} borderRadius={Radius.md} />
        </View>
        <View style={[styles.exploreCol, { width: colWidth, gap: exploreGap }]}>
          <SkeletonLoader width={colWidth} height={colWidth} borderRadius={Radius.md} />
          <SkeletonLoader width={colWidth} height={Math.round(colWidth * 1.33)} borderRadius={Radius.md} />
          <SkeletonLoader width={colWidth} height={Math.round(colWidth * 1.25)} borderRadius={Radius.md} />
        </View>
        <View style={[styles.exploreCol, { width: colWidth, gap: exploreGap }]}>
          <SkeletonLoader width={colWidth} height={Math.round(colWidth * 1.33)} borderRadius={Radius.md} />
          <SkeletonLoader width={colWidth} height={Math.round(colWidth * 1.25)} borderRadius={Radius.md} />
          <SkeletonLoader width={colWidth} height={colWidth} borderRadius={Radius.md} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  infoSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.sm,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs / 2,
  },
  creatorInfo: {
    gap: Space.xxs,
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    marginTop: Space.md,
    gap: Space.md,
  },
  exploreSeam: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xl,
    paddingBottom: Space.sm,
    gap: Space.sm,
  },
  exploreSeamDivider: {
    height: 1,
  },
  exploreGrid: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    gap: Space.xs,
    paddingTop: Space.xs,
    paddingBottom: Space.xxl,
  },
  exploreCol: {
    flex: 1,
  },
});
