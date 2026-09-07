/**
 * CoOwnCandleChart — candlestick chart for power users.
 *
 * Uses @shopify/react-native-skia for performant candle rendering.
 * Falls back to react-native-svg if skia path fails.
 *
 * Features: candle bodies with DIRECTION_COLORS, volume bars below,
 * range chips, line/candle toggle (handled by parent), crosshair on
 * long-press, textual summary for screen readers.
 *
 * Sparse-trade rule (source §17.5): charts must not imply continuity
 * where observations are sparse — render sparse trades as discrete marks,
 * not interpolated lines across gaps.
 *
 * See docs/coown/flagship-exchange-upgrade/04 §A5.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle, useWindowDimensions, PanResponder } from 'react-native';
import { Canvas, Rect, Line } from '@shopify/react-native-skia';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { DIRECTION_COLORS } from '../../constants/colors';
import { AnimatedPressable } from '../AnimatedPressable';
import { haptics } from '../../utils/haptics';

export type CoOwnCandleRange = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

export interface CoOwnCandle {
  t: number;   // timestamp (ms)
  o: number;   // open
  h: number;   // high
  l: number;   // low
  c: number;   // close
  v: number;   // volume
}

export interface CoOwnCandleChartProps {
  candles: CoOwnCandle[];
  range: CoOwnCandleRange;
  onRangeChange: (r: CoOwnCandleRange) => void;
  showVolume: boolean;
  lastPrice?: number;
  lastAgeSeconds?: number | null;
  style?: ViewStyle;
}

const RANGES: CoOwnCandleRange[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

const CHART_HEIGHT = 140;
const VOLUME_HEIGHT = 30;
const CHART_PADDING = 8;
const PRICE_AXIS_WIDTH = 52;
const DATE_AXIS_HEIGHT = 18;

export function CoOwnCandleChart({
  candles,
  range,
  onRangeChange,
  showVolume,
  lastPrice,
  lastAgeSeconds,
  style,
}: CoOwnCandleChartProps) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  // Per spec 03_COOWN §4: chart is width-responsive.
  const CHART_WIDTH = Math.min(Math.max(screenWidth - 32, 280), 440);
  const [crosshairIndex, setCrosshairIndex] = useState<number | null>(null);

  // Compute price range across all candles
  // Compute price range across all candles
  const { minPrice, maxPrice, maxVolume } = useMemo(() => {
    if (candles.length === 0) {
      return { minPrice: 0, maxPrice: 1, maxVolume: 1 };
    }
    const lows = candles.map((c) => c.l);
    const highs = candles.map((c) => c.h);
    const vols = candles.map((c) => c.v);
    return {
      minPrice: Math.min(...lows),
      maxPrice: Math.max(...highs),
      maxVolume: Math.max(...vols, 1),
    };
  }, [candles]);

  const priceRange = maxPrice - minPrice || 1;
  const chartH = showVolume ? CHART_HEIGHT - VOLUME_HEIGHT : CHART_HEIGHT;
  const chartW = CHART_WIDTH - PRICE_AXIS_WIDTH - CHART_PADDING * 2;
  // Keep every requested range visible inside the viewport. The previous
  // fixed 8pt slot clipped 3M histories (90 candles) after the first 52.
  const candleSlot = candles.length > 0 ? chartW / candles.length : chartW;
  const candleWidth = Math.max(2, Math.min(6, candleSlot * 0.72));

  // X position for a candle index
  const xForIndex = (i: number) => {
    if (candles.length === 0) return CHART_PADDING;
    return CHART_PADDING + i * candleSlot;
  };

  // Drag/pan inspection: track finger movement across the chart to scrub
  // through candles. This replaces the static tap-only inspection with a
  // continuous crosshair that follows the touch point.
  const updateCrosshairFromTouch = (locationX: number) => {
    if (candles.length === 0) return;
    const x = locationX - CHART_PADDING;
    const index = Math.max(0, Math.min(candles.length - 1, Math.round(x / candleSlot)));
    setCrosshairIndex(index);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => candles.length > 0,
        onMoveShouldSetPanResponder: () => candles.length > 0,
        onPanResponderGrant: (evt) => {
          updateCrosshairFromTouch(evt.nativeEvent.locationX);
          haptics.selection();
        },
        onPanResponderMove: (evt) => {
          updateCrosshairFromTouch(evt.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {
          // Keep the crosshair visible after release so the user can read
          // the OHLC values without holding their finger down.
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candles.length, candleSlot]
  );

  // Price axis labels — show 3 price levels (max, mid, min) as compact text.
  // Rendered as RN Text outside the Skia canvas for accessibility and clarity.
  const priceAxisLabels = useMemo(() => {
    if (candles.length === 0) return null;
    return {
      top: maxPrice.toFixed(2),
      mid: ((maxPrice + minPrice) / 2).toFixed(2),
      bottom: minPrice.toFixed(2),
    };
  }, [candles.length, minPrice, maxPrice]);

  // Date axis labels — show first and last candle dates so users can orient
  // themselves without tapping. For longer ranges, also show a midpoint.
  const dateAxisLabels = useMemo(() => {
    if (candles.length === 0) return null;
    const first = candles[0];
    const last = candles[candles.length - 1];
    return {
      start: formatCandleDate(first.t, range),
      end: formatCandleDate(last.t, range),
    };
  }, [candles, range]);

  // Y position for a price
  const yForPrice = (price: number) => {
    return CHART_PADDING + chartH - ((price - minPrice) / priceRange) * (chartH - CHART_PADDING * 2);
  };

  // Textual summary for screen readers
  const textualSummary = useMemo(() => {
    if (candles.length === 0) return 'No candle data available for this range.';
    const first = candles[0];
    const last = candles[candles.length - 1];
    const change = last.c - first.o;
    const changePct = first.o > 0 ? (change / first.o) * 100 : 0;
    const direction = change >= 0 ? 'up' : 'down';
    const totalVolume = candles.reduce((sum, c) => sum + c.v, 0);
    const agePart = lastAgeSeconds != null ? `, last trade ${formatAge(lastAgeSeconds)}` : '';
    return `1ZE ${range} chart: ${candles.length} candles, ${direction} ${Math.abs(changePct).toFixed(1)}%, volume ${totalVolume.toLocaleString('en-GB')}${agePart}.`;
  }, [candles, range, lastAgeSeconds]);

  const handleRangeChange = (r: CoOwnCandleRange) => {
    setCrosshairIndex(null);
    onRangeChange(r);
    haptics.tap();
  };

  // Empty state
  if (candles.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
        <Text
          style={styles.a11ySummary}
          accessibilityLabel={textualSummary}
          accessibilityRole="text"
        >
          {textualSummary}
        </Text>
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No trades in this range
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Candle chart requires trade data. Try a wider range, or place a limit order to be the first trade.
          </Text>
        </View>
        <RangeChips
          ranges={RANGES}
          activeRange={range}
          onRangeChange={handleRangeChange}
          colors={colors}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {/* Textual summary for screen readers */}
      <Text
        style={styles.a11ySummary}
        accessibilityLabel={textualSummary}
        accessibilityRole="text"
      >
        {textualSummary}
      </Text>

      {/* Range chips */}
      <RangeChips
        ranges={RANGES}
        activeRange={range}
        onRangeChange={handleRangeChange}
        colors={colors}
      />

      {/* Candle chart with price axis and date axis */}
      <View style={styles.chartWrap}>
        {/* Price axis labels (left side) */}
        {priceAxisLabels && (
          <View style={styles.priceAxis} pointerEvents="none">
            <Text style={[styles.priceAxisLabel, { color: colors.textMuted }]}>{priceAxisLabels.top}</Text>
            <Text style={[styles.priceAxisLabel, { color: colors.textMuted }]}>{priceAxisLabels.mid}</Text>
            <Text style={[styles.priceAxisLabel, { color: colors.textMuted }]}>{priceAxisLabels.bottom}</Text>
          </View>
        )}

        {/* Chart canvas + interaction layer */}
        <View style={styles.canvasContainer}>
          <Canvas style={{ width: CHART_WIDTH - PRICE_AXIS_WIDTH, height: showVolume ? CHART_HEIGHT : CHART_HEIGHT - VOLUME_HEIGHT }}>
            {/* Candles */}
            {candles.map((candle, i) => {
              const x = xForIndex(i);
              const isUp = candle.c >= candle.o;
              const color = isUp ? DIRECTION_COLORS.up : DIRECTION_COLORS.down;
              const fillColor = isUp ? DIRECTION_COLORS.upFill : DIRECTION_COLORS.downFill;

              const bodyTop = yForPrice(Math.max(candle.o, candle.c));
              const bodyBottom = yForPrice(Math.min(candle.o, candle.c));
              const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
              const wickTop = yForPrice(candle.h);
              const wickBottom = yForPrice(candle.l);

              return (
                <React.Fragment key={`candle-${i}`}>
                  {/* Wick (high-low line) */}
                  <Line
                    p1={{ x: x + candleWidth / 2, y: wickTop }}
                    p2={{ x: x + candleWidth / 2, y: wickBottom }}
                    color={color}
                    strokeWidth={1}
                  />
                  {/* Body */}
                  <Rect
                    x={x}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    color={fillColor}
                  />
                </React.Fragment>
              );
            })}

            {/* Volume bars */}
            {showVolume && candles.map((candle, i) => {
              const x = xForIndex(i);
              const isUp = candle.c >= candle.o;
              const volColor = isUp ? DIRECTION_COLORS.upFill : DIRECTION_COLORS.downFill;
              const volH = (candle.v / maxVolume) * (VOLUME_HEIGHT - 4);
              const volY = CHART_HEIGHT - volH;

              return (
                <Rect
                  key={`vol-${i}`}
                  x={x}
                  y={volY}
                  width={candleWidth}
                  height={volH}
                  color={volColor}
                />
              );
            })}

            {/* Crosshair — vertical line at selected candle */}
            {crosshairIndex != null && candles[crosshairIndex] && (
              <Line
                p1={{ x: xForIndex(crosshairIndex) + candleWidth / 2, y: 0 }}
                p2={{ x: xForIndex(crosshairIndex) + candleWidth / 2, y: CHART_HEIGHT }}
                color={colors.textMuted}
                strokeWidth={0.5}
              />
            )}
          </Canvas>
          {/* Transparent interaction layer with drag/pan support.
              The pan responder lets users scrub through candles by dragging
              their finger across the chart. */}
          <View
            style={StyleSheet.absoluteFill}
            {...panResponder.panHandlers}
            accessibilityRole="adjustable"
            accessibilityLabel="Price chart. Drag to inspect candle values."
            accessibilityHint="Drag your finger across the chart to see open, high, low, close and volume for each candle."
          />
        </View>
      </View>

      {/* Date axis labels */}
      {dateAxisLabels && (
        <View style={styles.dateAxisRow}>
          <Text style={[styles.dateAxisLabel, { color: colors.textMuted }]}>
            {dateAxisLabels.start}
          </Text>
          <Text style={[styles.dateAxisLabel, { color: colors.textMuted }]}>
            {dateAxisLabels.end}
          </Text>
        </View>
      )}

      {/* Crosshair info */}
      {crosshairIndex != null && candles[crosshairIndex] && (
        <View
          style={[styles.crosshairInfo, { borderColor: colors.border }]}
          accessibilityRole="text"
          accessibilityLabel={`Candle ${formatCandleTimestamp(candles[crosshairIndex].t)}. Open ${candles[crosshairIndex].o.toFixed(2)}, high ${candles[crosshairIndex].h.toFixed(2)}, low ${candles[crosshairIndex].l.toFixed(2)}, close ${candles[crosshairIndex].c.toFixed(2)}${showVolume ? `, volume ${candles[crosshairIndex].v}` : ''}.`}
        >
          <Text style={[styles.crosshairLabel, { color: colors.textMuted }]} numberOfLines={2}>
            {formatCandleTimestamp(candles[crosshairIndex].t)} · O {candles[crosshairIndex].o.toFixed(2)} · H {candles[crosshairIndex].h.toFixed(2)} · L {candles[crosshairIndex].l.toFixed(2)} · C {candles[crosshairIndex].c.toFixed(2)}
          </Text>
          {showVolume && (
            <Text style={[styles.crosshairVol, { color: colors.textMuted }]}>
              Vol {candles[crosshairIndex].v.toLocaleString('en-GB')}
            </Text>
          )}
        </View>
      )}

      {/* Last price line */}
      {lastPrice != null && (
        <View style={styles.lastPriceRow}>
          <Text style={[styles.lastPriceLabel, { color: colors.textMuted }]}>Last</Text>
          <Text style={[styles.lastPriceValue, { color: colors.textPrimary }]}>
            {lastPrice.toFixed(2)}
          </Text>
          {lastAgeSeconds != null && (
            <Text style={[styles.lastPriceAge, { color: colors.textMuted }]}>
              · {formatAge(lastAgeSeconds)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

/** Range chip selector. */
function RangeChips({
  ranges,
  activeRange,
  onRangeChange,
  colors,
}: {
  ranges: CoOwnCandleRange[];
  activeRange: CoOwnCandleRange;
  onRangeChange: (r: CoOwnCandleRange) => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View style={styles.rangeRow}>
      {ranges.map((r) => {
        const isActive = r === activeRange;
        return (
          <AnimatedPressable
            key={r}
            style={[
              styles.rangeChip,
              { borderColor: colors.border },
              isActive && { backgroundColor: colors.brandSubtle, borderColor: colors.brand },
            ]}
            onPress={() => onRangeChange(r)}
            activeOpacity={0.8}
            scaleValue={0.97}
            accessibilityRole="button"
            accessibilityLabel={`Candle chart range: ${r}`}
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[
                styles.rangeChipText,
                { color: colors.textSecondary },
                isActive && { color: colors.brand },
              ]}
            >
              {r}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

/** Format age in seconds to a human-readable string. */
function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return 'just now';
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatCandleTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Compact date format for axis labels — adapts to the range. */
function formatCandleDate(timestampMs: number, range: CoOwnCandleRange): string {
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) return '—';
  // For 1D, show time. For 1W/1M, show day + month. For longer, show month + year.
  if (range === '1D') {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '1Y' || range === 'ALL') {
    return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  a11ySummary: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  rangeChip: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.2,
  },
  chartWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  priceAxis: {
    width: PRICE_AXIS_WIDTH - CHART_PADDING,
    justifyContent: 'space-between',
    paddingVertical: CHART_PADDING,
    paddingRight: Space.xs,
  },
  priceAxisLabel: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    letterSpacing: 0.1,
  },
  canvasContainer: {
    position: 'relative',
  },
  dateAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: PRICE_AXIS_WIDTH,
    paddingTop: 2,
  },
  dateAxisLabel: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.1,
  },
  emptyWrap: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  emptyText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  emptySubtext: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  crosshairInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Space.sm,
  },
  crosshairLabel: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.1,
    fontVariant: ['tabular-nums'],
  },
  crosshairVol: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.1,
    fontVariant: ['tabular-nums'],
  },
  lastPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  lastPriceLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  lastPriceValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  lastPriceAge: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.1,
  },
});

export default CoOwnCandleChart;
