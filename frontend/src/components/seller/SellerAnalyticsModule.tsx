/**
 * SellerAnalyticsModule — the Analytics pillar of the Seller Hub overview.
 *
 * A flat, typographically-structured module: header row, 30-day net sales
 * with order metadata and period trend, and a real sparkline of daily
 * store views (traffic). The whole module is a single pressable that opens
 * the full analytics screen.
 *
 * Truth rules: null data renders an em dash or the element is omitted —
 * no fabricated zeros, no fake trends, no empty-state chrome. A flat
 * trend (|pct| < 0.5) reads as neutral "Flat", never green.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { LineChart } from '../charts/LineChart';
import type { ChartSeries } from '../charts/types';

export interface SellerSparklinePoint {
  /** ISO date (YYYY-MM-DD) for the daily value. */
  date: string;
  /** Daily store views (traffic) for that day. */
  value: number;
}

export interface SellerAnalyticsModuleProps {
  /** 30-day net sales in GBP. Null when the seller has no sales data yet. */
  netSalesGbp: number | null;
  /** Percent change vs the previous 30 days. Null when unknown — renders nothing. */
  trendPct: number | null | undefined;
  /** Orders in the trailing 30 days. Null when unknown. */
  orders30d: number | null;
  /** Data completeness — 'partial' appends a partial-data note to the meta line. */
  completeness: 'complete' | 'partial' | null;
  /** Daily store-view points for the traffic sparkline. Fewer than 2 points renders no chart. */
  sparkline: SellerSparklinePoint[] | null;
  /** True while the sparkline series is loading — renders the chart skeleton. */
  isSparklineLoading?: boolean;
  /** Daily-views fetch rejected — the host renders an inline retry; suppress the no-data note. */
  isSparklineFailed?: boolean;
  /** Money formatter from the host screen; must handle null/undefined. */
  formatMoney: (value: number | null | undefined) => string;
  /** Opens the full analytics screen. */
  onPress: () => void;
}

/**
 * Direction label for the 30-day trend. Flat (|pct| < 0.5) is neutral
 * textMuted — a flat period is not a win. Non-finite values are unknown.
 */
function trendLabel(pct: number | null | undefined): { text: string; direction: 'up' | 'down' | 'flat' } | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (Math.abs(pct) < 0.5) return { text: 'Flat', direction: 'flat' };
  return {
    text: `${pct > 0 ? '+' : '-'}${Math.abs(Math.round(pct))}%`,
    direction: pct > 0 ? 'up' : 'down',
  };
}

export const SellerAnalyticsModule: React.FC<SellerAnalyticsModuleProps> = ({
  netSalesGbp,
  trendPct,
  orders30d,
  completeness,
  sparkline,
  isSparklineLoading = false,
  isSparklineFailed = false,
  formatMoney,
  onPress,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  const trend = trendLabel(trendPct);

  const metaParts: string[] = [];
  if (orders30d != null) {
    metaParts.push(`${orders30d} order${orders30d === 1 ? '' : 's'}`);
  }
  if (completeness === 'partial') {
    metaParts.push('partial data');
  }
  const metaLine = metaParts.join(' · ');

  const sparklineSeries: ChartSeries[] | null =
    sparkline && sparkline.length >= 2
      ? [{ data: sparkline.map((p) => ({ x: p.date, y: p.value })), color: colors.brand }]
      : null;

  const trendColor =
    trend == null || trend.direction === 'flat'
      ? colors.textMuted
      : trend.direction === 'up'
      ? colors.success
      : colors.danger;

  return (
    <AnimatedPressable
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      scaleValue={0.985}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`Analytics, 30-day net ${
        netSalesGbp == null ? 'unavailable' : formatMoney(netSalesGbp)
      }${orders30d != null ? `, ${orders30d} order${orders30d === 1 ? '' : 's'}` : ''}, open full analytics`}
      accessibilityHint="Opens the full analytics screen"
    >
      <View style={styles.headerRow}>
        <AppIcon concept="trending" size={IconSize.xs} color="textSecondary" opticalCenter accessible={false} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Analytics</Text>
        <AppIcon concept="forward" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.netSalesCol}>
          <Text
            style={[styles.netSales, { color: netSalesGbp == null ? colors.textMuted : colors.textPrimary }]}
          >
            {netSalesGbp == null ? '—' : formatMoney(netSalesGbp)}
          </Text>
          {metaLine !== '' && (
            <Text style={[styles.meta, { color: colors.textMuted }]}>{metaLine}</Text>
          )}
        </View>
        {trend && (
          <Text style={[styles.trend, { color: trendColor }]}>{trend.text}</Text>
        )}
      </View>

      {isSparklineLoading ? (
        <LineChart
          data={[]}
          height={96}
          variant="flat"
          loading={true}
          showGrid={false}
          showCrosshair={false}
        />
      ) : sparklineSeries ? (
        <LineChart
          data={sparklineSeries}
          height={96}
          variant="flat"
          showGrid={false}
          showFrame={false}
          showCrosshair={false}
          showAreaFill={true}
          showPoints={false}
          padding={{ top: 4, right: 4, bottom: 4, left: 4 }}
          yAxisFormat={() => ''}
          xAxisFormat={() => ''}
          accessibilitySummary={`Daily store views across ${sparklineSeries[0].data.length} days`}
        />
      ) : isSparklineFailed ? null : (
        <Text style={[styles.noTraffic, { color: colors.textMuted }]}>
          Not enough views yet for a chart
        </Text>
      )}
    </AnimatedPressable>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginTop: Space.lg,
      marginHorizontal: Space.md,
      minHeight: Control.hit,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    title: {
      flex: 1,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      fontFamily: FontFamily.bold,
    },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginTop: Space.sm,
    },
    netSalesCol: {
      flex: 1,
      gap: Space.xxs,
    },
    netSales: {
      fontSize: TypographyV2.priceList.size,
      lineHeight: TypographyV2.priceList.lineHeight,
      letterSpacing: TypographyV2.priceList.letterSpacing,
      fontFamily: FontFamily.bold,
      fontVariant: ['tabular-nums'],
    },
    meta: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontFamily: FontFamily.medium,
      fontVariant: ['tabular-nums'],
    },
    trend: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontFamily: FontFamily.bold,
      fontVariant: ['tabular-nums'],
    },
    noTraffic: {
      marginTop: Space.sm,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontFamily: FontFamily.regular,
    },
  });
}
