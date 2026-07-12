import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { listCoOwnAssetOrders, MarketCoOwnOrder } from '../../services/marketApi';
import { haptics } from '../../utils/haptics';

// ── Types ────────────────────────────────────────────────────────────────────

type Period = '1D' | '1W' | '1M' | 'ALL';

export interface CoOwnPriceChartProps {
  assetId: string;
  unitPriceGbp: number;
  marketMovePct24h: number;
  volume24hGbp: number;
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

/** Build a price series from filled orders within the period window. */
function buildPriceSeries(orders: MarketCoOwnOrder[], period: Period, currentPrice: number): PricePoint[] {
  const now = Date.now();
  const cutoff = now - PERIOD_MS[period];
  const filled = orders
    .filter((o) => o.status === 'filled')
    .filter((o) => new Date(o.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (filled.length === 0) {
    // No trades in window — return a flat line at the current price
    return [
      { timestamp: now - PERIOD_MS[period === 'ALL' ? '1W' : period], price: currentPrice },
      { timestamp: now, price: currentPrice },
    ];
  }

  const points: PricePoint[] = filled.map((o) => ({
    timestamp: new Date(o.createdAt).getTime(),
    price: o.unitPriceGbp,
  }));

  // Anchor the start to the period cutoff with the first known price
  if (points[0].timestamp > cutoff + 60_000) {
    points.unshift({ timestamp: Math.max(cutoff, points[0].timestamp - 3600_000), price: points[0].price });
  }

  // Anchor the end to now with the current price
  if (points[points.length - 1].timestamp < now - 60_000) {
    points.push({ timestamp: now, price: currentPrice });
  }

  return points;
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

const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const CHART_PADDING = 8;

export function CoOwnPriceChart({
  assetId,
  unitPriceGbp,
  marketMovePct24h,
  volume24hGbp,
}: CoOwnPriceChartProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const [period, setPeriod] = useState<Period>('1W');
  const [orders, setOrders] = useState<MarketCoOwnOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setHasError(false);
    listCoOwnAssetOrders(assetId, { limit: 100 })
      .then((fetched) => {
        if (cancelled) return;
        setOrders(fetched);
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
    () => buildPriceSeries(orders, period, unitPriceGbp),
    [orders, period, unitPriceGbp],
  );

  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p);
    haptics.tap();
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

  const tradeCount = priceSeries.length - 2; // Subtract the two anchor points

  const periodHigh = priceSeries.length > 0 ? Math.max(...priceSeries.map((p) => p.price)) : unitPriceGbp;
  const periodLow = priceSeries.length > 0 ? Math.min(...priceSeries.map((p) => p.price)) : unitPriceGbp;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header: current price + 24h change */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="analytics-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Price</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.currentPrice, { color: colors.textPrimary }]}>
            {formatFromFiat(unitPriceGbp, 'GBP')}
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

      {/* Period selector */}
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

      {/* Chart area */}
      {isLoading ? (
        <View style={styles.chartLoading}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      ) : hasError ? (
        <View style={styles.chartEmpty}>
          <Ionicons name="cloud-offline-outline" size={24} color={colors.textMuted} />
          <Text style={[styles.chartEmptyText, { color: colors.textMuted }]}>
            Unable to load price data
          </Text>
        </View>
      ) : priceSeries.length < 3 && tradeCount <= 0 ? (
        <View style={styles.chartEmpty}>
          <Ionicons name="bar-chart-outline" size={24} color={colors.textMuted} />
          <Text style={[styles.chartEmptyText, { color: colors.textMuted }]}>
            No trades in this period yet
          </Text>
          <Text style={[styles.chartEmptySubtext, { color: colors.textMuted }]}>
            Price reflects the current listing price
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
          </Svg>
        </View>
      )}

      {/* Footer: high/low + volume + trade count */}
      <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: colors.textMuted }]}>High</Text>
          <Text style={[styles.footerValue, { color: colors.textPrimary }]}>
            {formatFromFiat(periodHigh, 'GBP')}
          </Text>
        </View>
        <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: colors.textMuted }]}>Low</Text>
          <Text style={[styles.footerValue, { color: colors.textPrimary }]}>
            {formatFromFiat(periodLow, 'GBP')}
          </Text>
        </View>
        <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: colors.textMuted }]}>24h volume</Text>
          <Text style={[styles.footerValue, { color: colors.textPrimary }]}>
            {formatFromFiat(volume24hGbp, 'GBP')}
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
  },
  periodRow: {
    flexDirection: 'row',
    gap: 6,
  },
  periodChip: {
    paddingVertical: 5,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 44,
    alignItems: 'center',
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
  },
});
