import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius } from '../theme/designTokens';
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
import { track } from '../analytics';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useA11yAudit } from '../hooks/useA11yAudit';


type NavT = NativeStackNavigationProp<RootStackParamList>;

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
  const currentUser = useStore((s) => s.currentUser);
  const { isOffline } = useConnectivity();
  const { currencyCode, currencySymbol, formatFromFiat } = useFormattedPrice();

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
  const [topPerformersData, setTopPerformersData] = useState<TopPerformerListing[]>([]);
  const [period, setPeriod] = useState<Period>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [partialError, setPartialError] = useState(false);
  const [topPerformersError, setTopPerformersError] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      setPartialError(false);
      setTopPerformersError(false);
      const [listingsRes, analyticsData, topData] = await Promise.all([
        fetchUserListingsFromApi(currentUser.id, { limit: 100 }),
        fetchSellerAnalytics(currentUser.id, period).catch(() => null),
        fetchTopPerformers(currentUser.id, 10).catch(() => null),
      ]);
      setListings(listingsRes.items);
      if (analyticsData) {
        setAnalytics(analyticsData);
      } else {
        setPartialError(true);
      }
      // Top performers: use real API data only. No client-side fallback —
      // presenting client-sorted listings as "top performers" is a truth
      // defect (AGENTS.md §11). When the endpoint fails, show an honest
      // error state for that section instead.
      if (topData) {
        setTopPerformersData(topData);
      } else {
        setTopPerformersError(true);
        setTopPerformersData([]);
      }
      setIsError(false);
    } catch {
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

  // ── Primary outcome: net sales (revenue − refunds − fees) ──
  // Falls back to gross revenue when ledger data is unavailable (completeness
  // = 'partial'). The hero label changes to reflect which figure is shown.
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

  // AOV — only meaningful when both revenue and items sold are real
  const avgOrderValue = useMemo<number | null>(() => {
    if (heroValue == null || itemsSold == null || itemsSold === 0) return null;
    return heroValue / itemsSold;
  }, [heroValue, itemsSold]);

  // Conversion rate — period-scoped views vs period-scoped items sold.
  // Both now come from real data sources (interactions table + orders).
  const conversionRate = useMemo<number | null>(() => {
    if (!analytics || totalViews == null || itemsSold == null) return null;
    return totalViews > 0 ? (itemsSold / totalViews) * 100 : 0;
  }, [analytics, totalViews, itemsSold]);

  // ── Supporting KPIs as flat rows — no icons, label + value only ──
  // Per anti-AI design policy: remove label-everything disease. The label
  // is the label; an icon adds noise without information.
  const kpiRows = useMemo(() => {
    const rows: { label: string; value: string }[] = [
      { label: 'Items sold', value: itemsSold != null ? String(itemsSold) : '—' },
      {
        label: 'Avg order value',
        value: avgOrderValue != null ? formatFromFiat(avgOrderValue, currencyCode) : '—',
      },
      {
        label: 'Conversion',
        value: conversionRate != null ? `${conversionRate.toFixed(1)}%` : '—',
      },
      { label: 'Views', value: totalViews != null ? String(totalViews) : '—' },
    ];
    if (activeListings != null) {
      rows.push({ label: 'Active listings', value: String(activeListings) });
    }
    if (avgRating != null) {
      rows.push({
        label: 'Avg rating',
        value: `${avgRating.toFixed(1)}${reviewCount > 0 ? ` (${reviewCount})` : ''}`,
      });
    }
    return rows;
  }, [itemsSold, avgOrderValue, conversionRate, totalViews, activeListings, avgRating, reviewCount, formatFromFiat, currencyCode]);

  // ── Top listings — enriched with imageUrl from listings data ──
  // Real API data only. No client-side fallback sort.
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
    navigation.navigate('ItemDetail', { itemId: listingId });
  }, [navigation]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Analytics" onBack={() => navigation.goBack()} />}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={{ height: Space.md }} />
          <View style={{ backgroundColor: colors.surfaceAlt, height: 12, width: '30%', borderRadius: Radius.sm }} />
          <View style={{ height: Space.xs }} />
          <View style={{ backgroundColor: colors.surfaceAlt, height: 34, width: '60%', borderRadius: Radius.sm }} />
          <View style={{ height: Space.xs }} />
          <View style={{ backgroundColor: colors.surfaceAlt, height: 13, width: '35%', borderRadius: Radius.sm }} />
          <View style={{ height: Space.lg }} />
          {/* Period tabs skeleton */}
          <View style={{ flexDirection: 'row', gap: Space.lg }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ backgroundColor: colors.surfaceAlt, height: 16, width: 30, borderRadius: Radius.sm }} />
            ))}
          </View>
          {/* KPI rows skeleton */}
          <View style={{ height: Space.md }} />
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonKpiRow}>
              <View style={{ backgroundColor: colors.surfaceAlt, height: 14, width: '40%', borderRadius: Radius.sm }} />
              <View style={{ flex: 1 }} />
              <View style={{ backgroundColor: colors.surfaceAlt, height: 16, width: 60, borderRadius: Radius.sm }} />
            </View>
          ))}
          {/* Top listings skeleton */}
          <View style={{ height: Space.lg }} />
          <View style={{ backgroundColor: colors.surfaceAlt, height: 14, width: '35%', borderRadius: Radius.sm }} />
          <View style={{ height: Space.sm }} />
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ backgroundColor: colors.surfaceAlt, width: 56, height: 56, borderRadius: Radius.sm }} />
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

  // ── Error state ──
  if (isError && listings.length === 0) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Analytics" onBack={() => navigation.goBack()} />}
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
        {/* ── Hero: net sales or revenue ──
            One dominant object — the primary financial outcome.
            No card, no chrome. The number IS the object. */}
        <View style={styles.heroBlock}>
          <Text style={[styles.heroEyebrow, { color: colors.textMuted }]}>
            {heroLabel} · Last {periodLabel}
          </Text>
          <Text style={[styles.heroValue, { color: colors.textPrimary }]}>
            {heroValue != null ? formatFromFiat(heroValue, currencyCode) : '—'}
          </Text>
          <Text style={[styles.heroContext, { color: itemsSold != null && itemsSold > 0 ? colors.textSecondary : colors.textMuted }]}>
            {itemsSold != null
              ? itemsSold > 0
                ? `${itemsSold} ${itemsSold === 1 ? 'item sold' : 'items sold'}`
                : 'No sales in this period'
              : '—'}
          </Text>
        </View>

        {/* ── Period selector — hairline tabs, no pill chrome ──
            Per anti-AI design: no grey surface, no rounded pill.
            Selected tab indicated by text weight + underline only. */}
        <View style={styles.periodRow}>
          {PERIOD_OPTIONS.map((opt) => {
            const isActive = period === opt.key;
            return (
              <Pressable
                key={opt.key}
                style={styles.periodTab}
                onPress={() => { haptics.tap(); setPeriod(opt.key); }}
                accessibilityRole="button"
                accessibilityLabel={`Period: ${opt.label}`}
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              >
                <Text style={[
                  styles.periodTabText,
                  { color: isActive ? colors.textPrimary : colors.textMuted },
                  isActive && styles.periodTabTextActive,
                ]}>
                  {opt.label}
                </Text>
                {isActive ? (
                  <View style={[styles.periodTabIndicator, { backgroundColor: colors.textPrimary }]} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* ── KPI rows — flat, no icons, hairline dividers ──
            Label on the left, value on the right. No card surface.
            Per anti-AI design: remove label-everything disease. */}
        <View style={styles.kpiList}>
          {kpiRows.map((kpi) => (
            <View key={kpi.label} style={styles.kpiRow}>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>{kpi.label}</Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{kpi.value}</Text>
            </View>
          ))}
        </View>

        {/* ── Top listings — media-first rows with hairline dividers ──
            Larger thumbnails (56pt) for stronger media presence.
            No card-on-card; flat rows on the canvas. */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Top listings</Text>
        </View>
        {topPerformersError ? (
          <View style={styles.sectionErrorWrap}>
            <Text style={[styles.sectionErrorText, { color: colors.textMuted }]}>
              Couldn't load top listings. Pull to retry.
            </Text>
          </View>
        ) : topPerformers.length > 0 ? (
          <View>
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
                accessibilityLabel={`Listing: ${item.title}, ${item.views} views, ${currencySymbol}${item.price.toFixed(0)}`}
              >
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
                    {item.views} views{item.likes > 0 ? ` · ${item.likes} likes` : ''}
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
            icon="analytics"
            title="No performance data yet"
            subtitle="Listings with views will appear here"
          />
        )}

        {/* ── Needs attention — flat rows, only when present ── */}
        {needsAttention.length > 0 ? (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Needs attention</Text>
              <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Low views</Text>
            </View>
            <View>
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
                    <Text style={[styles.attentionIssue, { color: colors.warning }]}>
                      {item.views} views
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

    // ── Hero — flat, no card ──
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
    heroContext: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'],
      marginTop: Space.xs - 2 },

    // ── Period selector — hairline tabs, no pill ──
    periodRow: {
      flexDirection: 'row',
      gap: Space.lg,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    periodTab: {
      alignItems: 'center',
      paddingVertical: Space.xs - 2 },
    periodTabText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    periodTabTextActive: {
      fontFamily: TypographyV2.bodyStrong.fontFamily },
    periodTabIndicator: {
      height: 2,
      width: '100%',
      marginTop: Space.xxs,
      borderRadius: 1 },

    // ── KPI flat rows — no icons, no card ──
    kpiList: {
      marginTop: Space.sm },
    kpiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
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
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily },
    sectionHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    sectionErrorWrap: {
      paddingVertical: Space.md },
    sectionErrorText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },

    // ── Top listings — media-first rows ──
    topListingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth },
    topListingThumb: {
      width: 56,
      height: 56,
      borderRadius: Radius.sm,
      overflow: 'hidden' },
    topListingThumbImage: {
      width: '100%',
      height: '100%' },
    topListingThumbPlaceholder: {
      flex: 1 },
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

    // ── Needs attention ──
    attentionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth },
    attentionImageWrap: {
      width: 44,
      height: 44,
      borderRadius: Radius.sm,
      overflow: 'hidden' },
    attentionImage: {
      width: '100%',
      height: '100%' },
    attentionImagePlaceholder: {
      flex: 1 },
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
