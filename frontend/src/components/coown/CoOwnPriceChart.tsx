import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { listCoOwnExecutions, MarketCoOwnExecution } from '../../services/marketApi';
import { haptics } from '../../utils/haptics';
import { formatCoOwnIze } from '../../utils/currency';

// ── Types ────────────────────────────────────────────────────────────────────

type Period = '1D' | '1W' | '1M' | 'ALL';
type ChartMode = 'line' | 'candle';

export interface CoOwnPriceChartProps {
  assetId: string;
  unitPriceGbp: number;
  marketMovePct24h: number;
  volume24hGbp: number;
  // Phase 2: last-age + 24h change timestamp
  lastAgeSeconds?: number | null;
  change24hTimestamp?: string;
  // Phase 2: candle chart delegate
  candleChart?: React.ReactNode;
}

interface PricePoint {
  timestamp: number;
  price: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PERIOD_MS: Record<Period, number> = {
  '1D': 24 * 60 * 60 * 1000,
  '1W': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  ALL: Infinity,
};

const PERIOD_LABELS: Period[] = ['1D', '1W', '1M', 'ALL'];

/** Build a price series only from authoritative settled executions. */
function buildPriceSeries(executions: MarketCoOwnExecution[], period: Period): PricePoint[] {
  const now = Date.now();
  const cutoff = now - PERIOD_MS[period];
  return executions
    .filter((execution) => new Date(execution.executedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime())
    .map((execution) => ({
      timestamp: new Date(execution.executedAt).getTime(),
      price: execution.unitPriceGbp,
    }));
}

/** Build an SVG path string for the sparkline. */
function buildSparklinePath(points: PricePoint[], width: number, height: number, padding: number): string {
  if (points.length < 2) return '';

  const timestamps = points.map((p) => p.timestamp);
  const prices = points.map((p) => p.price);
  const minT = Math.min(...timestamps);
  const maxT = Math.max(...timestamps);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);

  const tRange = maxT - minT || 1;
  const pRange = maxP - minP || 1;

  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const x = (t: number) => padding + ((t - minT) / tRange) * chartW;
  const y = (p: number) => padding + chartH - ((p - minP) / pRange) * chartH;

  return points
    .map((point, i) => {
      const px = x(point.timestamp);
      const py = y(point.price);
      return i === 0 ? `M ${px} ${py}` : `L ${px} ${py}`;
    })
    .join(' ');
}

/** Build a filled area path (for the gradient under the sparkline). */
function buildAreaPath(points: PricePoint[], width: number, height: number, padding: number): string {
  const linePath = buildSparklinePath(points, width, height, padding);
  if (!linePath) return '';

  const lastX = padding + ((points[points.length - 1].timestamp - Math.min(...points.map((p) => p.timestamp))) /
    (Math.max(...points.map((p) => p.timestamp)) - Math.min(...points.map((p) => p.timestamp)) || 1)) *
    (width - padding * 2);
  const firstX = padding;

  return `${linePath} L ${lastX} ${height - padding} L ${firstX} ${height - padding} Z`;
}

// ── Component ────────────────────────────────────────────────────────────────

/** Format last-trade age in seconds to a human-readable string. */
function formatLastAge(ageSeconds: number): string {
  if (ageSeconds < 60) return 'just now';
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const CHART_PADDING = 8;

export function CoOwnPriceChart({
  assetId,
  unitPriceGbp,
  marketMovePct24h,
  volume24hGbp,
  lastAgeSeconds,
  change24hTimestamp,
  candleChart,
}: CoOwnPriceChartProps) {
  const { colors } = useAppTheme();
  const [period, setPeriod] = useState<Period>('1W');
  const [chartMode, setChartMode] = useState<ChartMode>('line');
  const [showVolume, setShowVolume] = useState(false);
  const [executions, setExecutions] = useState<MarketCoOwnExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setHasError(false);
    listCoOwnExecutions(assetId, { limit: 200 })
      .then((fetched) => {
        if (cancelled) return;
        setExecutions(fetched.items);
      })
      .catch(() => {
        if (cancelled) return;
        setHasError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [assetId]);

  const priceSeries = useMemo(
    () => buildPriceSeries(executions, period),
    [executions, period],
  );

  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p);
    haptics.tap();
  }, []);

  const handleModeToggle = useCallback(() => {
    setChartMode((m) => m === 'line' ? 'candle' : 'line');
    haptics.tap();
  }, []);

  const handleVolumeToggle = useCallback(() => {
    setShowVolume((v) => !v);
    haptics.selection();
  }, []);

  const isPositive = marketMovePct24h >= 0;
  const changeColor = isPositive ? colors.success : colors.danger;
  const sparklineColor = isPositive ? colors.success : colors.danger;
  const gradientId = `sparkGradient-${isPositive ? 'up' : 'down'}`;

  const linePath = useMemo(
    () => buildSparklinePath(priceSeries, CHART_WIDTH, CHART_HEIGHT, CHART_PADDING),
    [priceSeries],
  );
  const areaPath = useMemo(
    () => buildAreaPath(priceSeries, CHART_WIDTH, CHART_HEIGHT, CHART_PADDING),
    [priceSeries],
  );

  const tradeCount = priceSeries.length;

  const periodHigh = priceSeries.length > 0 ? Math.max(...priceSeries.map((p) => p.price)) : unitPriceGbp;
  const periodLow = priceSeries.length > 0 ? Math.min(...priceSeries.map((p) => p.price)) : unitPriceGbp;

  // Phase 2: last-age badge
  const lastAgeLabel = lastAgeSeconds != null ? formatLastAge(lastAgeSeconds) : null;
  const isStaleLast = lastAgeSeconds != null && lastAgeSeconds > 24 * 60 * 60;

  // Phase 2: textual summary for screen readers
  const textualSummary = useMemo(() => {
    const direction = marketMovePct24h >= 0 ? 'up' : 'down';
    const agePart = lastAgeLabel ? `, last trade ${lastAgeLabel}` : '';
    const timestampPart = change24hTimestamp ? `, as of ${change24hTimestamp}` : '';
    return `1ZE last ${unitPriceGbp.toFixed(2)}, ${direction} ${Math.abs(marketMovePct24h).toFixed(1)}% over 24h${agePart}${timestampPart}, ${Math.max(0, tradeCount)} trades in range.`;
  }, [unitPriceGbp, marketMovePct24h, lastAgeLabel, change24hTimestamp, tradeCount]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Phase 2: textual summary for screen readers */}
      <Text
        style={styles.a11ySummary}
        accessibilityLabel={textualSummary}
        accessibilityRole="text"
      >
        {textualSummary}
      </Text>

      {/* Header: current price + 24h change + last-age badge */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="analytics-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Price</Text>
          {/* Phase 2: last-age badge */}
          {lastAgeLabel && (
            <View style={[styles.lastAgeBadge, { backgroundColor: (isStaleLast ? colors.warning : colors.textMuted) + '22' }]}>
              <Ionicons name="time-outline" size={10} color={isStaleLast ? colors.warning : colors.textMuted} />
              <Text style={[styles.lastAgeText, { color: isStaleLast ? colors.warning : colors.textMuted }]}>
                {lastAgeLabel}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.currentPrice, { color: colors.textPrimary }]}>
            {formatCoOwnIze(unitPriceGbp)}
          </Text>
          <View style={[styles.changeBadge, { backgroundColor: `${changeColor}15` }]}>
            <Ionicons
              name={isPositive ? 'trending-up' : 'trending-down'}
              size={11}
              color={changeColor}
            />
            <Text style={[styles.changeText, { color: changeColor }]}>
              {isPositive ? '+' : ''}{marketMovePct24h.toFixed(1)}%
            </Text>
          </View>
        </View>
      </View>

      {/* Phase 2: 24h change timestamp */}
      {change24hTimestamp && (
        <Text style={[styles.changeTimestamp, { color: colors.textMuted }]} numberOfLines={1}>
          as of {change24hTimestamp}
        </Text>
      )}

      {/* Controls row: period selector + mode toggle + volume toggle */}
      <View style={styles.controlsRow}>
        <View style={styles.periodRow}>
          {PERIOD_LABELS.map((p) => {
            const isActive = period === p;
            return (
              <AnimatedPressable
                key={p}
                style={[
                  styles.periodChip,
                  { borderColor: colors.border },
                  isActive && { backgroundColor: `${colors.brand}12`, borderColor: colors.brand },
                ]}
                onPress={() => handlePeriodChange(p)}
                activeOpacity={0.8}
                scaleValue={0.97}
                accessibilityRole="button"
                accessibilityLabel={`Price chart period: ${p}`}
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
        <View style={styles.toggleRow}>
          {/* Phase 2: volume toggle */}
          <AnimatedPressable
            style={[
              styles.toggleBtn,
              { borderColor: colors.border },
              showVolume && { backgroundColor: `${colors.brand}12`, borderColor: colors.brand },
            ]}
            onPress={handleVolumeToggle}
            activeOpacity={0.8}
            scaleValue={0.95}
            accessibilityRole="button"
            accessibilityLabel={showVolume ? 'Hide volume bars' : 'Show volume bars'}
            accessibilityState={{ selected: showVolume }}
          >
            <Ionicons name="stats-chart-outline" size={13} color={showVolume ? colors.brand : colors.textMuted} />
          </AnimatedPressable>
          {/* Phase 2: line/candle toggle */}
          {candleChart && (
            <AnimatedPressable
              style={[
                styles.toggleBtn,
                { borderColor: colors.border },
                chartMode === 'candle' && { backgroundColor: `${colors.brand}12`, borderColor: colors.brand },
              ]}
              onPress={handleModeToggle}
              activeOpacity={0.8}
              scaleValue={0.95}
              accessibilityRole="button"
              accessibilityLabel={chartMode === 'candle' ? 'Switch to line chart' : 'Switch to candle chart'}
              accessibilityState={{ selected: chartMode === 'candle' }}
            >
              <Ionicons
                name={chartMode === 'candle' ? 'analytics-outline' : 'analytics'}
                size={13}
                color={chartMode === 'candle' ? colors.brand : colors.textMuted}
              />
            </AnimatedPressable>
          )}
        </View>
      </View>

      {/* Chart area */}
      {chartMode === 'candle' && candleChart ? (
        candleChart
      ) : isLoading ? (
        <View style={styles.chartLoading}>
          <View style={[styles.skeletonLine, { backgroundColor: colors.surfaceAlt, width: '60%' }]} />
          <View style={[styles.skeletonArea, { backgroundColor: colors.surfaceAlt }]} />
        </View>
      ) : hasError ? (
        <View style={styles.chartEmpty}>
          <Ionicons name="cloud-offline-outline" size={24} color={colors.textMuted} />
          <Text style={[styles.chartEmptyText, { color: colors.textMuted }]}>
            Unable to load price data
          </Text>
          <Text style={[styles.chartEmptySubtext, { color: colors.textSecondary }]}>
            Tap a period to retry, or check your connection.
          </Text>
        </View>
      ) : priceSeries.length < 2 ? (
        <View style={styles.chartEmpty}>
          <Ionicons name="bar-chart-outline" size={24} color={colors.textMuted} />
          <Text style={[styles.chartEmptyText, { color: colors.textMuted }]}>
            {tradeCount === 0 ? 'No executions in this period' : 'One execution in this period'}
          </Text>
          <Text style={[styles.chartEmptySubtext, { color: colors.textSecondary }]}>
            {tradeCount === 0
              ? 'A chart appears only after real settled trades. The listing price is not fabricated as history.'
              : 'One settled execution is shown in market activity; a trend needs at least two executions.'}
          </Text>
        </View>
      ) : (
        <View style={styles.chartWrap}>
          <Svg width={CHART_WIDTH} height={CHART_HEIGHT} style={styles.svg}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={sparklineColor} stopOpacity="0.25" />
                <Stop offset="100%" stopColor={sparklineColor} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            {/* Area fill */}
            {areaPath ? <Path d={areaPath} fill={`url(#${gradientId})`} /> : null}
            {/* Sparkline */}
            {linePath ? (
              <Path
                d={linePath}
                stroke={sparklineColor}
                strokeWidth={1.5}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {/* Phase 2: sparse-trade marks — discrete dots at each trade point */}
            {priceSeries.map((point, i) => {
              const timestamps = priceSeries.map((p) => p.timestamp);
              const prices = priceSeries.map((p) => p.price);
              const minT = Math.min(...timestamps);
              const maxT = Math.max(...timestamps);
              const minP = Math.min(...prices);
              const maxP = Math.max(...prices);
              const tRange = maxT - minT || 1;
              const pRange = maxP - minP || 1;
              const chartW = CHART_WIDTH - CHART_PADDING * 2;
              const chartH = CHART_HEIGHT - CHART_PADDING * 2;
              const px = CHART_PADDING + ((point.timestamp - minT) / tRange) * chartW;
              const py = CHART_PADDING + chartH - ((point.price - minP) / pRange) * chartH;
              return <Circle key={`mark-${i}`} cx={px} cy={py} r={2} fill={sparklineColor} />;
            })}
          </Svg>
          {/* Phase 2: sparse-trade note */}
          {tradeCount > 0 && tradeCount <= 5 && (
            <Text style={[styles.sparseNote, { color: colors.textMuted }]} numberOfLines={1}>
              {tradeCount} {tradeCount === 1 ? 'trade' : 'trades'} — sparse observations rendered as discrete marks
            </Text>
          )}
        </View>
      )}

      {/* Footer: high/low + volume + trade count */}
      <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: colors.textMuted }]}>High</Text>
          <Text style={[styles.footerValue, { color: colors.textPrimary }]}>
            {formatCoOwnIze(periodHigh)}
          </Text>
        </View>
        <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: colors.textMuted }]}>Low</Text>
          <Text style={[styles.footerValue, { color: colors.textPrimary }]}>
            {formatCoOwnIze(periodLow)}
          </Text>
        </View>
        <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: colors.textMuted }]}>24h volume</Text>
          <Text style={[styles.footerValue, { color: colors.textPrimary }]}>
            {formatCoOwnIze(volume24hGbp)}
          </Text>
        </View>
        <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: colors.textMuted }]}>Trades</Text>
          <Text style={[styles.footerValue, { color: colors.textPrimary }]}>
            {Math.max(0, tradeCount)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  currentPrice: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  changeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  periodRow: {
    flexDirection: 'row',
    gap: 6,
  },
  periodChip: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodChipText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  chartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs,
  },
  svg: {
    width: '100%',
  },
  chartLoading: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  skeletonLine: {
    height: 12,
    borderRadius: Radius.sm,
  },
  skeletonArea: {
    width: '90%',
    height: CHART_HEIGHT - 40,
    borderRadius: Radius.md,
  },
  chartEmpty: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  chartEmptyText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  chartEmptySubtext: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerItem: {
    flex: 1,
    gap: 2,
  },
  footerDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    marginHorizontal: Space.xs,
  },
  footerLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.1,
  },
  footerValue: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  // ── Phase 2: a11y summary (visually hidden) ──
  a11ySummary: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  // ── Phase 2: last-age badge ──
  lastAgeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    marginLeft: 4,
  },
  lastAgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
  },
  // ── Phase 2: change timestamp ──
  changeTimestamp: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.1,
  },
  // ── Phase 2: controls row ──
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Phase 2: sparse-trade note ──
  sparseNote: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.1,
    textAlign: 'center',
    marginTop: Space.xs,
  },
});
