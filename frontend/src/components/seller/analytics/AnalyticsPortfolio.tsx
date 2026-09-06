import React from 'react';
import { View, Text } from 'react-native';
import { FlagshipMetricLine } from '../../flagship';
import type { SellerAnalyticsModel } from './useSellerAnalytics';

export function AnalyticsPortfolio({ model }: { model: SellerAnalyticsModel }) {
  const {
    styles,
    colors,
    funnelPipeline,
    funnelBottleneck,
    conversionRate,
    peerConversionBenchmark,
    periodLabel,
    categoryMix,
    listings,
    formatFromFiat,
    activeListings,
    avgRating,
    reviewCount,
    analytics,
    aovValue,
    repeatBuyerRate,
  } = model;

  return (
    <>
      {/* ── Conversion Funnel — flat metric rows ── */}
      {funnelPipeline && funnelPipeline.stages.some((s) => s.value > 0) ? (
        <View style={styles.funnelSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Conversion journey</Text>
            <Text style={[styles.sectionSubtitleMuted, { color: colors.textMuted }]}>
              {periodLabel} aggregate
            </Text>
          </View>

          <View style={styles.funnelList}>
            {funnelPipeline.stages.map((stage, idx) => {
              const prevValue = idx > 0 ? funnelPipeline.stages[idx - 1].value : stage.value;
              const stepConversion = idx > 0 && prevValue > 0 ? Math.round((stage.value / prevValue) * 100) : null;
              return (
                <FlagshipMetricLine
                  key={stage.id}
                  label={stage.label}
                  value={stepConversion != null ? `${stage.value.toLocaleString()} · ${stepConversion}%` : stage.value.toLocaleString()}
                  separated={idx > 0}
                />
              );
            })}
          </View>

          {/* ── Funnel Bottleneck Lever & Peer Benchmark (Shopify 2026 Mobile) ── */}
          {funnelBottleneck ? (
            <View style={[styles.bottleneckCard, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
              <View style={styles.bottleneckHeaderRow}>
                <Text style={[styles.bottleneckTitle, { color: colors.textPrimary }]}>
                  Conversion lever: {funnelBottleneck.stageFrom} → {funnelBottleneck.stageTo}
                </Text>
                <Text style={[styles.bottleneckDrop, { color: colors.danger }]}>
                  {funnelBottleneck.dropOffPct}% drop
                </Text>
              </View>
              <Text style={[styles.bottleneckRec, { color: colors.textSecondary }]}>
                {funnelBottleneck.recommendation}
              </Text>
            </View>
          ) : null}

          {conversionRate != null ? (
            <View style={styles.benchmarkRow}>
              <Text style={[styles.benchmarkLabel, { color: colors.textMuted }]}>
                Store conversion: <Text style={{ color: colors.textPrimary }}>{conversionRate.toFixed(1)}%</Text> · Top 20% peer benchmark: {peerConversionBenchmark}%
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Category & Portfolio Mix ── */}
      {categoryMix.length > 0 ? (
        <View style={styles.categorySection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Inventory category mix</Text>
            <Text style={[styles.sectionSubtitleMuted, { color: colors.textMuted }]}>
              {listings.length} pieces listed
            </Text>
          </View>

          {/* Proportional Segmented Bar */}
          <View style={[styles.categoryBarTrack, { backgroundColor: colors.surfaceAlt }]}>
            {categoryMix.map((cat) => (
              <View
                key={cat.category}
                style={{
                  width: `${cat.pct}%`,
                  height: '100%',
                  backgroundColor: cat.color,
                }}
              />
            ))}
          </View>

          {/* Category Legend Grid */}
          <View style={styles.categoryGrid}>
            {categoryMix.map((cat) => (
              <View key={cat.category} style={styles.categoryRow}>
                <View style={styles.categoryLeft}>
                  <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                  <Text style={[styles.categoryName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {cat.category}
                  </Text>
                </View>
                <View style={styles.categoryRight}>
                  <Text style={[styles.categoryCount, { color: colors.textMuted }]}>
                    {cat.count} {cat.count === 1 ? 'piece' : 'pieces'} · {cat.pct}%
                  </Text>
                  <Text style={[styles.categoryValue, { color: colors.textPrimary }]}>
                    {formatFromFiat(cat.totalGbp, 'GBP', { displayMode: 'fiat' })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── Key Performance Metrics (Audit & Ratings) ── */}
      <View style={styles.kpiList}>
        <View style={styles.kpiRow}>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Active listings</Text>
          <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
            {activeListings != null ? String(activeListings) : String(listings.length)}
          </Text>
        </View>
        {aovValue != null && aovValue > 0 ? (
          <View style={styles.kpiRow}>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Average order value (AOV)</Text>
            <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
              {formatFromFiat(aovValue, 'GBP', { displayMode: 'fiat' })}
            </Text>
          </View>
        ) : null}
        {repeatBuyerRate != null && repeatBuyerRate > 0 ? (
          <View style={styles.kpiRow}>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Repeat buyer orders</Text>
            <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
              {`${repeatBuyerRate}%`}
            </Text>
          </View>
        ) : null}
        {avgRating != null ? (
          <View style={styles.kpiRow}>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Merchant rating</Text>
            <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
              {avgRating.toFixed(1)} ★ {reviewCount > 0 ? `(${reviewCount} reviews)` : ''}
            </Text>
          </View>
        ) : null}
        {analytics?.responseRate != null ? (
          <View style={styles.kpiRow}>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Inquiry response rate</Text>
            <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
              {`${Math.round(analytics.responseRate)}%`}
            </Text>
          </View>
        ) : null}
        {analytics?.shipWithinDays != null ? (
          <View style={styles.kpiRow}>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Dispatch time</Text>
            <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
              {analytics.shipWithinDays <= 1 ? 'Within 24h' : `${analytics.shipWithinDays} days`}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );
}
