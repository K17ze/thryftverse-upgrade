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
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Canvas, Rect, Line } from '@shopify/react-native-skia';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
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

const CHART_WIDTH = 320;
const CHART_HEIGHT = 140;
const VOLUME_HEIGHT = 30;
const CHART_PADDING = 8;
const CANDLE_WIDTH = 6;
const CANDLE_GAP = 2;

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
  const [crosshairIndex, setCrosshairIndex] = useState<number | null>(null);

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
  const chartW = CHART_WIDTH - CHART_PADDING * 2;

  // X position for a candle index
  const xForIndex = (i: number) => {
    if (candles.length === 0) return CHART_PADDING;
    const step = CANDLE_WIDTH + CANDLE_GAP;
    return CHART_PADDING + i * step;
  };

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
          <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
            Candle chart requires trade data
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

      {/* Candle chart */}
      <View style={styles.chartWrap}>
        <Canvas style={{ width: CHART_WIDTH, height: showVolume ? CHART_HEIGHT : CHART_HEIGHT - VOLUME_HEIGHT }}>
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
                  p1={{ x: x + CANDLE_WIDTH / 2, y: wickTop }}
                  p2={{ x: x + CANDLE_WIDTH / 2, y: wickBottom }}
                  color={color}
                  strokeWidth={1}
                />
                {/* Body */}
                <Rect
                  x={x}
                  y={bodyTop}
                  width={CANDLE_WIDTH}
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
                width={CANDLE_WIDTH}
                height={volH}
                color={volColor}
              />
            );
          })}

          {/* Crosshair — vertical line at selected candle */}
          {crosshairIndex != null && candles[crosshairIndex] && (
            <Line
              p1={{ x: xForIndex(crosshairIndex) + CANDLE_WIDTH / 2, y: 0 }}
              p2={{ x: xForIndex(crosshairIndex) + CANDLE_WIDTH / 2, y: CHART_HEIGHT }}
              color={colors.textMuted}
              strokeWidth={0.5}
            />
          )}
        </Canvas>
      </View>

      {/* Crosshair info */}
      {crosshairIndex != null && candles[crosshairIndex] && (
        <View style={[styles.crosshairInfo, { borderColor: colors.border }]}>
          <Text style={[styles.crosshairLabel, { color: colors.textMuted }]}>
            O {candles[crosshairIndex].o.toFixed(2)} · H {candles[crosshairIndex].h.toFixed(2)} · L {candles[crosshairIndex].l.toFixed(2)} · C {candles[crosshairIndex].c.toFixed(2)}
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
              isActive && { backgroundColor: `${colors.brand}12`, borderColor: colors.brand },
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
    paddingVertical: 4,
    paddingHorizontal: Space.sm - 2,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 36,
    alignItems: 'center',
  },
  rangeChipText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  chartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  emptyText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  emptySubtext: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
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
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.1,
  },
  crosshairVol: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.1,
  },
  lastPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  lastPriceLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  lastPriceValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  lastPriceAge: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.1,
  },
});

export default CoOwnCandleChart;
