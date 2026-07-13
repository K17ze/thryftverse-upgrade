import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, RouteProp, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { TypeStyles, Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { CachedImage } from '../components/CachedImage';
import { SellerStandardsBadges } from '../components/profile/SellerStandardsBadges';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useSellerTrust } from '../platform/product';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'MyListings'>;

function ListingRow({ item, onPress }: { item: ListingApiItem; onPress: () => void }) {
  const { colors } = useAppTheme();
  const statusColor =
    item.status === 'active' ? colors.success
    : item.status === 'paused' ? colors.textMuted
    : item.status === 'sold' ? colors.brand
    : colors.danger;

  return (
    <AnimatedPressable style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onPress} activeOpacity={0.85}>
      {item.images[0] ? (
        <CachedImage uri={item.images[0]} style={styles.rowImage} containerStyle={[styles.rowImageWrap, { backgroundColor: colors.surfaceAlt }]} contentFit="cover" />
      ) : (
        <View style={[styles.rowImageWrap, styles.rowImageFallback, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="bag-handle-outline" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.rowPrice, { color: colors.textSecondary }]}>£{item.priceGbp.toFixed(2)}</Text>
        <View style={styles.rowMeta}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
          </View>
          {item.category ? <Text style={[styles.rowCategory, { color: colors.textMuted }]}>{item.category}</Text> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </AnimatedPressable>
  );
}

function StatCard({ icon, label, value, tone }: { icon: string; label: string; value: string; tone?: 'default' | 'success' | 'brand' }) {
  const { colors } = useAppTheme();
  const color = tone === 'success' ? colors.success : tone === 'brand' ? colors.brand : colors.textPrimary;
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

export default function MyListingsScreen() {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const currentUser = useStore((s) => s.currentUser);
  const filterType = route.params?.type;
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const headerTitle =
    filterType === 'coown' ? 'My Co-Own Listings' : 'Seller Hub';
  const emptySubtitle =
    filterType === 'coown'
      ? 'Co-own offerings you create will appear here.'
      : 'Items you list for sale will appear here.';

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: 100 });
      setListings(res.items);
    } catch (e) {
      show('Could not load listings', 'error');
    }
  }, [currentUser?.id, show]);

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

  // Aggregate seller analytics derived from listings data
  const analytics = useMemo(() => {
    const active = listings.filter((l) => l.status === 'active');
    const sold = listings.filter((l) => l.status === 'sold');
    const totalActiveValue = active.reduce((sum, l) => sum + l.priceGbp, 0);
    const totalSoldValue = sold.reduce((sum, l) => sum + l.priceGbp, 0);
    const avgActivePrice = active.length > 0 ? totalActiveValue / active.length : 0;
    const avgSoldPrice = sold.length > 0 ? totalSoldValue / sold.length : 0;
    return {
      total: listings.length,
      activeCount: active.length,
      soldCount: sold.length,
      pausedCount: listings.filter((l) => l.status === 'paused').length,
      totalActiveValue,
      totalSoldValue,
      avgActivePrice,
      avgSoldPrice,
    };
  }, [listings]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScreenHeader title={headerTitle} onBack={() => navigation.goBack()} />
        <View style={styles.body}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  const renderHeader = () => {
    if (listings.length === 0) return null;
    return (
      <View style={styles.headerSection}>
        {/* Analytics summary */}
        <View style={styles.statsGrid}>
          <StatCard
            icon="pricetag-outline"
            label="Active"
            value={String(analytics.activeCount)}
            tone="success"
          />
          <StatCard
            icon="checkmark-done"
            label="Sold"
            value={String(analytics.soldCount)}
            tone="brand"
          />
          <StatCard
            icon="cash-outline"
            label="Avg price"
            value={`£${analytics.avgActivePrice.toFixed(0)}`}
          />
          <StatCard
            icon="trending-up-outline"
            label="Active value"
            value={`£${analytics.totalActiveValue.toFixed(0)}`}
          />
        </View>

        {/* Seller standards badges */}
        {sellerTrust ? (
          <SellerStandardsBadges sellerTrust={sellerTrust} align="left" />
        ) : null}

        {/* Quick actions */}
        <View style={styles.quickActionsRow}>
          <AnimatedPressable
            style={[styles.quickActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('Sell')}
            activeOpacity={0.85}
            accessibilityLabel="Create new listing"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
            <Text style={[styles.quickActionText, { color: colors.brand }]}>New listing</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.quickActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('SellerAnalytics')}
            activeOpacity={0.85}
            accessibilityLabel="View seller analytics"
            accessibilityRole="button"
          >
            <Ionicons name="bar-chart-outline" size={18} color={colors.brand} />
            <Text style={[styles.quickActionText, { color: colors.brand }]}>Analytics</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.quickActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('SellerAuctionCentre')}
            activeOpacity={0.85}
            accessibilityLabel="Manage auctions"
            accessibilityRole="button"
          >
            <Ionicons name="trophy-outline" size={18} color={colors.brand} />
            <Text style={[styles.quickActionText, { color: colors.brand }]}>Auctions</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.quickActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('Wallet')}
            activeOpacity={0.85}
            accessibilityLabel="View payout account"
            accessibilityRole="button"
          >
            <Ionicons name="wallet-outline" size={18} color={colors.brand} />
            <Text style={[styles.quickActionText, { color: colors.brand }]}>Payouts</Text>
          </AnimatedPressable>
        </View>

        {/* Listings header */}
        <View style={styles.listingsHeaderRow}>
          <Text style={[styles.listingsHeaderText, { color: colors.textMuted }]}>
            {analytics.total} {analytics.total === 1 ? 'listing' : 'listings'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader title={headerTitle} onBack={() => navigation.goBack()} />

      {listings.length === 0 ? (
        <View style={styles.body}>
          <EmptyState
            icon="pricetags-outline"
            title="No listings yet"
            subtitle={emptySubtitle}
            ctaLabel="Start selling"
            onCtaPress={() => navigation.navigate('Sell')}
          />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={renderHeader}
          renderItem={({ item }) => (
            <ListingRow
              item={item}
              onPress={() => navigation.push('ManageListing', { itemId: item.id })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.sm,
    paddingBottom: Space.xl,
  },
  headerSection: {
    gap: Space.sm,
    marginBottom: Space.sm,
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
  quickActionsRow: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickActionText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  listingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.xs,
  },
  listingsHeaderText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowImageWrap: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  rowImage: {
    width: 64,
    height: 64,
  },
  rowImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  rowPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    textTransform: 'capitalize',
  },
  rowCategory: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
});