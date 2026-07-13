import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Typography } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import {
  CommerceUserOrder,
  listUserOrders,
  type ListUserOrdersParams,
} from '../services/commerceApi';
import { EmptyState } from '../components/EmptyState';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { OrdersTabRail, OrdersTab } from '../components/orders/OrdersTabRail';
import { OrderLedgerRow, OrderViewModel } from '../components/orders/OrderLedgerRow';
import {
  OrdersFilterSheet,
  FilterClassification,
  OrdersFilterState,
} from '../components/orders/OrdersFilterSheet';
import {
  needsAction,
  type OrderRole,
} from '../components/orders/orderCapabilities';

interface DateGroup {
  key: string;
  label: string;
  data: OrderViewModel[];
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

function formatGroupLabel(date: Date): string {
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = sameYear && date.getMonth() === now.getMonth();

  if (sameMonth) return 'This month';
  if (sameYear) return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return String(date.getFullYear());
}

function groupOrdersByDate(orders: OrderViewModel[]): DateGroup[] {
  const groups: Map<string, DateGroup> = new Map();

  for (const order of orders) {
    const date = new Date(order.createdAt);
    if (!Number.isFinite(date.getTime())) continue;

    const groupKey = `${date.getFullYear()}-${date.getMonth()}`;
    const label = formatGroupLabel(date);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { key: groupKey, label, data: [] });
    }
    groups.get(groupKey)!.data.push(order);
  }

  return Array.from(groups.values());
}

export default function MyOrdersScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);
  const viewerId = currentUser?.id;

  const [activeTab, setActiveTab] = useState<OrdersTab>('buying');
  const [orders, setOrders] = useState<CommerceUserOrder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paginationError, setPaginationError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<OrdersFilterState>({
    classification: 'all',
    year: null,
  });
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, SEARCH_DEBOUNCE_MS);
  }, [searchQuery]);

  const buildParams = useCallback(
    (cursor?: string): ListUserOrdersParams => {
      const params: ListUserOrdersParams = {
        role: activeTab === 'buying' ? 'buyer' : 'seller',
        limit: PAGE_SIZE,
      };

      if (filter.classification !== 'all') {
        params.classification = filter.classification;
      }
      if (filter.year) {
        params.year = filter.year;
      }
      if (debouncedQuery.trim()) {
        params.query = debouncedQuery.trim();
      }
      if (cursor) {
        params.cursor = cursor;
      }

      return params;
    },
    [activeTab, filter, debouncedQuery]
  );

  const fetchOrders = useCallback(
    async (cursor?: string) => {
      if (!viewerId) {
        setIsInitialLoading(false);
        return;
      }

      if (cursor) {
        if (isLoadingMore || !nextCursor) return;
        setIsLoadingMore(true);
        setPaginationError(null);
      } else {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
      }

      try {
        const result = await listUserOrders(viewerId, buildParams(cursor));
        if (cursor) {
          setOrders((prev) => [...prev, ...result.items]);
        } else {
          setOrders(result.items);
        }
        setNextCursor(result.nextCursor);
        setLoadError(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Orders could not be loaded';
        if (cursor) {
          setPaginationError(message);
        } else {
          setLoadError(message);
          setOrders([]);
        }
      } finally {
        if (cursor) {
          setIsLoadingMore(false);
        } else {
          setIsInitialLoading(false);
          isFetchingRef.current = false;
        }
      }
    },
    [viewerId, buildParams, isLoadingMore, nextCursor]
  );

  useEffect(() => {
    setIsInitialLoading(true);
    setOrders([]);
    setNextCursor(null);
    setLoadError(null);
    setPaginationError(null);
    void fetchOrders();
  }, [fetchOrders]);

  const handleRefresh = useCallback(async () => {
    if (!viewerId) return;
    setIsRefreshing(true);
    setNextCursor(null);
    setPaginationError(null);
    try {
      const result = await listUserOrders(viewerId, buildParams());
      setOrders(result.items);
      setNextCursor(result.nextCursor);
      setLoadError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Orders could not be refreshed';
      setLoadError(message);
    } finally {
      setIsRefreshing(false);
    }
  }, [viewerId, buildParams]);

  const handleLoadMore = useCallback(() => {
    if (nextCursor && !isLoadingMore) {
      void fetchOrders(nextCursor);
    }
  }, [nextCursor, isLoadingMore, fetchOrders]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
  }, []);

  const orderViewModels: OrderViewModel[] = useMemo(() => {
    return orders.map((order) => {
      const role: OrderRole = order.buyerId === viewerId ? 'buyer' : 'seller';
      const counterpartyUsername =
        role === 'buyer' ? order.sellerUsername : order.buyerUsername;

      return {
        id: order.id,
        listingId: order.listingId,
        title: order.listingTitle || 'Ordered item',
        image: order.listingImageUrl || '',
        totalGbp: order.totalGbp,
        status: order.status,
        createdAt: order.createdAt,
        trackingNumber: order.trackingNumber,
        shippingProvider: order.shippingProvider,
        role,
        counterpartyUsername,
      };
    });
  }, [orders, viewerId]);

  const needsActionCount = useMemo(
    () => orderViewModels.filter((o) => needsAction(o.status, o.role)).length,
    [orderViewModels]
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const now = new Date();
    years.add(now.getFullYear());
    for (const order of orderViewModels) {
      const date = new Date(order.createdAt);
      if (Number.isFinite(date.getTime())) {
        years.add(date.getFullYear());
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [orderViewModels]);

  const groupedOrders = useMemo(() => groupOrdersByDate(orderViewModels), [orderViewModels]);

  const hasActiveFilter =
    filter.classification !== 'all' || filter.year !== null || debouncedQuery.trim() !== '';

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

  const renderGroupHeader = useCallback(
    (label: string) => (
      <View style={styles.groupHeader}>
        <Text style={styles.groupHeaderText}>{label}</Text>
      </View>
    ),
    []
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

    if (debouncedQuery.trim()) {
      return (
        <EmptyState
          icon="search-outline"
          title="No results found"
          subtitle={`No orders matching "${debouncedQuery.trim()}". Try a different search term.`}
          ctaLabel="Clear search"
          onCtaPress={handleClearSearch}
        />
      );
    }

    if (hasActiveFilter) {
      return (
        <EmptyState
          icon="document-text-outline"
          title="No orders match these filters"
          subtitle="Try adjusting your filters to see more orders."
          ctaLabel="Clear filters"
          onCtaPress={() => {
            setFilter({ classification: 'all', year: null });
            setSearchQuery('');
            setDebouncedQuery('');
          }}
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
  }, [viewerId, debouncedQuery, hasActiveFilter, activeTab, navigation, handleClearSearch]);

  const renderLoading = useCallback(() => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={Colors.textSecondary} />
      <Text style={styles.loadingText}>Loading orders…</Text>
    </View>
  ), []);

  const renderError = useCallback(() => (
    <View style={styles.errorContainer}>
      <Ionicons name="cloud-offline-outline" size={40} color={Colors.textMuted} />
      <Text style={styles.errorTitle}>Orders could not be loaded</Text>
      <Text style={styles.errorSubtitle}>Check your connection and try again.</Text>
      <Pressable
        style={styles.retryBtn}
        onPress={() => {
          setLoadError(null);
          setIsInitialLoading(true);
          void fetchOrders();
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Retry loading orders"
      >
        <Text style={styles.retryBtnText}>Retry</Text>
      </Pressable>
    </View>
  ), [fetchOrders]);

  const renderListFooter = useCallback(() => {
    if (isLoadingMore) {
      return (
        <View style={styles.footerLoading}>
          <ActivityIndicator size="small" color={Colors.textSecondary} />
          <Text style={styles.footerLoadingText}>Loading more…</Text>
        </View>
      );
    }
    if (paginationError) {
      return (
        <View style={styles.footerError}>
          <Text style={styles.footerErrorText}>{paginationError}</Text>
          <Pressable
            onPress={() => {
              setPaginationError(null);
              if (nextCursor) void fetchOrders(nextCursor);
            }}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading more orders"
          >
            <Text style={styles.retryLink}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    if (!nextCursor && orders.length > 0) {
      return (
        <View style={styles.footerEnd}>
          <Text style={styles.footerEndText}>No more orders</Text>
        </View>
      );
    }
    return null;
  }, [isLoadingMore, paginationError, nextCursor, orders.length, fetchOrders]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filter.classification !== 'all') {
      const labels: Record<FilterClassification, string> = {
        all: 'All',
        needs_action: 'Needs action',
        active: 'Active',
        completed: 'Completed',
        cancelled: 'Cancelled',
      };
      parts.push(labels[filter.classification]);
    }
    if (filter.year) parts.push(String(filter.year));
    return parts.join(' · ');
  }, [filter]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

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
        <Pressable
          style={styles.headerFilterBtn}
          onPress={() => setFilterSheetVisible(true)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={`Filter orders${filterSummary ? `, current filter: ${filterSummary}` : ''}`}
        >
          <Ionicons
            name={hasActiveFilter ? 'filter' : 'filter-outline'}
            size={22}
            color={hasActiveFilter ? Colors.brand : Colors.textPrimary}
          />
        </Pressable>
      </View>

      <OrdersTabRail
        activeTab={activeTab}
        buyingCount={0}
        sellingCount={0}
        onChange={setActiveTab}
      />

      {needsActionCount > 0 && !debouncedQuery.trim() && filter.classification === 'all' && (
        <Pressable
          style={styles.needsActionBanner}
          onPress={() => setFilter({ classification: 'needs_action', year: null })}
          accessibilityRole="button"
          accessibilityLabel={`${needsActionCount} orders need your attention. Tap to view.`}
        >
          <Ionicons name="alert-circle-outline" size={16} color={Colors.brand} />
          <Text style={styles.needsActionText}>
            {needsActionCount} {needsActionCount === 1 ? 'order' : 'orders'} need{needsActionCount === 1 ? 's' : ''} your attention
          </Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
        </Pressable>
      )}

      <View style={styles.searchRow}>
        <ElevatedSurface variant="surface" style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by item, order number, member, or tracking"
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search orders"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={handleClearSearch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </Pressable>
          )}
        </ElevatedSurface>
      </View>

      {filterSummary ? (
        <View style={styles.filterSummaryRow}>
          <Text style={styles.filterSummaryText}>{filterSummary}</Text>
          <Pressable
            onPress={() => setFilter({ classification: 'all', year: null })}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Clear filters"
          >
            <Text style={styles.clearFilterText}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={groupedOrders}
        keyExtractor={(group) => group.key}
        renderItem={({ item: group }) => (
          <View>
            {renderGroupHeader(group.label)}
            <FlatList
              data={group.data}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              ItemSeparatorComponent={renderSeparator}
              scrollEnabled={false}
            />
          </View>
        )}
        ListEmptyComponent={
          loadError && orders.length === 0
            ? renderError
            : isInitialLoading
              ? renderLoading
              : renderEmpty
        }
        ListFooterComponent={renderListFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
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

      <OrdersFilterSheet
        visible={filterSheetVisible}
        currentFilter={filter}
        availableYears={availableYears}
        onApply={setFilter}
        onClose={() => setFilterSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  headerFilterBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  needsActionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    backgroundColor: Colors.surface,
  },
  needsActionText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.brand,
  },
  searchRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Space.md,
    height: 40,
  },
  searchIcon: {
    marginLeft: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  filterSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.xs,
  },
  filterSummaryText: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  clearFilterText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  groupHeader: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.xs,
  },
  groupHeaderText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  listContent: {
    paddingBottom: Space.xl,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderLight,
    marginLeft: 104,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl * 2,
    gap: Space.md,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl * 2,
    gap: Space.md,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  errorSubtitle: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 14,
    paddingHorizontal: Space.xl,
    borderRadius: 10,
    backgroundColor: Colors.brand,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  footerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Space.md,
  },
  footerLoadingText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  footerError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Space.md,
  },
  footerErrorText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  retryLink: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  footerEnd: {
    alignItems: 'center',
    paddingVertical: Space.md,
  },
  footerEndText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
});