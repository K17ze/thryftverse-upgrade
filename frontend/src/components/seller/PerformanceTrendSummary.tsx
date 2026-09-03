import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { SellerPerformanceTrend } from '../../domain/listingHealth';

type TrendDirection = 'up' | 'down' | 'flat';

function trendDirection(value: number | null | undefined): TrendDirection | null {
  if (value == null) return null;
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

/**
 * Trend arrow — semantic colour by direction.
 * Up = success (more revenue/views is good), down = danger, flat = muted.
 * The arrow is a small metadata glyph (14pt), not a decorative icon.
 */
function TrendArrow({
  direction,
  color,
}: {
  direction: TrendDirection;
  color: string;
}) {
  const name =
    direction === 'up'
      ? 'arrow-up'
      : direction === 'down'
        ? 'arrow-down'
        : 'remove';
  return <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={12} color={color} />;
}

function trendColor(
  direction: TrendDirection,
  colors: ThemeColors,
): string {
  switch (direction) {
    case 'up': return colors.success;
    case 'down': return colors.danger;
    case 'flat': return colors.textMuted;
  }
}

function formatTrend(value: number | null | undefined): string | null {
  if (value == null) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value)}%`;
}

interface HeroMetric {
  label: string;
  value: string;
  trendDirection: TrendDirection | null;
  trendText: string | null;
}

interface OpMetric {
  label: string;
  value: string;
}

export interface PerformanceTrendSummaryProps {
  trend: SellerPerformanceTrend;
  /** Formatted price strings — caller controls currency formatting */
  formatPrice: (value: number) => string;
  /** Optional period label shown as a quiet eyebrow (e.g. "Last 30 days") */
  periodLabel?: string;
}

/**
 * Seller Performance Trend Summary — evidence-backed performance over time.
 *
 * Composition (flat, no card-on-card):
 *   period eyebrow (optional) →
 *   hero metrics row (items sold, revenue, avg sale price) with trend arrows →
 *   operational row (response time, ship time) as flat label+value pairs
 *
 * Per AGENTS.md §4 anti-AI design:
 * - No vanity metrics — every number comes from SellerPerformanceTrend
 *   which is populated from backend data, never fabricated
 * - Trend arrows are metadata glyphs (12pt), not decorative illustrations
 * - Flat rows with hairline separators, no card chrome
 * - One type scale: hero values (priceList), labels (meta)
 * - Missing data shows an em-dash, never a fabricated zero
 */
export function PerformanceTrendSummary({
  trend,
  formatPrice,
  periodLabel,
}: PerformanceTrendSummaryProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const revenueDir = trendDirection(trend.revenueTrend);
  const viewsDir = trendDirection(trend.viewsTrend);
  const inquiryDir = trendDirection(trend.inquiryTrend);
  const conversionDir = trendDirection(trend.conversionTrend);

  const heroMetrics: HeroMetric[] = [
    {
      label: 'Items sold',
      value: String(trend.itemsSold),
      trendDirection: null,
      trendText: null,
    },
    {
      label: 'Revenue',
      value: formatPrice(trend.totalRevenue),
      trendDirection: revenueDir,
      trendText: formatTrend(trend.revenueTrend),
    },
    {
      label: 'Avg sale',
      value: trend.itemsSold > 0 ? formatPrice(trend.averageSalePrice) : '—',
      trendDirection: null,
      trendText: null,
    },
  ];

  const opMetrics: OpMetric[] = [];

  if (trend.averageResponseTimeHours > 0) {
    const hrs = trend.averageResponseTimeHours;
    opMetrics.push({
      label: 'Response',
      value: hrs < 1 ? '<1h' : hrs < 24 ? `${Math.round(hrs)}h` : `${(hrs / 24).toFixed(1)}d`,
    });
  }

  if (trend.averageShipTimeDays > 0) {
    opMetrics.push({
      label: 'Ship time',
      value: `${trend.averageShipTimeDays.toFixed(1)}d`,
    });
  }

  if (trend.medianDaysToSell > 0) {
    opMetrics.push({
      label: 'Days to sell',
      value: `${Math.round(trend.medianDaysToSell)}d`,
    });
  }

  // Engagement trend row — only shown when at least one trend exists
  const engagementTrends: { label: string; dir: TrendDirection | null; text: string | null }[] = [
    { label: 'Views', dir: viewsDir, text: formatTrend(trend.viewsTrend) },
    { label: 'Inquiries', dir: inquiryDir, text: formatTrend(trend.inquiryTrend) },
    { label: 'Conversion', dir: conversionDir, text: formatTrend(trend.conversionTrend) },
  ].filter((t) => t.text != null);

  const a11yParts: string[] = [];
  if (periodLabel) a11yParts.push(periodLabel);
  a11yParts.push(`${trend.itemsSold} items sold`);
  a11yParts.push(`Revenue ${formatPrice(trend.totalRevenue)}`);
  if (revenueDir && formatTrend(trend.revenueTrend)) {
    a11yParts.push(`Revenue ${formatTrend(trend.revenueTrend)}`);
  }
  for (const op of opMetrics) a11yParts.push(`${op.label} ${op.value}`);

  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      accessibilityLabel={a11yParts.join(', ')}
    >
      {periodLabel ? (
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
          {periodLabel}
        </Text>
      ) : null}

      {/* Hero metrics — flat row, hairline-divided cells */}
      <View style={[styles.heroRow, { borderColor: colors.borderSubtle }]}>
        {heroMetrics.map((metric, i) => (
          <React.Fragment key={metric.label}>
            {i > 0 ? (
              <View style={[styles.heroDivider, { backgroundColor: colors.borderSubtle }]} />
            ) : null}
            <View style={styles.heroCell}>
              <Text style={[styles.heroValue, { color: colors.textPrimary }]}>
                {metric.value}
              </Text>
              <View style={styles.heroLabelRow}>
                <Text style={[styles.heroLabel, { color: colors.textMuted }]}>
                  {metric.label}
                </Text>
                {metric.trendDirection && metric.trendText ? (
                  <View style={styles.trendRow}>
                    <TrendArrow
                      direction={metric.trendDirection}
                      color={trendColor(metric.trendDirection, colors)}
                    />
                    <Text
                      style={[
                        styles.trendText,
                        { color: trendColor(metric.trendDirection, colors) },
                      ]}
                    >
                      {metric.trendText}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Engagement trends — flat row, only when data exists */}
      {engagementTrends.length > 0 ? (
        <View style={[styles.engagementRow, { borderColor: colors.borderSubtle }]}>
          {engagementTrends.map((t, i) => (
            <React.Fragment key={t.label}>
              {i > 0 ? (
                <View style={[styles.heroDivider, { backgroundColor: colors.borderSubtle }]} />
              ) : null}
              <View style={styles.engagementCell}>
                <Text style={[styles.engagementLabel, { color: colors.textMuted }]}>
                  {t.label}
                </Text>
                <View style={styles.trendRow}>
                  {t.dir ? (
                    <TrendArrow direction={t.dir} color={trendColor(t.dir, colors)} />
                  ) : null}
                  <Text
                    style={[
                      styles.trendText,
                      { color: t.dir ? trendColor(t.dir, colors) : colors.textMuted },
                    ]}
                  >
                    {t.text}
                  </Text>
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>
      ) : null}

      {/* Operational metrics — flat label+value rows */}
      {opMetrics.length > 0 ? (
        <View style={styles.opList}>
          {opMetrics.map((op, i) => (
            <View
              key={op.label}
              style={[
                styles.opRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
              ]}
            >
              <Text style={[styles.opLabel, { color: colors.textSecondary }]}>
                {op.label}
              </Text>
              <Text style={[styles.opValue, { color: colors.textPrimary }]}>
                {op.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    eyebrow: {
      fontSize: TypographyV2.label.size,
      lineHeight: TypographyV2.label.lineHeight,
      fontFamily: TypographyV2.label.fontFamily,
      letterSpacing: TypographyV2.label.letterSpacing,
      textTransform: 'uppercase',
      marginBottom: Space.sm,
    },
    // ── Hero row ──
    heroRow: {
      flexDirection: 'row',
      paddingTop: Space.xs,
      paddingBottom: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    heroDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
    },
    heroCell: {
      flex: 1,
      gap: 2,
      paddingHorizontal: Space.xs,
    },
    heroValue: {
      fontSize: TypographyV2.priceList.size,
      lineHeight: TypographyV2.priceList.lineHeight,
      fontFamily: TypographyV2.priceList.fontFamily,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    },
    heroLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    heroLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
    },
    // ── Engagement row ──
    engagementRow: {
      flexDirection: 'row',
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    engagementCell: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: Space.xs,
    },
    engagementLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
    },
    // ── Trend ──
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    trendText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    },
    // ── Operational rows ──
    opList: {
      marginTop: Space.xs,
    },
    opRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
    },
    opLabel: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
    },
    opValue: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    },
  });
}
