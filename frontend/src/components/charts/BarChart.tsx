/**
 * BarChart — Skia-rendered bar chart via Victory Native.
 *
 * Uses Victory Native's `CartesianChart` with the `Bar` mark for
 * GPU-rendered animated bars. The Y-axis always includes zero so bars
 * grow from the baseline. Crosshair interaction runs entirely on the
 * UI thread via Reanimated SharedValues.
 *
 * Features:
 *  - Animated bar entrance (grow from 0 via path animation)
 *  - Touch feedback on bars (highlight + tooltip)
 *  - Y-axis from 0 (never starts from a non-zero baseline)
 *  - Handles negative values (bars below zero line)
 *  - Crosshair tooltip using `buildSingleTooltipLines`
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
  Bar,
  useChartPressState,
  type ChartBounds } from 'victory-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  type ChartPoint,
  type ChartPadding,
  type ChartTheme } from './types';
import { ChartTooltip, buildSingleTooltipLines } from './ChartTooltip';

// ============================================================================
// TYPES
// ============================================================================

export interface BarChartProps {
  /** Bar data — one bar per ChartPoint. `x` is the category label. */
  data: ChartPoint[];
  /** Chart height in canvas pixels. */
  height: number;
  /** Bar fill colour. Defaults to theme.positive. */
  barColor?: string;
  /** Padding around the plotting area. Defaults to a sensible chart padding. */
  padding?: ChartPadding;
  /** Override the theme colours. Defaults to the app theme. */
  theme?: ChartTheme;
  /** Value formatter for axis labels and tooltip. */
  valueFormat?: (v: number) => string;
  /** Loading state — renders a skeleton placeholder. */
  loading?: boolean;
  /** Error state — renders an error message. */
  error?: string | null;
  /** Optional empty-state message override. */
  emptyMessage?: string;
  /** Screen-reader summary of the chart data (e.g. "Views over 7 days, peak 340 on Saturday, total 1,420"). Required for WCAG 1.1.1 — the Skia canvas is invisible to assistive tech. */
  accessibilitySummary?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_WIDTH = 280;
const FONT_SIZE = 11;

const DEFAULT_PADDING: ChartPadding = {
  top: 16,
  right: 50,
  bottom: 28,
  left: 8 };

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

function defaultValueFormat(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0 });
  }
  return value.toFixed(0);
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

export function BarChart({
  data,
  height,
  barColor,
  padding = DEFAULT_PADDING,
  theme: themeOverride,
  valueFormat = defaultValueFormat,
  loading = false,
  error = null,
  emptyMessage = 'No data available',
  accessibilitySummary }: BarChartProps): React.ReactElement {
  const appTheme = useChartTheme();
  const theme = useMemo(
    () => ({ ...appTheme, ...themeOverride }),
    [appTheme, themeOverride],
  );
  const { colors } = useAppTheme();
  const fillColor = barColor ?? theme.positive;

  // Responsive sizing via onLayout (width only; height is fixed via prop).
  const [layoutWidth, setLayoutWidth] = useState(MIN_WIDTH);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setLayoutWidth(w);
  }, []);

  // Skia font for axis labels and tooltip text.
  // useFont(null, size) uses the system default font.
  const font = useFont(null, FONT_SIZE);

  // Chart press state for touch feedback.
  const { state: pressState, isActive } = useChartPressState({
    x: data.length > 0 ? data[0].x : '',
    y: { value: 0 } });

  // Transform ChartPoint[] into Victory Native data rows.
  const chartData = useMemo(() => {
    return data.map((p) => ({ x: p.x, value: p.y }));
  }, [data]);

  // Determine the y-domain: always include 0 so bars grow from the baseline.
  // Negative values get bars below the zero line.
  const domain = useMemo(() => {
    if (chartData.length === 0) return { y: [0, 1] as [number, number] };
    const values = chartData.map((d) => d.value);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    // Add 10% headroom above max and below min (if min < 0).
    const headroom = (max - min) * 0.1 || 1;
    return {
      y: [min - (min < 0 ? headroom : 0), max + headroom] as [number, number] };
  }, [chartData]);

  // Derive tooltip text from press state (runs on UI thread).
  const tooltipLines = useDerivedValue(() => {
    if (!pressState.isActive.value) return [];
    const idx = pressState.matchedIndex.value;
    if (idx < 0 || idx >= data.length) return [];
    const point = data[idx];
    const label = typeof point.x === 'string' ? point.x : String(point.x);
    return buildSingleTooltipLines(label, point.y, fillColor);
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
        yKeys={['value']}
        domain={domain}
        padding={padding}
        domainPadding={{ left: 12, right: 12, top: 16, bottom: 8 }}
        chartPressState={pressState}
        explicitSize={{ width: layoutWidth, height }}
        xAxis={{
          font,
          lineColor: axisColor,
          labelColor,
          labelOffset: 6,
          formatXLabel: (label: string | number) =>
            typeof label === 'string' ? label : String(label),
          tickCount: Math.min(chartData.length, 7) }}
        yAxis={[
          {
            yKeys: ['value'],
            font,
            lineColor: gridColor,
            labelColor,
            labelOffset: 4,
            formatYLabel: (value: number) => valueFormat(value),
            tickCount: 5,
            axisSide: 'right' },
        ]}
        frame={{
          lineColor: axisColor,
          lineWidth: StyleSheet.hairlineWidth }}
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
          <Bar
            points={points.value}
            chartBounds={chartBounds}
            color={fillColor}
            roundedCorners={{ topLeft: 4, topRight: 4 }}
            animate={{ type: 'timing', duration: 400 }}
          />
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

export default BarChart;
