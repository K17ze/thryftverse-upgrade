import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';

// ── Shared shimmer-free skeleton primitives ──
// Deterministic, layout-matching placeholders. No random values.
// Resemble the final layout shape so the loading → populated transition is smooth.

function SkeletonBlock({ width, height, radius = Radius.md }: { width: number | string; height: number; radius?: number }) {
  const { colors } = useAppTheme();
  return <View style={{ width, height, borderRadius: radius, backgroundColor: colors.surfaceAlt }} />;
}

// ── Hub skeletons ──

export function CoOwnHubSkeleton() {
  const { width } = useWindowDimensions();
  const heroHeight = Math.min(width * 0.62, 280);
  const cardWidth = (width - Space.md * 3) / 2;

  return (
    <View style={styles.wrap}>
      <SkeletonBlock width={width - Space.md * 2} height={heroHeight + 120} radius={Radius.lg} />
      <View style={styles.sectionGap} />
      <View style={styles.row}>
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.25} />
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.25} />
      </View>
      <View style={styles.rowGap} />
      <View style={styles.row}>
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.25} />
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.25} />
      </View>
    </View>
  );
}

// ── Asset detail skeleton ──

export function CoOwnAssetDetailSkeleton() {
  const { width } = useWindowDimensions();
  const heroHeight = Math.min(width * 0.75, 360);

  return (
    <View style={styles.wrap}>
      <SkeletonBlock width={width} height={heroHeight} radius={0} />
      <View style={styles.contentPad}>
        <SkeletonBlock width="60%" height={28} />
        <View style={styles.itemGap} />
        <SkeletonBlock width="40%" height={22} />
        <View style={styles.itemGap} />
        <SkeletonBlock width="100%" height={80} radius={Radius.lg} />
        <View style={styles.itemGap} />
        <SkeletonBlock width="100%" height={120} radius={Radius.lg} />
        <View style={styles.itemGap} />
        <SkeletonBlock width="100%" height={200} radius={Radius.lg} />
      </View>
    </View>
  );
}

// ── Portfolio skeleton ──

export function CoOwnPortfolioSkeleton() {
  const { width } = useWindowDimensions();
  const cardWidth = (width - Space.md * 3) / 2;

  return (
    <View style={styles.wrap}>
      <SkeletonBlock width={width - Space.md * 2} height={100} radius={Radius.lg} />
      <View style={styles.sectionGap} />
      <View style={styles.row}>
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.3} />
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.3} />
      </View>
      <View style={styles.rowGap} />
      <View style={styles.row}>
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.3} />
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.3} />
      </View>
    </View>
  );
}

// ── Activity / ledger skeleton ──

export function CoOwnActivitySkeleton() {
  return (
    <View style={styles.wrap}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.activityRow}>
          <SkeletonBlock width={56} height={56} radius={Radius.md} />
          <View style={styles.activityBody}>
            <SkeletonBlock width="70%" height={16} />
            <View style={styles.itemGap} />
            <SkeletonBlock width="45%" height={14} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Trade skeleton ──

export function CoOwnTradeSkeleton() {
  const { width } = useWindowDimensions();

  return (
    <View style={styles.wrap}>
      <SkeletonBlock width={width - Space.md * 2} height={100} radius={Radius.lg} />
      <View style={styles.sectionGap} />
      <SkeletonBlock width="100%" height={50} radius={Radius.md} />
      <View style={styles.itemGap} />
      <SkeletonBlock width="100%" height={50} radius={Radius.md} />
      <View style={styles.itemGap} />
      <SkeletonBlock width="100%" height={120} radius={Radius.lg} />
    </View>
  );
}

// ── Create studio skeleton ──

export function CoOwnCreateStudioSkeleton() {
  const { width } = useWindowDimensions();
  const cardWidth = (width - Space.md * 3) / 2;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.2} />
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.2} />
      </View>
      <View style={styles.rowGap} />
      <View style={styles.row}>
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.2} />
        <SkeletonBlock width={cardWidth} height={cardWidth * 1.2} />
      </View>
    </View>
  );
}

// ── Leaderboard skeleton ──

export function CoOwnLeaderboardSkeleton() {
  return (
    <View style={styles.wrap}>
      {[0, 1, 2].map((section) => (
        <View key={section} style={styles.leaderboardSection}>
          <SkeletonBlock width="50%" height={20} />
          <View style={styles.itemGap} />
          {[0, 1, 2, 3].map((row) => (
            <View key={row} style={styles.activityRow}>
              <SkeletonBlock width={48} height={48} radius={Radius.md} />
              <View style={styles.activityBody}>
                <SkeletonBlock width="60%" height={14} />
                <View style={styles.itemGap} />
                <SkeletonBlock width="35%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  row: {
    flexDirection: 'row',
    gap: Space.md,
  },
  rowGap: {
    height: Space.md,
  },
  sectionGap: {
    height: Space.lg,
  },
  itemGap: {
    height: Space.sm,
  },
  contentPad: {
    padding: Space.md,
    gap: Space.md,
  },
  activityRow: {
    flexDirection: 'row',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  activityBody: {
    flex: 1,
    justifyContent: 'center',
  },
  leaderboardSection: {
    marginBottom: Space.lg,
  },
});
