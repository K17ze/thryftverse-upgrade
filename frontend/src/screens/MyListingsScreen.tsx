import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation, RouteProp, useRoute, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { TypeStyles, Space, Radius, Type, Typography } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { CachedImage } from '../components/CachedImage';
import { SellerStandardsBadges } from '../components/profile/SellerStandardsBadges';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useSellerTrust } from '../platform/product';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'MyListings'>;

function ListingRow({ item, onPress }: { item: ListingApiItem; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statusColor =
    item.status === 'active' ? colors.success
    : item.status === 'paused' ? colors.textMuted
    : item.status === 'sold' ? colors.brand
    : colors.danger;

  return (
    <AnimatedPressable style={styles.row} onPress={onPress} activeOpacity={0.85}>
      {item.images[0] ? (
        <CachedImage uri={item.images[0]} style={styles.rowImage} containerStyle={styles.rowImageWrap} contentFit="cover" />
      ) : (
        <View style={[styles.rowImageWrap, styles.rowImageFallback]}>
          <Ionicons name="bag-handle-outline" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowPrice}>£{item.priceGbp.toFixed(2)}</Text>
        <View style={styles.rowMeta}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
          </View>
          {item.category ? <Text style={styles.rowCategory}>{item.category}</Text> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </AnimatedPressable>
  );
}

function StatCard({ icon, label, value, tone }: { icon: string; label: string; value: string; tone?: 'default' | 'success' | 'brand' }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const color = tone === 'success' ? colors.success : tone === 'brand' ? colors.brand : colors.textPrimary;
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function MyListingsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const currentUser = useStore((s) => s.currentUser);
  const filterType = route.params?.type;
  const reducedMotionEnabled = useReducedMotion();
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

  // useFocusEffect ensures listings re-fetch when the user navigates back
  // (e.g., after editing or managing a listing from this screen).
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setIsLoading(true);
      load().finally(() => { if (mounted) setIsLoading(false); });
      return () => { mounted = false; };
    }, [load])
  );

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
      <FlagshipScreen header={<FlagshipHeader title={headerTitle} onBack={() => navigation.goBack()} />}>
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  const renderHeader = () => {
    if (listings.length === 0) return null;
    return (
      <Reanimated.View style={styles.headerSection} entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
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
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('Sell')}
            activeOpacity={0.85}
            accessibilityLabel="Create new listing"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
            <Text style={styles.quickActionText}>New listing</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('SellerAnalytics')}
            activeOpacity={0.85}
            accessibilityLabel="View seller analytics"
            accessibilityRole="button"
          >
            <Ionicons name="bar-chart-outline" size={18} color={colors.brand} />
            <Text style={styles.quickActionText}>Analytics</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('SellerAuctionCentre')}
            activeOpacity={0.85}
            accessibilityLabel="Manage auctions"
            accessibilityRole="button"
          >
            <Ionicons name="trophy-outline" size={18} color={colors.brand} />
            <Text style={styles.quickActionText}>Auctions</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('Wallet')}
            activeOpacity={0.85}
            accessibilityLabel="View payout account"
            accessibilityRole="button"
          >
            <Ionicons name="wallet-outline" size={18} color={colors.brand} />
            <Text style={styles.quickActionText}>Payouts</Text>
          </AnimatedPressable>
          {filterType === 'coown' && (
            <AnimatedPressable
              style={styles.quickActionBtn}
              onPress={() => navigation.navigate('SellerVerification')}
              activeOpacity={0.85}
              accessibilityLabel="View verification requests"
              accessibilityRole="button"
            >
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.brand} />
              <Text style={styles.quickActionText}>Verification</Text>
            </AnimatedPressable>
          )}
        </View>

        {/* Listings header */}
        <View style={styles.listingsHeaderRow}>
          <Text style={styles.listingsHeaderText}>
            {analytics.total} {analytics.total === 1 ? 'listing' : 'listings'}
          </Text>
        </View>
      </Reanimated.View>
    );
  };

  return (
    <FlagshipScreen
      header={<FlagshipHeader title={headerTitle} onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
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
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListHeaderComponent={renderHeader}
          renderItem={({ item }) => (
            <ListingRow
              item={item}
              onPress={() => navigation.push('ManageListing', { itemId: item.id })}
            />
          )}
        />
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 2,
  },
  statValue: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
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
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  quickActionText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
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
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowImageWrap: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
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
    color: colors.textPrimary,
  },
  rowPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
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
    color: colors.textMuted,
  },
  });
}