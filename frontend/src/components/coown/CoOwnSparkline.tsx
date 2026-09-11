/**
 * CoOwnSparkline — a tiny inline price chart for position cards and
 * watchlist rows.
 *
 * Pure SVG, no axes/labels/grid. A single polyline with an optional
 * area fill, coloured by trend (first vs last price). Flat on canvas —
 * no card, no shadow, no animation. Memoised for list performance.
 *
 * See docs/coown/flagship-exchange-upgrade (sparkline spec).
 */

import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import { Svg, Polyline, Polygon, Line } from 'react-native-svg';
import { useAppTheme } from '../../theme/ThemeContext';

export interface CoOwnSparklineProps {
  /** Price series — most recent last. */
  data: number[];
  /** Canvas width. Default 60. */
  width?: number;
  /** Canvas height. Default 24. */
  height?: number;
  /** Positive trend color override; defaults to theme coownUp. */
  positiveColor?: string;
  /** Negative trend color override; defaults to theme coownDown. */
  negativeColor?: string;
  /** Neutral color for flat data; defaults to theme textSecondary. */
  neutralColor?: string;
  /** Show fill under the line. Default true. */
  showFill?: boolean;
  /** Line stroke width. Default 1.5. */
  strokeWidth?: number;
  /** Accessibility label. */
  accessibilityLabel?: string;
}

type Trend = 'up' | 'down' | 'flat';

/**
 * Map a price series to normalised SVG points.
 * Returns null when the series cannot form a line (empty or single point).
 */
function buildPoints(data: number[], width: number, height: number): string[] | null {
  const n = data.length;
  if (n < 2) return null;

  let min = data[0];
  let max = data[0];
  for (let i = 1; i < n; i++) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const range = max - min;
  // All values identical — caller renders a flat line at mid-height.
  if (range === 0) return null;

  const points: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * width;
    const y = height - ((data[i] - min) / range) * height;
    points[i] = `${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return points;
}

function resolveTrend(data: number[]): Trend {
  if (data.length < 2) return 'flat';
  const first = data[0];
  const last = data[data.length - 1];
  if (last > first) return 'up';
  if (last < first) return 'down';
  return 'flat';
}

function CoOwnSparklineImpl({
  data,
  width = 60,
  height = 24,
  positiveColor,
  negativeColor,
  neutralColor,
  showFill = true,
  strokeWidth = 1.5,
  accessibilityLabel,
}: CoOwnSparklineProps) {
  const { colors } = useAppTheme();

  const up = positiveColor ?? colors.coownUp;
  const down = negativeColor ?? colors.coownDown;
  const neutral = neutralColor ?? colors.textSecondary;

  const trend = resolveTrend(data);
  const color = trend === 'up' ? up : trend === 'down' ? down : neutral;

  const linePoints = useMemo(() => buildPoints(data, width, height), [data, width, height]);

  // Empty data — render an empty View of the same size so layout is stable.
  if (data.length === 0) {
    return <View style={{ width, height }} accessibilityLabel={accessibilityLabel} />;
  }

  // Single point, or all-same values — render a horizontal line at mid-height.
  if (linePoints === null) {
    const midY = height / 2;
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="image"
      >
        <Svg width={width} height={height}>
          <Line
            x1={0}
            y1={midY}
            x2={width}
            y2={midY}
            stroke={neutral}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </Svg>
      </View>
    );
  }

  const lineString = linePoints.join(' ');
  // Close the polygon down to the bottom corners for the area fill.
  const fillString = `${linePoints.join(' ')} ${width},${height} 0,${height}`;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    >
      <Svg width={width} height={height}>
        {showFill && <Polygon points={fillString} fill={color} opacity={0.15} />}
        <Polyline
          points={lineString}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

export const CoOwnSparkline = memo(CoOwnSparklineImpl);

export default CoOwnSparkline;
