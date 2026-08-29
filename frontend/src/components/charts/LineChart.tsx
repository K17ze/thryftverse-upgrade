/**
 * LineChart — Skia-rendered multi-series line chart via Victory Native.
 *
 * Uses Victory Native's `CartesianChart` with the `Line` mark for
 * GPU-batched path rendering at 60+ FPS. Each series in `data` renders
 * as a separate coloured line. Crosshair interaction runs entirely on
 * the UI thread via Reanimated SharedValues — no JS bridge crossings
 * during scrub.
 *
 * Features:
 *  - Multi-series line rendering (one Line per ChartSeries)
 *  - Interactive crosshair with Skia tooltip (pan to scrub)
 *  - Subtle grid lines (toggleable, theme-dependent)
 *  - X-axis labels, Y-axis labels (custom formatters)
 *  - Empty / loading / error states
 *  - Dark-mode aware via ThemeContext
 *  - Responsive via onLayout
 *  - All interactions on the UI thread via Reanimated SharedValues
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useFont, Line as SkiaLine, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  CartesianChart,
  Line,
  useChartPressState,
  type ChartBounds } from 'victory-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  type ChartSeries,
  type ChartPadding,
  type ChartTheme } from './types';
import { ChartTooltip, buildSingleTooltipLines } from './ChartTooltip';

// ============================================================================
// TYPES
// ============================================================================

export interface LineChartProps {
  /** One or more series — each renders as a separate coloured line. */
  data: ChartSeries[];
  /** Chart height in canvas pixels. */
  height: number;
  /** Padding around the plotting area. Defaults to a sensible chart padding. */
  padding?: ChartPadding;
  /** Show subtle grid lines. Defaults to true. */
  showGrid?: boolean;
  /** Show interactive crosshair with tooltip on touch. Defaults to true. */
  showCrosshair?: boolean;
  /** Override the theme colours. Defaults to the app theme. */
  theme?: ChartTheme;
  /** Y-axis label formatter. */
  yAxisFormat?: (v: number) => string;
  /** X-axis label formatter. */
  xAxisFormat?: (v: number | string) => string;
  /** Loading state — renders a skeleton placeholder. */
  loading?: boolean;
  /** Error state — renders an error message. */
  error?: string | null;
  /** Optional empty-state message override. */
  emptyMessage?: string;
  /** Screen-reader summary of the chart data (e.g. "Portfolio value over 30 days, peak £1,240 on day 18, current £1,180"). Required for WCAG 1.1.1 — the Skia canvas is invisible to assistive tech. */
  accessibilitySummary?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_WIDTH = 280;
const FONT_SIZE = 11;
/** Maximum number of series supported by the multi-series line chart. */
const MAX_SERIES = 5;

const DEFAULT_PADDING: ChartPadding = {
  top: 16,
  right: 50,
  bottom: 28,
  left: 8 };

// ============================================================================
// INTERNAL DATA ROW TYPE
// ============================================================================

/**
 * Data row for the CartesianChart — supports up to MAX_SERIES series.
 * Each series maps to a y-key (y0, y1, ...). Null values indicate
 * that a series has no data point at that x position (sparse data).
 *
 * This fixed shape is required because Victory Native's CartesianChart
 * uses compile-time generics to infer xKey and yKeys from the data type.
 * The explicit index signature satisfies the `Record<string, unknown>`
 * constraint on CartesianChart's RawData generic.
 */
type LineDataRow = {
  x: string | number;
  y0: number | null;
  y1: number | null;
  y2: number | null;
  y3: number | null;
  y4: number | null;
  [key: string]: unknown;
};

/** All possible y-keys, in order. */
const ALL_Y_KEYS = ['y0', 'y1', 'y2', 'y3', 'y4'] as const;
type YKey = (typeof ALL_Y_KEYS)[number];

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
      axisLine: colors.border }),
    [colors],
  );
}

// ============================================================================
// DEFAULT FORMATTERS
// ============================================================================

function defaultYAxisFormat(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0 });
  }
  return value.toFixed(1);
}

function defaultXAxisFormat(value: number | string): string {
  if (typeof value === 'string') return value;
  const date = new Date(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
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
  isActive }: {
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
// MAIN COMPONENT
// ============================================================================

export function LineChart({
  data,
  height,
  padding = DEFAULT_PADDING,
  showGrid = true,
  showCrosshair = true,
  theme: themeOverride,
  yAxisFormat = defaultYAxisFormat,
  xAxisFormat = defaultXAxisFormat,
  loading = false,
  error = null,
  emptyMessage = 'No data available',
  accessibilitySummary }: LineChartProps): React.ReactElement {
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

  // Flatten all series into a single data row shape for CartesianChart.
  // Each series becomes a yKey (y0, y1, ... up to MAX_SERIES). We build
  // a merged dataset where each row has the x value and one column per
  // series. Null values indicate sparse data (series has no point at x).
  const { chartData, yKeys, seriesColors, seriesLabels } = useMemo<{
    chartData: LineDataRow[];
    yKeys: YKey[];
    seriesColors: string[];
    seriesLabels: string[];
  }>(() => {
    if (data.length === 0) {
      return {
        chartData: [] as LineDataRow[],
        yKeys: [] as YKey[],
        seriesColors: [] as string[],
        seriesLabels: [] as string[] };
    }

    const seriesCount = Math.min(data.length, MAX_SERIES);

    // Collect all unique x values across all series, preserving order
    // of the first series. If series have different x sets, we merge.
    const xOrder: (string | number)[] = [];
    const xSet = new Set<string | number>();
    for (let si = 0; si < seriesCount; si++) {
      for (const point of data[si].data) {
        const key = typeof point.x === 'number' ? point.x : String(point.x);
        if (!xSet.has(key)) {
          xSet.add(key);
          xOrder.push(point.x);
        }
      }
    }

    // Build a lookup: x -> { seriesIndex -> y }
    const lookup = new Map<string | number, Map<number, number>>();
    for (let si = 0; si < seriesCount; si++) {
      for (const point of data[si].data) {
        const key = typeof point.x === 'number' ? point.x : String(point.x);
        let seriesMap = lookup.get(key);
        if (!seriesMap) {
          seriesMap = new Map();
          lookup.set(key, seriesMap);
        }
        seriesMap.set(si, point.y);
      }
    }

    const keys: YKey[] = [];
    const cols: string[] = [];
    const labels: string[] = [];
    for (let si = 0; si < seriesCount; si++) {
      keys.push(ALL_Y_KEYS[si]);
      cols.push(data[si].color);
      labels.push(data[si].label ?? `Series ${si + 1}`);
    }

    const rows: LineDataRow[] = xOrder.map((x) => {
      const key = typeof x === 'number' ? x : String(x);
      const seriesMap = lookup.get(key);
      return {
        x,
        y0: seriesMap?.get(0) ?? null,
        y1: seriesMap?.get(1) ?? null,
        y2: seriesMap?.get(2) ?? null,
        y3: seriesMap?.get(3) ?? null,
        y4: seriesMap?.get(4) ?? null };
    });

    return {
      chartData: rows,
      yKeys: keys,
      seriesColors: cols,
      seriesLabels: labels };
  }, [data]);

  // Chart press state for crosshair interaction.
  // Initialise with all possible y-keys so the press state type matches
  // the CartesianChart's expected shape regardless of how many series
  // are active. Only the first series is shown in the tooltip.
  const { state: pressState, isActive } = useChartPressState({
    x: chartData.length > 0 ? chartData[0].x : 0,
    y: { y0: 0, y1: 0, y2: 0, y3: 0, y4: 0 } });

  // Derive tooltip text from press state (runs on UI thread).
  // Shows the first series value at the crosshair position.
  const tooltipLines = useDerivedValue(() => {
    if (!pressState.isActive.value) return [];
    const firstKey = yKeys[0];
    if (!firstKey) return [];
    const val = pressState.y[firstKey].value.value;
    return buildSingleTooltipLines(seriesLabels[0] ?? '', val, seriesColors[0]);
  });

  // Axis colours.
  const gridColor = showGrid ? theme.gridLine : 'transparent';
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
          <View style={[styles.skeletonBar, { backgroundColor: colors.borderSubtle, width: '50%' }]} />
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
        </View>
      </View>
    );
  }

  // ── Ready state ──
  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onLayout={onLayout}
    >
      {/* Off-screen text for screen readers — the Skia canvas is invisible
          to VoiceOver/TalkBack, so we expose a textual summary (WCAG 1.1.1). */}
      <Text
        accessibilityLabel={accessibilitySummary ?? `${chartData.length} data points`}
        accessibilityRole="text"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      />
      <CartesianChart
        data={chartData}
        xKey="x"
        yKeys={yKeys}
        padding={padding}
        domainPadding={{ left: 10, right: 10, top: 16, bottom: 8 }}
        chartPressState={showCrosshair ? pressState : undefined}
        explicitSize={{ width: layoutWidth, height }}
        xAxis={{
          font,
          lineColor: axisColor,
          labelColor,
          labelOffset: 6,
          formatXLabel: (label: string | number) => xAxisFormat(label),
          tickCount: 5 }}
        yAxis={[
          {
            yKeys,
            font,
            lineColor: gridColor,
            labelColor,
            labelOffset: 4,
            formatYLabel: (value: number | null) => (value == null ? '' : yAxisFormat(value)),
            tickCount: 5,
            axisSide: 'right' },
        ]}
        frame={{
          lineColor: axisColor,
          lineWidth: StyleSheet.hairlineWidth }}
        renderOutside={showCrosshair ? ({ chartBounds }) =>
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
        : undefined}
      >
        {({ points }) => (
          <>
            {yKeys.map((yk, si) => (
              <Line
                key={`line-${yk}`}
                points={points[yk]}
                curveType="monotoneX"
                color={seriesColors[si]}
                strokeWidth={2}
                connectMissingData={false}
                animate={{ type: 'timing', duration: 400 }}
              />
            ))}
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
    overflow: 'hidden' },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm },
  skeletonBar: {
    height: 12,
    width: '80%',
    borderRadius: Radius.sm },
  errorText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'center' },
  emptyTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    textAlign: 'center' } });

export default LineChart;
