import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';

/**
 * Fundamentals / valuation section — stacked layout showing
 * Reference vs NAV, NAV per unit, next report date, and next
 * distribution. Rendered inside the expanded valuation disclosure.
 * Extracted verbatim from AssetDetailScreen; behaviour unchanged.
 */
export interface FundamentalsSectionProps {
  referenceVsNavPct: number | null;
  navPerUnitLabel: string;
  appraisalValuedAt: string | null | undefined;
}

export function FundamentalsSection({
  referenceVsNavPct,
  navPerUnitLabel,
  appraisalValuedAt,
}: FundamentalsSectionProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.fundamentalsStacked, { borderTopColor: colors.border }]}>
      <View style={styles.fundamentalsRow}>
        <Text style={[styles.fundamentalsLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>Reference vs NAV</Text>
        <Text style={[styles.fundamentalsValue, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>
          {referenceVsNavPct != null
            ? `${referenceVsNavPct >= 0 ? '+' : ''}${referenceVsNavPct.toFixed(1)}%`
            : 'Not available'}
        </Text>
      </View>
      <View style={styles.fundamentalsRow}>
        <Text style={[styles.fundamentalsLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>NAV / unit</Text>
        <Text style={[styles.fundamentalsValue, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>
          {navPerUnitLabel}
        </Text>
      </View>
      <View style={styles.fundamentalsRow}>
        <Text style={[styles.fundamentalsLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>Next report</Text>
        <Text style={[styles.fundamentalsValue, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>
          {appraisalValuedAt
            ? new Date(appraisalValuedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Not scheduled'}
        </Text>
      </View>
      <View style={styles.fundamentalsRow}>
        <Text style={[styles.fundamentalsLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>Next distribution</Text>
        <Text style={[styles.fundamentalsValue, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>Not scheduled</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fundamentalsStacked: {
    marginTop: Space.lg,
    paddingTop: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Space.md,
  },
  fundamentalsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  fundamentalsLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    flexShrink: 0,
  },
  fundamentalsValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    textAlign: 'right',
    flexShrink: 1,
  },
});
