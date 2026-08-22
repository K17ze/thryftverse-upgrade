/**
 * CandleChart — Skia-rendered candlestick chart via Victory Native.
 *
 * Uses Victory Native's `CartesianChart` with the built-in `Candlestick`
 * mark for GPU-batched path rendering. The candlestick mark batches
 * bodies and wicks by status (positive/negative/neutral) for efficient
 * GPU draws, and all crosshair interaction runs on the UI thread via
 * Reanimated SharedValues.
 *
 * Features:
 *  - OHLC candle bodies + wicks (batched by status for performance)
 *  - Green/red candles based on close >= open
 *  - Interactive crosshair via Gesture Handler (pan to scrub)
 *  - Skia-rendered tooltip showing OHLC + volume at crosshair
 *    (uses `buildCandleTooltipLines` from ChartTooltip)
 *  - Optional volume bars at the bottom (separate axis region)
 *  - Time axis (bottom), price axis (right)
 *  - Empty / loading / error states
 *  - Dark-mode aware via ThemeContext
 *  - Responsive via onLayout
 *  - All interactions on the UI thread via Reanimated SharedValues
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useFont, Line as SkiaLine, Rect, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  CartesianChart,
  Candlestick,
  useChartPressState,
  type ChartBounds,
  type PointsArray,
} from 'victory-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import {
  type CandleData,
  type ChartPadding,
  type ChartTheme,
} from './types';
import { ChartTooltip, buildCandleTooltipLines } from './ChartTooltip';

// ============================================================================
// TYPES
// ============================================================================

export interface CandleChartProps {
  /** OHLCV candle data. */
  data: CandleData[];
  /** Chart height in canvas pixels. */
  height: number;
  /** Padding around the plotting area. Defaults to a sensible chart padding. */
  padding?: ChartPadding;
  /** Show volume bars at the bottom. Defaults to false. */
  showVolume?: boolean;
  /** Override the theme colours. Defaults to the app theme. */
  theme?: ChartTheme;
  /** Price formatter for axis labels and tooltip. */
  priceFormat?: (v: number) => string;
  /** Loading state — renders a skeleton placeholder. */
  loading?: boolean;
  /** Error state — renders an error message. */
  error?: string | null;
  /** Optional empty-state message override. */
  emptyMessage?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_WIDTH = 280;
const FONT_SIZE = 11;
const VOLUME_AREA_RATIO = 0.2; // bottom 20% of chart for volume bars

const DEFAULT_PADDING: ChartPadding = {
  top: 16,
  right: 56,
  bottom: 28,
  left: 8,
};

// ============================================================================
// THEME RESOLVER
// ============================================================================

/**
 * Resolve a full `ChartTheme` from the app's ThemeContext.
 * Maps the app's semantic colour tokens to the chart-specific palette.
 */
function useChartTheme(): ChartTheme {
  const { colors } = useAppTheme();
  return useMemo(
    () => ({
      surface: colors.surfaceElevated,
      textPrimary: colors.textPrimary,
      textSecondary: colors.textSecondary,
      positive: colors.coownUp,
      negative: colors.coownDown,
      gridLine: colors.borderSubtle,
      axisLine: colors.border,
    }),
    [colors],
  );
}

// ============================================================================
// DEFAULT FORMATTERS
// ============================================================================

function defaultPriceFormat(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return value.toFixed(2);
}

function defaultTimeFormat(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
}

// ============================================================================
// CROSSHAIR INDICATOR (Skia-rendered vertical line)
// ============================================================================

/**
 * Vertical crosshair line rendered on the Skia canvas.
 * Follows the press state x-position on the UI thread.
 */
function CrosshairLine({
  xPosition,
  chartBounds,
  color,
  isActive,
}: {
  xPosition: SharedValue<number>;
  chartBounds: ChartBounds;
  color: string;
  isActive: SharedValue<boolean>;
}): React.ReactElement {
  const opacity = useDerivedValue(() => (isActive.value ? 0.6 : 0));
  const p1 = useDerivedValue(() => vec(xPosition.value, chartBounds.top));
  const p2 = useDerivedValue(() => vec(xPosition.value, chartBounds.bottom));

  return (
    <SkiaLine
      p1={p1}
      p2={p2}
      color={color}
      strokeWidth={StyleSheet.hairlineWidth}
      opacity={opacity}
    />
  );
}

// ============================================================================
// VOLUME BARS (Skia-rendered Rects at the bottom of the chart)
// ============================================================================

/**
 * Volume bars rendered as Skia Rects in the bottom portion of the chart.
 * Uses the x-positions from the candle points and scales volume to
 * the bottom VOLUME_AREA_RATIO of the chart height. Coloured by
 * candle direction (close >= open = positive, else negative).
 */
function VolumeBars({
  volumePoints,
  chartBounds,
  openPoints,
  closePoints,
  positiveColor,
  negativeColor,
}: {
  volumePoints: PointsArray;
  chartBounds: ChartBounds;
  openPoints: PointsArray;
  closePoints: PointsArray;
  positiveColor: string;
  negativeColor: string;
}): React.ReactElement {
  const volumeAreaHeight = (chartBounds.bottom - chartBounds.top) * VOLUME_AREA_RATIO;
  const volumeAreaTop = chartBounds.bottom - volumeAreaHeight;

  // Find max volume for scaling.
  const maxVolume = useMemo(() => {
    let max = 0;
    for (const p of volumePoints) {
      if (p.yValue != null && p.yValue > max) max = p.yValue;
    }
    return max || 1;
  }, [volumePoints]);

  const barWidth = useMemo(() => {
    if (volumePoints.length < 2) return 4;
    const spacing = volumePoints[1].x - volumePoints[0].x;
    return Math.max(spacing * 0.6, 2);
  }, [volumePoints]);

  return (
    <>
      {volumePoints.map((point, i) => {
        const vol = point.yValue;
        if (vol == null || vol <= 0) return null;
        const barH = (vol / maxVolume) * volumeAreaHeight;
        const isUp =
          closePoints[i]?.yValue != null && openPoints[i]?.yValue != null
            ? closePoints[i].yValue >= openPoints[i].yValue
            : true;
        return (
          <Rect
            key={`vol-${i}`}
            x={point.x - barWidth / 2}
            y={chartBounds.bottom - barH}
            width={barWidth}
            height={barH}
            color={isUp ? positiveColor : negativeColor}
            opacity={0.25}
          />
        );
      })}
    </>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CandleChart({
  data,
  height,
  padding = DEFAULT_PADDING,
  showVolume = false,
  theme: themeOverride,
  priceFormat = defaultPriceFormat,
  loading = false,
  error = null,
  emptyMessage = 'No trades in this range',
}: CandleChartProps): React.ReactElement {
  const appTheme = useChartTheme();
  const theme = useMemo(
    () => ({ ...appTheme, ...themeOverride }),
    [appTheme, themeOverride],
  );
  const { colors } = useAppTheme();

  // Responsive sizing via onLayout (width only; height is fixed via prop).
  const [layoutWidth, setLayoutWidth] = useState(MIN_WIDTH);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setLayoutWidth(w);
  }, []);

  // Skia font for axis labels and tooltip text.
  // useFont(null, size) uses the system default font.
  const font = useFont(null, FONT_SIZE);

  // Chart press state for crosshair interaction.
  const { state: pressState, isActive } = useChartPressState({
    x: data.length > 0 ? data[0].timestamp : 0,
    y: { open: 0, high: 0, low: 0, close: 0, volume: 0 },
  });

  // Transform CandleData[] into Victory Native data rows.
  const chartData = useMemo(() => {
    return data.map((c) => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
    }));
  }, [data]);

  // Derive tooltip lines from the press state (runs on UI thread).
  const tooltipLines = useDerivedValue(() => {
    if (!pressState.isActive.value) return [];
    return buildCandleTooltipLines(
      pressState.y.open.value.value,
      pressState.y.high.value.value,
      pressState.y.low.value.value,
      pressState.y.close.value.value,
      showVolume ? pressState.y.volume.value.value : undefined,
      theme.positive,
      theme.negative,
    );
  });

  // Axis colours.
  const gridColor = theme.gridLine;
  const axisColor = theme.axisLine;
  const labelColor = theme.textSecondary;

  // ── Loading state ──
  if (loading) {
    return (
      <View
        style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onLayout={onLayout}
      >
        <View style={[styles.placeholder, { height }]}>
          <View style={[styles.skeletonBar, { backgroundColor: colors.borderSubtle }]} />
          <View style={[styles.skeletonBar, { backgroundColor: colors.borderSubtle, width: '60%' }]} />
        </View>
      </View>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <View
        style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onLayout={onLayout}
      >
        <View style={[styles.placeholder, { height }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      </View>
    );
  }

  // ── Empty state ──
  if (chartData.length === 0) {
    return (
      <View
        style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onLayout={onLayout}
      >
        <View style={[styles.placeholder, { height }]}>
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            {emptyMessage}
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
            Try a wider range, or place a limit order to be the first trade.
          </Text>
        </View>
      </View>
    );
  }

  // ── Ready state: render Victory Native chart ──
  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onLayout={onLayout}
    >
      <CartesianChart
        data={chartData}
        xKey="timestamp"
        yKeys={['open', 'high', 'low', 'close', 'volume']}
        padding={padding}
        domainPadding={{ left: 10, right: 10, top: 20, bottom: 8 }}
        chartPressState={pressState}
        explicitSize={{ width: layoutWidth, height }}
        xAxis={{
          font,
          lineColor: axisColor,
          labelColor,
          labelOffset: 6,
          formatXLabel: (label: number) => defaultTimeFormat(label),
          tickCount: 5,
        }}
        yAxis={[
          {
            yKeys: ['open', 'high', 'low', 'close'],
            font,
            lineColor: gridColor,
            labelColor,
            labelOffset: 4,
            formatYLabel: (value: number) => priceFormat(value),
            tickCount: 5,
            axisSide: 'right',
          },
        ]}
        frame={{
          lineColor: axisColor,
          lineWidth: StyleSheet.hairlineWidth,
        }}
        renderOutside={({ chartBounds }) =>
          isActive ? (
            <>
              <CrosshairLine
                xPosition={pressState.x.position}
                chartBounds={chartBounds}
                color={theme.textSecondary}
                isActive={pressState.isActive}
              />
              <ChartTooltip
                xPosition={pressState.x.position}
                top={chartBounds.top}
                lines={tooltipLines}
                font={font}
                theme={theme}
                chartBounds={chartBounds}
                isActive={pressState.isActive}
              />
            </>
          ) : null
        }
      >
        {({ points, chartBounds }) => (
          <>
            <Candlestick
              openPoints={points.open}
              highPoints={points.high}
              lowPoints={points.low}
              closePoints={points.close}
              chartBounds={chartBounds}
              candleRatio={0.65}
              wickStrokeWidth={1}
              candleColors={{
                positive: theme.positive,
                negative: theme.negative,
                neutral: theme.textSecondary,
              }}
              animate={{ type: 'timing', duration: 300 }}
            />
            {showVolume && (
              <VolumeBars
                volumePoints={points.volume}
                chartBounds={chartBounds}
                openPoints={points.open}
                closePoints={points.close}
                positiveColor={theme.positive}
                negativeColor={theme.negative}
              />
            )}
          </>
        )}
      </CartesianChart>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.sm,
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  skeletonBar: {
    height: 12,
    width: '80%',
    borderRadius: Radius.sm,
  },
  errorText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    paddingHorizontal: Space.lg,
  },
});

export default CandleChart;
