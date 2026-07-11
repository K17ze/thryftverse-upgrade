import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useStore } from '../store/useStore';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';

type NavT = StackNavigationProp<RootStackParamList>;

interface AnalyticsMetric {
  icon: string;
  label: string;
  value: string;
  sublabel?: string;
  tone: 'default' | 'success' | 'brand';
}

export default function SellerAnalyticsScreen() {
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((s) => s.currentUser);

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: 100 });
      setListings(res.items);
    } catch {
      // silent
    }
  }, [currentUser?.id]);

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
    const active = listings.filter((l) => l.status === 'active');
    const sold = listings.filter((l) => l.status === 'sold');
    const totalActiveValue = active.reduce((sum, l) => sum + l.priceGbp, 0);
    const totalSoldValue = sold.reduce((sum, l) => sum + l.priceGbp, 0);
    const avgActivePrice = active.length > 0 ? totalActiveValue / active.length : 0;
    const avgSoldPrice = sold.length > 0 ? totalSoldValue / sold.length : 0;
    const totalViews = listings.reduce((sum, l) => sum + ((l as any).views ?? 0), 0);
    const totalLikes = listings.reduce((sum, l) => sum + ((l as any).likes ?? 0), 0);
    const totalSaves = listings.reduce((sum, l) => sum + ((l as any).saves ?? 0), 0);
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
  }, [listings]);

  const topPerformers = useMemo(() => {
    return [...listings]
      .sort((a, b) => ((b as any).views ?? 0) - ((a as any).views ?? 0))
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        title: l.title,
        price: l.priceGbp,
        views: (l as any).views ?? 0,
        likes: (l as any).likes ?? 0,
        status: l.status,
      }));
  }, [listings]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} />
        <ScreenHeader title="Seller Analytics" onBack={() => navigation.goBack()} />
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} />
      <ScreenHeader title="Seller Analytics" onBack={() => navigation.goBack()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* Key metrics grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Key metrics</Text>
        </View>
        <View style={styles.metricsGrid}>
          {metrics.map((metric) => {
            const color = metric.tone === 'success' ? Colors.success : metric.tone === 'brand' ? Colors.brand : Colors.textPrimary;
            return (
              <View key={metric.label} style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Ionicons name={metric.icon as any} size={16} color={color} />
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                </View>
                <Text style={[styles.metricValue, { color }]}>{metric.value}</Text>
                {metric.sublabel ? (
                  <Text style={styles.metricSublabel}>{metric.sublabel}</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Top performing listings */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top performing listings</Text>
        </View>
        {topPerformers.length > 0 ? (
          <View style={styles.topList}>
            {topPerformers.map((item, index) => (
              <View key={item.id} style={styles.topRow}>
                <Text style={styles.rankText}>{index + 1}</Text>
                <View style={styles.topInfo}>
                  <Text style={styles.topTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.topMeta}>{item.views} views · {item.likes} likes</Text>
                </View>
                <Text style={styles.topPrice}>£{item.price.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="bar-chart-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No performance data yet</Text>
            <Text style={styles.emptySubtext}>Listings with views will appear here</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  sectionHeader: {
    marginTop: Space.md,
    marginBottom: Space.sm,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
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
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    gap: 4,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  metricValue: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
  },
  metricSublabel: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
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
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  rankText: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.brand,
    minWidth: 20,
  },
  topInfo: {
    flex: 1,
    gap: 2,
  },
  topTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  topMeta: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  topPrice: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.xs,
  },
  emptyText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  emptySubtext: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
});
