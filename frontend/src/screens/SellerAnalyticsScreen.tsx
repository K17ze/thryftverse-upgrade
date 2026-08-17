import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
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

type NavT = NativeStackNavigationProp<RootStackParamList>;

const TOP_LISTING_CARD_WIDTH = 140;

interface KpiRow {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  sublabel?: string;
}

type Period = '7d' | '30d' | '90d' | '1y';

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: '1y', label: '1y' },
];

export default function SellerAnalyticsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((s) => s.currentUser);
  const { isOffline } = useConnectivity();

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [analytics, setAnalytics] = React.useState<SellerAnalytics | null>(null);
  const [topPerformersData, setTopPerformersData] = React.useState<TopPerformerListing[]>([]);
  const [period, setPeriod] = React.useState<Period>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const [listingsRes, analyticsData, topData] = await Promise.all([
        fetchUserListingsFromApi(currentUser.id, { limit: 100 }),
        fetchSellerAnalytics(currentUser.id, period).catch(() => null),
        fetchTopPerformers(currentUser.id, 10).catch(() => [] as TopPerformerListing[]),
      ]);
      setListings(listingsRes.items);
      if (analyticsData) setAnalytics(analyticsData);
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

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  // ── Primary outcome: revenue ──
  const revenue = useMemo(() => {
    if (analytics) return analytics.revenueGbpMinor / 100;
    const sold = listings.filter((l) => l.status === 'sold');
    return sold.reduce((sum, l) => sum + l.priceGbp, 0);
  }, [analytics, listings]);

  const itemsSold = useMemo(() => {
    if (analytics) return analytics.itemsSold;
    return listings.filter((l) => l.status === 'sold').length;
  }, [analytics, listings]);

  const totalViews = useMemo(() => {
    if (analytics) return analytics.totalViews;
    return listings.reduce((sum, l) => sum + (l.engagement?.views ?? 0), 0);
  }, [analytics, listings]);

  const totalLikes = useMemo(() => {
    if (analytics) return analytics.totalLikes;
    return listings.reduce((sum, l) => sum + (l.engagement?.likes ?? 0), 0);
  }, [analytics, listings]);

  const conversionRate = useMemo(() => {
    const views = analytics ? analytics.totalViews : listings.reduce((sum, l) => sum + (l.engagement?.views ?? 0), 0);
    const sold = analytics ? analytics.itemsSold : listings.filter((l) => l.status === 'sold').length;
    return views > 0 ? (sold / views) * 100 : 0;
  }, [analytics, listings]);

  const avgRating = analytics?.avgRating ?? null;
  const reviewCount = analytics?.reviewCount ?? 0;

  // ── Avg order value ──
  const avgOrderValue = useMemo(() => {
    if (itemsSold === 0) return 0;
    return revenue / itemsSold;
  }, [revenue, itemsSold]);

  // ── Trend indicator: percentage change vs items sold baseline ──
  const trendPercentage = useMemo(() => {
    if (itemsSold === 0) return 0;
    // Use conversion rate as a proxy for trend direction
    if (conversionRate > 0) {
      return Math.min(999, Math.round(conversionRate * 10) / 10);
    }
    return 0;
  }, [conversionRate, itemsSold]);

  // ── Supporting KPIs as flat rows (2-4 max) ──
  const kpiRows = useMemo<KpiRow[]>(() => {
    return [
      { icon: 'checkmark-done', label: 'Items sold', value: String(itemsSold) },
      {
        icon: 'cash-outline',
        label: 'Avg order value',
        value: avgOrderValue > 0 ? `£${avgOrderValue.toFixed(2)}` : '—',
      },
      { icon: 'trending-up-outline', label: 'Conversion', value: `${conversionRate.toFixed(1)}%` },
      { icon: 'eye-outline', label: 'Views', value: String(totalViews) },
    ];
  }, [itemsSold, avgOrderValue, conversionRate, totalViews]);

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
          imageUrl: listing?.imageUrl ?? listing?.images?.[0] ?? null,
        };
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
        imageUrl: l.imageUrl ?? l.images?.[0] ?? null,
      }));
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
        imageUrl: l.imageUrl ?? l.images?.[0] ?? null,
      }));
  }, [listings]);

  const periodLabel = period === '7d' ? '7 days' : period === '30d' ? '30 days' : period === '90d' ? '90 days' : '1 year';

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
            {[0, 1, 2, 3].map((i) => (
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
          <View style={{ flexDirection: 'row', gap: Space.sm }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skeletonTopCard}>
                <View style={{ backgroundColor: colors.surfaceAlt, width: '100%', height: 90, borderRadius: Radius.md }} />
                <View style={{ height: Space.xs }} />
                <View style={{ backgroundColor: colors.surfaceAlt, height: 12, width: '80%', borderRadius: Radius.sm }} />
                <View style={{ height: 4 }} />
                <View style={{ backgroundColor: colors.surfaceAlt, height: 14, width: 50, borderRadius: Radius.sm }} />
              </View>
            ))}
          </View>
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
      header={<FlagshipHeader title="Seller Analytics" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {isOffline ? (
        <OfflineBanner onRetry={() => void onRefresh()} />
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
            £{revenue.toFixed(2)}
          </Text>
          <View style={styles.heroTrendRow}>
            <Ionicons
              name={itemsSold > 0 ? 'trending-up' : 'remove'}
              size={14}
              color={itemsSold > 0 ? colors.success : colors.textMuted}
            />
            <Text style={[styles.heroTrendText, { color: itemsSold > 0 ? colors.success : colors.textMuted }]}>
              {itemsSold > 0
                ? `${trendPercentage}% conv · ${itemsSold} ${itemsSold === 1 ? 'item sold' : 'items sold'}`
                : 'No sales yet'}
            </Text>
          </View>
        </View>

        {/* ── Period selector — segmented control (7d / 30d / 90d / 1y) ── */}
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

        {/* ── Top listings — horizontal scroll of compact cards ── */}
        <View>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Top listings</Text>
          </View>
          {topPerformers.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.topListingsScroll}
            >
              {topPerformers.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.topListingCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => handleListingPress(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Listing: ${item.title}, ${item.views} views, £${item.price.toFixed(0)} revenue`}
                >
                  <View style={[styles.topListingImageWrap, { backgroundColor: colors.surfaceAlt }]}>
                    {item.imageUrl ? (
                      <CachedImage
                        uri={item.imageUrl}
                        style={styles.topListingImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.topListingImagePlaceholder}>
                        <Ionicons name="image-outline" size={20} color={colors.textMuted} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.topListingTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.topListingRevenue, { color: colors.brand }]}>
                    £{item.price.toFixed(0)}
                  </Text>
                  <Text style={[styles.topListingMeta, { color: colors.textMuted }]}>
                    {item.views} views
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
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
                  accessibilityLabel={`Needs attention: ${item.title}, ${item.views} views, £${item.price.toFixed(0)}`}
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
                    £{item.price.toFixed(0)}
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
      paddingBottom: Space.xl,
    },

    // ── Primary outcome hero ──
    heroBlock: {
      paddingVertical: Space.md,
    },
    heroEyebrow: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      letterSpacing: Type.caption.letterSpacing,
      marginBottom: Space.xs - 2,
    },
    heroValue: {
      fontSize: Type.priceHero.size,
      lineHeight: Type.priceHero.lineHeight,
      fontFamily: Typography.family.bold,
      fontVariant: ['tabular-nums'],
    },
    heroTrendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs,
    },
    heroTrendText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      fontVariant: ['tabular-nums'],
    },

    // ── Period selector — segmented control ──
    periodSegmentRow: {
      flexDirection: 'row',
      gap: Space.xs,
      marginVertical: Space.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      padding: 2,
    },
    periodSegment: {
      flex: 1,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 36,
    },
    periodSegmentText: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
    },

    // ── KPI flat rows ──
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
    kpiLabelCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
    },
    kpiLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
    },
    kpiValue: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      fontVariant: ['tabular-nums'],
    },

    // ── Section headers ──
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Space.lg,
      marginBottom: Space.sm,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    sectionTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
    },
    sectionHint: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
    },

    // ── Top listings — horizontal scroll cards ──
    topListingsScroll: {
      gap: Space.sm,
      paddingRight: Space.md,
    },
    topListingCard: {
      width: TOP_LISTING_CARD_WIDTH,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.sm,
      gap: Space.xs - 1,
    },
    topListingImageWrap: {
      width: '100%',
      height: 90,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      marginBottom: Space.xs - 1,
    },
    topListingImage: {
      width: '100%',
      height: '100%',
    },
    topListingImagePlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topListingTitle: {
      fontSize: Type.captionElevated.size,
      lineHeight: Type.captionElevated.lineHeight,
      fontFamily: Typography.family.semibold,
    },
    topListingRevenue: {
      fontSize: Type.bodyEmphasis.size,
      lineHeight: Type.bodyEmphasis.lineHeight,
      fontFamily: Typography.family.bold,
      fontVariant: ['tabular-nums'],
    },
    topListingMeta: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      fontVariant: ['tabular-nums'],
    },

    // ── Needs attention — flat rows with images ──
    listingList: {
      gap: 0,
    },
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
      alignItems: 'center',
      justifyContent: 'center',
    },
    attentionInfo: {
      flex: 1,
      gap: Space.xs - 2,
    },
    attentionTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
    },
    attentionIssue: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
    },
    attentionPrice: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.bold,
      fontVariant: ['tabular-nums'],
    },

    // ── Skeleton ──
    skeletonKpiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
    },
    skeletonTopCard: {
      width: TOP_LISTING_CARD_WIDTH,
      padding: Space.sm,
    },
  });
}
