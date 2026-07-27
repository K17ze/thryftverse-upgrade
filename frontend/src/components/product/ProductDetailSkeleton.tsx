import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';

export function ProductDetailSkeleton() {
  const { colors } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const isCompact = width < 390;
  const heroHeight = Math.min(height * (isCompact ? 0.5 : 0.62), width * 1.35);

  return (
    <View style={styles.container}>
      {/* Hero skeleton — matches CommerceMediaStage height */}
      <View style={[styles.heroSkeleton, { height: heroHeight, backgroundColor: colors.surfaceAlt }]} />

      {/* Identity skeleton — matches ProductIdentitySummary */}
      <View style={styles.identitySection}>
        <View style={[styles.skeletonLine, { backgroundColor: colors.surfaceAlt }]} />
        <View style={[styles.skeletonLine, { width: '70%', backgroundColor: colors.surfaceAlt }]} />
        <View style={[styles.skeletonLine, { width: '40%', height: 28, backgroundColor: colors.surfaceAlt }]} />
      </View>

      {/* Chips skeleton */}
      <View style={styles.chipsRow}>
        <View style={[styles.chipSkeleton, { backgroundColor: colors.surfaceAlt }]} />
        <View style={[styles.chipSkeleton, { backgroundColor: colors.surfaceAlt }]} />
        <View style={[styles.chipSkeleton, { backgroundColor: colors.surfaceAlt }]} />
      </View>

      {/* Commerce skeleton */}
      <View style={[styles.commerceSkeleton, { backgroundColor: colors.surface }]}>
        <View style={[styles.skeletonLine, { backgroundColor: colors.surfaceAlt }]} />
        <View style={[styles.skeletonLine, { width: '90%', backgroundColor: colors.surfaceAlt }]} />
        <View style={[styles.skeletonLine, { width: '80%', backgroundColor: colors.surfaceAlt }]} />
      </View>

      {/* Seller skeleton */}
      <View style={[styles.sellerSkeleton, { backgroundColor: colors.surface }]}>
        <View style={[styles.skeletonLine, { backgroundColor: colors.surfaceAlt }]} />
        <View style={[styles.skeletonLine, { width: '60%', backgroundColor: colors.surfaceAlt }]} />
      </View>

      {/* Rail skeleton */}
      <View style={styles.railSkeleton}>
        <View style={[styles.skeletonLine, { width: '50%', backgroundColor: colors.surfaceAlt }]} />
        <View style={styles.railCardsRow}>
          <View style={[styles.railCardSkeleton, { backgroundColor: colors.surfaceAlt }]} />
          <View style={[styles.railCardSkeleton, { backgroundColor: colors.surfaceAlt }]} />
          <View style={[styles.railCardSkeleton, { backgroundColor: colors.surfaceAlt }]} />
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
  },
  identitySection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.sm,
  },
  skeletonLine: {
    height: 16,
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
    borderRadius: Radius.md,
  },
  commerceSkeleton: {
    marginHorizontal: Space.md,
    borderRadius: Radius.lg,
    padding: Space.md,
    gap: Space.sm,
    marginTop: Space.sm,
  },
  sellerSkeleton: {
    marginHorizontal: Space.md,
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
    borderRadius: Radius.md,
  },
});
