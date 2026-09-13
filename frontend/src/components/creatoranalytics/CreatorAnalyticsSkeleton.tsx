import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, Radius } from '../../theme/designTokens';
import { createSkeletonStyles } from './creatorAnalyticsStyles';

// ── Loading skeleton ──────────────────────────────────────────────────
export function CreatorAnalyticsSkeleton() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSkeletonStyles(colors), [colors]);
  return (
    <View>
      {/* Freshness strip placeholder */}
      <SkeletonLoader width={140} height={14} />

      {/* Hero placeholder — matches media-anchored hero height */}
      <View style={{ height: Space.md }} />
      <SkeletonLoader width="100%" height={140} borderRadius={Radius.md} />

      {/* Comparison context */}
      <View style={{ height: Space.sm }} />
      <SkeletonLoader width={180} height={12} />

      {/* Metric lines placeholder — 7 rows to match populated state */}
      <View style={{ height: Space.lg }} />
      {Array.from({ length: 7 }).map((_, i) => (
        <View key={i} style={styles.skelMetricRow}>
          <SkeletonLoader width="40%" height={14} />
          <SkeletonLoader width={60} height={16} />
        </View>
      ))}

      {/* Chart placeholder */}
      <View style={{ height: Space.lg }} />
      <SkeletonLoader width={80} height={14} />
      <View style={{ height: Space.sm }} />
      <SkeletonLoader width="100%" height={180} borderRadius={Radius.lg} />

      {/* Content ranking placeholder */}
      <View style={{ height: Space.lg }} />
      <SkeletonLoader width={70} height={14} />
      <View style={{ height: Space.sm }} />
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={styles.skelContentRow}>
          <SkeletonLoader width={48} height={48} borderRadius={Radius.sm} />
          <View style={styles.skelContentInfo}>
            <SkeletonLoader width="60%" height={14} />
            <SkeletonLoader width="40%" height={12} style={{ marginTop: Space.xs }} />
          </View>
        </View>
      ))}

      {/* Earnings placeholder */}
      <View style={{ height: Space.lg }} />
      <SkeletonLoader width={60} height={14} />
      <View style={{ height: Space.sm }} />
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={styles.skelMetricRow}>
          <SkeletonLoader width="35%" height={14} />
          <SkeletonLoader width={70} height={16} />
        </View>
      ))}
    </View>
  );
}
