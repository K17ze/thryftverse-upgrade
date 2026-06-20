import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Typography } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { useStore } from '../store/useStore';
import { CommerceUserOrder, listUserOrders } from '../services/commerceApi';
import { getListingCoverUri } from '../utils/media';
import { EmptyState } from '../components/EmptyState';
import { OrdersTabRail, OrdersTab } from '../components/orders/OrdersTabRail';
import { OrderLedgerRow, OrderViewModel, normaliseOrderStatus } from '../components/orders/OrderLedgerRow';

type StatusFilter = 'All' | 'Active' | 'Completed' | 'Cancelled';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'Active', label: 'Active' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Cancelled', label: 'Cancelled' },
];

const ACTIVE_STATUSES = new Set(['created', 'paid', 'shipped', 'in transit']);
const COMPLETED_STATUSES = new Set(['delivered', 'completed']);
const CANCELLED_STATUSES = new Set(['cancelled', 'refunded']);

function classifyStatus(status: string): 'active' | 'completed' | 'cancelled' | 'unknown' {
  const key = normaliseOrderStatus(status);
  if (CANCELLED_STATUSES.has(key)) return 'cancelled';
  if (COMPLETED_STATUSES.has(key)) return 'completed';
  if (ACTIVE_STATUSES.has(key)) return 'active';
  return 'unknown';
}

export default function MyOrdersScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { formatFromFiat } = useFormattedPrice();
  const { listings, refreshListings } = useBackendData();
  const currentUser = useStore((state) => state.currentUser);
  const viewerId = currentUser?.id;

  const [activeTab, setActiveTab] = useState<OrdersTab>('buying');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [backendOrders, setBackendOrders] = useState<CommerceUserOrder[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const listingPool = useMemo(() => listings, [listings]);

  const fetchOrders = useCallback(async () => {
    if (!viewerId) {
      setIsInitialLoading(false);
      return;
    }
    try {
      const items = await listUserOrders(viewerId, 'all', 80);
      setBackendOrders(items);
      setLoadError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Orders could not be loaded';
      setLoadError(message);
    } finally {
      setIsInitialLoading(false);
    }
  }, [viewerId]);

  React.useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const handleRefresh = useCallback(async () => {
    if (!viewerId) return;
    setIsRefreshing(true);
    try {
      await Promise.all([refreshListings(), fetchOrders()]);
    } catch {
      // fetchOrders already handles errors internally
    } finally {
      setIsRefreshing(false);
    }
  }, [viewerId, refreshListings, fetchOrders]);

  // Build order view models
  const allOrderViewModels: OrderViewModel[] = useMemo(() => {
    return backendOrders.map((order) => {
      const existingListing = listingPool.find((entry) => entry.id === order.listingId);
      const role: 'buying' | 'selling' = order.buyerId === viewerId ? 'buying' : 'selling';
      return {
        id: order.id,
        listingId: order.listingId,
        title:
          order.listingTitle
          || existingListing?.title
          || 'Ordered item',
        image:
          order.listingImageUrl
          || getListingCoverUri(existingListing?.images ?? [], ''),
        totalGbp: order.totalGbp,
        status: order.status,
        createdAt: order.createdAt,
        trackingNumber: order.trackingNumber,
        shippingProvider: order.shippingProvider,
        role,
      };
    });
  }, [backendOrders, listingPool, viewerId]);

  // Split by role
  const buyingOrders = useMemo(
    () => allOrderViewModels.filter((o) => o.role === 'buying'),
    [allOrderViewModels]
  );
  const sellingOrders = useMemo(
    () => allOrderViewModels.filter((o) => o.role === 'selling'),
    [allOrderViewModels]
  );

  const currentTabOrders = activeTab === 'buying' ? buyingOrders : sellingOrders;

  // Filter by status
  const filteredOrders = useMemo(() => {
    if (statusFilter === 'All') return currentTabOrders;

    return currentTabOrders.filter((order) => {
      const classification = classifyStatus(order.status);
      if (statusFilter === 'Active') return classification === 'active';
      if (statusFilter === 'Completed') return classification === 'completed';
      if (statusFilter === 'Cancelled') return classification === 'cancelled';
      return true;
    });
  }, [currentTabOrders, statusFilter]);

  // Sort newest first
  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [filteredOrders]);

  const handleOrderPress = useCallback(
    (orderId: string) => {
      navigation.navigate('OrderDetail', { orderId });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: OrderViewModel }) => (
      <OrderLedgerRow
        order={item}
        formattedTotal={formatFromFiat(item.totalGbp, 'GBP', { displayMode: 'fiat' })}
        onPress={() => handleOrderPress(item.id)}
      />
    ),
    [formatFromFiat, handleOrderPress]
  );

  const keyExtractor = useCallback((item: OrderViewModel) => item.id, []);

  const renderSeparator = useCallback(() => <View style={styles.separator} />, []);

  const renderEmpty = useCallback(() => {
    if (!viewerId) {
      return (
        <EmptyState
          icon="bag-outline"
          title="Sign in to view orders"
          subtitle="Your buying and selling history appears here once you're signed in."
          ctaLabel="Sign In"
          onCtaPress={() => navigation.navigate('Login')}
        />
      );
    }

    if (statusFilter !== 'All') {
      return (
        <EmptyState
          icon="document-text-outline"
          title={`No ${statusFilter.toLowerCase()} orders`}
          subtitle="Try another status."
          ctaLabel="Clear filter"
          onCtaPress={() => setStatusFilter('All')}
        />
      );
    }

    if (activeTab === 'buying') {
      return (
        <EmptyState
          icon="bag-outline"
          title="No purchases yet"
          subtitle="Your purchases will appear here."
          ctaLabel="Browse items"
          onCtaPress={() => navigation.navigate('MainTabs')}
        />
      );
    }

    return (
      <EmptyState
        icon="pricetag-outline"
        title="No sales yet"
        subtitle="Items you sell will appear here."
        ctaLabel="List an item"
        onCtaPress={() => navigation.navigate('Sell')}
      />
    );
  }, [viewerId, statusFilter, activeTab, navigation]);

  const renderLoading = useCallback(() => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={Colors.textSecondary} />
      <Text style={styles.loadingText}>Loading orders…</Text>
    </View>
  ), []);

  const renderStaleErrorBanner = useCallback(() => {
    if (!loadError || backendOrders.length === 0) return null;
    return (
      <View
        style={styles.staleBanner}
        accessibilityRole="alert"
        accessibilityLabel="Orders could not be refreshed. Showing the last loaded results."
      >
        <View style={styles.staleBannerText}>
          <Text style={styles.staleBannerTitle}>Orders could not be refreshed</Text>
          <Text style={styles.staleBannerSubtitle}>Showing the last loaded results.</Text>
        </View>
        <Pressable
          style={styles.staleRetryBtn}
          onPress={() => { setLoadError(null); void fetchOrders(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Retry refreshing orders"
        >
          <Text style={styles.staleRetryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }, [loadError, backendOrders.length, fetchOrders]);

  const renderError = useCallback(() => (
    <View style={styles.errorContainer}>
      <Ionicons name="cloud-offline-outline" size={40} color={Colors.textMuted} />
      <Text style={styles.errorTitle}>Orders could not be loaded</Text>
      <Text style={styles.errorSubtitle}>Check your connection and try again.</Text>
      <Pressable
        style={styles.retryBtn}
        onPress={() => { setLoadError(null); setIsInitialLoading(true); void fetchOrders(); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Retry loading orders"
      >
        <Text style={styles.retryBtnText}>Retry</Text>
      </Pressable>
    </View>
  ), [fetchOrders]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* ── 1. COMPACT NAVIGATION HEADER ── */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          style={styles.headerBack}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Orders</Text>
        <Text style={styles.headerCount}>
          {viewerId ? `${sortedOrders.length} visible` : ''}
        </Text>
      </View>

      {/* ── 2. BUYING / SELLING TAB RAIL ── */}
      <OrdersTabRail
        activeTab={activeTab}
        buyingCount={buyingOrders.length}
        sellingCount={sellingOrders.length}
        onChange={setActiveTab}
      />

      {/* ── 3. STATUS FILTER RAIL ── */}
      <View style={styles.filterRail}>
        {STATUS_FILTERS.map((filter) => {
          const isActive = statusFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              style={styles.filterTab}
              onPress={() => setStatusFilter(filter.key)}
              hitSlop={{ top: 6, bottom: 6 }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`Filter by ${filter.label}`}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {filter.label}
              </Text>
              {isActive && <View style={styles.filterUnderline} />}
            </Pressable>
          );
        })}
      </View>

      {/* ── 4. ORDER LIST ── */}
      <FlatList
        data={isInitialLoading ? [] : sortedOrders}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={renderSeparator}
        ListHeaderComponent={renderStaleErrorBanner}
        ListEmptyComponent={loadError && backendOrders.length === 0 ? renderError : isInitialLoading ? renderLoading : renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.textSecondary}
            colors={[Colors.textSecondary]}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Compact header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    gap: Space.sm,
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Space.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: 26,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerCount: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },

  // Status filter rail
  filterRail: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    gap: Space.md,
  },
  filterTab: {
    paddingVertical: 4,
    alignItems: 'flex-start',
  },
  filterText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  filterTextActive: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  filterUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: Colors.textPrimary,
    borderRadius: 1,
  },

  // List
  listContent: {
    paddingBottom: 120,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginHorizontal: Space.md,
  },

  // Loading
  loadingContainer: {
    paddingVertical: 80,
    alignItems: 'center',
    gap: Space.md,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },

  // Error
  errorContainer: {
    paddingVertical: 80,
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.sm,
  },
  errorTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: Space.sm,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },

  // Stale error banner
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    marginBottom: 4,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  staleBannerText: {
    flex: 1,
    gap: 2,
  },
  staleBannerTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  staleBannerSubtitle: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  staleRetryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  staleRetryBtnText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});