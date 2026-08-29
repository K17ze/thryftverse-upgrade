import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { CachedImage } from '../components/CachedImage';
import { useStore } from '../store/useStore';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';
import { fetchSellerAnalytics, fetchTopPerformers, type SellerAnalytics, type TopPerformerListing } from '../services/commerceApi';
import { useConnectivity } from '../hooks/useConnectivity';
import { haptics } from '../utils/haptics';
import { OfflineBanner } from '../components/OfflineBanner';
import { useFeatureFlag, track } from '../analytics';
import { t } from '../i18n';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useA11yAudit } from '../hooks/useA11yAudit';


type NavT = NativeStackNavigationProp<RootStackParamList>;

interface KpiRow {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  sublabel?: string;
}

type Period = '7d' | '30d' | '90d';

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
];

// ── Simple bar chart for listing creation over time ──
// Derived from real listing createdAt timestamps. No fabricated data.
// Shows listings created per day (7d/30d) or per week (90d).
interface ChartBucket {
  label: string;
  count: number;
}

function computeActivityBuckets(listings: ListingApiItem[], period: Period): ChartBucket[] {
  const now = Date.now();
  const buckets: ChartBucket[] = [];

  if (period === '7d') {
    // 7 daily buckets
    const dayMs = 24 * 60 * 60 * 1000;
    for (let i = 6; i >= 0; i--) {
      const dayStart = now - i * dayMs;
      const date = new Date(dayStart);
      const dayLabel = date.toLocaleDateString('en-GB', { weekday: 'short' });
      buckets.push({ label: dayLabel, count: 0 });
    }
    const bucketStart = now - 7 * dayMs;
    for (const l of listings) {
      const created = new Date(l.createdAt).getTime();
      if (!Number.isNaN(created) && created >= bucketStart) {
        const dayIndex = Math.floor((created - bucketStart) / dayMs);
        if (dayIndex >= 0 && dayIndex < 7) {
          buckets[dayIndex].count++;
        }
      }
    }
  } else if (period === '30d') {
    // 30 daily buckets — thin bars
    const dayMs = 24 * 60 * 60 * 1000;
    for (let i = 29; i >= 0; i--) {
      const dayStart = now - i * dayMs;
      const date = new Date(dayStart);
      const dayLabel = date.getDate().toString();
      buckets.push({ label: dayLabel, count: 0 });
    }
    const bucketStart = now - 30 * dayMs;
    for (const l of listings) {
      const created = new Date(l.createdAt).getTime();
      if (!Number.isNaN(created) && created >= bucketStart) {
        const dayIndex = Math.floor((created - bucketStart) / dayMs);
        if (dayIndex >= 0 && dayIndex < 30) {
          buckets[dayIndex].count++;
        }
      }
    }
  } else if (period === '90d') {
    // ~13 weekly buckets
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const numWeeks = 13;
    for (let i = numWeeks - 1; i >= 0; i--) {
      const weekStart = now - i * weekMs;
      const date = new Date(weekStart);
      const weekLabel = `${date.getDate()}/${date.getMonth() + 1}`;
      buckets.push({ label: weekLabel, count: 0 });
    }
    const bucketStart = now - numWeeks * weekMs;
    for (const l of listings) {
      const created = new Date(l.createdAt).getTime();
      if (!Number.isNaN(created) && created >= bucketStart) {
        const weekIndex = Math.floor((created - bucketStart) / weekMs);
        if (weekIndex >= 0 && weekIndex < numWeeks) {
          buckets[weekIndex].count++;
        }
      }
    }
  }

  return buckets;
}

// ── Activity chart component ──
// Simple View-based bar chart. No external library. Uses theme colors.
// Per AGENTS.md §4: flat, no card chrome. Hierarchy from typography.
// Branded bar colour, light grid lines, Y-axis (0 / max) and X-axis labels.
function ActivityChart({ buckets, colors, accessibilitySummary }: { buckets: ChartBucket[]; colors: ThemeColors; accessibilitySummary: string }) {
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const hasData = buckets.some((b) => b.count > 0);
  const isCompact = buckets.length > 10;
  // Grid line positions as fractions of plot height (top → bottom)
  const gridFracs = [1, 0.5, 0];

  if (!hasData) {
    return (
      <View style={chartStyles.emptyWrap}>
        <Ionicons name="bar-chart-outline" size={24} color={colors.textMuted} />
        <Text style={[chartStyles.emptyText, { color: colors.textMuted }]}>
          No listings created in this period
        </Text>
      </View>
    );
  }

  return (
    <View style={chartStyles.container}>
      <Text
        accessibilityLabel={accessibilitySummary}
        accessibilityRole="text"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      />
      {/* Chart area: Y-axis labels + plot */}
      <View style={chartStyles.chartArea}>
        {/* Y-axis labels (max / 0) */}
        <View style={chartStyles.yAxis}>
          <Text style={[chartStyles.yAxisLabel, { color: colors.textMuted }]} numberOfLines={1}>
            {maxCount}
          </Text>
          <Text style={[chartStyles.yAxisLabel, { color: colors.textMuted }]} numberOfLines={1}>
            0
          </Text>
        </View>
        {/* Plot area: grid lines + bars */}
        <View style={chartStyles.plotArea}>
          {/* Horizontal grid lines */}
          {gridFracs.map((frac, i) => (
            <View
              key={i}
              pointerEvents="none"
              style={[
                chartStyles.gridLine,
                { bottom: `${frac * 100}%`, backgroundColor: colors.border, opacity: 0.5 },
              ]}
            />
          ))}
          {/* Bars row */}
          <View style={chartStyles.barsRow}>
            {buckets.map((bucket, i) => {
              const heightPct = (bucket.count / maxCount) * 100;
              return (
                <View key={i} style={chartStyles.barColumn}>
                  <View style={chartStyles.barTrack}>
                    <View
                      style={[
                        chartStyles.bar,
                        {
                          height: `${heightPct}%`,
                          backgroundColor: bucket.count > 0 ? colors.brand : colors.surfaceAlt },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
      {/* X-axis labels — offset to align with plot area */}
      <View style={chartStyles.labelsRow}>
        <View style={chartStyles.yAxisSpacer} />
        <View style={chartStyles.labelsTrack}>
          {buckets.map((bucket, i) => {
            const showLabel = isCompact
              ? i % Math.ceil(buckets.length / 6) === 0 || i === buckets.length - 1
              : true;
            return (
              <View key={i} style={chartStyles.labelColumn}>
                {showLabel && (
                  <Text style={[chartStyles.labelText, { color: colors.textMuted }]} numberOfLines={1}>
                    {bucket.label}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    paddingVertical: Space.sm },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'stretch' },
  yAxis: {
    width: 26,
    height: 80,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: Space.xs },
  yAxisLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.size + 2,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    textAlign: 'right' },
  plotArea: {
    flex: 1,
    height: 80,
    position: 'relative' },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
    gap: Space.xxs },
  barColumn: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end' },
  barTrack: {
    flex: 1,
    justifyContent: 'flex-end' },
  bar: {
    width: '100%',
    borderTopLeftRadius: Radius.sm,
    borderTopRightRadius: Radius.sm,
    minHeight: 2 },
  labelsRow: {
    flexDirection: 'row',
    marginTop: Space.xs - 2 },
  yAxisSpacer: {
    width: 26 },
  labelsTrack: {
    flex: 1,
    flexDirection: 'row',
    gap: Space.xxs },
  labelColumn: {
    flex: 1,
    alignItems: 'center' },
  labelText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  emptyWrap: {
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.lg },
  emptyText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily } });

export default function SellerAnalyticsScreen() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'SellerAnalyticsScreen');
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((s) => s.currentUser);
  const { isOffline } = useConnectivity();
  const { currencyCode, currencySymbol, formatFromFiat } = useFormattedPrice();

  // Feature flag — gates the enhanced Seller Analytics v2 metrics section.
  // Defaults to false (current behaviour) when PostHog is not loaded.
  const sellerAnalyticsV2Enabled = useFeatureFlag('seller_analytics_v2');

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [analytics, setAnalytics] = React.useState<SellerAnalytics | null>(null);
  const [topPerformersData, setTopPerformersData] = React.useState<TopPerformerListing[]>([]);
  const [period, setPeriod] = React.useState<Period>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [partialError, setPartialError] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      setPartialError(false);
      const [listingsRes, analyticsData, topData] = await Promise.all([
        fetchUserListingsFromApi(currentUser.id, { limit: 100 }),
        fetchSellerAnalytics(currentUser.id, period).catch(() => null),
        fetchTopPerformers(currentUser.id, 10).catch(() => [] as TopPerformerListing[]),
      ]);
      setListings(listingsRes.items);
      if (analyticsData) {
        setAnalytics(analyticsData);
      } else {
        // Analytics endpoint failed — surface a partial-error state instead
        // of silently rendering zero KPIs (AGENTS.md §11 — unknown outcome is
        // not success).
        setPartialError(true);
      }
      setTopPerformersData(topData);
      setIsError(false);
    } catch {
      // If the primary listings fetch fails, surface an error state so the
      // user can retry rather than seeing a silently degraded zero-metrics
      // view (AGENTS.md §14 — error state with retry).
      setIsError(true);
    }
  }, [currentUser?.id, period]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    load().finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [load]);

  useEffect(() => { track('seller_dashboard_viewed'); }, []);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  // ── Primary outcome: revenue ──
  // When the analytics API is unavailable we fall back to listing data.
  // Listing rows carry no `soldAt` timestamp, so revenue cannot be honestly
  // filtered to the selected period — show "Unavailable" rather than a
  // cumulative figure dressed up as period revenue (AGENTS.md §11).
  const revenue = useMemo<number | null>(() => {
    if (analytics) return analytics.revenueGbpMinor / 100;
    return null;
  }, [analytics]);

  const itemsSold = useMemo<number | null>(() => {
    if (analytics) return analytics.itemsSold;
    return null;
  }, [analytics]);

  const totalViews = useMemo<number | null>(() => {
    if (analytics) return analytics.totalViews;
    return null;
  }, [analytics]);

  const totalLikes = useMemo<number | null>(() => {
    if (analytics) return analytics.totalLikes;
    return null;
  }, [analytics]);

  // Conversion rate requires period-scoped views. Listing engagement is
  // cumulative (no per-period breakdown), so mixing it with a period sold
  // count would be a truth defect. Show "Unavailable" in fallback.
  const conversionRate = useMemo<number | null>(() => {
    if (!analytics) return null;
    const views = analytics.totalViews;
    const sold = analytics.itemsSold;
    return views > 0 ? (sold / views) * 100 : 0;
  }, [analytics]);

  const avgRating = analytics?.avgRating ?? null;
  const reviewCount = analytics?.reviewCount ?? 0;

  // ── Avg order value ──
  const avgOrderValue = useMemo<number | null>(() => {
    if (revenue == null || itemsSold == null || itemsSold === 0) return null;
    return revenue / itemsSold;
  }, [revenue, itemsSold]);

  // ── Trend indicator ──
  // Per AGENTS.md §11, we do NOT relabel conversion rate as a trend
  // percentage. Real period-over-period delta data is not available from the
  // backend in this build, so we show no trend — only the honest item count.

  // ── Supporting KPIs as flat rows (2-4 max) ──
  const kpiRows = useMemo<KpiRow[]>(() => {
    return [
      { icon: 'checkmark-done', label: 'Items sold', value: itemsSold != null ? String(itemsSold) : 'Unavailable' },
      {
        icon: 'cash-outline',
        label: 'Avg order value',
        value: avgOrderValue != null ? formatFromFiat(avgOrderValue, currencyCode) : 'Unavailable' },
      { icon: 'trending-up-outline', label: 'Conversion', value: conversionRate != null ? `${conversionRate.toFixed(1)}%` : 'Unavailable' },
      { icon: 'eye-outline', label: 'Views', value: totalViews != null ? String(totalViews) : 'Unavailable' },
    ];
  }, [itemsSold, avgOrderValue, conversionRate, totalViews, formatFromFiat]);

  // ── Top listings — enriched with imageUrl from listings data ──
  const topPerformers = useMemo(() => {
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    if (topPerformersData.length > 0) {
      return topPerformersData.map((t) => {
        const listing = listingMap.get(t.id);
        return {
          id: t.id,
          title: t.title,
          price: t.priceGbpMinor / 100,
          views: t.viewsCount,
          likes: t.likesCount,
          status: t.status,
          imageUrl: listing?.imageUrl ?? listing?.images?.[0] ?? null };
      });
    }
    return [...listings]
      .sort((a, b) => (b.engagement?.views ?? 0) - (a.engagement?.views ?? 0))
      .slice(0, 10)
      .map((l) => ({
        id: l.id,
        title: l.title,
        price: l.priceGbp,
        views: l.engagement?.views ?? 0,
        likes: l.engagement?.likes ?? 0,
        status: l.status,
        imageUrl: l.imageUrl ?? l.images?.[0] ?? null }));
  }, [listings, topPerformersData]);

  // ── Activity chart data ──
  // Derived from real listing createdAt timestamps. Shows listings created
  // per day (7d/30d) or per week (90d). No fabricated data.
  const activityBuckets = useMemo(() => computeActivityBuckets(listings, period), [listings, period]);

  const activityChartSummary = useMemo(() => {
    const counts = activityBuckets.map((b) => b.count);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const total = counts.reduce((sum, c) => sum + c, 0);
    const periodDesc = period === '7d' ? '7 days' : period === '30d' ? '30 days' : '90 days';
    return `Listings created chart over ${periodDesc}. ${total} listings created. Highest: ${max}, lowest: ${min}.`;
  }, [activityBuckets, period]);

  // ── Needs attention: active listings with low views and no sales ──
  const needsAttention = useMemo(() => {
    return listings
      .filter((l) => l.status === 'active')
      .filter((l) => (l.engagement?.views ?? 0) < 10)
      .sort((a, b) => (a.engagement?.views ?? 0) - (b.engagement?.views ?? 0))
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        title: l.title,
        price: l.priceGbp,
        views: l.engagement?.views ?? 0,
        likes: l.engagement?.likes ?? 0,
        status: l.status,
        imageUrl: l.imageUrl ?? l.images?.[0] ?? null }));
  }, [listings]);

  const periodLabel = period === '7d' ? '7 days' : period === '30d' ? '30 days' : '90 days';

  const handleListingPress = useCallback((listingId: string) => {
    navigation.navigate('ItemDetail', { itemId: listingId });
  }, [navigation]);

  if (isLoading) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Analytics" onBack={() => navigation.goBack()} />}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Hero skeleton */}
          <View style={{ height: Space.md }} />
          <View style={{ backgroundColor: colors.surfaceAlt, height: 13, width: '40%', borderRadius: Radius.sm }} />
          <View style={{ height: Space.xs }} />
          <View style={{ backgroundColor: colors.surfaceAlt, height: 32, width: '55%', borderRadius: Radius.sm }} />
          <View style={{ height: Space.xs }} />
          <View style={{ backgroundColor: colors.surfaceAlt, height: 14, width: '30%', borderRadius: Radius.sm }} />
          {/* Period selector skeleton */}
          <View style={{ height: Space.lg }} />
          <View style={{ flexDirection: 'row', gap: Space.xs }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ backgroundColor: colors.surfaceAlt, height: 32, flex: 1, borderRadius: Radius.full }} />
            ))}
          </View>
          {/* KPI rows skeleton */}
          <View style={{ height: Space.md }} />
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonKpiRow}>
              <View style={{ backgroundColor: colors.surfaceAlt, height: 14, width: '35%', borderRadius: Radius.sm }} />
              <View style={{ flex: 1 }} />
              <View style={{ backgroundColor: colors.surfaceAlt, height: 16, width: 60, borderRadius: Radius.sm }} />
            </View>
          ))}
          {/* Top listings skeleton */}
          <View style={{ height: Space.lg }} />
          <View style={{ backgroundColor: colors.surfaceAlt, height: 14, width: '40%', borderRadius: Radius.sm }} />
          <View style={{ height: Space.sm }} />
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ backgroundColor: colors.surfaceAlt, width: 48, height: 48, borderRadius: Radius.sm }} />
              <View style={{ flex: 1, gap: Space.xs }}>
                <View style={{ backgroundColor: colors.surfaceAlt, height: 14, width: '60%', borderRadius: Radius.sm }} />
                <View style={{ backgroundColor: colors.surfaceAlt, height: 11, width: '35%', borderRadius: Radius.sm }} />
              </View>
              <View style={{ backgroundColor: colors.surfaceAlt, height: 16, width: 50, borderRadius: Radius.sm }} />
            </View>
          ))}
        </ScrollView>
      </FlagshipScreen>
    );
  }

  // ── Error state — primary listings fetch failed; offer retry (AGENTS.md §14) ──
  if (isError && listings.length === 0) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Analytics" onBack={() => navigation.goBack()} />}
      >
        <EmptyState
          icon="cloud-offline-outline"
          iconColor={colors.danger}
          title="Couldn't load analytics"
          subtitle="We couldn't load your seller data. Check your connection and try again."
          ctaLabel="Retry"
          onCtaPress={() => { setIsError(false); setIsLoading(true); void load().finally(() => setIsLoading(false)); }}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      ref={a11yRef}
      header={<FlagshipHeader title="Seller Analytics" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {isOffline ? (
        <OfflineBanner onRetry={() => void onRefresh()} />
      ) : null}
      {partialError ? (
        <View style={{ paddingHorizontal: Space.md, paddingVertical: Space.sm, backgroundColor: colors.surfaceAlt }}>
          <Text style={{ fontSize: TypographyV2.meta.size, color: colors.textMuted, lineHeight: TypographyV2.meta.lineHeight }}>
            Analytics details couldn't be loaded — showing listing data only. Pull to retry.
          </Text>
        </View>
      ) : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* ── Primary outcome: revenue hero ── */}
        <View style={styles.heroBlock}>
          <Text style={[styles.heroEyebrow, { color: colors.textMuted }]}>Revenue · Last {periodLabel}</Text>
          <Text style={[styles.heroValue, { color: colors.textPrimary }]}>
            {revenue != null ? formatFromFiat(revenue, currencyCode) : 'Unavailable'}
          </Text>
          <View style={styles.heroTrendRow}>
            <Ionicons
              name={itemsSold != null && itemsSold > 0 ? 'checkmark-circle-outline' : 'remove'}
              size={14}
              color={itemsSold != null && itemsSold > 0 ? colors.success : colors.textMuted}
            />
            <Text style={[styles.heroTrendText, { color: itemsSold != null && itemsSold > 0 ? colors.success : colors.textMuted }]}>
              {itemsSold != null
                ? itemsSold > 0
                  ? `${itemsSold} ${itemsSold === 1 ? 'item sold' : 'items sold'}`
                  : 'No sales yet'
                : 'Unavailable'}
            </Text>
          </View>
        </View>

        {/* ── Period selector — segmented control (7d / 30d / 90d) ── */}
        <View style={styles.periodSegmentRow}>
          {PERIOD_OPTIONS.map((opt) => {
            const isActive = period === opt.key;
            return (
              <Pressable
                key={opt.key}
                style={[
                  styles.periodSegment,
                  isActive && { backgroundColor: colors.brand },
                ]}
                onPress={() => { haptics.tap(); setPeriod(opt.key); setIsLoading(true); }}
                accessibilityRole="button"
                accessibilityLabel={`Period: ${opt.label}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.periodSegmentText, isActive && { color: colors.textInverse }]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Listings created chart ──
            Simple bar chart derived from real listing createdAt timestamps.
            Shows listings created per day/week depending on the selected
            period. No fabricated data — only real listings. */}
        <View style={styles.chartSection}>
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: colors.textSecondary }]}>
              Listings created
            </Text>
            <Text style={[styles.chartSubtitle, { color: colors.textMuted }]}>
              {activityBuckets.reduce((sum, b) => sum + b.count, 0)} created
            </Text>
          </View>
          <ActivityChart buckets={activityBuckets} colors={colors} accessibilitySummary={activityChartSummary} />
        </View>

        {/* ── Supporting KPIs as flat rows ── */}
        <View style={styles.kpiList}>
          {kpiRows.map((kpi) => (
            <View key={kpi.label} style={styles.kpiRow}>
              <View style={styles.kpiLabelCol}>
                <Ionicons name={kpi.icon} size={16} color={colors.textSecondary} />
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>{kpi.label}</Text>
              </View>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{kpi.value}</Text>
            </View>
          ))}
        </View>

        {/* ── Seller Analytics v2 — enhanced metrics (gated by feature flag) ──
            Additive section: engagement ratio + active inventory count. When
            the flag is off this section is absent (current behaviour). */}
        {sellerAnalyticsV2Enabled ? (
          <View style={styles.v2Section}>
            <View style={styles.v2Header}>
              <Ionicons name="sparkles" size={14} color={colors.brand} />
              <Text style={[styles.v2HeaderTitle, { color: colors.textPrimary }]}>Engagement insights</Text>
            </View>
            <View style={styles.kpiList}>
              <View style={styles.kpiRow}>
                <View style={styles.kpiLabelCol}>
                  <Ionicons name="heart-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Like-to-view ratio</Text>
                </View>
                <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                  {totalViews != null && totalLikes != null && totalViews > 0 ? `${((totalLikes / totalViews) * 100).toFixed(1)}%` : 'Unavailable'}
                </Text>
              </View>
              <View style={styles.kpiRow}>
                <View style={styles.kpiLabelCol}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Active listings</Text>
                </View>
                <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                  {listings.filter((l) => l.status === 'active').length}
                </Text>
              </View>
              <View style={styles.kpiRow}>
                <View style={styles.kpiLabelCol}>
                  <Ionicons name="star-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Avg rating</Text>
                </View>
                <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                  {avgRating != null ? `${avgRating.toFixed(1)}${reviewCount > 0 ? ` (${reviewCount})` : ''}` : '—'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ── Top listings — media-first rows with hairline dividers ── */}
        <View>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Top listings</Text>
          </View>
          {topPerformers.length > 0 ? (
            <View style={styles.topListingsList}>
              {topPerformers.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.topListingRow,
                    { borderBottomColor: colors.border },
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={() => handleListingPress(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Listing: ${item.title}, ${item.views} views, ${currencySymbol}${item.price.toFixed(0)} revenue`}
                >
                  <View style={[styles.topListingThumb, { backgroundColor: colors.surfaceAlt }]}>
                    {item.imageUrl ? (
                      <CachedImage
                        uri={item.imageUrl}
                        style={styles.topListingThumbImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.topListingThumbPlaceholder}>
                        <Ionicons name="image-outline" size={18} color={colors.textMuted} />
                      </View>
                    )}
                  </View>
                  <View style={styles.topListingInfo}>
                    <Text style={[styles.topListingRowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.topListingRowMeta, { color: colors.textMuted }]}>
                      {item.views} views · {item.likes} likes
                    </Text>
                  </View>
                  <Text style={[styles.topListingRowPrice, { color: colors.brand }]}>
                    {currencySymbol}{item.price.toFixed(0)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="bar-chart-outline"
              title="No performance data yet"
              subtitle="Listings with views will appear here"
            />
          )}
        </View>

        {/* ── Needs attention — flat rows with images ── */}
        {needsAttention.length > 0 ? (
          <View>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.warning} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Needs attention</Text>
              </View>
              <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Low views, no sales</Text>
            </View>
            <View style={styles.listingList}>
              {needsAttention.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.attentionRow,
                    { borderBottomColor: colors.border },
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={() => handleListingPress(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Needs attention: ${item.title}, ${item.views} views, ${currencySymbol}${item.price.toFixed(0)}`}
                >
                  <View style={[styles.attentionImageWrap, { backgroundColor: colors.surfaceAlt }]}>
                    {item.imageUrl ? (
                      <CachedImage
                        uri={item.imageUrl}
                        style={styles.attentionImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.attentionImagePlaceholder}>
                        <Ionicons name="image-outline" size={14} color={colors.textMuted} />
                      </View>
                    )}
                  </View>
                  <View style={styles.attentionInfo}>
                    <Text style={[styles.attentionTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.attentionIssue, { color: colors.warning }]}>
                      {item.views} views — low visibility
                    </Text>
                  </View>
                  <Text style={[styles.attentionPrice, { color: colors.textSecondary }]}>
                    {currencySymbol}{item.price.toFixed(0)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl },

    // ── Primary outcome hero ──
    heroBlock: {
      paddingVertical: Space.md },
    heroEyebrow: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginBottom: Space.xs - 2 },
    heroValue: {
      fontSize: TypographyV2.priceHero.size,
      lineHeight: TypographyV2.priceHero.lineHeight,
      fontFamily: TypographyV2.priceHero.fontFamily,
      fontVariant: ['tabular-nums'] },
    heroTrendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs },
    heroTrendText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'] },

    // ── Period selector — segmented control ──
    periodSegmentRow: {
      flexDirection: 'row',
      gap: Space.xs,
      marginVertical: Space.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      padding: Space.xxs },
    periodSegment: {
      flex: 1,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.chrome },
    periodSegmentText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },

    // ── Activity chart section ──
    chartSection: {
      marginTop: Space.sm,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    chartHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: Space.xs },
    chartTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    chartSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'] },

    // ── KPI flat rows ──
    kpiList: {
      marginTop: Space.sm },
    // ── Seller Analytics v2 — engagement insights section ──
    v2Section: {
      marginTop: Space.lg,
      paddingTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border },
    v2Header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs },
    v2HeaderTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    kpiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    kpiLabelCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2 },
    kpiLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    kpiValue: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'] },

    // ── Section headers ──
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Space.lg,
      marginBottom: Space.sm },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily },
    sectionHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },

    // ── Top listings — media-first rows with hairline dividers ──
    topListingsList: {
      gap: 0 },
    topListingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth },
    topListingThumb: {
      width: 48,
      height: 48,
      borderRadius: Radius.sm,
      overflow: 'hidden' },
    topListingThumbImage: {
      width: '100%',
      height: '100%' },
    topListingThumbPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center' },
    topListingInfo: {
      flex: 1,
      gap: Space.xs - 2 },
    topListingRowTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    topListingRowMeta: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'] },
    topListingRowPrice: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'] },

    // ── Needs attention — flat rows with images ──
    listingList: {
      gap: 0 },
    attentionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth },
    attentionImageWrap: {
      width: 40,
      height: 40,
      borderRadius: Radius.sm,
      overflow: 'hidden' },
    attentionImage: {
      width: '100%',
      height: '100%' },
    attentionImagePlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center' },
    attentionInfo: {
      flex: 1,
      gap: Space.xs - 2 },
    attentionTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    attentionIssue: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    attentionPrice: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      fontVariant: ['tabular-nums'] },

    // ── Skeleton ──
    skeletonKpiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2 } });
}
