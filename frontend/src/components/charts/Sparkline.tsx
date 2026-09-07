/**
 * Sparkline — minimal Skia line chart for inline metric trends.
 */

import React, { useMemo } from 'react';
import {
  Canvas,
  Path,
  LinearGradient,
  vec,
  Skia } from '@shopify/react-native-skia';
import { useAppTheme } from '../../theme/ThemeContext';
import { withAlpha } from '../poster/shared/colorUtils';

const PAD_X = 2;
const PAD_Y = 3;
const FILL_ALPHA = 0.14;

export interface SparklineProps {
  values: number[];
  /** Canvas width in px. */
  width?: number;
  /** Canvas height in px. */
  height?: number;
  /** Stroke colour; defaults to the theme brand colour. */
  color?: string;
  /** Gradient area under the line. */
  fill?: boolean;
  strokeWidth?: number;
}

export function Sparkline({
  values,
  width = 72,
  height = 28,
  color,
  fill = true,
  strokeWidth = 1.5,
}: SparklineProps): React.ReactElement | null {
  const { colors } = useAppTheme();
  const stroke = color ?? colors.brand;

  const { line, area } = useMemo(() => {
    if (values.length < 2) return { line: null, area: null };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const stepX = (width - PAD_X * 2) / (values.length - 1);
    const points = values.map((v, i) => ({
      x: PAD_X + i * stepX,
      y:
        span === 0
          ? height / 2
          : PAD_Y + (1 - (v - min) / span) * (height - PAD_Y * 2),
    }));
    const linePath = Skia.Path.Make();
    linePath.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      linePath.lineTo(points[i].x, points[i].y);
    }
    const areaPath = linePath.copy();
    areaPath.lineTo(points[points.length - 1].x, height);
    areaPath.lineTo(points[0].x, height);
    areaPath.close();
    return { line: linePath, area: areaPath };
  }, [values, width, height]);

  if (!line) return null;

  return (
    <Canvas style={{ width, height }}>
      {fill && area ? (
        <Path path={area} style="fill">
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={[withAlpha(stroke, FILL_ALPHA), withAlpha(stroke, 0)]}
          />
        </Path>
      ) : null}
      <Path
        path={line}
        style="stroke"
        color={stroke}
        strokeWidth={strokeWidth}
        strokeJoin="round"
        strokeCap="round"
      />
    </Canvas>
  );
}
