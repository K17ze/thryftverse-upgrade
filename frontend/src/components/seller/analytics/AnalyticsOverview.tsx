import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { AppIcon } from '../../common/AppIcon';
import { AnimatedNumber } from '../../common/AnimatedNumber';
import { Sparkline } from '../../charts/Sparkline';
import { Control } from '../../../theme/designTokens';
import { IconSize } from '../../../theme/iconTokens';
import { FlagshipMetricLine } from '../../flagship';
import { AnalyticsTrajectoryChart } from './AnalyticsTrajectoryChart';
import { haptics } from '../../../utils/haptics';
import type { SellerAnalyticsModel } from './useSellerAnalytics';

export function AnalyticsOverview({ model }: { model: SellerAnalyticsModel }) {
 const { styles, colors, heroLabel, heroValue, revenueDelta, prevRevenueGbp, periodLabel, formatFromFiat, activeDimension, handleDimensionChange, itemsSold, avgOrderValue, totalViews, periodDays, conversionRate, dimensionChartData, chartViewMode, setChartViewMode, chartSeries, salesSparklineValues } = model;
 return (<>
            {/* ── Dominant metric: Net Sales (flat, no card) ── */}
            <View style={styles.heroMetricWrap}>
              <Text style={[styles.heroMetricLabel, { color: colors.textSecondary }]}>
                {heroLabel}
              </Text>
              <View style={styles.heroMetricRow}>
                {heroValue != null ? (
                  <AnimatedNumber
                    value={heroValue}
                    format={(v) => formatFromFiat(v, 'GBP', { displayMode: 'fiat' })}
                    style={[styles.heroMetricValue, { color: colors.textPrimary }]}
                  />
                ) : (
                  <Text style={[styles.heroMetricValue, { color: colors.textPrimary }]}>—</Text>
                )}
                {revenueDelta != null && revenueDelta !== 0 ? (
                  <View style={[
                    styles.heroDeltaPill,
                    { backgroundColor: revenueDelta > 0 ? colors.successSubtle : colors.dangerSubtle },
                  ]}>
                    <Text style={[
                      styles.heroDeltaText,
                      { color: revenueDelta > 0 ? colors.success : colors.danger },
                    ]}>
                      {revenueDelta > 0 ? '+' : ''}{revenueDelta.toFixed(0)}%
                    </Text>
                  </View>
                ) : null}
                {salesSparklineValues.length >= 2 ? (
                  <View style={styles.heroSparkline}>
                    <Sparkline values={salesSparklineValues} width={72} height={28} />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.heroMetricSub, { color: colors.textMuted }]}>
                {prevRevenueGbp != null ? `Prev ${formatFromFiat(prevRevenueGbp, 'GBP', { displayMode: 'fiat' })}` : `Last ${periodLabel}`}
              </Text>
            </View>

            {/* ── Dimension selector tabs ── */}
            <View style={styles.dimensionTabRow}>
              {([
                { key: 'sales', label: 'Sales' },
                { key: 'orders', label: 'Orders' },
                { key: 'views', label: 'Views' },
                { key: 'conversion', label: 'Conversion' },
              ] as const).map((dim) => {
                const isActive = activeDimension === dim.key;
                return (
                  <Pressable
                    key={dim.key}
                    style={({ pressed }) => [styles.dimensionTab, { minHeight: Control.hit }, pressed && { opacity: 0.6 }]}
                    onPress={() => handleDimensionChange(dim.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${dim.label} analytics`}
                    accessibilityState={{ selected: isActive }}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <Text
                      style={[
                        styles.dimensionTabText,
                        { color: isActive ? colors.textPrimary : colors.textMuted },
                        isActive && styles.dimensionTabTextActive,
                      ]}
                    >
                      {dim.label}
                    </Text>
                    {isActive ? (
                      <View style={[styles.dimensionTabIndicator, { backgroundColor: colors.textPrimary }]} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {/* ── Interactive Chart Section ── */}
            <View style={styles.chartSection}>
              {/* Chart Header Toolbar */}
              <View style={styles.chartToolbar}>
                <View style={styles.chartTitleBlock}>
                  <Text style={[styles.chartActiveTitle, { color: colors.textPrimary }]}>
                    {activeDimension === 'sales'
                      ? 'Net Sales Trajectory'
                      : activeDimension === 'orders'
                      ? 'Order Volume'
                      : activeDimension === 'views'
                      ? 'Store Traffic'
                      : 'Conversion Trajectory'}
                  </Text>
                  {dimensionChartData.peakText ? (
                    <Text style={[styles.chartPeakSubtitle, { color: colors.textMuted }]}>
                      {dimensionChartData.peakText}
                      {dimensionChartData.avgText ? ` · ${dimensionChartData.avgText}` : ''}
                    </Text>
                  ) : null}
                </View>

                {/* Mode Selector (Bar vs Line) */}
                <View style={[styles.chartViewToggle, { backgroundColor: colors.surfaceAlt }]}>
                  <Pressable
                    style={[
                      styles.chartViewToggleBtn,
                      { minHeight: Control.hit },
                      chartViewMode === 'bar' && [styles.chartViewToggleBtnActive, { backgroundColor: colors.surfaceElevated }],
                    ]}
                    onPress={() => {
                      haptics.tap();
                      setChartViewMode('bar');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Bar Chart"
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <AppIcon
                      name="bar-chart-outline"
                      size={IconSize.xs}
                      color={chartViewMode === 'bar' ? 'textPrimary' : 'textMuted'}
                      opticalCenter
                      accessible={false}
                    />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.chartViewToggleBtn,
                      { minHeight: Control.hit },
                      chartViewMode === 'line' && [styles.chartViewToggleBtnActive, { backgroundColor: colors.surfaceElevated }],
                    ]}
                    onPress={() => {
                      haptics.tap();
                      setChartViewMode('line');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Line Chart"
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <AppIcon
                      name="pulse-outline"
                      size={IconSize.xs}
                      color={chartViewMode === 'line' ? 'textPrimary' : 'textMuted'}
                      opticalCenter
                      accessible={false}
                    />
                  </Pressable>
                </View>
              </View>

              {/* Chart Canvas */}
              {dimensionChartData.currentPoints.length > 0 ? (
                <View style={styles.chartWrapper}>
                  <AnalyticsTrajectoryChart
                    points={dimensionChartData.currentPoints}
                    prevPoints={dimensionChartData.prevPoints}
                    viewMode={chartViewMode}
                    valueFormat={dimensionChartData.valueFormat}
                    activeDimension={activeDimension}
                    periodLabel={periodLabel}
                  />

                  {chartSeries.length > 1 && chartViewMode === 'line' ? (
                    <View style={styles.chartLegend}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: colors.brand }]} />
                        <Text style={[styles.legendText, { color: colors.textMuted }]}>This {periodLabel}</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: colors.textMuted }]} />
                        <Text style={[styles.legendText, { color: colors.textMuted }]}>Previous period</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={styles.chartEmpty}>
                  <AppIcon
                    concept="analytics"
                    size={IconSize.lg}
                    color="textMuted"
                    accessible={false}
                  />
                  <Text style={[styles.chartEmptyText, { color: colors.textMuted }]}>
                    {activeDimension === 'sales'
                      ? 'No activity recorded in this period'
                      : 'No daily breakdown available for this period'}
                  </Text>
                </View>
              )}
            </View>

            {/* ── Secondary metrics — flat lines, no cards ── */}
            <View style={styles.metricsSection}>
              <FlagshipMetricLine
                label="Orders"
                value={itemsSold != null ? String(itemsSold) : '—'}
                subLabel={avgOrderValue != null ? `AOV ${formatFromFiat(avgOrderValue, 'GBP', { displayMode: 'fiat' })}` : undefined}
                separated
              />
              <FlagshipMetricLine
                label="Views"
                value={totalViews != null ? totalViews.toLocaleString() : '—'}
                subLabel={totalViews != null ? `~${Math.round(totalViews / periodDays)}/day` : undefined}
                separated
              />
              <FlagshipMetricLine
                label="Conversion rate"
                value={conversionRate != null ? `${conversionRate.toFixed(1)}%` : '—'}
                subLabel={itemsSold && totalViews ? `${itemsSold} / ${totalViews}` : undefined}
                separated
              />
            </View>


 </>);
}
