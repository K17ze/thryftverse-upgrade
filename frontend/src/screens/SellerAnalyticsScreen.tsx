import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, LayoutChangeEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Control, PressScale } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useStore } from '../store/useStore';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';
import {
  fetchSellerAnalytics,
  fetchTopPerformers,
  fetchDailyBreakdown,
  type SellerAnalytics,
  type TopPerformerListing,
  type DailyBreakdownPoint,
} from '../services/commerceApi';
import { useConnectivity } from '../hooks/useConnectivity';
import { haptics } from '../utils/haptics';
import { OfflineBanner } from '../components/OfflineBanner';
import { track, trackRaw } from '../analytics';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { useAppTranslation } from '../i18n/useAppTranslation';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { openShareSheet } from '../platform/share/shareSheet';

type NavT = NativeStackNavigationProp<RootStackParamList>;

type Period = '7d' | '30d' | '90d';

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
];

export default function SellerAnalyticsScreen() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'SellerAnalyticsScreen');
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((s) => s.currentUser);
  const { isOffline } = useConnectivity();
  const { currencyCode, currencySymbol, formatFromFiat } = useFormattedPrice();

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
  const [prevAnalytics, setPrevAnalytics] = useState<SellerAnalytics | null>(null);
  const [topPerformersData, setTopPerformersData] = useState<TopPerformerListing[]>([]);
  const [dailyData, setDailyData] = useState<DailyBreakdownPoint[]>([]);
  const [period, setPeriod] = useState<Period>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [partialError, setPartialError] = useState(false);
  const [topPerformersError, setTopPerformersError] = useState(false);
  const [dailyError, setDailyError] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { t } = useAppTranslation('commerce');
  const { show: showToast } = useToast();
  const haptic = useHaptic();

  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      setPartialError(false);
      setTopPerformersError(false);
      setDailyError(false);
      const [listingsRes, analyticsData, prevData, topData, daily] = await Promise.all([
        fetchUserListingsFromApi(currentUser.id, { limit: 100 }),
        fetchSellerAnalytics(currentUser.id, period).catch(() => null),
        fetchSellerAnalytics(currentUser.id, period, { offsetDays: periodDays }).catch(() => null),
        fetchTopPerformers(currentUser.id, 10).catch(() => null),
        fetchDailyBreakdown(currentUser.id, period).catch(() => null),
      ]);
      setListings(listingsRes.items);
      if (analyticsData) {
        setAnalytics(analyticsData);
      } else {
        setPartialError(true);
      }
      setPrevAnalytics(prevData ?? null);
      if (topData) {
        setTopPerformersData(topData);
      } else {
        setTopPerformersError(true);
        setTopPerformersData([]);
      }
      if (daily) {
        setDailyData(daily);
      } else {
        setDailyError(true);
        setDailyData([]);
      }
      setIsError(false);
    } catch {
      setIsError(true);
    }
  }, [currentUser?.id, period, periodDays]);

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

  // ── Primary outcome: net sales (revenue − refunds − fees) ──
  const heroLabel = useMemo(() => {
    if (!analytics) return 'Revenue';
    if (analytics.netSalesGbpMinor != null && analytics.completeness === 'complete') {
      return 'Net sales';
    }
    return 'Revenue';
  }, [analytics]);

  const heroValue = useMemo<number | null>(() => {
    if (!analytics) return null;
    if (analytics.netSalesGbpMinor != null && analytics.completeness === 'complete') {
      return analytics.netSalesGbpMinor / 100;
    }
    return analytics.revenueGbpMinor / 100;
  }, [analytics]);

  const itemsSold = analytics?.itemsSold ?? null;
  const totalViews = analytics?.totalViews ?? null;
  const totalLikes = analytics?.totalLikes ?? null;
  const totalSaves = analytics?.totalSaves ?? null;
  const activeListings = analytics?.activeListings ?? null;
  const avgRating = analytics?.avgRating ?? null;
  const reviewCount = analytics?.reviewCount ?? 0;

  const avgOrderValue = useMemo<number | null>(() => {
    if (heroValue == null || itemsSold == null || itemsSold === 0) return null;
    return heroValue / itemsSold;
  }, [heroValue, itemsSold]);

  const conversionRate = useMemo<number | null>(() => {
    if (!analytics || totalViews == null || itemsSold == null) return null;
    return totalViews > 0 ? (itemsSold / totalViews) * 100 : 0;
  }, [analytics, totalViews, itemsSold]);

  const pctDelta = useCallback(
    (current: number | null, previous: number | null): number | null => {
      if (current == null || previous == null || previous === 0) return null;
      return ((current - previous) / previous) * 100;
    },
    []
  );

  const viewsDelta = useMemo(
    () => pctDelta(totalViews, prevAnalytics?.totalViews ?? null),
    [pctDelta, totalViews, prevAnalytics]
  );
  const itemsSoldDelta = useMemo(
    () => pctDelta(itemsSold, prevAnalytics?.itemsSold ?? null),
    [pctDelta, itemsSold, prevAnalytics]
  );
  const revenueDelta = useMemo(
    () => pctDelta(
      heroValue,
      prevAnalytics
        ? (prevAnalytics.netSalesGbpMinor != null && prevAnalytics.completeness === 'complete'
            ? prevAnalytics.netSalesGbpMinor / 100
            : prevAnalytics.revenueGbpMinor / 100)
        : null
    ),
    [pctDelta, heroValue, prevAnalytics]
  );
  const prevConversion = useMemo(() => {
    if (!prevAnalytics) return null;
    const pv = prevAnalytics.totalViews;
    const ps = prevAnalytics.itemsSold;
    if (pv == null || ps == null) return null;
    return pv > 0 ? (ps / pv) * 100 : 0;
  }, [prevAnalytics]);
  const conversionDelta = useMemo(
    () => pctDelta(conversionRate, prevConversion),
    [pctDelta, conversionRate, prevConversion]
  );

  // ── Real daily chart data from the API ──
  // No fabrication. The backend returns one row per day with real counts.
  const chartData = useMemo(() => {
    if (dailyData.length === 0) return [];
    return dailyData;
  }, [dailyData]);

  const chartMaxViews = useMemo(
    () => chartData.reduce((m, d) => (d.views > m ? d.views : m), 0),
    [chartData]
  );

  const hasChartData = chartData.length > 0 && chartMaxViews > 0;

  // ── Conversion funnel data ──
  const funnelSteps = useMemo(() => {
    const views = analytics?.totalViews ?? 0;
    const likes = analytics?.totalLikes ?? 0;
    const saves = analytics?.totalSaves ?? 0;
    const purchases = analytics?.itemsSold ?? 0;
    const max = views > 0 ? views : 1;
    const steps = [
      { label: 'Views', value: views, pctOfPrev: 100, widthPct: Math.max(2, (views / max) * 100) },
      { label: 'Likes', value: likes, pctOfPrev: views > 0 ? (likes / views) * 100 : 0, widthPct: Math.max(2, (likes / max) * 100) },
      { label: 'Saves', value: saves, pctOfPrev: likes > 0 ? (saves / likes) * 100 : (views > 0 ? (saves / views) * 100 : 0), widthPct: Math.max(2, (saves / max) * 100) },
      { label: 'Purchases', value: purchases, pctOfPrev: saves > 0 ? (purchases / saves) * 100 : (views > 0 ? (purchases / views) * 100 : 0), widthPct: Math.max(2, (purchases / max) * 100) },
    ];

    // Identify the biggest drop-off step (lowest pctOfPrev, excluding the first)
    let biggestDropIdx = -1;
    let biggestDropPct = 101;
    for (let i = 1; i < steps.length; i++) {
      if (steps[i].pctOfPrev < biggestDropPct) {
        biggestDropPct = steps[i].pctOfPrev;
        biggestDropIdx = i;
      }
    }
    return { steps, biggestDropIdx };
  }, [analytics]);

  // ── KPI grid cells — 2-column grid, value dominant, label recessed ──
  const kpiCells = useMemo(() => {
    const cells: { label: string; value: string; delta: number | null }[] = [
      { label: 'Items sold', value: itemsSold != null ? String(itemsSold) : '—', delta: itemsSoldDelta },
      {
        label: 'Avg order',
        value: avgOrderValue != null ? formatFromFiat(avgOrderValue, currencyCode) : '—',
        delta: null,
      },
      {
        label: 'Conversion',
        value: conversionRate != null ? `${conversionRate.toFixed(1)}%` : '—',
        delta: conversionDelta,
      },
      { label: 'Views', value: totalViews != null ? totalViews.toLocaleString() : '—', delta: viewsDelta },
    ];
    if (activeListings != null) {
      cells.push({ label: 'Active listings', value: String(activeListings), delta: null });
    }
    if (avgRating != null) {
      cells.push({
        label: 'Avg rating',
        value: `${avgRating.toFixed(1)}${reviewCount > 0 ? ` (${reviewCount})` : ''}`,
        delta: null,
      });
    }
    return cells;
  }, [itemsSold, avgOrderValue, conversionRate, totalViews, activeListings, avgRating, reviewCount, formatFromFiat, currencyCode, itemsSoldDelta, conversionDelta, viewsDelta]);

  // ── Top listings — enriched with imageUrl from listings data ──
  const topPerformers = useMemo(() => {
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    return topPerformersData.map((t) => {
      const listing = listingMap.get(t.id);
      return {
        id: t.id,
        title: t.title,
        price: t.priceGbpMinor / 100,
        views: t.viewsCount,
        likes: t.likesCount,
        status: t.status,
        imageUrl: listing?.imageUrl ?? listing?.images?.[0] ?? null,
      };
    });
  }, [listings, topPerformersData]);

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
  const hasZeroListings = listings.length === 0 && !isLoading && !isError;

  const handleListingPress = useCallback((listingId: string) => {
    navigation.navigate('ManageListing', { itemId: listingId });
  }, [navigation]);

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - periodDays);

      const report = {
        generatedAt: now.toISOString(),
        period,
        dateRange: {
          start: start.toISOString().split('T')[0],
          end: now.toISOString().split('T')[0],
          days: periodDays,
        },
        kpis: {
          heroLabel,
          heroValue,
          itemsSold,
          totalViews,
          totalLikes,
          totalSaves,
          activeListings,
          avgRating,
          reviewCount,
          avgOrderValue,
          conversionRate,
          revenueGbpMinor: analytics?.revenueGbpMinor ?? null,
          netSalesGbpMinor: analytics?.netSalesGbpMinor ?? null,
          refundsGbpMinor: analytics?.refundsGbpMinor ?? null,
          feesGbpMinor: analytics?.feesGbpMinor ?? null,
          responseRate: analytics?.responseRate ?? null,
          positiveRatingPct: analytics?.positiveRatingPct ?? null,
        },
        dailyBreakdown: chartData,
        topPerformers: topPerformers.map((p) => ({
          id: p.id,
          title: p.title,
          priceGbp: p.price,
          views: p.views,
          likes: p.likes,
        })),
      };

      const json = JSON.stringify(report, null, 2);
      const fileName = `seller_report_${period}_${now.toISOString().split('T')[0]}.json`;
      const dir = FileSystem.Paths?.document?.uri;
      if (!dir) throw new Error('File system unavailable');
      const fileUri = `${dir}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, json);

      const result = await openShareSheet({
        url: fileUri,
        title: 'Seller report',
        subject: `Seller analytics report — ${periodLabel}`,
      });

      if (result.success) {
        haptic.success();
        showToast(t('sellerAnalytics.exportSuccess'), 'success');
        trackRaw('seller_report_exported', { period });
      }
    } catch {
      haptic.error();
      showToast(t('sellerAnalytics.exportFailed'), 'error');
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, periodDays, period, heroLabel, heroValue, itemsSold, totalViews, totalLikes, totalSaves, activeListings, avgRating, reviewCount, avgOrderValue, conversionRate, analytics, chartData, topPerformers, periodLabel, haptic, showToast, t]);

  const exportButton = useMemo(() => (
    <AnimatedPressable
      style={styles.headerAction}
      onPress={handleExport}
      disabled={isExporting || !analytics}
      accessibilityRole="button"
      accessibilityLabel={t('sellerAnalytics.exportReport')}
      accessibilityHint="Exports a JSON report via the system share sheet"
      scaleValue={PressScale.icon}
      hapticFeedback="light"
      activeOpacity={0.62}
    >
      <Ionicons
        name={isExporting ? 'hourglass-outline' : 'share-outline'}
        size={20}
        color={colors.textPrimary}
        aria-hidden={true}
      />
    </AnimatedPressable>
  ), [styles, handleExport, isExporting, analytics, t, colors.textPrimary]);

  // ── Loading state — skeleton matches the actual populated layout ──
  if (isLoading) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Analytics" onBack={() => navigation.goBack()} />}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Hero skeleton */}
          <View style={styles.skeletonHero}>
            <View style={styles.skeletonPeriodRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.skeletonPeriodPill} />
              ))}
            </View>
            <View style={{ height: Space.md }} />
            <View style={[styles.skeletonBar, { width: '45%', height: 32 }]} />
            <View style={{ height: Space.sm }} />
            <View style={styles.skeletonMetricRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flex: 1, gap: Space.xs }}>
                  <View style={[styles.skeletonBar, { width: '60%', height: 16 }]} />
                  <View style={[styles.skeletonBar, { width: '40%', height: 11 }]} />
                </View>
              ))}
            </View>
          </View>
          {/* KPI grid skeleton */}
          <View style={styles.skeletonKpiGrid}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.skeletonKpiCell}>
                <View style={[styles.skeletonBar, { width: '50%', height: 18 }]} />
                <View style={{ height: Space.xs }} />
                <View style={[styles.skeletonBar, { width: '70%', height: 11 }]} />
              </View>
            ))}
          </View>
          {/* Chart skeleton */}
          <View style={{ height: Space.lg }} />
          <View style={[styles.skeletonBar, { width: '30%', height: 14 }]} />
          <View style={{ height: Space.sm }} />
          <View style={styles.skeletonChart} />
          {/* Top listings skeleton */}
          <View style={{ height: Space.lg }} />
          <View style={[styles.skeletonBar, { width: '25%', height: 14 }]} />
          <View style={{ height: Space.sm }} />
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonListingRow}>
              <View style={styles.skeletonThumb} />
              <View style={{ flex: 1, gap: Space.xs }}>
                <View style={[styles.skeletonBar, { width: '60%', height: 14 }]} />
                <View style={[styles.skeletonBar, { width: '35%', height: 11 }]} />
              </View>
              <View style={[styles.skeletonBar, { width: 50, height: 16 }]} />
            </View>
          ))}
        </ScrollView>
      </FlagshipScreen>
    );
  }

  // ── Error state ──
  if (isError && listings.length === 0) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Analytics" onBack={() => navigation.goBack()} />}
      >
        <EmptyState
          icon="cloud-offline-outline"
          iconColor={colors.danger}
          title="Couldn't load analytics"
          subtitle="Check your connection and try again."
          ctaLabel="Retry"
          onCtaPress={() => { setIsError(false); setIsLoading(true); void load().finally(() => setIsLoading(false)); }}
        />
      </FlagshipScreen>
    );
  }

  // ── Empty state — seller has no listings ──
  if (hasZeroListings) {
    return (
      <FlagshipScreen
        ref={a11yRef}
        header={<FlagshipHeader title="Analytics" onBack={() => navigation.goBack()} />}
      >
        <EmptyState
          icon="analytics"
          title="No listings yet"
          subtitle="List an item to start tracking your performance."
          ctaLabel="List an item"
          onCtaPress={() => navigation.navigate('Sell')}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      ref={a11yRef}
      header={
        <FlagshipHeader
          title="Analytics"
          onBack={() => navigation.goBack()}
          rightAction={exportButton}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {isOffline ? (
        <OfflineBanner onRetry={() => void onRefresh()} />
      ) : null}
      {partialError ? (
        <View style={styles.partialBanner}>
          <Text style={styles.partialText}>
            Analytics details couldn't be loaded — showing listing data only. Pull to retry.
          </Text>
        </View>
      ) : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* ══ HERO — composed object, period integrated ══
            The number IS the object. Period selector sits directly above it.
            Delta is a semantic indicator, not decoration. Supporting metrics
            recede below. No eyebrow — the period selector provides context. */}
        <View style={styles.heroBlock}>
          {/* Period selector — segmented control, part of the hero */}
          <View style={styles.periodSegment}>
            {PERIOD_OPTIONS.map((opt) => {
              const isActive = period === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[
                    styles.periodSegmentItem,
                    isActive && { backgroundColor: colors.brand },
                  ]}
                  onPress={() => { haptics.tap(); setPeriod(opt.key); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Period: ${opt.label}`}
                  accessibilityState={{ selected: isActive }}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                >
                  <Text style={[
                    styles.periodSegmentText,
                    { color: isActive ? colors.textInverse : colors.textMuted },
                  ]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Hero number — THE dominant object */}
          <View style={styles.heroValueRow}>
            <Text style={[styles.heroValue, { color: colors.textPrimary }]}>
              {heroValue != null ? formatFromFiat(heroValue, currencyCode) : '—'}
            </Text>
            {revenueDelta != null ? (
              <View style={[
                styles.deltaPill,
                { backgroundColor: revenueDelta >= 0 ? colors.successSubtle : colors.dangerSubtle },
              ]}>
                <Text style={[
                  styles.deltaPillText,
                  { color: revenueDelta >= 0 ? colors.success : colors.danger },
                ]}>
                  {revenueDelta >= 0 ? '+' : ''}{revenueDelta.toFixed(0)}%
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.heroLabel, { color: colors.textMuted }]}>
            {heroLabel} · vs previous {periodLabel}
          </Text>

          {/* Supporting metrics — tight row, recede below the number */}
          <View style={styles.heroMetricsRow}>
            <View style={styles.heroMetricCell}>
              <Text style={[styles.heroMetricValue, { color: colors.textPrimary }]}>
                {itemsSold != null ? String(itemsSold) : '—'}
              </Text>
              <Text style={[styles.heroMetricLabel, { color: colors.textMuted }]}>
                sold
              </Text>
            </View>
            <View style={[styles.heroMetricDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.heroMetricCell}>
              <Text style={[styles.heroMetricValue, { color: colors.textPrimary }]}>
                {totalViews != null ? totalViews.toLocaleString() : '—'}
              </Text>
              <Text style={[styles.heroMetricLabel, { color: colors.textMuted }]}>
                views
              </Text>
            </View>
            <View style={[styles.heroMetricDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.heroMetricCell}>
              <Text style={[styles.heroMetricValue, { color: colors.textPrimary }]}>
                {conversionRate != null ? `${conversionRate.toFixed(1)}%` : '—'}
              </Text>
              <Text style={[styles.heroMetricLabel, { color: colors.textMuted }]}>
                conv.
              </Text>
            </View>
          </View>
        </View>

        {/* ══ KPI GRID — 2-column, value dominant, label recessed ══
            No icons, no card chrome. Hairline dividers between cells.
            Density without the list-like feel. */}
        <View style={styles.kpiGrid}>
          {kpiCells.map((kpi, i) => (
            <View
              key={kpi.label}
              style={[
                styles.kpiCell,
                i % 2 === 1 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.borderSubtle },
                i >= 2 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
              ]}
            >
              <View style={styles.kpiCellValueRow}>
                <Text style={[styles.kpiCellValue, { color: colors.textPrimary }]}>
                  {kpi.value}
                </Text>
                {kpi.delta != null ? (
                  <Text style={[
                    styles.kpiCellDelta,
                    { color: kpi.delta >= 0 ? colors.success : colors.danger },
                  ]}>
                    {kpi.delta >= 0 ? '+' : ''}{kpi.delta.toFixed(0)}%
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.kpiCellLabel, { color: colors.textMuted }]}>
                {kpi.label}
              </Text>
            </View>
          ))}
        </View>

        {/* ══ DAILY VIEWS — real data from the API, no fabrication ══
            Area-style bar chart with the peak day labelled.
            If the API returned no data or all zeros, show an honest state. */}
        <View style={styles.chartSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Views</Text>
            {hasChartData ? (
              <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
                {totalViews != null ? totalViews.toLocaleString() : ''} total
              </Text>
            ) : null}
          </View>
          {dailyError ? (
            <Text style={[styles.chartEmpty, { color: colors.textMuted }]}>
              Couldn't load daily breakdown. Pull to retry.
            </Text>
          ) : hasChartData ? (
            <DailyViewsChart
              data={chartData}
              maxViews={chartMaxViews}
              barColor={colors.brand}
              trackColor={colors.surfaceAlt}
              labelColor={colors.textMuted}
            />
          ) : (
            <Text style={[styles.chartEmpty, { color: colors.textMuted }]}>
              No views in this period yet.
            </Text>
          )}
        </View>

        {/* ══ CONVERSION FUNNEL — connected stepped bars with drop-off ══
            Each step shows value + step-to-step conversion %.
            The biggest drop-off is highlighted with a danger tint. */}
        {analytics && (analytics.totalViews > 0 || analytics.itemsSold > 0) ? (
          <View style={styles.funnelSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Funnel</Text>
              {conversionRate != null ? (
                <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
                  {conversionRate.toFixed(1)}% view→purchase
                </Text>
              ) : null}
            </View>
            {funnelSteps.steps.map((step, idx) => {
              const isBiggestDrop = idx === funnelSteps.biggestDropIdx && idx > 0;
              return (
                <View key={step.label} style={styles.funnelRow}>
                  <View style={styles.funnelLabelRow}>
                    <Text style={[styles.funnelLabel, { color: colors.textSecondary }]}>
                      {step.label}
                    </Text>
                    <View style={styles.funnelValueRow}>
                      <Text style={[styles.funnelValue, { color: colors.textPrimary }]}>
                        {step.value.toLocaleString()}
                      </Text>
                      {idx > 0 ? (
                        <Text style={[
                          styles.funnelPct,
                          { color: isBiggestDrop ? colors.danger : colors.textMuted },
                        ]}>
                          {step.pctOfPrev.toFixed(0)}%
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.funnelBarTrack, { backgroundColor: colors.surfaceAlt }]}>
                    <View
                      style={[
                        styles.funnelBar,
                        {
                          width: `${step.widthPct}%`,
                          backgroundColor: colors.brand,
                          opacity: 1 - idx * 0.18,
                        },
                      ]}
                    />
                  </View>
                  {isBiggestDrop ? (
                    <Text style={[styles.funnelDropHint, { color: colors.danger }]}>
                      Biggest drop-off
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* ══ TOP LISTINGS — media-first, rank, strong composition ══
            72pt thumbnails for a media-first marketplace. Rank is a quiet
            metadata element, not a decorative badge. */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Top listings</Text>
        </View>
        {topPerformersError ? (
          <Text style={[styles.sectionError, { color: colors.textMuted }]}>
            Couldn't load top listings. Pull to retry.
          </Text>
        ) : topPerformers.length > 0 ? (
          <View>
            {topPerformers.map((item, idx) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.topListingRow,
                  { borderBottomColor: colors.borderSubtle },
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => handleListingPress(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Listing ${idx + 1}: ${item.title}, ${item.views} views, ${currencySymbol}${item.price.toFixed(0)}`}
              >
                <Text style={[styles.rankLabel, { color: colors.textMuted }]}>
                  {idx + 1}
                </Text>
                <View style={[styles.topListingThumb, { backgroundColor: colors.surfaceAlt }]}>
                  {item.imageUrl ? (
                    <CachedImage
                      uri={item.imageUrl}
                      style={styles.topListingThumbImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.topListingThumbPlaceholder} />
                  )}
                </View>
                <View style={styles.topListingInfo}>
                  <Text style={[styles.topListingRowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.topListingRowMeta, { color: colors.textMuted }]}>
                    {item.views.toLocaleString()} views{item.likes > 0 ? ` · ${item.likes} likes` : ''}
                  </Text>
                </View>
                <Text style={[styles.topListingRowPrice, { color: colors.textPrimary }]}>
                  {currencySymbol}{item.price.toFixed(0)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="analytics"
            title="No performance data yet"
            subtitle="Listings with views will appear here"
          />
        )}

        {/* ══ NEEDS ATTENTION — actionable, clear issue label ══
            The issue is stated as text, not decorated with warning color.
            The row is pressable → takes the seller to manage the listing. */}
        {needsAttention.length > 0 ? (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Needs attention</Text>
              <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Low engagement</Text>
            </View>
            <View>
              {needsAttention.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.attentionRow,
                    { borderBottomColor: colors.borderSubtle },
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={() => handleListingPress(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Needs attention: ${item.title}, ${item.views} views`}
                >
                  <View style={[styles.attentionImageWrap, { backgroundColor: colors.surfaceAlt }]}>
                    {item.imageUrl ? (
                      <CachedImage
                        uri={item.imageUrl}
                        style={styles.attentionImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.attentionImagePlaceholder} />
                    )}
                  </View>
                  <View style={styles.attentionInfo}>
                    <Text style={[styles.attentionTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.attentionIssue, { color: colors.textMuted }]}>
                      {item.views} views · low engagement
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.textMuted}
                    aria-hidden={true}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </FlagshipScreen>
  );
}

// ── Daily Views Chart — real data, View-based, no chart library ──
// Compact area-style bars showing the real per-day view counts from the API.
// The peak day is marked. No fabrication, no Math.sin distribution.
function DailyViewsChart({
  data,
  maxViews,
  barColor,
  trackColor,
  labelColor,
}: {
  data: DailyBreakdownPoint[];
  maxViews: number;
  barColor: string;
  trackColor: string;
  labelColor: string;
}) {
  const [chartWidth, setChartWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
  }, []);

  // For periods > 30d, label every ~2 weeks. For 30d, label every ~week.
  // For 7d, label every day.
  const labelInterval = data.length <= 7 ? 1 : data.length <= 30 ? 7 : 14;

  const peakIdx = useMemo(() => {
    let peak = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i].views > data[peak].views) peak = i;
    }
    return peak;
  }, [data]);

  // Show the peak day label only if there's room (chart width > 120)
  const showPeakLabel = chartWidth > 120 && data[peakIdx]?.views > 0;

  return (
    <View onLayout={onLayout} style={{ marginTop: Space.sm }}>
      {/* Bar chart */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 2 }}>
        {data.map((d, i) => {
          const ratio = maxViews > 0 ? d.views / maxViews : 0;
          const isPeak = i === peakIdx && d.views > 0;
          return (
            <View key={i} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
              <View
                style={{
                  width: '100%',
                  height: `${Math.max(ratio * 100, d.views > 0 ? 4 : 0)}%`,
                  backgroundColor: barColor,
                  opacity: isPeak ? 1 : 0.35 + ratio * 0.4,
                  borderRadius: Radius.sm,
                }}
              />
            </View>
          );
        })}
      </View>
      {/* Date labels — sparse, not every day */}
      <View style={{ flexDirection: 'row', marginTop: Space.xs, height: 14 }}>
        {data.map((d, i) => {
          if (i % labelInterval !== 0 && i !== data.length - 1) {
            return <View key={i} style={{ flex: 1 }} />;
          }
          const date = new Date(d.date);
          const label = `${date.getMonth() + 1}/${date.getDate()}`;
          return (
            <View key={i} style={{ flex: labelInterval, alignItems: 'flex-start' }}>
              <Text style={{
                fontSize: TypographyV2.meta.size,
                fontFamily: TypographyV2.meta.fontFamily,
                color: labelColor,
                fontVariant: ['tabular-nums' as any],
              }}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      {/* Peak annotation */}
      {showPeakLabel ? (
        <Text style={{
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: labelColor,
          marginTop: Space.xs,
        }}>
          Peak: {data[peakIdx].views.toLocaleString()} views on{' '}
          {new Date(data[peakIdx].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xxl },

    // ── Header action ──
    headerAction: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },

    // ── Hero — composed object ──
    heroBlock: {
      paddingVertical: Space.md },

    // Period segmented control — part of the hero, not a separate section
    periodSegment: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.sm,
      padding: 2,
      marginBottom: Space.md },
    periodSegmentItem: {
      paddingVertical: Space.xs + 1,
      paddingHorizontal: Space.sm + 2,
      borderRadius: Radius.sm - 1,
      minWidth: 44,
      alignItems: 'center' },
    periodSegmentText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontWeight: '600' },

    // Hero number — THE dominant object
    heroValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.sm,
      marginBottom: Space.xs },
    heroValue: {
      fontSize: TypographyV2.priceHero.size,
      lineHeight: TypographyV2.priceHero.lineHeight,
      fontFamily: TypographyV2.priceHero.fontFamily,
      fontVariant: ['tabular-nums'],
      letterSpacing: TypographyV2.priceHero.letterSpacing },
    heroLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },

    // Delta pill — semantic, not decorative
    deltaPill: {
      paddingVertical: 2,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.sm,
      alignSelf: 'center' },
    deltaPillText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontWeight: '600',
      fontVariant: ['tabular-nums'] },

    // Supporting metrics — tight row, recede
    heroMetricsRow: {
      flexDirection: 'row',
      marginTop: Space.md,
      paddingTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle },
    heroMetricCell: {
      flex: 1,
      gap: 0 },
    heroMetricDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch' },
    heroMetricValue: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'] },
    heroMetricLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily },

    // ── KPI grid — 2-column, value dominant ──
    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.borderSubtle },
    kpiCell: {
      width: '50%',
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },
    kpiCellValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.xs },
    kpiCellValue: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'] },
    kpiCellDelta: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontWeight: '600',
      fontVariant: ['tabular-nums'] },
    kpiCellLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: 2 },

    // ── Section headers ──
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: Space.lg,
      marginBottom: Space.sm },
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    sectionHint: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'] },
    sectionError: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      paddingVertical: Space.md },

    // ── Chart ──
    chartSection: {
      marginTop: Space.sm },
    chartEmpty: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      paddingVertical: Space.md },

    // ── Funnel ──
    funnelSection: {
      marginTop: Space.sm },
    funnelRow: {
      paddingVertical: Space.sm - 1,
      gap: Space.xs },
    funnelLabelRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between' },
    funnelValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.sm },
    funnelLabel: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily },
    funnelValue: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'] },
    funnelPct: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontWeight: '600',
      fontVariant: ['tabular-nums'] },
    funnelBarTrack: {
      height: 6,
      borderRadius: Radius.sm,
      overflow: 'hidden' },
    funnelBar: {
      height: '100%',
      borderRadius: Radius.sm },
    funnelDropHint: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: 1 },

    // ── Top listings — media-first ──
    topListingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth },
    rankLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontWeight: '600',
      width: 16,
      textAlign: 'center',
      fontVariant: ['tabular-nums'] },
    topListingThumb: {
      width: 72,
      height: 72,
      borderRadius: Radius.md,
      overflow: 'hidden' },
    topListingThumbImage: {
      width: '100%',
      height: '100%' },
    topListingThumbPlaceholder: {
      flex: 1 },
    topListingInfo: {
      flex: 1,
      gap: Space.xs - 1 },
    topListingRowTitle: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily },
    topListingRowMeta: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'] },
    topListingRowPrice: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'] },

    // ── Needs attention ──
    attentionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth },
    attentionImageWrap: {
      width: 48,
      height: 48,
      borderRadius: Radius.sm,
      overflow: 'hidden' },
    attentionImage: {
      width: '100%',
      height: '100%' },
    attentionImagePlaceholder: {
      flex: 1 },
    attentionInfo: {
      flex: 1,
      gap: Space.xs - 1 },
    attentionTitle: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily },
    attentionIssue: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily },
    attentionPrice: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
      fontVariant: ['tabular-nums'] },

    // ── Partial error banner ──
    partialBanner: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      backgroundColor: colors.surfaceAlt },
    partialText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },

    // ── Skeleton ──
    skeletonHero: {
      paddingVertical: Space.md },
    skeletonPeriodRow: {
      flexDirection: 'row',
      gap: Space.xs },
    skeletonPeriodPill: {
      backgroundColor: colors.surfaceAlt,
      width: 44,
      height: 24,
      borderRadius: Radius.sm },
    skeletonMetricRow: {
      flexDirection: 'row',
      paddingTop: Space.md,
      marginTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle },
    skeletonKpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle },
    skeletonKpiCell: {
      width: '50%',
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.borderSubtle },
    skeletonChart: {
      height: 80,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.sm,
      opacity: 0.5 },
    skeletonListingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },
    skeletonThumb: {
      width: 72,
      height: 72,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt },
    skeletonBar: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.sm },
  });
}
