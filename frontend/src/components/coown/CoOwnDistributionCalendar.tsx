/**
 * CoOwnDistributionCalendar — upcoming + recent distribution dates in a
 * compact vertical timeline (§01 §4 Distributions).
 *
 * Flat on canvas, no card chrome. Date on the left, amount on the right,
 * status badge inline. Scheduled entries project the user's personal
 * payout from `userUnits × perUnitGbp`; settled entries show the actual
 * per-unit amount that was paid.
 *
 * Anti-AI: one stroke grammar (hairline separators), one type scale,
 * tabular numerals for all money, neutral palette with status colour
 * used only where it carries information.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface CoOwnDistributionCalendarEntry {
  id: string;
  /** ISO date — the primary timeline date (payable or announcement). */
  date: string;
  perUnitGbp: number;
  totalPoolGbp: number;
  status: 'scheduled' | 'pending' | 'settled' | 'reversed';
  /** ISO record date — ownership snapshot for eligibility. Rendered only
   * when the backend supplies it (CoOwnDistribution.recordDate). */
  recordDate?: string | null;
  /** ISO ex-date — first date new buyers are no longer entitled to this
   * distribution. Rendered only when supplied (CoOwnDistribution.exDate). */
  exDate?: string | null;
  /** ISO payable date — actual or projected payment date. Rendered only
   * when supplied (CoOwnDistribution.projectedPayableDate / settledAt). */
  payableDate?: string | null;
}

export interface CoOwnDistributionCalendarProps {
  entries: CoOwnDistributionCalendarEntry[];
  /** User's unit count for projecting personal payout. */
  userUnits?: number;
  /** Max entries to show (default 6). */
  maxEntries?: number;
}

type StatusKey = CoOwnDistributionCalendarEntry['status'];

const STATUS_CONFIG: Record<StatusKey, { label: string; tone: 'muted' | 'warning' | 'success' | 'danger' }> = {
  scheduled: { label: 'Scheduled', tone: 'muted' },
  pending: { label: 'Pending', tone: 'warning' },
  settled: { label: 'Settled', tone: 'success' },
  reversed: { label: 'Reversed', tone: 'danger' },
};

function formatGbp(value: number): string {
  return `£${value.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusColor(colors: ReturnType<typeof useAppTheme>['colors'], tone: 'muted' | 'warning' | 'success' | 'danger'): string {
  switch (tone) {
    case 'warning':
      return colors.warning;
    case 'success':
      return colors.success;
    case 'danger':
      return colors.danger;
    default:
      return colors.textMuted;
  }
}

function statusBg(colors: ReturnType<typeof useAppTheme>['colors'], tone: 'muted' | 'warning' | 'success' | 'danger'): string {
  switch (tone) {
    case 'warning':
      return colors.warningSubtle;
    case 'success':
      return colors.successSubtle;
    case 'danger':
      return colors.dangerSubtle;
    default:
      return colors.surfaceAlt;
  }
}

export function CoOwnDistributionCalendar({
  entries,
  userUnits,
  maxEntries = 6,
}: CoOwnDistributionCalendarProps) {
  const { colors } = useAppTheme();
  const visible = entries.slice(0, maxEntries);

  if (visible.length === 0) {
    return (
      <View style={styles.root}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          No distributions scheduled.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {visible.map((entry, i) => {
        const cfg = STATUS_CONFIG[entry.status];
        const sColor = statusColor(colors, cfg.tone);
        const sBg = statusBg(colors, cfg.tone);
        const isLast = i === visible.length - 1;

        // Personal payout projection — only meaningful when the user holds units.
        const showProjection = entry.status === 'scheduled' && userUnits != null && userUnits > 0;
        const projectedGbp = showProjection ? entry.perUnitGbp * userUnits : null;

        // Settled entries disclose the actual per-unit amount paid.
        const showActualPerUnit = entry.status === 'settled';

        // Record / ex / payable disclosures — each rendered only when the
        // payload carries it; never fabricated.
        const dateDetailParts = [
          entry.recordDate ? `Record date ${formatDate(entry.recordDate)}` : null,
          entry.exDate ? `Ex date ${formatDate(entry.exDate)}` : null,
          entry.payableDate ? `Payable ${formatDate(entry.payableDate)}` : null,
        ].filter((part): part is string => part != null);

        const a11yParts = [
          formatDate(entry.date),
          `${formatGbp(entry.perUnitGbp)} per unit`,
          `pool ${formatGbp(entry.totalPoolGbp)}`,
          cfg.label,
          projectedGbp != null ? `you ${formatGbp(projectedGbp)}` : '',
          ...dateDetailParts,
        ].filter(Boolean);

        return (
          <View
            key={entry.id}
            style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
            accessibilityLabel={a11yParts.join(', ')}
            accessibilityRole="text"
          >
            <View style={styles.dateCol}>
              <Text style={[styles.dateText, { color: colors.textPrimary }]} numberOfLines={1}>
                {formatDate(entry.date)}
              </Text>
              <View style={[styles.badge, { backgroundColor: sBg }]}>
                <Text style={[styles.badgeText, { color: sColor }]} numberOfLines={1}>
                  {cfg.label}
                </Text>
              </View>
              {dateDetailParts.map((part) => (
                <Text
                  key={part}
                  style={[styles.dateMeta, { color: colors.textMuted }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.3}
                >
                  {part}
                </Text>
              ))}
            </View>

            <View style={styles.amountCol}>
              <Text style={[styles.perUnit, { color: colors.textPrimary }]} numberOfLines={1}>
                {formatGbp(entry.perUnitGbp)}
                <Text style={[styles.perUnitSuffix, { color: colors.textMuted }]}> /unit</Text>
              </Text>
              {showProjection && projectedGbp != null && (
                <Text style={[styles.projection, { color: colors.coownUp }]} numberOfLines={1}>
                  You: ~{formatGbp(projectedGbp)}
                </Text>
              )}
              {showActualPerUnit && (
                <Text style={[styles.projection, { color: colors.textMuted }]} numberOfLines={1}>
                  Pool {formatGbp(entry.totalPoolGbp)}
                </Text>
              )}
            </View>
          </View>
        );
      })}
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 44,
  },
  dateCol: {
    flex: 1,
    gap: 4,
  },
  dateText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  badgeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  dateMeta: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  amountCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  perUnit: {
    fontSize: TypographyV2.numericMeta.size,
    lineHeight: TypographyV2.numericMeta.lineHeight,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    letterSpacing: TypographyV2.numericMeta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  perUnitSuffix: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  projection: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
});

export default CoOwnDistributionCalendar;
