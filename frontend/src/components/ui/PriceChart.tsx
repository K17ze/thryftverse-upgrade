/**
 * PriceChart — Lightweight sparkline for price intelligence
 * Shows historical price trajectory + current position + prediction band.
 * Uses react-native-svg for crisp rendering at any size.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Line, Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { Type, Space } from '../../theme/designTokens';

export interface PricePoint {
  day: number; // 0 = 90 days ago, 90 = today
  price: number;
  isPrediction?: boolean;
}

interface PriceChartProps {
  data: PricePoint[];
  width?: number;
  height?: number;
  currentPrice: number;
  suggestedRange?: { low: number; high: number };
  style?: object;
}

export function PriceChart({
  data,
  width = 200,
  height = 48,
  currentPrice,
  suggestedRange,
  style,
}: PriceChartProps) {
  if (data.length < 2) return null;

  const padding = { top: 4, right: 8, bottom: 4, left: 8 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const prices = data.map((d) => d.price);
  const minPrice = Math.min(...prices, suggestedRange?.low ?? Infinity);
  const maxPrice = Math.max(...prices, suggestedRange?.high ?? -Infinity);
  const range = maxPrice - minPrice || 1;

  const scaleX = (day: number) => padding.left + (day / 90) * chartW;
  const scaleY = (price: number) => padding.top + chartH - ((price - minPrice) / range) * chartH;

  const historical = data.filter((d) => !d.isPrediction);
  const predicted = data.filter((d) => d.isPrediction);

  const histPoints = historical.map((d) => `${scaleX(d.day)},${scaleY(d.price)}`).join(' ');
  const predPoints = predicted.map((d) => `${scaleX(d.day)},${scaleY(d.price)}`).join(' ');

  const currentDay = historical[historical.length - 1]?.day ?? 90;
  const currentX = scaleX(currentDay);
  const currentY = scaleY(currentPrice);

  // Prediction band
  const predBand = suggestedRange
    ? {
        x: scaleX(currentDay),
        y: scaleY(suggestedRange.high),
        width: scaleX(90) - scaleX(currentDay),
        height: scaleY(suggestedRange.low) - scaleY(suggestedRange.high),
      }
    : null;

  return (
    <View style={[{ width, height }, style]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Colors.brand} stopOpacity="0.12" />
            <Stop offset="1" stopColor={Colors.brand} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {/* Prediction band */}
        {predBand && (
          <Rect
            x={predBand.x}
            y={predBand.y}
            width={predBand.width}
            height={predBand.height}
            fill="url(#predGrad)"
            rx={4}
          />
        )}

        {/* Historical line */}
        {histPoints.length > 0 && (
          <Polyline
            points={histPoints}
            fill="none"
            stroke={Colors.brand}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Predicted line (dashed) */}
        {predPoints.length > 0 && (
          <Polyline
            points={predPoints}
            fill="none"
            stroke={Colors.brand}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="3,3"
            opacity={0.6}
          />
        )}

        {/* Current price dot */}
        <Circle cx={currentX} cy={currentY} r={3.5} fill={Colors.background} stroke={Colors.brand} strokeWidth={2} />

        {/* Baseline */}
        <Line
          x1={padding.left}
          y1={padding.top + chartH}
          x2={width - padding.right}
          y2={padding.top + chartH}
          stroke={Colors.border}
          strokeWidth={0.5}
        />
      </Svg>
    </View>
  );
}

/**
 * PriceSparklineRow — Inline price intel with sparkline + micro-copy
 */
interface PriceSparklineRowProps {
  data: PricePoint[];
  currentPrice: number;
  suggestedRange?: { low: number; high: number };
  trendLabel?: string;
  daysToSellEstimate?: number;
  style?: object;
}

export function PriceSparklineRow({
  data,
  currentPrice,
  suggestedRange,
  trendLabel,
  daysToSellEstimate,
  style,
}: PriceSparklineRowProps) {
  const isRising = data.length >= 2 && data[data.length - 1].price >= data[0].price;
  const trendColor = isRising ? Colors.success : Colors.danger;
  const trendIcon = isRising ? 'trending-up-outline' : 'trending-down-outline';

  return (
    <View style={[styles.row, style]}>
      <View style={styles.left}>
        {trendLabel && (
          <Text style={[styles.trendLabel, { color: trendColor }]}>{trendLabel}</Text>
        )}
        {daysToSellEstimate !== undefined && (
          <Text style={styles.estimateLabel}>
            Est. sell time: ~{daysToSellEstimate} days
          </Text>
        )}
        {suggestedRange && (
          <Text style={styles.rangeLabel}>
            Market range: £{suggestedRange.low.toFixed(0)} - £{suggestedRange.high.toFixed(0)}
          </Text>
        )}
      </View>
      <PriceChart
        data={data}
        currentPrice={currentPrice}
        suggestedRange={suggestedRange}
        width={120}
        height={40}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  trendLabel: {
    fontSize: Type.caption.size,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: Type.caption.lineHeight,
  },
  estimateLabel: {
    fontSize: Type.meta.size,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.meta.letterSpacing,
  },
  rangeLabel: {
    fontSize: Type.meta.size,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.meta.letterSpacing,
  },
});
