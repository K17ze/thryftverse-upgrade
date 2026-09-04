import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { openProductDetail } from '../platform/product/openProductDetail';
import { EmptyState } from '../components/EmptyState';
import { CachedImage } from '../components/CachedImage';
import { useStore } from '../store/useStore';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';
import {
  fetchSellerAnalytics,
  fetchTopPerformers,
  fetchNeedsAttention,
  fetchListingAnalytics,
  type SellerAnalytics,
  type TopPerformerListing,
  type NeedsAttentionListing,
  type ListingAnalyticsData,
} from '../services/commerceApi';
import { LineChart, BarChart, type ChartSeries, type ChartPoint } from '../components/charts';
import { useConnectivity } from '../hooks/useConnectivity';
import { haptics } from '../utils/haptics';
import { OfflineBanner } from '../components/OfflineBanner';
import { track } from '../analytics';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useA11yAudit } from '../hooks/useA11yAudit';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type SellerAnalyticsRoute = RouteProp<RootStackParamList, 'SellerAnalytics'>;

type Period = '7d' | '30d' | '90d';

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
];

export default function SellerAnalyticsScreen() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'SellerAnalyticsScreen');
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const route = useRoute<SellerAnalyticsRoute>();
  const currentUser = useStore((s) => s.currentUser);
  const { isOffline } = useConnectivity();
  const { formatFromFiat } = useFormattedPrice();

  // ── Listing context ──
  const routeListingId = route.params?.listingId;
  const [selectedListingId, setSelectedListingId] = useState<string | null>(routeListingId ?? null);

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
  const [topPerformersData, setTopPerformersData] = useState<TopPerformerListing[]>([]);
  const [needsAttentionData, setNeedsAttentionData] = useState<NeedsAttentionListing[]>([]);
  const [listingAnalytics, setListingAnalytics] = useState<ListingAnalyticsData | null>(null);

  const [period, setPeriod] = useState<Period>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [isListingLoading, setIsListingLoading] = useState(false);
  const [listingError, setListingError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [partialError, setPartialError] = useState(false);

  useEffect(() => {
    if (route.params?.listingId && route.params.listingId !== selectedListingId) {
      setSelectedListingId(route.params.listingId);
    }
  }, [route.params?.listingId]);

  const loadGeneralAnalytics = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      setPartialError(false);
      const [listingsRes, analyticsData, topData, attentionData] = await Promise.all([
        fetchUserListingsFromApi(currentUser.id, { limit: 100 }),
        fetchSellerAnalytics(currentUser.id, period).catch(() => null),
        fetchTopPerformers(currentUser.id, 10, period).catch(() => []),
        fetchNeedsAttention(currentUser.id, 5, period).catch(() => []),
      ]);
      setListings(listingsRes.items);
      if (analyticsData) {
        setAnalytics(analyticsData);
      } else {
        setPartialError(true);
      }
      setTopPerformersData(topData);
      setNeedsAttentionData(attentionData);
      setIsError(false);
    } catch {
      setIsError(true);
    }
  }, [currentUser?.id, period]);

  const loadListingAnalytics = useCallback(async (listingId: string) => {
    if (!currentUser?.id) return;
    setIsListingLoading(true);
    setListingError(false);
    try {
      const data = await fetchListingAnalytics(currentUser.id, listingId, period);
      setListingAnalytics(data);
    } catch {
      setListingAnalytics(null);
      setListingError(true);
    } finally {
      setIsListingLoading(false);
    }
  }, [currentUser?.id, period]);

  const load = useCallback(async () => {
    await loadGeneralAnalytics();
    if (selectedListingId) {
      await loadListingAnalytics(selectedListingId);
    }
  }, [loadGeneralAnalytics, selectedListingId, loadListingAnalytics]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    load().finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [load]);

  useEffect(() => {
    if (selectedListingId) {
      void loadListingAnalytics(selectedListingId);
    } else {
      setListingAnalytics(null);
    }
  }, [selectedListingId, loadListingAnalytics]);

  useEffect(() => {
    track('seller_dashboard_viewed', { scopedListingId: selectedListingId ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  // ── Selected listing meta ──
  const currentListingItem = useMemo(() => {
    if (!selectedListingId) return null;
    return listings.find((l) => l.id === selectedListingId) ?? null;
  }, [listings, selectedListingId]);

  // ── Primary financial outcome ──
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
  const activeListings = analytics?.activeListings ?? null;
  const avgRating = analytics?.avgRating ?? null;
  const reviewCount = analytics?.reviewCount ?? 0;

  const avgOrderValue = useMemo<number | null>(() => {
    if (heroValue == null || itemsSold == null || itemsSold === 0) return null;
    return heroValue / itemsSold;
  }, [heroValue, itemsSold]);

  const conversionRate = useMemo<number | null>(() => {
    if (!analytics || totalViews == null || itemsSold == null) return null;
    return totalViews > 0 ? (itemsSold / totalViews) * 100 : null;
  }, [analytics, totalViews, itemsSold]);

  // ── Chart: current period bars + previous period ghost line ──
  const chartSeries = useMemo<ChartSeries[]>(() => {
    if (!analytics?.trend?.current || analytics.trend.current.length === 0) return [];
    const currentPoints: ChartPoint[] = analytics.trend.current.map((d) => ({
      x: d.date.slice(5),
      y: d.value,
    }));
    const prevPoints: ChartPoint[] = (analytics.trend.previous ?? []).map((d) => ({
      x: d.date.slice(5),
      y: d.value,
    }));
    return [
      { label: 'This period', color: colors.brand, data: currentPoints },
      ...(prevPoints.length > 0 ? [{
        label: 'Previous',
        color: colors.textMuted,
        data: prevPoints,
      }] : []),
    ];
  }, [analytics, colors]);

  const barData = useMemo<ChartPoint[]>(() => {
    if (!analytics?.trend?.current || analytics.trend.current.length === 0) return [];
    return analytics.trend.current.map((d) => ({
      x: d.date.slice(5),
      y: d.value,
    }));
  }, [analytics]);

  // ── Per-product chart: store-wide trend (honestly labelled) ──
  const productChartSeries = useMemo<ChartSeries[]>(() => {
    if (!analytics?.trend?.current || analytics.trend.current.length === 0 || !listingAnalytics) return [];
    const points: ChartPoint[] = analytics.trend.current.map((d) => ({
      x: d.date.slice(5),
      y: d.value,
    }));
    return [{ label: 'Store trend', color: colors.brand, data: points }];
  }, [analytics, listingAnalytics, colors]);

  // ── Period-over-period delta ──
  const deltaPct = useCallback((current: number, previous: number): number | null => {
    if (previous <= 0) return null;
    const pct = ((current - previous) / previous) * 100;
    return Math.min(Math.max(Math.round(pct * 10) / 10, -999), 999);
  }, []);

  const revenueDelta = useMemo(() => {
    if (!analytics?.comparison) return null;
    const useNet = analytics.netSalesGbpMinor != null;
    const current = useNet ? analytics.netSalesGbpMinor! : analytics.revenueGbpMinor;
    const previous = useNet
      ? (analytics.comparison.netSalesGbpMinor ?? analytics.comparison.revenueGbpMinor)
      : analytics.comparison.revenueGbpMinor;
    return deltaPct(current, previous);
  }, [analytics, deltaPct]);

  const itemsSoldDelta = useMemo(() => {
    if (!analytics?.comparison) return null;
    return deltaPct(analytics.itemsSold, analytics.comparison.itemsSold);
  }, [analytics, deltaPct]);

  const viewsDelta = useMemo(() => {
    if (!analytics?.comparison) return null;
    return deltaPct(analytics.totalViews, analytics.comparison.totalViews);
  }, [analytics, deltaPct]);

  // ── Conversion funnel — scale to first stage for honest drop-off ──
  const funnelData = useMemo(() => {
    if (!analytics?.funnel) return null;
    const f = analytics.funnel;
    const stages = [
      { label: 'Impressions', value: f.impressions, color: colors.textSecondary },
      { label: 'Views', value: f.views, color: colors.brand },
      { label: 'Saves', value: f.saves, color: colors.success },
      { label: 'Offers', value: f.offers, color: colors.warning },
      { label: 'Purchases', value: f.purchases, color: colors.danger },
    ];
    const maxVal = Math.max(stages[0].value, 1);
    return { stages, maxVal };
  }, [analytics, colors]);

  // ── Enriched Top Performers ──
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

  // ── Enriched Needs Attention ──
  const needsAttention = useMemo(() => {
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    return needsAttentionData.map((a) => {
      const listing = listingMap.get(a.listingId);
      return {
        id: a.listingId,
        title: a.title,
        price: a.priceGbp,
        views: a.views,
        likes: a.likes,
        status: a.status,
        imageUrl: a.coverImageUrl ?? listing?.imageUrl ?? listing?.images?.[0] ?? null,
      };
    });
  }, [listings, needsAttentionData]);

  const periodLabel = period === '7d' ? '7 days' : period === '30d' ? '30 days' : '90 days';
  const hasZeroListings = listings.length === 0 && !isLoading && !isError;

  const handleListingSelect = (id: string | null) => {
    haptics.selection();
    setSelectedListingId(id);
  };

  // ── Loading state — skeleton matches final layout ──
  if (isLoading) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title={selectedListingId ? 'Product Analytics' : 'Seller Analytics'} onBack={() => navigation.goBack()} />}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.periodRowSkeleton}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.skeletonBlock, { width: 40, height: 16 }]} />
            ))}
          </View>
          <View style={{ height: Space.md }} />
          <View style={[styles.skeletonBlock, { width: '35%', height: 12 }]} />
          <View style={{ height: Space.xs }} />
          <View style={[styles.skeletonBlock, { width: '60%', height: 36 }]} />
          <View style={{ height: Space.sm }} />
          <View style={[styles.skeletonBlock, { width: '40%', height: 12 }]} />
          <View style={{ height: Space.lg }} />
          <View style={[styles.skeletonBlock, { height: 190, borderRadius: Radius.lg }]} />
          <View style={{ height: Space.lg }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonKpiRow}>
              <View style={[styles.skeletonBlock, { width: '30%', height: 14 }]} />
              <View style={{ flex: 1 }} />
              <View style={[styles.skeletonBlock, { width: 60, height: 16 }]} />
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
        header={<FlagshipHeader title={selectedListingId ? 'Product Analytics' : 'Seller Analytics'} onBack={() => navigation.goBack()} />}
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
        header={<FlagshipHeader title="Seller Analytics" onBack={() => navigation.goBack()} />}
      >
        <EmptyState
          icon="analytics"
          title="No listings yet"
          subtitle="List an item to start tracking performance."
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
          title={selectedListingId ? 'Product Analytics' : 'Seller Analytics'}
          onBack={() => navigation.goBack()}
          rightAction={selectedListingId ? (
            <Pressable
              onPress={() => handleListingSelect(null)}
              style={styles.clearScopeButton}
              accessibilityRole="button"
              accessibilityLabel="View all listings analytics"
              accessibilityHint="Switches back to the overall store analytics view"
            >
              <Text style={[styles.clearScopeText, { color: colors.brand }]}>All Listings</Text>
            </Pressable>
          ) : undefined}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {isOffline ? <OfflineBanner onRetry={() => void onRefresh()} /> : null}

      {partialError ? (
        <View style={[styles.partialBanner, { borderBottomColor: colors.border }]}>
          <Text style={[styles.partialBannerText, { color: colors.textMuted }]}>
            Showing cached data · pull to refresh
          </Text>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* ── Period Selector ── */}
        <View style={styles.periodRow}>
          {PERIOD_OPTIONS.map((opt) => {
            const isActive = period === opt.key;
            return (
              <Pressable
                key={opt.key}
                style={({ pressed }) => [styles.periodTab, pressed && { opacity: 0.6 }]}
                onPress={() => { haptics.tap(); setPeriod(opt.key); }}
                accessibilityRole="button"
                accessibilityLabel={`Period: ${opt.label}`}
                accessibilityHint={`Filters analytics to the last ${opt.label}`}
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              >
                <Text
                  style={[
                    styles.periodTabText,
                    { color: isActive ? colors.textPrimary : colors.textMuted },
                    isActive && styles.periodTabTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {isActive ? (
                  <View style={[styles.periodTabIndicator, { backgroundColor: colors.textPrimary }]} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* ========================================================================= */}
        {/* VIEW A: SPECIFIC PRODUCT ANALYTICS — flat canvas, no card stack */}
        {/* ========================================================================= */}
        {selectedListingId ? (
          <View style={styles.productAnalyticsContainer}>
            {/* Product Identity — flat, no card */}
            <View style={styles.productHero}>
              <View style={styles.productHeroMedia}>
                {(listingAnalytics?.listing.imageUrl ?? currentListingItem?.imageUrl ?? currentListingItem?.images?.[0]) ? (
                  <CachedImage
                    uri={listingAnalytics?.listing.imageUrl ?? currentListingItem?.imageUrl ?? currentListingItem?.images?.[0] ?? ''}
                    style={styles.productHeroImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.productHeroImage, { backgroundColor: colors.surfaceAlt }]} />
                )}
              </View>

              <View style={styles.productHeroDetails}>
                <View style={styles.productHeroStatusRow}>
                  <Text style={[styles.statusText, {
                    color: (listingAnalytics?.listing.status ?? currentListingItem?.status) === 'sold' ? colors.success : colors.brand
                  }]}>
                    {(listingAnalytics?.listing.status ?? currentListingItem?.status ?? 'active')}
                  </Text>
                  {listingAnalytics?.timeOnMarketDays != null ? (
                    <Text style={[styles.marketDaysText, { color: colors.textMuted }]}>
                      {listingAnalytics.listing.soldAt ? `Sold in ${listingAnalytics.timeOnMarketDays}d` : `${listingAnalytics.timeOnMarketDays}d listed`}
                    </Text>
                  ) : null}
                </View>

                <Text style={[styles.productHeroTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {listingAnalytics?.listing.title ?? currentListingItem?.title ?? 'Listing'}
                </Text>

                <Text style={[styles.productHeroPrice, { color: colors.textPrimary }]}>
                  {formatFromFiat(
                    (listingAnalytics?.listing.priceGbpMinor ? listingAnalytics.listing.priceGbpMinor / 100 : (currentListingItem?.priceGbp ?? 0)),
                    'GBP'
                  )}
                </Text>

                {listingAnalytics?.listing.brand || listingAnalytics?.listing.category ? (
                  <Text style={[styles.productHeroMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[listingAnalytics.listing.brand, listingAnalytics.listing.category, listingAnalytics.listing.condition].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Action links — text, no button chrome */}
            <View style={styles.productActionRow}>
              <Pressable
                style={({ pressed }) => [styles.productActionLink, pressed && { opacity: 0.6 }]}
                onPress={() => navigation.navigate('EditListing', { itemId: selectedListingId })}
                accessibilityRole="button"
                accessibilityLabel="Edit this listing"
                accessibilityHint="Opens the listing editor"
              >
                <Ionicons name="create-outline" size={16} color={colors.brand} />
                <Text style={[styles.productActionText, { color: colors.brand }]}>Edit</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.productActionLink, pressed && { opacity: 0.6 }]}
                onPress={() => openProductDetail(navigation, { referenceKind: 'listing', canonicalId: selectedListingId, sourceSurface: 'SellerAnalytics' })}
                accessibilityRole="button"
                accessibilityLabel="View listing detail"
                accessibilityHint="Opens the public storefront view of this listing"
              >
                <Ionicons name="eye-outline" size={16} color={colors.brand} />
                <Text style={[styles.productActionText, { color: colors.brand }]}>Storefront</Text>
              </Pressable>
            </View>

            {listingError ? (
              <View style={styles.listingErrorState}>
                <Text style={[styles.listingErrorText, { color: colors.danger }]}>
                  Couldn't load product analytics
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.listingErrorRetry, { borderColor: colors.brand }, pressed && { opacity: 0.6 }]}
                  onPress={() => { if (selectedListingId) void loadListingAnalytics(selectedListingId); }}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading product analytics"
                >
                  <Text style={[styles.listingErrorRetryText, { color: colors.brand }]}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Product Stats — flat strip, no tiles */}
            {isListingLoading ? (
              <View style={styles.productStatsStrip}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={styles.productStatItem}>
                    <View style={[styles.skeletonBlock, { width: 40, height: 10 }]} />
                    <View style={{ height: 4 }} />
                    <View style={[styles.skeletonBlock, { width: 50, height: 18 }]} />
                  </View>
                ))}
              </View>
            ) : (
            <View style={styles.productStatsStrip}>
              <View style={styles.productStatItem}>
                <Text style={[styles.productStatLabel, { color: colors.textMuted }]}>Views</Text>
                <Text style={[styles.productStatValue, { color: colors.textPrimary }]}>
                  {listingAnalytics?.views ?? 0}
                </Text>
              </View>
              <View style={[styles.productStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.productStatItem}>
                <Text style={[styles.productStatLabel, { color: colors.textMuted }]}>Saves</Text>
                <Text style={[styles.productStatValue, { color: colors.textPrimary }]}>
                  {listingAnalytics?.saves ?? 0}
                </Text>
              </View>
              <View style={[styles.productStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.productStatItem}>
                <Text style={[styles.productStatLabel, { color: colors.textMuted }]}>Offers</Text>
                <Text style={[styles.productStatValue, { color: colors.textPrimary }]}>
                  {listingAnalytics?.offers ?? 0}
                </Text>
              </View>
              <View style={[styles.productStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.productStatItem}>
                <Text style={[styles.productStatLabel, { color: colors.textMuted }]}>Conv.</Text>
                <Text style={[styles.productStatValue, { color: colors.textPrimary }]}>
                  {listingAnalytics?.conversionRate != null ? `${listingAnalytics.conversionRate.toFixed(1)}%` : '—'}
                </Text>
              </View>
            </View>
            )}

            {/* Product Sales Trend */}
            <View style={styles.chartSection}>
              {productChartSeries.length > 0 ? (
                <View style={styles.chartWrapper}>
                  <LineChart
                    data={productChartSeries}
                    height={180}
                    showGrid
                    showCrosshair
                    yAxisFormat={(v) => `£${Math.round(v / 100)}`}
                    xAxisFormat={(v) => String(v)}
                    accessibilitySummary={`Store performance trend over the last ${periodLabel}`}
                  />
                </View>
              ) : (
                <View style={styles.chartEmpty}>
                  <Text style={[styles.chartEmptyText, { color: colors.textMuted }]}>
                    No sales yet
                  </Text>
                </View>
              )}
            </View>

            {/* Market Price Benchmark — flat, no card */}
            {listingAnalytics?.comparables && listingAnalytics.comparables.sampleSize > 0 ? (
              <View style={styles.comparablesSection}>
                <Text style={[styles.comparablesTitle, { color: colors.textPrimary }]}>
                  Sold comparables · {listingAnalytics.listing.category ?? 'this category'} ({listingAnalytics.comparables.sampleSize})
                </Text>

                <View style={styles.comparablesValuesRow}>
                  <View style={styles.compValueItem}>
                    <Text style={[styles.compValueLabel, { color: colors.textMuted }]}>Min</Text>
                    <Text style={[styles.compValueNumber, { color: colors.textPrimary }]}>
                      {listingAnalytics.comparables.minPrice != null ? formatFromFiat(listingAnalytics.comparables.minPrice, 'GBP') : '—'}
                    </Text>
                  </View>
                  <View style={styles.compValueItem}>
                    <Text style={[styles.compValueLabel, { color: colors.brand }]}>Median</Text>
                    <Text style={[styles.compValueNumber, { color: colors.brand }]}>
                      {listingAnalytics.comparables.medianPrice != null ? formatFromFiat(listingAnalytics.comparables.medianPrice, 'GBP') : '—'}
                    </Text>
                  </View>
                  <View style={styles.compValueItem}>
                    <Text style={[styles.compValueLabel, { color: colors.textMuted }]}>Max</Text>
                    <Text style={[styles.compValueNumber, { color: colors.textPrimary }]}>
                      {listingAnalytics.comparables.maxPrice != null ? formatFromFiat(listingAnalytics.comparables.maxPrice, 'GBP') : '—'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Price History — flat list */}
            {listingAnalytics?.priceHistory && listingAnalytics.priceHistory.length > 0 ? (
              <View style={styles.priceHistorySection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Price history</Text>
                <View style={styles.priceHistoryList}>
                  {listingAnalytics.priceHistory.map((event, idx) => (
                    <View key={idx} style={styles.priceHistoryRow}>
                      <Ionicons
                        name={event.newPrice - event.previousPrice < 0 ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                        size={16}
                        color={colors.brand}
                      />
                      <Text style={[styles.priceHistoryText, { color: colors.textPrimary }]}>
                        {formatFromFiat(event.previousPrice, 'GBP')} → {formatFromFiat(event.newPrice, 'GBP')}
                      </Text>
                      <Text style={[styles.priceHistoryDate, { color: colors.textMuted }]}>
                        {new Date(event.changedAt).toLocaleDateString()}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          // VIEW B: ALL LISTINGS / OVERALL STORE ANALYTICS — hero + chart + flat rows
          <View>
            {/* Store Financial Hero — flat, no card */}
            <View style={styles.heroBlock}>
              <Text style={[styles.heroEyebrow, { color: colors.textMuted }]}>
                {heroLabel} · {periodLabel}
              </Text>
              <View style={styles.heroValueRow}>
                <Text style={[styles.heroValue, { color: colors.textPrimary }]}>
                  {heroValue != null ? formatFromFiat(heroValue, 'GBP') : '—'}
                </Text>
                {revenueDelta != null && revenueDelta !== 0 ? (
                  <View style={[styles.deltaPill, { backgroundColor: revenueDelta > 0 ? colors.successSubtle : colors.dangerSubtle }]}>
                    <Ionicons
                      name={revenueDelta > 0 ? 'trending-up' : 'trending-down'}
                      size={12}
                      color={revenueDelta > 0 ? colors.success : colors.danger}
                    />
                    <Text style={[styles.deltaPillText, { color: revenueDelta > 0 ? colors.success : colors.danger }]}>
                      {revenueDelta > 0 ? '+' : ''}{revenueDelta.toFixed(0)}%
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.heroContext, { color: itemsSold != null && itemsSold > 0 ? colors.textSecondary : colors.textMuted }]}>
                {itemsSold != null
                  ? itemsSold > 0
                    ? `${itemsSold} ${itemsSold === 1 ? 'item sold' : 'items sold'}`
                    : 'No sales this period'
                  : '—'}
              </Text>
            </View>

            {/* Primary Chart — bar chart with overlaid previous period line */}
            <View style={styles.chartSection}>
              {barData.length > 0 ? (
                <View style={styles.chartWrapper}>
                  <BarChart
                    data={barData}
                    height={190}
                    barColor={colors.brand}
                    valueFormat={(v: number) => `£${Math.round(v / 100)}`}
                    accessibilitySummary={`Daily sales across last ${periodLabel}`}
                  />
                  {chartSeries.length > 1 ? (
                    <View style={styles.chartLegend}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: colors.brand }]} />
                        <Text style={[styles.legendText, { color: colors.textMuted }]}>This {periodLabel}</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: colors.textMuted }]} />
                        <Text style={[styles.legendText, { color: colors.textMuted }]}>Previous</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={styles.chartEmpty}>
                  <Text style={[styles.chartEmptyText, { color: colors.textMuted }]}>
                    No sales yet
                  </Text>
                </View>
              )}
            </View>

            {/* Conversion Funnel — scaled to first stage, drop-off shown */}
            {funnelData && funnelData.stages.some((s) => s.value > 0) ? (
              <View style={styles.funnelSection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Funnel</Text>
                <View style={styles.funnelList}>
                  {funnelData.stages.map((stage, idx) => {
                    const prevValue = idx > 0 ? funnelData.stages[idx - 1].value : stage.value;
                    const dropOff = idx > 0 && prevValue > 0
                      ? Math.round((1 - stage.value / prevValue) * 100)
                      : null;
                    const barWidth = (stage.value / funnelData.maxVal) * 100;
                    return (
                      <View key={stage.label} style={styles.funnelRow}>
                        <View style={styles.funnelLabelRow}>
                          <Text style={[styles.funnelLabel, { color: colors.textSecondary }]}>{stage.label}</Text>
                          <View style={styles.funnelValueRow}>
                            <Text style={[styles.funnelValue, { color: colors.textPrimary }]}>
                              {stage.value.toLocaleString()}
                            </Text>
                            {dropOff != null ? (
                              <Text style={[styles.funnelDropOff, { color: colors.textMuted }]}>
                                −{dropOff}%
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <View style={[styles.funnelBarTrack, { backgroundColor: colors.surfaceAlt }]}>
                          <View
                            style={[
                              styles.funnelBarFill,
                              { width: `${Math.max(barWidth, 2)}%`, backgroundColor: stage.color },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* KPIs — flat rows, hairline separators, no cards */}
            <View style={styles.kpiList}>
              <View style={styles.kpiRow}>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Items sold</Text>
                <View style={styles.kpiValueRow}>
                  <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{itemsSold != null ? String(itemsSold) : '—'}</Text>
                  {itemsSoldDelta != null && itemsSoldDelta !== 0 ? (
                    <Text style={[styles.kpiDelta, { color: itemsSoldDelta > 0 ? colors.success : colors.danger }]}>
                      {itemsSoldDelta > 0 ? '+' : ''}{itemsSoldDelta.toFixed(0)}%
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.kpiRow}>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Avg order value</Text>
                <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{avgOrderValue != null ? formatFromFiat(avgOrderValue, 'GBP') : '—'}</Text>
              </View>
              <View style={styles.kpiRow}>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Conversion rate</Text>
                <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{conversionRate != null ? `${conversionRate.toFixed(1)}%` : '—'}</Text>
              </View>
              <View style={styles.kpiRow}>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Total views</Text>
                <View style={styles.kpiValueRow}>
                  <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{totalViews != null ? String(totalViews) : '—'}</Text>
                  {viewsDelta != null && viewsDelta !== 0 ? (
                    <Text style={[styles.kpiDelta, { color: viewsDelta > 0 ? colors.success : colors.danger }]}>
                      {viewsDelta > 0 ? '+' : ''}{viewsDelta.toFixed(0)}%
                    </Text>
                  ) : null}
                </View>
              </View>
              {activeListings != null ? (
                <View style={styles.kpiRow}>
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Active listings</Text>
                  <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{String(activeListings)}</Text>
                </View>
              ) : null}
              {avgRating != null ? (
                <View style={styles.kpiRow}>
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Seller rating</Text>
                  <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                    {`${avgRating.toFixed(1)}${reviewCount > 0 ? ` (${reviewCount})` : ''}`}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Top listings — list, not cards */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: Space.lg }]}>Top listings</Text>

            {topPerformers.length > 0 ? (
              <View>
                {topPerformers.map((item) => (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [
                      styles.topListingRow,
                      { borderBottomColor: colors.border },
                      pressed && { opacity: 0.6 },
                    ]}
                    onPress={() => handleListingSelect(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`View analytics for ${item.title}`}
                    accessibilityHint="Opens detailed analytics for this listing"
                  >
                    <View style={[styles.topListingThumb, { backgroundColor: colors.surfaceAlt }]}>
                      {item.imageUrl ? (
                        <CachedImage uri={item.imageUrl} style={styles.topListingThumbImage} contentFit="cover" />
                      ) : (
                        <View style={styles.topListingThumbPlaceholder} />
                      )}
                    </View>
                    <View style={styles.topListingInfo}>
                      <Text style={[styles.topListingRowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.topListingRowMeta, { color: colors.textMuted }]}>
                        {item.views} views{item.likes > 0 ? ` · ${item.likes} likes` : ''}
                      </Text>
                    </View>
                    <View style={styles.topListingRight}>
                      <Text style={[styles.topListingRowPrice, { color: colors.brand }]}>
                        {formatFromFiat(item.price, 'GBP')}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <EmptyState
                icon="analytics"
                title="No views this period"
                subtitle="Listings with views will appear here."
              />
            )}

            {/* Needs attention — list, not cards */}
            {needsAttention.length > 0 ? (
              <View style={{ marginTop: Space.lg }}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Needs attention</Text>
                <View>
                  {needsAttention.map((item) => (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.attentionRow,
                        { borderBottomColor: colors.border },
                        pressed && { opacity: 0.6 },
                      ]}
                      onPress={() => handleListingSelect(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Needs attention: ${item.title}`}
                      accessibilityHint="Opens detailed analytics for this listing"
                    >
                      <View style={[styles.attentionImageWrap, { backgroundColor: colors.surfaceAlt }]}>
                        {item.imageUrl ? (
                          <CachedImage uri={item.imageUrl} style={styles.attentionImage} contentFit="cover" />
                        ) : (
                          <View style={styles.attentionImagePlaceholder} />
                        )}
                      </View>
                      <View style={styles.attentionInfo}>
                        <Text style={[styles.attentionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.attentionIssue, { color: colors.warning }]}>
                          {item.views} views in {periodLabel}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Product scope rail — at bottom, visually light */}
            <View style={styles.productRailWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.productRail}
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.productChip,
                    !selectedListingId && styles.productChipActive,
                    { borderColor: !selectedListingId ? colors.textPrimary : 'transparent' },
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={() => handleListingSelect(null)}
                  accessibilityRole="button"
                  accessibilityLabel="All listings overview"
                  accessibilityHint="Shows aggregate analytics across all your listings"
                >
                  <Ionicons
                    name="grid-outline"
                    size={14}
                    color={!selectedListingId ? colors.textPrimary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.productChipText,
                      { color: !selectedListingId ? colors.textPrimary : colors.textSecondary },
                      !selectedListingId && styles.productChipTextActive,
                    ]}
                  >
                    All ({listings.length})
                  </Text>
                </Pressable>

                {listings.map((item) => {
                  const isSelected = selectedListingId === item.id;
                  const imgUri = item.imageUrl ?? item.images?.[0];
                  return (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.productChip,
                        isSelected && styles.productChipActive,
                        { borderColor: isSelected ? colors.brand : 'transparent' },
                        pressed && { opacity: 0.6 },
                      ]}
                      onPress={() => handleListingSelect(isSelected ? null : item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter analytics for ${item.title}`}
                      accessibilityHint="Shows analytics scoped to this listing"
                    >
                      {imgUri ? (
                        <CachedImage uri={imgUri} style={styles.productChipThumb} contentFit="cover" />
                      ) : (
                        <View style={[styles.productChipThumb, { backgroundColor: colors.surfaceAlt }]} />
                      )}
                      <Text
                        style={[
                          styles.productChipText,
                          { color: isSelected ? colors.textPrimary : colors.textSecondary },
                          isSelected && styles.productChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xxl,
    },
    clearScopeButton: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
    },
    clearScopeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    partialBanner: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    partialBannerText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
    },

    // ── Period tabs ──
    periodRow: {
      flexDirection: 'row',
      gap: Space.lg,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    periodTab: {
      alignItems: 'center',
      paddingVertical: Space.xs - 2,
    },
    periodTabText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    periodTabTextActive: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    periodTabIndicator: {
      height: 2,
      width: '100%',
      marginTop: Space.xxs,
      borderRadius: Radius.sm,
    },
    periodRowSkeleton: {
      flexDirection: 'row',
      gap: Space.lg,
      paddingVertical: Space.sm,
    },

    // ── Hero ──
    heroBlock: {
      paddingVertical: Space.md,
    },
    heroEyebrow: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      marginBottom: Space.xs - 2,
    },
    heroValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    heroValue: {
      fontSize: TypographyV2.priceHero.size,
      lineHeight: TypographyV2.priceHero.lineHeight,
      fontFamily: TypographyV2.priceHero.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    heroContext: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: Space.xs - 2,
    },
    deltaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: Space.xs + 2,
      paddingVertical: 2,
      borderRadius: Radius.full,
    },
    deltaPillText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },

    // ── Chart ──
    chartSection: {
      marginTop: Space.sm,
      marginBottom: Space.md,
    },
    chartWrapper: {
      height: 220,
      marginTop: Space.xs,
    },
    chartLegend: {
      flexDirection: 'row',
      gap: Space.md,
      marginTop: Space.xs,
      paddingHorizontal: Space.xs,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs - 2,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: Radius.sm,
    },
    legendText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
    },
    chartEmpty: {
      height: 140,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.xs,
    },
    chartEmptyText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
    },

    // ── Funnel ──
    funnelSection: {
      marginTop: Space.sm,
      marginBottom: Space.md,
    },
    funnelList: {
      gap: Space.sm,
      marginTop: Space.sm,
    },
    funnelRow: {},
    funnelLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Space.xs - 2,
    },
    funnelLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    funnelValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    funnelValue: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    funnelDropOff: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    funnelBarTrack: {
      height: 6,
      borderRadius: Radius.sm,
      overflow: 'hidden',
    },
    funnelBarFill: {
      height: '100%',
      borderRadius: Radius.sm,
    },

    // ── KPI rows — flat, hairline separators ──
    kpiList: {
      marginTop: Space.sm,
    },
    kpiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    kpiLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    kpiValue: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    kpiValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    kpiDelta: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },

    // ── Section title ──
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      marginBottom: Space.sm,
    },

    // ── Top listings ──
    topListingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    topListingThumb: {
      width: 48,
      height: 48,
      borderRadius: Radius.sm,
      overflow: 'hidden',
    },
    topListingThumbImage: {
      width: '100%',
      height: '100%',
    },
    topListingThumbPlaceholder: {
      flex: 1,
    },
    topListingInfo: {
      flex: 1,
      gap: Space.xs - 2,
    },
    topListingRowTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    topListingRowMeta: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    topListingRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    topListingRowPrice: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },

    // ── Needs attention ──
    attentionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    attentionImageWrap: {
      width: 40,
      height: 40,
      borderRadius: Radius.sm,
      overflow: 'hidden',
    },
    attentionImage: {
      width: '100%',
      height: '100%',
    },
    attentionImagePlaceholder: {
      flex: 1,
    },
    attentionInfo: {
      flex: 1,
      gap: Space.xs - 2,
    },
    attentionTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    attentionIssue: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
    },

    // ── Product scope rail — at bottom, visually light ──
    productRailWrap: {
      marginTop: Space.xl,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    productRail: {
      gap: Space.xs,
      flexDirection: 'row',
      alignItems: 'center',
    },
    productChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    productChipActive: {
      borderWidth: 1,
    },
    productChipThumb: {
      width: 18,
      height: 18,
      borderRadius: Radius.md,
    },
    productChipText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      maxWidth: 120,
    },
    productChipTextActive: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },

    // ── Product Analytics View — flat canvas ──
    productAnalyticsContainer: {
      paddingTop: Space.md,
    },
    productHero: {
      flexDirection: 'row',
      gap: Space.md,
      alignItems: 'center',
    },
    productHeroMedia: {
      width: 72,
      height: 72,
      borderRadius: Radius.sm,
      overflow: 'hidden',
    },
    productHeroImage: {
      width: '100%',
      height: '100%',
    },
    productHeroDetails: {
      flex: 1,
      gap: 2,
    },
    productHeroStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: 2,
    },
    statusText: {
      fontSize: TypographyV2.label.size,
      fontFamily: TypographyV2.label.fontFamily,
      letterSpacing: TypographyV2.label.letterSpacing,
      textTransform: 'uppercase',
    },
    marketDaysText: {
      fontSize: TypographyV2.caption.size,
    },
    productHeroTitle: {
      fontSize: TypographyV2.itemTitle.size,
      fontFamily: TypographyV2.itemTitle.fontFamily,
    },
    productHeroPrice: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    productHeroMeta: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
    },
    productActionRow: {
      flexDirection: 'row',
      gap: Space.lg,
      marginTop: Space.md,
      paddingBottom: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    productActionLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
    },
    productActionText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },

    listingErrorState: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.md,
      gap: Space.md,
    },
    listingErrorText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      flexShrink: 1,
    },
    listingErrorRetry: {
      paddingVertical: Space.xs,
      paddingHorizontal: Space.md,
      borderWidth: 1,
      borderRadius: Radius.md,
    },
    listingErrorRetryText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },

    // ── Product stats strip — flat, no tiles ──
    productStatsStrip: {
      flexDirection: 'row',
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    productStatItem: {
      flex: 1,
      alignItems: 'center',
    },
    productStatLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      marginBottom: 4,
    },
    productStatValue: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    productStatDivider: {
      width: StyleSheet.hairlineWidth,
      marginVertical: Space.xs,
    },

    // ── Comparables — flat, no card ──
    comparablesSection: {
      marginTop: Space.lg,
    },
    comparablesTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      marginBottom: Space.sm,
    },
    comparablesValuesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    compValueItem: {
      alignItems: 'flex-start',
    },
    compValueLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      marginBottom: 2,
    },
    compValueNumber: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },

    // ── Price history ──
    priceHistorySection: {
      marginTop: Space.lg,
    },
    priceHistoryList: {
      marginTop: Space.xs,
      gap: Space.xs,
    },
    priceHistoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
    },
    priceHistoryText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    priceHistoryDate: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
    },

    // ── Skeleton ──
    skeletonBlock: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.sm,
    },
    skeletonKpiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
  });
}
