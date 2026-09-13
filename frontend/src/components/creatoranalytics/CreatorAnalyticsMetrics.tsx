import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { FlagshipMetricLine } from '../flagship';
import type { AnalyticsSummary } from '../../services/creatorAnalyticsApi';
import { createCreatorAnalyticsStyles } from './creatorAnalyticsStyles';
import { formatCount, formatRate } from './creatorAnalyticsFormat';

// ── Secondary metrics — flat lines, no cards ────────────────────────
export function CreatorAnalyticsMetrics({
  summary }: {
  summary: AnalyticsSummary['summary'];
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createCreatorAnalyticsStyles(colors), [colors]);
  return (
    <View style={styles.metricsSection}>
      <FlagshipMetricLine
        label="Engagement rate"
        value={formatRate(summary.engagementRate.value)}
        separated
      />
      <FlagshipMetricLine
        label="Profile visits"
        value={formatCount(summary.profileVisits.value)}
        separated
      />
      <FlagshipMetricLine
        label="Product clicks"
        value={formatCount(summary.productClicks.value)}
        separated
      />
      <FlagshipMetricLine
        label="Likes"
        value={formatCount(summary.likes.value)}
        separated
      />
      <FlagshipMetricLine
        label="Saves"
        value={formatCount(summary.saves.value)}
        separated
      />
      <FlagshipMetricLine
        label="Comments"
        value={formatCount(summary.comments.value)}
        separated
      />
      <FlagshipMetricLine
        label="Shares"
        value={formatCount(summary.shares.value)}
        separated
      />
    </View>
  );
}
