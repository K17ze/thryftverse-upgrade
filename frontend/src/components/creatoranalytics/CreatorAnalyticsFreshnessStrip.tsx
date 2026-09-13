import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import type { AnalyticsSummary } from '../../services/creatorAnalyticsApi';
import { createCreatorAnalyticsStyles } from './creatorAnalyticsStyles';
import { completenessColor, completenessLabel } from './creatorAnalyticsFormat';

// ── Data freshness strip ────────────────────────────────────────────
export function CreatorAnalyticsFreshnessStrip({
  summary }: {
  summary: AnalyticsSummary | null;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createCreatorAnalyticsStyles(colors), [colors]);
  if (!summary) return null;
  const c = summary.completeness;
  const color = completenessColor(c, colors);
  return (
    <View style={styles.freshnessRow}>
      <View style={[styles.freshnessDot, { backgroundColor: color }]} />
      <Text style={[styles.freshnessText, { color: colors.textMuted }]}>
        {completenessLabel(c)}
      </Text>
      {/* Always show watermark — even when complete */}
      <Text style={[styles.freshnessWatermark, { color: colors.textMuted }]}>
        · updated {new Date(summary.watermark).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
      </Text>
    </View>
  );
}
