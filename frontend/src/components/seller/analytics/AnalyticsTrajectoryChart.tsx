import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { haptics } from '../../../utils/haptics';
import { Canvas, Path, LinearGradient, vec, Skia, DashPathEffect } from '@shopify/react-native-skia';

export interface ChartPoint {
  x: string | number;
  y: number;
}

export interface AnalyticsTrajectoryChartProps {
  points: ChartPoint[];
  prevPoints?: ChartPoint[];
  viewMode: 'bar' | 'line';
  valueFormat: (v: number) => string;
  activeDimension: string;
  periodLabel: string;
}

const CANVAS_HEIGHT = 160;

export function AnalyticsTrajectoryChart({
  points,
  prevPoints,
  viewMode,
  valueFormat,
  activeDimension,
  periodLabel,
}: AnalyticsTrajectoryChartProps) {
  const { colors } = useAppTheme();

  // Find index with highest value as initial selection, or last item
  const initialIndex = useMemo(() => {
    if (points.length === 0) return 0;
    let maxIdx = 0;
    let maxY = -Infinity;
    points.forEach((p, idx) => {
      if (p.y > maxY) {
        maxY = p.y;
        maxIdx = idx;
      }
    });
    return maxY > 0 ? maxIdx : points.length - 1;
  }, [points]);

  const [activeIndex, setActiveIndex] = useState<number>(initialIndex);
  const [containerWidth, setContainerWidth] = useState(300);

  // Sync initialIndex when points array changes
  React.useEffect(() => {
    setActiveIndex(initialIndex);
  }, [initialIndex]);

  const activePoint = points[activeIndex] ?? points[0];

  const { maxY, midY, yTicks } = useMemo(() => {
    if (points.length === 0) return { maxY: 10, midY: 5, yTicks: ['10', '5', '0'] };
    const rawMax = Math.max(...points.map((p) => p.y), 1);
    // Add 10% headroom
    const ceiling = rawMax > 10 ? Math.ceil(rawMax * 1.1) : Math.max(rawMax, 4);
    const mid = Math.round(ceiling / 2);
    return {
      maxY: ceiling,
      midY: mid,
      yTicks: [valueFormat(ceiling), valueFormat(mid), valueFormat(0)],
    };
  }, [points, valueFormat]);

  // X-axis benchmarks
  const xBenchmarks = useMemo(() => {
    const len = points.length;
    if (len <= 7) {
      return points.map((p, idx) => ({ label: String(p.x), index: idx }));
    }
    // 5 benchmarks evenly spaced
    const step = (len - 1) / 4;
    return [0, 1, 2, 3, 4].map((i) => {
      const idx = Math.min(len - 1, Math.round(i * step));
      return { label: String(points[idx]?.x ?? ''), index: idx };
    });
  }, [points]);

  // Skia Path for Line mode
  const { linePath, areaPath, prevLinePath } = useMemo(() => {
    if (viewMode !== 'line' || points.length < 2) return { linePath: null, areaPath: null, prevLinePath: null };
    const width = containerWidth;
    const padY = 8;
    const effH = CANVAS_HEIGHT - padY * 2;
    const stepX = width / (points.length - 1);

    const coords = points.map((p, i) => {
      const normY = Math.max(0, Math.min(1, p.y / maxY));
      return { x: i * stepX, y: padY + (1 - normY) * effH };
    });

    const lPath = Skia.Path.Make();
    const aPath = Skia.Path.Make();

    lPath.moveTo(coords[0].x, coords[0].y);
    aPath.moveTo(coords[0].x, CANVAS_HEIGHT);
    aPath.lineTo(coords[0].x, coords[0].y);

    for (let i = 1; i < coords.length; i++) {
      lPath.lineTo(coords[i].x, coords[i].y);
      aPath.lineTo(coords[i].x, coords[i].y);
    }

    aPath.lineTo(coords[coords.length - 1].x, CANVAS_HEIGHT);
    aPath.close();

    // Previous period line (dashed) — only when prevPoints has matching length
    let pPath: ReturnType<typeof Skia.Path.Make> | null = null;
    if (prevPoints && prevPoints.length >= 2) {
      const prevStepX = width / (prevPoints.length - 1);
      const prevCoords = prevPoints.map((p, i) => {
        const normY = Math.max(0, Math.min(1, p.y / maxY));
        return { x: i * prevStepX, y: padY + (1 - normY) * effH };
      });
      pPath = Skia.Path.Make();
      pPath.moveTo(prevCoords[0].x, prevCoords[0].y);
      for (let i = 1; i < prevCoords.length; i++) {
        pPath.lineTo(prevCoords[i].x, prevCoords[i].y);
      }
    }

    return { linePath: lPath, areaPath: aPath, prevLinePath: pPath };
  }, [points, prevPoints, viewMode, maxY, containerWidth]);

  const dimensionName =
    activeDimension === 'sales'
      ? 'Net Sales'
      : activeDimension === 'orders'
      ? 'Orders'
      : activeDimension === 'views'
      ? 'Store Views'
      : 'Conversion';

  return (
    <View style={styles.container}>
      {/* ── Active Inspection Header Strip ── */}
      <View style={[styles.readoutCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle }]}>
        <View style={styles.readoutLeft}>
          <Text style={[styles.readoutDate, { color: colors.textSecondary }]}>
            {activePoint?.x ?? 'Date'}
          </Text>
          <Text style={[styles.readoutValue, { color: colors.textPrimary }]}>
            {activePoint ? valueFormat(activePoint.y) : '—'} {dimensionName}
          </Text>
        </View>

        {activePoint && activePoint.y === Math.max(...points.map((p) => p.y)) && activePoint.y > 0 ? (
          <View style={[styles.peakBadge, { backgroundColor: colors.brandSubtle }]}>
            <Text style={[styles.peakBadgeText, { color: colors.brand }]}>Period Peak</Text>
          </View>
        ) : null}
      </View>

      {/* ── Main Chart Canvas Area ── */}
      <View style={styles.chartRow}>
        <View
          style={styles.canvasArea}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          {/* Horizontal Guidelines */}
          <View style={[styles.guideline, { top: 0, borderBottomColor: colors.borderSubtle }]} />
          <View style={[styles.guideline, { top: CANVAS_HEIGHT / 2, borderBottomColor: colors.borderSubtle }]} />
          <View style={[styles.guideline, { bottom: 0, borderBottomColor: colors.border }]} />

          {/* Interactive Data Presentation */}
          {viewMode === 'bar' ? (
            <View style={styles.barsContainer}>
              {points.map((p, idx) => {
                const isSelected = idx === activeIndex;
                const ratio = Math.max(0, Math.min(1, p.y / maxY));
                const barHeight = Math.max(3, Math.round(ratio * (CANVAS_HEIGHT - 12)));
                const isZero = p.y === 0;

                return (
                  <Pressable
                    key={idx}
                    style={styles.barColumnHit}
                    onPress={() => {
                      haptics.selection();
                      setActiveIndex(idx);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.x}, ${valueFormat(p.y)}`}
                  >
                    <View
                      style={[
                        styles.barPillar,
                        {
                          height: barHeight,
                          backgroundColor: isSelected
                            ? colors.brand
                            : isZero
                            ? colors.borderSubtle
                            : colors.textPrimary,
                          opacity: isZero && !isSelected ? 0.35 : 1,
                          borderRadius: 2,
                        },
                        isSelected && styles.barPillarSelected,
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            /* Line View Mode */
            <View style={styles.lineContainer}>
              {linePath && areaPath ? (
                <>
                  <Canvas style={{ width: '100%', height: CANVAS_HEIGHT }}>
                    <Path path={areaPath} opacity={0.15}>
                      <LinearGradient
                        start={vec(0, 0)}
                        end={vec(0, CANVAS_HEIGHT)}
                        colors={[colors.brand, 'transparent']}
                      />
                    </Path>
                    <Path
                      path={linePath}
                      color={colors.brand}
                      style="stroke"
                      strokeWidth={2.5}
                    />
                    {prevLinePath ? (
                      <Path
                        path={prevLinePath}
                        color={colors.textMuted}
                        style="stroke"
                        strokeWidth={1.5}
                      >
                        <DashPathEffect intervals={[6, 4]} />
                      </Path>
                    ) : null}
                  </Canvas>
                  {/* Touch overlay for line mode — invisible tap zones */}
                  <View style={styles.lineTouchOverlay}>
                    {points.map((p, idx) => (
                      <Pressable
                        key={idx}
                        style={styles.lineTouchZone}
                        onPress={() => {
                          haptics.selection();
                          setActiveIndex(idx);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${p.x}, ${valueFormat(p.y)}`}
                      />
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          )}
        </View>

        {/* Right Y-Axis Scale Markers */}
        <View style={styles.yAxisColumn}>
          <Text style={[styles.yAxisLabel, { color: colors.textMuted }]}>{yTicks[0]}</Text>
          <Text style={[styles.yAxisLabel, { color: colors.textMuted }]}>{yTicks[1]}</Text>
          <Text style={[styles.yAxisLabel, { color: colors.textMuted }]}>{yTicks[2]}</Text>
        </View>
      </View>

      {/* ── Bottom X-Axis Benchmarks (React Native Text for 100% Reliability) ── */}
      <View style={styles.xAxisRow}>
        {xBenchmarks.map((b, i) => (
          <Text key={i} style={[styles.xAxisLabel, { color: colors.textMuted }]}>
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Space.sm,
  },
  readoutCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.sm,
  },
  readoutLeft: {
    gap: 1,
  },
  readoutDate: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.regular,
  },
  readoutValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  peakBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  peakBadgeText: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.3,
  },

  chartRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  canvasArea: {
    height: CANVAS_HEIGHT,
    position: 'relative',
    flex: 1, // take available space after Y-axis
  },
  guideline: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  yAxisColumn: {
    width: 44,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 0,
    marginLeft: Space.xs,
  },
  yAxisLabel: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },

  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '100%',
    paddingBottom: 2,
  },
  barColumnHit: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 1,
  },
  barPillar: {
    width: '80%',
    maxWidth: 12,
  },
  barPillarSelected: {
    transform: [{ scaleY: 1.05 }],
  },

  lineContainer: {
    width: '100%',
    height: CANVAS_HEIGHT,
    justifyContent: 'flex-end',
  },
  lineTouchOverlay: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  lineTouchZone: {
    flex: 1,
    height: '100%',
  },

  xAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Space.xs,
    paddingTop: 4,
  },
  xAxisLabel: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
});
