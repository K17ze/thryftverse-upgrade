/**
 * Chart type definitions for Victory Native chart components.
 *
 * These types are the public contract for all chart primitives in
 * src/components/charts/. They are designed to be simple, serialisable,
 * and compatible with Victory Native's CartesianChart data model.
 *
 * The `ChartTheme` type is consumed by `ChartTooltip.tsx` and every
 * chart component in this directory. Theme values are resolved from
 * the app's ThemeContext at render time, so charts automatically
 * adapt to light/dark mode and high-contrast accessibility settings.
 */

// ============================================================================
// CHART THEME
// ============================================================================

/**
 * Theme-aware colour set consumed by every chart primitive and the
 * `ChartTooltip` component.
 *
 * Values are resolved from `useAppTheme()` at render time, so charts
 * automatically adapt to light/dark mode and high-contrast settings.
 */
export interface ChartTheme {
  /** Surface colour for tooltip background and chart chrome. */
  surface: string;
  /** Primary text colour for axis labels and tooltip text. */
  textPrimary: string;
  /** Secondary text colour for muted axis labels. */
  textSecondary: string;
  /** Up / positive direction colour (candles, positive bars). */
  positive: string;
  /** Down / negative direction colour (candles, negative bars). */
  negative: string;
  /** Grid line colour. */
  gridLine: string;
  /** Axis line colour. */
  axisLine: string;
}

// ============================================================================
// DATA TYPES
// ============================================================================

/**
 * A single point on a line or bar chart.
 * `x` may be a numeric timestamp or a string category label.
 */
export interface ChartPoint {
  /** X-axis value — numeric timestamp or string category. */
  x: string | number;
  /** Y-axis value. */
  y: number;
}

/**
 * OHLCV candle data — one row per time period.
 * Compatible with the existing `CoOwnCandle` shape but uses full
 * descriptive field names for clarity in new chart consumers.
 */
export interface CandleData {
  /** Timestamp in milliseconds since epoch (numeric x-axis). */
  timestamp: number;
  /** Opening price for the period. */
  open: number;
  /** Highest price during the period. */
  high: number;
  /** Lowest price during the period. */
  low: number;
  /** Closing price for the period. */
  close: number;
  /** Trade volume during the period (optional — enables volume bars). */
  volume?: number;
}

// ============================================================================
// SERIES & LAYOUT TYPES
// ============================================================================

/**
 * A single series for a line chart — one coloured line per series.
 */
export interface ChartSeries {
  /** Data points for this series. */
  data: ChartPoint[];
  /** Line colour for this series. */
  color: string;
  /** Optional series label (for legends or tooltips). */
  label?: string;
}

/**
 * Padding around the chart plotting area, in canvas pixels.
 * Applied to the CartesianChart's `padding` prop.
 */
export interface ChartPadding {
  /** Padding above the plotting area. */
  top: number;
  /** Padding to the right of the plotting area. */
  right: number;
  /** Padding below the plotting area. */
  bottom: number;
  /** Padding to the left of the plotting area. */
  left: number;
}
