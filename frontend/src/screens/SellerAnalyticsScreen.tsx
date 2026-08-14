import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { useStore } from '../store/useStore';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';
import { fetchSellerAnalytics, fetchTopPerformers, type SellerAnalytics, type TopPerformerListing } from '../services/commerceApi';
import { useReducedMotion } from '../hooks/useReducedMotion';

type NavT = NativeStackNavigationProp<RootStackParamList>;

interface KpiRow {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  sublabel?: string;
}

export default function SellerAnalyticsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((s) => s.currentUser);
  const reducedMotionEnabled = useReducedMotion();

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [analytics, setAnalytics] = React.useState<SellerAnalytics | null>(null);
  const [topPerformersData, setTopPerformersData] = React.useState<TopPerformerListing[]>([]);
  const [period, setPeriod] = React.useState<'7d' | '30d' | '90d'>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    } catch {
      // silent — fall back to client-side derived metrics
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

  // ── Supporting KPIs as flat rows (2-4 max) ──
  const kpiRows = useMemo<KpiRow[]>(() => {
    return [
      { icon: 'eye-outline', label: 'Views', value: String(totalViews) },
      { icon: 'checkmark-done', label: 'Items sold', value: String(itemsSold) },
      { icon: 'trending-up-outline', label: 'Conversion', value: `${conversionRate.toFixed(1)}%` },
      {
        icon: 'star-outline',
        label: 'Avg rating',
        value: avgRating ? avgRating.toFixed(1) : '—',
        sublabel: reviewCount > 0 ? `${reviewCount} reviews` : undefined,
      },
    ];
  }, [totalViews, itemsSold, conversionRate, avgRating, reviewCount]);

  // ── Top listings ──
  const topPerformers = useMemo(() => {
    if (topPerformersData.length > 0) {
      return topPerformersData.map((t) => ({
        id: t.id,
        title: t.title,
        price: t.priceGbpMinor / 100,
        views: t.viewsCount,
        likes: t.likesCount,
        status: t.status,
      }));
    }
    return [...listings]
      .sort((a, b) => (b.engagement?.views ?? 0) - (a.engagement?.views ?? 0))
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        title: l.title,
        price: l.priceGbp,
        views: l.engagement?.views ?? 0,
        likes: l.engagement?.likes ?? 0,
        status: l.status,
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
      }));
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
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Seller Analytics" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* ── Primary outcome: revenue hero ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
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
                {itemsSold} {itemsSold === 1 ? 'item sold' : 'items sold'}
              </Text>
            </View>
          </View>
        </Reanimated.View>

        {/* ── Period selector ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)} style={styles.periodRow}>
          {(['7d', '30d', '90d'] as const).map((p) => {
            const isActive = period === p;
            return (
              <Pressable
                key={p}
                style={[styles.periodTab, isActive && { backgroundColor: colors.brand }]}
                onPress={() => { setPeriod(p); setIsLoading(true); }}
              >
                <Text style={[styles.periodTabText, isActive && { color: colors.textInverse }]}>
                  {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '90 days'}
                </Text>
              </Pressable>
            );
          })}
        </Reanimated.View>

        {/* ── Supporting KPIs as flat rows ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
          <View style={styles.kpiList}>
            {kpiRows.map((kpi) => (
              <View key={kpi.label} style={styles.kpiRow}>
                <View style={styles.kpiLabelCol}>
                  <Ionicons name={kpi.icon} size={16} color={colors.textSecondary} />
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>{kpi.label}</Text>
                </View>
                <View style={styles.kpiValueCol}>
                  <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{kpi.value}</Text>
                  {kpi.sublabel ? (
                    <Text style={[styles.kpiSublabel, { color: colors.textMuted }]}>{kpi.sublabel}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </Reanimated.View>

        {/* ── Top listings ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your top listings</Text>
          </View>
          {topPerformers.length > 0 ? (
            <View style={styles.listingList}>
              {topPerformers.map((item, index) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.listingRow,
                    { borderBottomColor: colors.border },
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={() => handleListingPress(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Listing: ${item.title}, ${item.views} views, ${item.likes} likes, £${item.price.toFixed(0)}`}
                >
                  <Text style={[styles.rankText, { color: colors.textMuted }]}>{index + 1}</Text>
                  <View style={styles.listingInfo}>
                    <Text style={[styles.listingTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.listingMeta, { color: colors.textMuted }]}>{item.views} views · {item.likes} likes</Text>
                  </View>
                  <Text style={[styles.listingPrice, { color: colors.brand }]}>£{item.price.toFixed(0)}</Text>
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
        </Reanimated.View>

        {/* ── Needs attention ── */}
        {needsAttention.length > 0 ? (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)}>
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
                    styles.listingRow,
                    { borderBottomColor: colors.border },
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={() => handleListingPress(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Needs attention: ${item.title}, ${item.views} views, £${item.price.toFixed(0)}`}
                >
                  <Ionicons name="eye-off-outline" size={16} color={colors.warning} />
                  <View style={styles.listingInfo}>
                    <Text style={[styles.listingTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.listingMeta, { color: colors.textMuted }]}>{item.views} views · {item.likes} likes</Text>
                  </View>
                  <Text style={[styles.listingPrice, { color: colors.textSecondary }]}>£{item.price.toFixed(0)}</Text>
                </Pressable>
              ))}
            </View>
          </Reanimated.View>
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
    },

    // ── Period selector ──
    periodRow: {
      flexDirection: 'row',
      gap: Space.xs,
      marginVertical: Space.sm,
    },
    periodTab: {
      paddingVertical: Space.xs,
      paddingHorizontal: Space.sm + 2,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
    },
    periodTabText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
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
    kpiValueCol: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.xs,
    },
    kpiValue: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      fontVariant: ['tabular-nums'],
    },
    kpiSublabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
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

    // ── Listing rows ──
    listingList: {
      gap: 0,
    },
    listingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rankText: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
      minWidth: 20,
    },
    listingInfo: {
      flex: 1,
      gap: Space.xs - 2,
    },
    listingTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
    },
    listingMeta: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
    },
    listingPrice: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.bold,
      fontVariant: ['tabular-nums'],
    },
  });
}
