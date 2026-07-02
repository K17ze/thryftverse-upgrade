import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';

export function AuctionSkeletons() {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.container}>
      {/* Header skeleton */}
      <View style={styles.headerRow}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonHeaderActions} />
      </View>

      {/* Thin attention strip skeleton */}
      <View style={styles.attentionStrip} />

      {/* Segment rail skeleton */}
      <View style={styles.segmentRail}>
        <View style={styles.segmentSkeleton} />
        <View style={styles.segmentSkeleton} />
        <View style={styles.segmentSkeleton} />
      </View>

      {/* Selected market composition — featured + supporting */}
      <View style={styles.featuredCard} />
      <View style={styles.supportingRow}>
        <View style={[styles.supportingCard, { width: (width - Space.md * 2 - Space.sm) / 2 }]} />
        <View style={[styles.supportingCard, { width: (width - Space.md * 2 - Space.sm) / 2 }]} />
      </View>

      {/* Category continuation skeleton */}
      <View style={styles.categoryRow}>
        <View style={styles.categorySkeleton} />
        <View style={styles.categorySkeleton} />
        <View style={styles.categorySkeleton} />
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
    width: 120,
    height: 24,
    borderRadius: Radius.sm,
    backgroundColor: SKELETON_BG,
  },
  attentionStrip: {
    height: 52,
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
  featuredCard: {
    width: '100%',
    height: 220,
    borderRadius: Radius.lg,
    backgroundColor: SKELETON_BG,
  },
  supportingRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  supportingCard: {
    height: 200,
    borderRadius: Radius.md,
    backgroundColor: SKELETON_BG,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  categorySkeleton: {
    flex: 1,
    height: 100,
    borderRadius: Radius.md,
    backgroundColor: SKELETON_BG,
  },
});
