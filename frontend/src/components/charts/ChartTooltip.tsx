/**
 * ChartTooltip — Skia-rendered tooltip for Victory Native charts.
 *
 * Renders entirely on the Skia canvas (no React Native Views) so it
 * stays at 60+ FPS during crosshair scrub. Positioned via Reanimated
 * SharedValues so the position updates on the UI thread without
 * crossing the JS bridge.
 *
 * Used inside a CartesianChart's `renderOutside` callback where
 * Skia elements are composited above the chart marks.
 */

import React from 'react';
import { type SharedValue, useDerivedValue } from 'react-native-reanimated';
import { RoundedRect, Text as SkiaText, type SkFont } from '@shopify/react-native-skia';
import { type ChartBounds } from 'victory-native';
import { type ChartTheme } from './types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single line of text in the tooltip.
 */
export interface TooltipLine {
  /** Label prefix, e.g. "O", "H", "L", "C". */
  label: string;
  /** Formatted value, e.g. "1,234.56". */
  value: string;
  /** Optional colour for the value text. Falls back to theme.textPrimary. */
  color?: string;
}

export interface ChartTooltipProps {
  /** Horizontal position in canvas pixels (from pressState.x.position). */
  xPosition: SharedValue<number>;
  /** Vertical anchor: top of chart bounds (tooltip renders below). */
  top: number;
  /** Reanimated derived value producing the text lines to display. */
  lines: SharedValue<TooltipLine[]>;
  /** Skia font for rendering text. Must be loaded before rendering. */
  font: SkFont | null;
  /** Chart theme for background and text colours. */
  theme: ChartTheme;
  /** Chart bounds for clamping the tooltip within the canvas. */
  chartBounds: ChartBounds;
  /** Whether the tooltip is currently active (touch is down). */
  isActive: SharedValue<boolean>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TOOLTIP_HEIGHT = 28;
const TOOLTIP_PADDING_X = 10;
const TOOLTIP_PADDING_Y = 8;
const FONT_SIZE = 11;
const ESTIMATED_WIDTH = 210;

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Skia-rendered tooltip that follows the crosshair position.
 *
 * The tooltip is anchored to the crosshair x-position and renders at
 * the top of the chart area. It clamps to the chart bounds so it
 * never overflows the canvas. All position calculations run in
 * Reanimated worklets on the UI thread.
 */
export function ChartTooltip({
  xPosition,
  top,
  lines,
  font,
  theme,
  chartBounds,
  isActive,
}: ChartTooltipProps): React.ReactElement | null {
  // Derive the tooltip x position, clamped so it stays within the canvas.
  // All hooks are called unconditionally before any early return.
  const clampedX = useDerivedValue(() => {
    const halfWidth = ESTIMATED_WIDTH / 2;
    const x = xPosition.value;
    const min = chartBounds.left + halfWidth;
    const max = chartBounds.right - halfWidth;
    if (x < min) return min;
    if (x > max) return max;
    return x;
  });

  const opacity = useDerivedValue(() => {
    return isActive.value ? 1 : 0;
  });

  const text = useDerivedValue(() => {
    const activeLines = lines.value;
    if (activeLines.length === 0) return '';
    return activeLines
      .map((line) => `${line.label} ${line.value}`)
      .join('   ');
  });

  const tooltipX = useDerivedValue(() => {
    return clampedX.value - ESTIMATED_WIDTH / 2;
  });

  const tooltipY = top + TOOLTIP_PADDING_Y;

  const textX = useDerivedValue(() => {
    return tooltipX.value + TOOLTIP_PADDING_X;
  });

  const textY = tooltipY + FONT_SIZE + 2;

  if (!font) return null;

  return (
    <>
      <RoundedRect
        x={tooltipX}
        y={tooltipY}
        width={ESTIMATED_WIDTH}
        height={TOOLTIP_HEIGHT}
        r={6}
        color={theme.surface}
        opacity={opacity}
      />
      <SkiaText
        x={textX}
        y={textY}
        text={text}
        font={font}
        color={theme.textPrimary}
        opacity={opacity}
      />
    </>
  );
}

// ============================================================================
// HELPER: Build tooltip lines from OHLC values
// ============================================================================

/**
 * Build tooltip lines for a candle chart from OHLC values.
 * Returns a plain array — wrap in `useDerivedValue` at the call site
 * to feed into `ChartTooltip`.
 */
export function buildCandleTooltipLines(
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number | undefined,
  positiveColor: string,
  negativeColor: string,
): TooltipLine[] {
  const isUp = close >= open;
  const directionColor = isUp ? positiveColor : negativeColor;
  const lines: TooltipLine[] = [
    { label: 'O', value: formatPrice(open) },
    { label: 'H', value: formatPrice(high) },
    { label: 'L', value: formatPrice(low) },
    { label: 'C', value: formatPrice(close), color: directionColor },
  ];
  if (volume != null) {
    lines.push({ label: 'Vol', value: formatVolume(volume) });
  }
  return lines;
}

/**
 * Build a single-line tooltip for a line or bar chart.
 */
export function buildSingleTooltipLines(
  label: string,
  value: number,
  color?: string,
): TooltipLine[] {
  return [{ label, value: formatPrice(value), color }];
}

// ============================================================================
// FORMATTERS
// ============================================================================

function formatPrice(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return value.toFixed(2);
}

function formatVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('en-GB');
}
