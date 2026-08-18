/**
 * FlagshipMetricLine — open-space numeric hierarchy primitive.
 *
 * A flat label/value pair with tabular numerals. No card, no border, no
 * background. Uses whitespace and typography for structure.
 *
 * Prefer this over 2×2 boxed metric cells (MetricGrid) for seller hub,
 * analytics summaries, and any context where metrics should read as a
 * clean financial ledger rather than a dashboard of cards.
 *
 * Per AGENTS.md §4:
 *   - Flat canvas, spacing and hairlines are the default utility structure.
 *   - Surface budget: at most one dominant non-media panel above the fold.
 *   - Hierarchy from typography and alignment, not from boxes.
 *
 * Example:
 *   Available balance                    £182.40
 *   Orders to ship                             2
 *   Active listings                           14
 */

import React from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, FontFamily, Numeric } from '../../theme/designTokens';

export interface FlagshipMetricLineProps {
  /** Label — left-aligned, regular weight. */
  label: string;
  /** Value — right-aligned, tabular numerals, semibold. */
  value: string;
  /** Optional secondary label below the main label. */
  subLabel?: string;
  /** Emphasis mode — larger value for summary totals (uses priceList type). */
  emphasis?: boolean;
  /** Muted value — renders value in textMuted instead of textPrimary. */
  muted?: boolean;
  /** Danger value — renders value in danger color (e.g. negative balance). */
  danger?: boolean;
  /** Success value — renders value in success color (e.g. positive P&L). */
  success?: boolean;
  /** Show hairline separator above this row. Defaults to false. */
  separated?: boolean;
  /** Style override for the label. */
  labelStyle?: TextStyle;
  /** Style override for the value. */
  valueStyle?: TextStyle;
}

export function FlagshipMetricLine({
  label,
  value,
  subLabel,
  emphasis = false,
  muted = false,
  danger = false,
  success = false,
  separated = false,
  labelStyle,
  valueStyle,
}: FlagshipMetricLineProps) {
  const { colors } = useAppTheme();

  const valueColor = danger
    ? colors.danger
    : success
      ? colors.success
      : muted
        ? colors.textMuted
        : colors.textPrimary;

  return (
    <View style={styles.row}>
      {separated ? (
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
      ) : null}
      <View style={styles.contentRow}>
        <View style={styles.labelWrap}>
          <Text
            style={[styles.label, { color: colors.textSecondary }, labelStyle]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {subLabel ? (
            <Text
              style={[styles.subLabel, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {subLabel}
            </Text>
          ) : null}
        </View>
        <Text
          style={[
            emphasis ? styles.valueEmphasis : styles.value,
            { color: valueColor },
            valueStyle,
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginBottom: Space.sm,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
  },
  labelWrap: {
    flex: 1,
    minWidth: 0,
    gap: Space.xxs,
  },
  label: {
    fontSize: Type.body.size,
    fontFamily: FontFamily.regular,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  subLabel: {
    fontSize: Type.caption.size,
    fontFamily: FontFamily.regular,
    lineHeight: Type.caption.lineHeight,
  },
  value: {
    ...Numeric.numericMeta,
    fontFamily: FontFamily.semibold,
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    textAlign: 'right',
  },
  valueEmphasis: {
    ...Numeric.priceList,
    fontFamily: FontFamily.bold,
    textAlign: 'right',
  },
});
