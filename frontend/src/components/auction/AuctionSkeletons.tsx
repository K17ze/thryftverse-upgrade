import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';

export function AuctionSkeletons() {
  return (
    <View style={styles.container}>
      {/* Header skeleton */}
      <View style={styles.headerRow}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonHeaderActions} />
      </View>

      {/* Runway skeleton */}
      <View style={styles.runwayWrap}>
        <View style={[styles.skeletonBlock, styles.runwayCard]} />
        <View style={[styles.skeletonBlock, styles.runwayPeek]} />
      </View>

      {/* Grid skeleton */}
      <View style={styles.gridRow}>
        <View style={[styles.skeletonBlock, styles.gridCard]} />
        <View style={[styles.skeletonBlock, styles.gridCard]} />
      </View>
      <View style={styles.gridRow}>
        <View style={[styles.skeletonBlock, styles.gridCard]} />
        <View style={[styles.skeletonBlock, styles.gridCard]} />
      </View>

      {/* Row skeletons */}
      <View style={styles.rowSkeleton}>
        <View style={[styles.skeletonBlock, styles.rowThumb]} />
        <View style={styles.rowBody}>
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, { width: '60%' }]} />
        </View>
      </View>
      <View style={styles.rowSkeleton}>
        <View style={[styles.skeletonBlock, styles.rowThumb]} />
        <View style={styles.rowBody}>
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, { width: '60%' }]} />
        </View>
      </View>
    </View>
  );
}

const SKELETON_BG = Colors.surfaceAlt;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  skeletonTitle: {
    width: 120,
    height: 24,
    borderRadius: Radius.sm,
    backgroundColor: SKELETON_BG,
  },
  skeletonHeaderActions: {
    width: 80,
    height: 24,
    borderRadius: Radius.sm,
    backgroundColor: SKELETON_BG,
  },
  runwayWrap: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  runwayCard: {
    width: '76%',
    height: 320,
    borderRadius: Radius.lg,
  },
  runwayPeek: {
    flex: 1,
    height: 320,
    borderRadius: Radius.lg,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  gridCard: {
    flex: 1,
    height: 240,
    borderRadius: Radius.md,
  },
  rowSkeleton: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
    paddingVertical: Space.sm,
  },
  rowThumb: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
  },
  rowBody: {
    flex: 1,
    gap: Space.xs,
  },
  skeletonLine: {
    height: 14,
    borderRadius: Radius.sm,
    backgroundColor: SKELETON_BG,
  },
  skeletonBlock: {
    backgroundColor: SKELETON_BG,
  },
});
