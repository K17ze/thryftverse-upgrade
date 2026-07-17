import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';

export interface CoOwnLedgerSummaryProps {
  issuedCount: number;
  boughtCount: number;
  soldCount: number;
  pausedCount: number;
  // Phase 6: mark-used + window labels
  /** Mark price used for valuation (e.g. "Last trade"). */
  markUsedLabel?: string;
  /** Valuation window label (e.g. "24h", "7d", "MTD", "All time"). */
  windowLabel?: string;
  /** Mark timestamp (e.g. "as of 14:02"). */
  markTimestamp?: string;
  /** Whether the mark is stale (>24h). */
  isStaleMark?: boolean;
}

export function CoOwnLedgerSummary({
  issuedCount,
  boughtCount,
  soldCount,
  pausedCount,
  markUsedLabel,
  windowLabel,
  markTimestamp,
  isStaleMark,
}: CoOwnLedgerSummaryProps) {
  const { colors } = useAppTheme();

  const items = [
    { icon: 'add-circle-outline', label: 'Issued', value: issuedCount },
    { icon: 'arrow-down-circle-outline', label: 'Bought', value: boughtCount },
    { icon: 'arrow-up-circle-outline', label: 'Sold', value: soldCount },
    { icon: 'pause-circle-outline', label: 'Paused', value: pausedCount },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {items.map((item, i) => (
        <View
          key={item.label}
          style={[
            styles.item,
            i < items.length - 1 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
          ]}
        >
          <Ionicons name={item.icon as any} size={18} color={colors.textSecondary} />
          <Text
            style={[styles.itemValue, { color: colors.textPrimary }]}
            accessibilityLabel={`${item.label}: ${item.value}`}
          >
            {item.value}
          </Text>
          <Text style={[styles.itemLabel, { color: colors.textMuted }]}>{item.label}</Text>
        </View>
      ))}
      {/* Phase 6: mark-used + window labels */}
      {(markUsedLabel || windowLabel) && (
        <View
          style={[
            styles.metaItem,
            { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
          ]}
        >
          {windowLabel && (
            <Text style={[styles.windowLabel, { color: colors.textMuted }]} numberOfLines={1}>
              {windowLabel}
            </Text>
          )}
          {markUsedLabel && (
            <Text
              style={[
                styles.markUsedLabel,
                { color: isStaleMark ? colors.warning : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {markUsedLabel}
            </Text>
          )}
          {markTimestamp && (
            <Text
              style={[
                styles.markTimestamp,
                { color: isStaleMark ? colors.warning : colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {markTimestamp}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    paddingVertical: Space.md,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  itemValue: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  itemLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  // Phase 6: mark-used + window
  metaItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: Space.xs,
  },
  windowLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  markUsedLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
    textAlign: 'center',
  },
  markTimestamp: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
});
