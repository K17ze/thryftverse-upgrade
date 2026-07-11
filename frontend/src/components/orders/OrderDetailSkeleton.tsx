import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, Radius } from '../../theme/designTokens';

/**
 * Skeleton loader for the OrderDetailScreen.
 * Mirrors the final layout: status header, item summary, stepper, timeline, transaction.
 */
export function OrderDetailSkeleton() {
  return (
    <View style={styles.container}>
      {/* Status header */}
      <View style={styles.statusHeader}>
        <SkeletonLoader width={120} height={12} borderRadius={6} />
        <SkeletonLoader width={80} height={20} borderRadius={10} style={{ marginTop: 8 }} />
        <SkeletonLoader width="90%" height={14} borderRadius={7} style={{ marginTop: 6 }} />
        <SkeletonLoader width="60%" height={12} borderRadius={6} style={{ marginTop: 4 }} />
      </View>

      {/* Item summary */}
      <View style={styles.summaryCard}>
        <SkeletonLoader width={64} height={64} borderRadius={Radius.md} />
        <View style={styles.summaryText}>
          <SkeletonLoader width="80%" height={14} borderRadius={7} />
          <SkeletonLoader width="50%" height={12} borderRadius={6} style={{ marginTop: 6 }} />
          <SkeletonLoader width="40%" height={14} borderRadius={7} style={{ marginTop: 8 }} />
        </View>
      </View>

      {/* Stepper */}
      <View style={styles.stepperRow}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={i} style={styles.stepperItem}>
            <SkeletonLoader width={28} height={28} borderRadius={14} />
            <SkeletonLoader width={40} height={10} borderRadius={5} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>

      {/* Timeline */}
      <View style={styles.timelineSection}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={styles.timelineRow}>
            <SkeletonLoader width={10} height={10} borderRadius={5} />
            <View style={styles.timelineText}>
              <SkeletonLoader width="70%" height={12} borderRadius={6} />
              <SkeletonLoader width="40%" height={10} borderRadius={5} style={{ marginTop: 4 }} />
            </View>
          </View>
        ))}
      </View>

      {/* Transaction */}
      <View style={styles.transactionSection}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={styles.txRow}>
            <SkeletonLoader width="50%" height={12} borderRadius={6} />
            <SkeletonLoader width={60} height={12} borderRadius={6} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.lg,
  },
  statusHeader: {
    paddingVertical: Space.sm,
    gap: 4,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  summaryText: {
    flex: 1,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
  },
  stepperItem: {
    alignItems: 'center',
    gap: 4,
  },
  timelineSection: {
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  timelineText: {
    flex: 1,
  },
  transactionSection: {
    gap: 10,
    paddingVertical: Space.sm,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
