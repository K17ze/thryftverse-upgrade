import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { useStore } from '../store/useStore';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';
import { fetchSellerAnalytics, fetchTopPerformers, type SellerAnalytics, type TopPerformerListing } from '../services/commerceApi';
import { useReducedMotion } from '../hooks/useReducedMotion';

type NavT = StackNavigationProp<RootStackParamList>;

interface AnalyticsMetric {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  sublabel?: string;
  tone: 'default' | 'success' | 'brand';
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

  const metrics = useMemo<AnalyticsMetric[]>(() => {
    // Use backend analytics when available, fall back to client-side derivation
    if (analytics) {
      const likeRate = analytics.totalViews > 0 ? (analytics.totalLikes / analytics.totalViews) * 100 : 0;
      const conversionRate = analytics.totalViews > 0 ? (analytics.itemsSold / analytics.totalViews) * 100 : 0;
      return [
        { icon: 'eye-outline', label: 'Total views', value: String(analytics.totalViews), tone: 'default' },
        { icon: 'heart-outline', label: 'Total likes', value: String(analytics.totalLikes), sublabel: `${likeRate.toFixed(1)}% like rate`, tone: 'brand' },
        { icon: 'bookmark-outline', label: 'Total saves', value: String(analytics.totalSaves), tone: 'default' },
        { icon: 'checkmark-done', label: 'Items sold', value: String(analytics.itemsSold), tone: 'success' },
        { icon: 'trending-up-outline', label: 'Conversion rate', value: `${conversionRate.toFixed(1)}%`, sublabel: 'Views to sold', tone: 'default' },
        { icon: 'cash-outline', label: 'Revenue', value: `£${(analytics.revenueGbpMinor / 100).toFixed(2)}`, tone: 'success' },
        { icon: 'star-outline', label: 'Avg rating', value: analytics.avgRating ? analytics.avgRating.toFixed(1) : '—', sublabel: `${analytics.reviewCount} reviews`, tone: 'brand' },
        { icon: 'pulse-outline', label: 'Response rate', value: analytics.responseRate != null ? `${(analytics.responseRate * 100).toFixed(0)}%` : '—', tone: 'default' },
      ];
    }
    // Client-side fallback
    const active = listings.filter((l) => l.status === 'active');
    const sold = listings.filter((l) => l.status === 'sold');
    const totalActiveValue = active.reduce((sum, l) => sum + l.priceGbp, 0);
    const totalSoldValue = sold.reduce((sum, l) => sum + l.priceGbp, 0);
    const avgActivePrice = active.length > 0 ? totalActiveValue / active.length : 0;
    const avgSoldPrice = sold.length > 0 ? totalSoldValue / sold.length : 0;
    const totalViews = listings.reduce((sum, l) => sum + (l.engagement?.views ?? 0), 0);
    const totalLikes = listings.reduce((sum, l) => sum + (l.engagement?.likes ?? 0), 0);
    const totalSaves = listings.reduce((sum, l) => sum + (l.engagement?.saves ?? 0), 0);
    const conversionRate = totalViews > 0 ? (sold.length / totalViews) * 100 : 0;
    const likeRate = totalViews > 0 ? (totalLikes / totalViews) * 100 : 0;

    return [
      { icon: 'eye-outline', label: 'Total views', value: String(totalViews), tone: 'default' },
      { icon: 'heart-outline', label: 'Total likes', value: String(totalLikes), sublabel: `${likeRate.toFixed(1)}% like rate`, tone: 'brand' },
      { icon: 'bookmark-outline', label: 'Total saves', value: String(totalSaves), tone: 'default' },
      { icon: 'checkmark-done', label: 'Items sold', value: String(sold.length), tone: 'success' },
      { icon: 'trending-up-outline', label: 'Conversion rate', value: `${conversionRate.toFixed(1)}%`, sublabel: 'Views to sold', tone: 'default' },
      { icon: 'cash-outline', label: 'Total revenue', value: `£${totalSoldValue.toFixed(2)}`, tone: 'success' },
      { icon: 'pricetag-outline', label: 'Avg active price', value: `£${avgActivePrice.toFixed(2)}`, tone: 'default' },
      { icon: 'pulse-outline', label: 'Avg sold price', value: `£${avgSoldPrice.toFixed(2)}`, tone: 'brand' },
    ];
  }, [listings, analytics]);

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
        {/* Hero summary — analytics overview */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.heroRow}>
              <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="bar-chart" size={18} color={colors.textInverse} />
              </View>
              <View style={styles.heroText}>
                <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                  {metrics[0]?.value ?? '—'} {metrics[0]?.label.toLowerCase()}
                </Text>
                <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                  Last {period === '7d' ? '7 days' : period === '30d' ? '30 days' : '90 days'}
                </Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

        {/* Period selector */}
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

        {/* Key metrics grid */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Key metrics</Text>
        </View>
        <View style={styles.metricsGrid}>
          {metrics.map((metric) => {
            const color = metric.tone === 'success' ? colors.success : metric.tone === 'brand' ? colors.brand : colors.textPrimary;
            return (
              <View key={metric.label} style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.metricHeader}>
                  <Ionicons name={metric.icon} size={16} color={color} />
                  <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{metric.label}</Text>
                </View>
                <Text style={[styles.metricValue, { color }]}>{metric.value}</Text>
                {metric.sublabel ? (
                  <Text style={[styles.metricSublabel, { color: colors.textMuted }]}>{metric.sublabel}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
        </Reanimated.View>

        {/* Top performing listings */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Top performing listings</Text>
        </View>
        {topPerformers.length > 0 ? (
          <View style={styles.topList}>
            {topPerformers.map((item, index) => (
              <View key={item.id} style={[styles.topRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.rankText, { color: colors.textMuted }]}>{index + 1}</Text>
                <View style={styles.topInfo}>
                  <Text style={[styles.topTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.topMeta, { color: colors.textMuted }]}>{item.views} views · {item.likes} likes</Text>
                </View>
                <Text style={[styles.topPrice, { color: colors.brand }]}>£{item.price.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="bar-chart-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textPrimary }]}>No performance data yet</Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Listings with views will appear here</Text>
          </View>
        )}
        </Reanimated.View>
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  heroSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
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
  sectionHeader: {
    marginTop: Space.md,
    marginBottom: Space.sm,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  metricCard: {
    flex: 1,
    minWidth: '47%',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  metricValue: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
  },
  metricSublabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
  topList: {
    gap: Space.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rankText: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    minWidth: 20,
  },
  topInfo: {
    flex: 1,
    gap: 2,
  },
  topTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  topMeta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  topPrice: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.xs,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  emptySubtext: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  });
}
