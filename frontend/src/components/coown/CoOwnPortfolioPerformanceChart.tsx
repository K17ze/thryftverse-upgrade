import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily, Stroke, Numeric } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { AnimatedPressable } from '../AnimatedPressable';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { haptics } from '../../utils/haptics';
import { formatCoOwnIze } from '../../utils/currency';
import type { CoOwnPositionVM } from '../../services/coOwnPortfolio';

// ── Types ────────────────────────────────────────────────────────────────────

type Period = '1M' | '3M' | 'ALL';

interface PortfolioPoint {
  timestamp: number;
  /** Cumulative cost basis up to this point, or current mark for the final point. */
  value: number;
  /** Whether this is the current-mark endpoint (vs a cost-basis step). */
  isCurrentMark: boolean;
}

export interface CoOwnPortfolioPerformanceChartProps {
  positions: CoOwnPositionVM[];
  totalValueGbp: number;
  totalCostBasisGbp: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PERIOD_MS: Record<Period, number> = {
  '1M': 30 * 24 * 60 * 60 * 1000,
  '3M': 90 * 24 * 60 * 60 * 1000,
  ALL: Infinity,
};

const PERIOD_LABELS: Period[] = ['1M', '3M', 'ALL'];

/**
 * Build a portfolio value series from position creation dates.
 *
 * Each position contributes its cost basis (avgEntryPrice * unitsOwned) at its
 * creation timestamp. We walk forward in time, accumulating cost basis as
 * capital was deployed. The final point is the current total mark value —
 * the delta between the last cost-basis step and this point is unrealized P&L.
 *
 * This is honest data: it shows when capital entered and what the portfolio is
 * worth now. It does not fabricate intra-period marks.
 */
function buildPortfolioSeries(
  positions: CoOwnPositionVM[],
  totalValueGbp: number,
  period: Period,
): PortfolioPoint[] {
  const now = Date.now();
  const cutoff = now - PERIOD_MS[period];

  // Collect (timestamp, costBasis) pairs from positions created within range.
  const entries = positions
    .map((p) => ({
      ts: new Date(p.createdAt).getTime(),
      cost: p.avgEntryPriceGbp * p.unitsOwned,
    }))
    .filter((e) => e.ts >= cutoff && e.cost > 0)
    .sort((a, b) => a.ts - b.ts);

  if (entries.length === 0 && totalValueGbp <= 0) return [];

  // Build cumulative cost-basis steps.
  const points: PortfolioPoint[] = [];
  let cumulative = 0;

  // If the earliest position is after the cutoff, start the series at 0
  // at the cutoff timestamp so the chart shows growth from a baseline.
  if (entries.length > 0 && entries[0].ts > cutoff + 24 * 60 * 60 * 1000) {
    points.push({ timestamp: cutoff, value: 0, isCurrentMark: false });
  }

  for (const entry of entries) {
    cumulative += entry.cost;
    points.push({ timestamp: entry.ts, value: cumulative, isCurrentMark: false });
  }

  // Append current mark as the final point.
  points.push({ timestamp: now, value: totalValueGbp, isCurrentMark: true });

  return points;
}

/** Build an SVG path string for the portfolio sparkline. */
function buildLinePath(
  points: PortfolioPoint[],
  width: number,
  height: number,
  padding: number,
): string {
  if (points.length < 2) return '';

  const timestamps = points.map((p) => p.timestamp);
  const values = points.map((p) => p.value);
  const minT = Math.min(...timestamps);
  const maxT = Math.max(...timestamps);
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 1);

  const tRange = maxT - minT || 1;
  const vRange = maxV - minV || 1;

  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const x = (t: number) => padding + ((t - minT) / tRange) * chartW;
  const y = (v: number) => padding + chartH - ((v - minV) / vRange) * chartH;

  return points
    .map((point, i) => {
      const px = x(point.timestamp);
      const py = y(point.value);
      return i === 0 ? `M ${px} ${py}` : `L ${px} ${py}`;
    })
    .join(' ');
}

/** Build a filled area path under the sparkline. */
function buildAreaPath(
  points: PortfolioPoint[],
  width: number,
  height: number,
  padding: number,
): string {
  const linePath = buildLinePath(points, width, height, padding);
  if (!linePath) return '';

  const timestamps = points.map((p) => p.timestamp);
  const values = points.map((p) => p.value);
  const minT = Math.min(...timestamps);
  const maxT = Math.max(...timestamps);
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 1);

  const tRange = maxT - minT || 1;
  const vRange = maxV - minV || 1;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const lastX = padding + ((points[points.length - 1].timestamp - minT) / tRange) * chartW;
  const baselineY = padding + chartH - ((0 - minV) / vRange) * chartH;
  const firstX = padding + ((points[0].timestamp - minT) / tRange) * chartW;

  return `${linePath} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
}

// ── Component ────────────────────────────────────────────────────────────────

const CHART_HEIGHT = 100;
const CHART_PADDING = 6;

export function CoOwnPortfolioPerformanceChart({
  positions,
  totalValueGbp,
  totalCostBasisGbp,
}: CoOwnPortfolioPerformanceChartProps) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [period, setPeriod] = useState<Period>('3M');

  const chartWidth = Math.min(Math.max(screenWidth - Space.md * 2, 280), 440);

  const series = useMemo(
    () => buildPortfolioSeries(positions, totalValueGbp, period),
    [positions, totalValueGbp, period],
  );

  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p);
    haptics.tap();
  }, []);

  // Determine if the portfolio is up or down from cost basis.
  const isUp = totalValueGbp >= totalCostBasisGbp;
  const lineColor = isUp ? colors.coownUp : colors.coownDown;
  const gradientId = `portfolioGradient-${isUp ? 'up' : 'down'}`;

  const linePath = useMemo(
    () => buildLinePath(series, chartWidth, CHART_HEIGHT, CHART_PADDING),
    [series, chartWidth],
  );
  const areaPath = useMemo(
    () => buildAreaPath(series, chartWidth, CHART_HEIGHT, CHART_PADDING),
    [series, chartWidth],
  );

  const hasHistory = series.length >= 2;
  const totalReturnGbp = totalValueGbp - totalCostBasisGbp;
  const totalReturnPct = totalCostBasisGbp > 0
    ? (totalReturnGbp / totalCostBasisGbp) * 100
    : 0;

  // Accessibility summary
  const a11ySummary = useMemo(() => {
    const direction = isUp ? 'up' : 'down';
    const pctStr = totalCostBasisGbp > 0
      ? `, ${direction} ${Math.abs(totalReturnPct).toFixed(1)}%`
      : '';
    return `Portfolio performance over ${period}. Current value ${formatCoOwnIze(totalValueGbp)}, cost basis ${formatCoOwnIze(totalCostBasisGbp)}${pctStr}.`;
  }, [isUp, totalReturnPct, totalValueGbp, totalCostBasisGbp, period]);

  // ── Not enough data to chart ──
  if (!hasHistory) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Accessibility summary */}
      <Text
        style={styles.a11ySummary}
        accessibilityLabel={a11ySummary}
        accessibilityRole="text"
      >
        {a11ySummary}
      </Text>

      {/* Header row: title + period selector */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Performance</Text>
        <View style={styles.periodRow}>
          {PERIOD_LABELS.map((p) => {
            const isActive = period === p;
            return (
              <AnimatedPressable
                key={p}
                style={[
                  styles.periodChip,
                  { borderColor: colors.border },
                  isActive && { backgroundColor: colors.brandSubtle, borderColor: colors.brand },
                ]}
                onPress={() => handlePeriodChange(p)}
                activeOpacity={0.8}
                scaleValue={0.97}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Performance chart period: ${p}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.periodChipText,
                    { color: colors.textSecondary },
                    isActive && { color: colors.brand },
                  ]}
                >
                  {p}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      </View>

      {/* Chart area */}
      <View style={styles.chartWrap}>
        <Svg width={chartWidth} height={CHART_HEIGHT} style={styles.svg}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
              <Stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {areaPath ? <Path d={areaPath} fill={`url(#${gradientId})`} /> : null}
          {linePath ? (
            <Path
              d={linePath}
              stroke={lineColor}
              strokeWidth={1.5}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {/* Current value endpoint marker */}
          {series.length > 0 && (() => {
            const timestamps = series.map((p) => p.timestamp);
            const values = series.map((p) => p.value);
            const minT = Math.min(...timestamps);
            const maxT = Math.max(...timestamps);
            const minV = Math.min(...values, 0);
            const maxV = Math.max(...values, 1);
            const tRange = maxT - minT || 1;
            const vRange = maxV - minV || 1;
            const chartW = chartWidth - CHART_PADDING * 2;
            const chartH = CHART_HEIGHT - CHART_PADDING * 2;
            const last = series[series.length - 1];
            const cx = CHART_PADDING + ((last.timestamp - minT) / tRange) * chartW;
            const cy = CHART_PADDING + chartH - ((last.value - minV) / vRange) * chartH;
            return <Circle cx={cx} cy={cy} r={3} fill={lineColor} />;
          })()}
        </Svg>
      </View>

      {/* Footer: cost basis vs current value + return */}
      <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: colors.textMuted }]} numberOfLines={1}>
            Cost basis
          </Text>
          <Text style={[styles.footerValue, { color: colors.textPrimary }]}>
            {formatCoOwnIze(totalCostBasisGbp)}
          </Text>
        </View>
        <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: colors.textMuted }]} numberOfLines={1}>
            Current
          </Text>
          <Text style={[styles.footerValue, { color: colors.textPrimary }]}>
            {formatCoOwnIze(totalValueGbp)}
          </Text>
        </View>
        <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: colors.textMuted }]} numberOfLines={1}>
            Return
          </Text>
          <Text style={[
            styles.footerValue,
            { color: isUp ? colors.coownUp : colors.coownDown },
          ]}>
            {isUp ? '+' : ''}{totalReturnPct.toFixed(1)}%
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginBottom: Space.lg,
  },
  a11ySummary: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.sm,
  },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  periodRow: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  periodChip: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  periodChipText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  chartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs,
  },
  svg: {
    backgroundColor: 'transparent',
  },
  footerRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.sm,
    marginTop: Space.xs,
  },
  footerItem: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  footerDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: Space.xs / 2,
  },
  footerLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  footerValue: {
    fontSize: Numeric.mono.size,
    lineHeight: Numeric.mono.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
});
