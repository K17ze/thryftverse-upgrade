import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { BarChart } from '../charts/BarChart';
import type { ChartPoint } from '../charts/types';
import { createCreatorAnalyticsStyles } from './creatorAnalyticsStyles';
import { formatCount } from './creatorAnalyticsFormat';

// ── Trend chart ─────────────────────────────────────────────────────
export function CreatorAnalyticsChart({
  data,
  hasTimeline,
  accessibilitySummary }: {
  data: ChartPoint[];
  hasTimeline: boolean;
  accessibilitySummary: string;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createCreatorAnalyticsStyles(colors), [colors]);
  return (
    <View style={styles.chartSection}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        Views over time
      </Text>
      <BarChart
        data={data}
        height={180}
        barColor={colors.brand}
        loading={false}
        error={hasTimeline ? null : 'Chart unavailable'}
        emptyMessage="No views in this period"
        valueFormat={formatCount}
        accessibilitySummary={accessibilitySummary}
      />
    </View>
  );
}
