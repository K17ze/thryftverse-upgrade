import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';

export function AuctionSkeletons() {
  const { width } = useWindowDimensions();
  const contentWidth = width - Space.md * 2;
  const featuredWidth = contentWidth * 0.62;
  const supportingWidth = contentWidth - featuredWidth - Space.sm;

  return (
    <View style={styles.container}>
      {/* Header skeleton */}
      <View style={styles.headerRow}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonHeaderActions} />
      </View>

      {/* Attention strip skeleton */}
      <View style={styles.attentionStrip} />

      {/* Segment rail skeleton */}
      <View style={styles.segmentRail}>
        <View style={styles.segmentSkeleton} />
        <View style={styles.segmentSkeleton} />
        <View style={styles.segmentSkeleton} />
      </View>

      {/* Asymmetric composition — featured + 2 stacked supporting */}
      <View style={styles.compositionRow}>
        <View style={[styles.featuredSkeleton, { width: featuredWidth }]} />
        <View style={[styles.supportingColumn, { width: supportingWidth }]}>
          <View style={styles.supportingSkeleton} />
          <View style={styles.supportingSkeleton} />
        </View>
      </View>

      {/* Continuation hint */}
      <View style={styles.continuationRow}>
        <View style={[styles.gridSkeleton, { width: (contentWidth - Space.sm) / 2 }]} />
        <View style={[styles.gridSkeleton, { width: (contentWidth - Space.sm) / 2 }]} />
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
    width: 140,
    height: 24,
    borderRadius: Radius.sm,
    backgroundColor: SKELETON_BG,
  },
  attentionStrip: {
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: SKELETON_BG,
  },
  segmentRail: {
    flexDirection: 'row',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  segmentSkeleton: {
    width: 80,
    height: 20,
    borderRadius: Radius.sm,
    backgroundColor: SKELETON_BG,
  },
  compositionRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  featuredSkeleton: {
    height: 280,
    borderRadius: Radius.lg,
    backgroundColor: SKELETON_BG,
  },
  supportingColumn: {
    gap: Space.sm,
  },
  supportingSkeleton: {
    flex: 1,
    borderRadius: Radius.md,
    backgroundColor: SKELETON_BG,
  },
  continuationRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  gridSkeleton: {
    height: 200,
    borderRadius: Radius.md,
    backgroundColor: SKELETON_BG,
  },
});
  },
});
