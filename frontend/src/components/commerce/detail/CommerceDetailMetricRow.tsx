import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Typography } from '../../../theme/designTokens';
import { TypographyV2, typographyV2Style } from '../../../theme/typography.v2';

/**
 * Compact metric row — a label/value pair laid out for tabular numerals.
 *
 * Used for secondary facts (NAV/unit, next distribution, holder count,
 * bid count, shipping speed). Not for the dominant transaction value —
 * that lives in the transaction surface.
 *
 * Per spec 02: missing values use muted copy, not a display-size em
 * dash. Pass `value="Not available"` (or similar) for unavailable
 * facts; pass `muted` to render the value in the muted text colour.
 */
export interface CommerceDetailMetricRowProps {
  label: string;
  value?: string;
  /** When true, the value renders in the muted text colour (used for
   * unavailable facts). */
  muted?: boolean;
  /** Optional trailing glyph (e.g. info icon). */
  trailing?: React.ReactNode;
  /** Optional sub-label under the value (e.g. "per unit"). */
  subLabel?: string;
  /** When true, the row reads as a summary total: the value uses
   * `Type.priceList` and the label is emphasized. Per Design.md
   * checkout summary spec: "Type.priceList for line items,
   * Type.priceHero for total, right-aligned, tabular alignment for
   * numbers." Used for the estimated-total row in cost breakdowns. */
  emphasis?: boolean;
  /** When true alongside `emphasis`, the value uses `Type.priceLarge`
   * (28px / TypographyV2.priceHero) instead of `Type.priceList` (20px).
   * Per Design.md: checkout totals are the dominant number and must
   * use the larger price scale. */
  large?: boolean;
  /** When true, a hairline separator is drawn above the row. Used to
   * detach a summary total from the line items above it. */
  separated?: boolean;
}

export function CommerceDetailMetricRow({
  label,
  value,
  muted = false,
  trailing,
  subLabel,
  emphasis = false,
  large = false,
  separated = false }: CommerceDetailMetricRowProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.row,
        separated && [styles.rowSeparated, { borderTopColor: colors.borderSubtle }],
      ]}
    >
      <Text
        style={[
          styles.label,
          emphasis && styles.labelEmphasis,
          { color: emphasis ? colors.textPrimary : colors.textSecondary },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <View style={styles.valueCluster}>
        {value ? (
          <Text
            style={[
              styles.value,
              emphasis && (large ? styles.valueLarge : styles.valueEmphasis),
              { color: muted ? colors.textMuted : colors.textPrimary },
            ]}
            numberOfLines={2}
          >
            {value}
          </Text>
        ) : null}
        {subLabel ? (
          <Text style={[styles.subLabel, { color: colors.textMuted }]} numberOfLines={1}>
            {subLabel}
          </Text>
        ) : null}
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: 52 },
  // Hairline detaching a summary total from the line items above it.
  // Per Design.md stroke grammar: separators are hairline.
  rowSeparated: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.xs,
    paddingTop: Space.sm + Space.xs },
  label: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    flex: 1,
    flexShrink: 1 },
  labelEmphasis: {
    fontFamily: Typography.family.semibold },
  valueCluster: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    maxWidth: '56%',
    flexShrink: 1,
    justifyContent: 'flex-end' },
  // Canonical numeric role (numericMeta): tabular figures, right-aligned
  // so comparable values keep a stable column.
  value: {
    ...typographyV2Style('numericMeta'),
    flexShrink: 1,
    textAlign: 'right' },
  // Per Design.md checkout summary spec: the total is the dominant
  // number in a cost breakdown.
  valueEmphasis: {
    ...typographyV2Style('priceList') },
  // Per Design.md: checkout totals use the hero price scale.
  valueLarge: {
    ...typographyV2Style('priceHero') },
  subLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily } });
