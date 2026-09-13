/**
 * CoOwnFeeSchedule — the fee stack for a Co-Own asset (§01 §4 Fees).
 *
 * Flat on canvas, no card chrome. One row per fee: label left, rate or
 * fixed amount right, description below in muted text. Hairline
 * separators between rows. Tabular numerals for all numbers.
 *
 * Anti-AI: one stroke grammar (hairlines), one type scale, neutral
 * palette. When no fees are disclosed the surface says so plainly
 * rather than hiding the section.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface CoOwnFeeScheduleEntry {
  /** e.g. "Management fee". */
  label: string;
  /** e.g. 1.5 for 1.5%. */
  ratePct?: number | null;
  /** Fixed amount in GBP. */
  fixedGbp?: number | null;
  /** e.g. "Paid in shares annually". */
  description?: string;
  isRecurring?: boolean;
}

export interface CoOwnFeeScheduleProps {
  fees: CoOwnFeeScheduleEntry[];
  /** Show "No fees disclosed" when empty. */
  isEmpty?: boolean;
}

function formatGbp(value: number): string {
  return `£${value.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRate(value: number): string {
  // Avoid trailing zero noise: 1.5 -> "1.5%", 2 -> "2%", 0.75 -> "0.75%".
  const rounded = Number(value.toFixed(2));
  return `${rounded}%`;
}

function buildAmount(entry: CoOwnFeeScheduleEntry): string | null {
  if (entry.ratePct != null) return formatRate(entry.ratePct);
  if (entry.fixedGbp != null) return formatGbp(entry.fixedGbp);
  return null;
}

export function CoOwnFeeSchedule({ fees, isEmpty }: CoOwnFeeScheduleProps) {
  const { colors } = useAppTheme();
  const showEmpty = isEmpty || fees.length === 0;

  if (showEmpty) {
    return (
      <View style={styles.root}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          No fees disclosed
        </Text>
        <Text style={[styles.footerText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
          Fees apply whether the investment gains or loses value.
        </Text>
      </View>
    );
  }

  const summary = fees
    .map((f) => {
      const amt = buildAmount(f);
      return `${f.label}${amt ? ` ${amt}` : ''}${f.isRecurring ? ', recurring' : ''}`;
    })
    .join('; ');

  return (
    <View style={styles.root} accessibilityLabel={`Fee schedule: ${summary}`} accessibilityRole="text">
      {fees.map((entry, i) => {
        const amount = buildAmount(entry);
        const isLast = i === fees.length - 1;
        return (
          <View
            key={`${entry.label}-${i}`}
            style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          >
            <View style={styles.labelCol}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={1}>
                  {entry.label}
                </Text>
                {entry.isRecurring && (
                  <View style={[styles.recurringBadge, { backgroundColor: colors.surfaceAlt }]}>
                    <Text style={[styles.recurringText, { color: colors.textMuted }]} numberOfLines={1}>
                      Recurring
                    </Text>
                  </View>
                )}
              </View>
              {entry.description ? (
                <Text style={[styles.description, { color: colors.textMuted }]} numberOfLines={2}>
                  {entry.description}
                </Text>
              ) : null}
            </View>
            {amount != null && (
              <Text style={[styles.amount, { color: colors.textPrimary }]} numberOfLines={1}>
                {amount}
              </Text>
            )}
          </View>
        );
      })}
      {/* Fee honesty footer — fees are owed regardless of outcome. */}
      <Text style={[styles.footerText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
        Fees apply whether the investment gains or loses value.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: Space.sm,
  },
  emptyText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    paddingVertical: Space.sm,
  },
  footerText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 4,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    paddingTop: Space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 44,
  },
  labelCol: {
    flex: 1,
    gap: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexWrap: 'wrap',
  },
  label: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  recurringBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  recurringText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  description: {
    fontSize: TypographyV2.caption.size,
    lineHeight: TypographyV2.caption.lineHeight,
    fontFamily: TypographyV2.caption.fontFamily,
    letterSpacing: TypographyV2.caption.letterSpacing,
  },
  amount: {
    fontSize: TypographyV2.numericMeta.size,
    lineHeight: TypographyV2.numericMeta.lineHeight,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    letterSpacing: TypographyV2.numericMeta.letterSpacing,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
});

export default CoOwnFeeSchedule;
