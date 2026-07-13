import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { SellerStandardsBadges } from '../components/profile/SellerStandardsBadges';
import { useStore } from '../store/useStore';
import { useSellerTrust } from '../platform/product';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';

type NavT = StackNavigationProp<RootStackParamList>;

interface HubStat {
  icon: string;
  label: string;
  value: string;
  tone: 'default' | 'success' | 'brand';
}

interface HubAction {
  icon: string;
  label: string;
  subtitle: string;
  onPress: () => void;
  accessibilityLabel: string;
}

export default function SellerHubScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const currentUser = useStore((s) => s.currentUser);
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: 100 });
      setListings(res.items);
    } catch {
      // silent — empty state will show
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

  const stats = useMemo<HubStat[]>(() => {
    const active = listings.filter((l) => l.status === 'active');
    const sold = listings.filter((l) => l.status === 'sold');
    const totalActiveValue = active.reduce((sum, l) => sum + l.priceGbp, 0);
    const totalSoldValue = sold.reduce((sum, l) => sum + l.priceGbp, 0);
    const totalViews = listings.reduce((sum, l) => sum + ((l as any).views ?? 0), 0);
    const totalLikes = listings.reduce((sum, l) => sum + ((l as any).likes ?? 0), 0);
    const conversionRate = totalViews > 0 ? (sold.length / totalViews) * 100 : 0;

    return [
      { icon: 'pricetag-outline', label: 'Active listings', value: String(active.length), tone: 'success' },
      { icon: 'checkmark-done', label: 'Sold', value: String(sold.length), tone: 'brand' },
      { icon: 'cash-outline', label: 'Active value', value: `£${totalActiveValue.toFixed(0)}`, tone: 'default' },
      { icon: 'trending-up-outline', label: 'Revenue', value: `£${totalSoldValue.toFixed(0)}`, tone: 'default' },
      { icon: 'eye-outline', label: 'Total views', value: String(totalViews), tone: 'default' },
      { icon: 'heart-outline', label: 'Total likes', value: String(totalLikes), tone: 'default' },
      { icon: 'stats-chart-outline', label: 'Conversion', value: `${conversionRate.toFixed(1)}%`, tone: 'default' },
      { icon: 'pause-outline', label: 'Paused', value: String(listings.filter((l) => l.status === 'paused').length), tone: 'default' },
    ];
  }, [listings]);

  const actions = useMemo<HubAction[]>(() => [
    {
      icon: 'add-circle-outline',
      label: 'Create listing',
      subtitle: 'List a new item for sale',
      onPress: () => navigation.navigate('Sell'),
      accessibilityLabel: 'Create a new listing',
    },
    {
      icon: 'list-outline',
      label: 'My listings',
      subtitle: 'Manage active and sold listings',
      onPress: () => navigation.navigate('MyListings'),
      accessibilityLabel: 'View all your listings',
    },
    {
      icon: 'bar-chart-outline',
      label: 'Analytics',
      subtitle: 'Views, likes, conversion and revenue',
      onPress: () => navigation.navigate('SellerAnalytics'),
      accessibilityLabel: 'View seller analytics dashboard',
    },
    {
      icon: 'trophy-outline',
      label: 'Auctions',
      subtitle: 'Manage auction listings',
      onPress: () => navigation.navigate('SellerAuctionCentre'),
      accessibilityLabel: 'Manage your auctions',
    },
    {
      icon: 'receipt-outline',
      label: 'Orders',
      subtitle: 'View and fulfil orders',
      onPress: () => navigation.navigate('MyOrders'),
      accessibilityLabel: 'View your orders',
    },
    {
      icon: 'wallet-outline',
      label: 'Payouts',
      subtitle: 'Withdraw your earnings',
      onPress: () => navigation.navigate('Wallet'),
      accessibilityLabel: 'View your wallet and payouts',
    },
    {
      icon: 'shield-checkmark-outline',
      label: 'Verification',
      subtitle: 'ID, phone and seller standards',
      onPress: () => navigation.navigate('Verification'),
      accessibilityLabel: 'Manage your verification status',
    },
  ], [navigation]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScreenHeader title="Seller Hub" onBack={() => navigation.goBack()} />
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader title="Seller Hub" onBack={() => navigation.goBack()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* Seller standards badges */}
        {sellerTrust ? (
          <View style={styles.badgeSection}>
            <SellerStandardsBadges sellerTrust={sellerTrust} align="left" />
          </View>
        ) : null}

        {/* Analytics dashboard */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Performance overview</Text>
        </View>
        <View style={styles.statsGrid}>
          {stats.map((stat) => {
            const color = stat.tone === 'success' ? colors.success : stat.tone === 'brand' ? colors.brand : colors.textPrimary;
            return (
              <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name={stat.icon as any} size={16} color={color} />
                <Text style={[styles.statValue, { color }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
              </View>
            );
          })}
        </View>

        {/* Quick actions */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick actions</Text>
        </View>
        <View style={styles.actionsList}>
          {actions.map((action) => (
            <AnimatedPressable
              key={action.label}
              style={[styles.actionRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={action.onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: `${colors.brand}12` }]}>
                <Ionicons name={action.icon as any} size={20} color={colors.brand} />
              </View>
              <View style={styles.actionInfo}>
                <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{action.label}</Text>
                <Text style={[styles.actionSubtitle, { color: colors.textMuted }]}>{action.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </AnimatedPressable>
          ))}
        </View>

        {/* Primary CTA */}
        <AppButton
          title="Create new listing"
          icon={<Ionicons name="add-circle-outline" size={18} color={colors.background} />}
          variant="primary"
          size="lg"
          style={styles.ctaBtn}
          onPress={() => navigation.navigate('Sell')}
          accessibilityLabel="Create a new listing"
          hapticFeedback="light"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  badgeSection: {
    marginBottom: Space.md,
  },
  sectionHeader: {
    marginTop: Space.md,
    marginBottom: Space.sm,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  statValue: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
  },
  actionsList: {
    gap: Space.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInfo: {
    flex: 1,
    gap: 2,
  },
  actionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  actionSubtitle: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
  },
  ctaBtn: {
    marginTop: Space.lg,
  },
});
