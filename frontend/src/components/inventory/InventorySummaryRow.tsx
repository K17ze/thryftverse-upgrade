import React from 'react';
import { Text, View } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { InventorySummary } from '../../hooks/inventory/types';
import type { InventoryScreenStyles } from './inventoryScreenStyles';

export interface InventorySummaryRowProps {
  summary: InventorySummary;
  /** Preformatted listed value, e.g. "£1,240.00". */
  valueLabel: string;
  colors: ThemeColors;
  styles: InventoryScreenStyles;
}

/** Summary header — flat canvas, hairline separators. */
export function InventorySummaryRow({ summary, valueLabel, colors, styles }: InventorySummaryRowProps) {
  return (
    <View style={styles.summaryRow}>
      <SummaryCell label="Items" value={String(summary.total)} colors={colors} styles={styles} />
      <SummaryCell label="Active" value={String(summary.active)} colors={colors} styles={styles} accent={colors.success} />
      <SummaryCell label="Sold" value={String(summary.sold)} colors={colors} styles={styles} accent={colors.textMuted} />
      <SummaryCell label="Paused" value={String(summary.paused)} colors={colors} styles={styles} accent={colors.warning} />
      <SummaryCell label="Value" value={valueLabel} colors={colors} styles={styles} accent={colors.brand} last />
    </View>
  );
}

// ── Summary cell (flat canvas, hairline separators) ──
function SummaryCell({
  label,
  value,
  colors,
  styles,
  accent,
  last }: {
  label: string;
  value: string;
  colors: ThemeColors;
  styles: InventoryScreenStyles;
  accent?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.summaryCell, !last && { borderRightColor: colors.border }]}>
      <Text style={[styles.summaryValue, { color: accent ?? colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}
