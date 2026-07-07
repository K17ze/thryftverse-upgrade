import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';

export function ProductDetailSkeleton() {
  const { width, height } = useWindowDimensions();
  const isCompact = width < 390;
  const heroHeight = Math.min(height * (isCompact ? 0.5 : 0.62), width * 1.35);

  return (
    <View style={styles.container}>
      {/* Hero skeleton — matches CommerceMediaStage height */}
      <View style={[styles.heroSkeleton, { height: heroHeight }]} />

      {/* Identity skeleton — matches ProductIdentitySummary */}
      <View style={styles.identitySection}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: '70%' }]} />
        <View style={[styles.skeletonLine, { width: '40%', height: 28 }]} />
      </View>

      {/* Chips skeleton */}
      <View style={styles.chipsRow}>
        <View style={styles.chipSkeleton} />
        <View style={styles.chipSkeleton} />
        <View style={styles.chipSkeleton} />
      </View>

      {/* Commerce skeleton */}
      <View style={styles.commerceSkeleton}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: '90%' }]} />
        <View style={[styles.skeletonLine, { width: '80%' }]} />
      </View>

      {/* Seller skeleton */}
      <View style={styles.sellerSkeleton}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: '60%' }]} />
      </View>

      {/* Rail skeleton */}
      <View style={styles.railSkeleton}>
        <View style={[styles.skeletonLine, { width: '50%' }]} />
        <View style={styles.railCardsRow}>
          <View style={styles.railCardSkeleton} />
          <View style={styles.railCardSkeleton} />
          <View style={styles.railCardSkeleton} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroSkeleton: {
    width: '100%',
    backgroundColor: Colors.surfaceAlt,
  },
  identitySection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.sm,
  },
  skeletonLine: {
    height: 16,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  chipSkeleton: {
    width: 80,
    height: 48,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
  },
  commerceSkeleton: {
    marginHorizontal: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    gap: Space.sm,
    marginTop: Space.sm,
  },
  sellerSkeleton: {
    marginHorizontal: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    gap: Space.sm,
    marginTop: Space.sm,
  },
  railSkeleton: {
    marginTop: Space.lg,
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  railCardsRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  railCardSkeleton: {
    width: 140,
    height: 175,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
  },
});
