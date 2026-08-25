import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { haptics } from '../utils/haptics';
import { useStore } from '../store/useStore';
import {
  CommerceUserOrder,
  listUserOrders,
  type ListUserOrdersParams,
} from '../services/commerceApi';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { useConnectivity } from '../hooks/useConnectivity';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { OrdersTabRail, OrdersTab } from '../components/orders/OrdersTabRail';
import { OrderLedgerRow, OrderViewModel } from '../components/orders/OrderLedgerRow';
import { OrderRowSkeleton } from '../components/skeletons/OrderRowSkeleton';
import { DEFAULT_CURRENCY_CODE } from '../constants/currencies';
import {
  OrdersFilterSheet,
  FilterClassification,
  OrdersFilterState,
} from '../components/orders/OrdersFilterSheet';
import {

  needsAction,
  type OrderRole,
} from '../components/orders/orderCapabilities';
import { t } from '../i18n';

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);
  const viewerId = currentUser?.id;
  const { isOffline } = useConnectivity();

  const [activeTab, setActiveTab] = useState<OrdersTab>('all');
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
        limit: PAGE_SIZE,
      };

      // Tab → role mapping:
      //  'all'       → role=all (both buyer + seller orders)
      //  'buying'    → role=buyer
      //  'selling'   → role=seller
      //  'completed' → role=buyer, classification=completed
      if (activeTab === 'buying') {
        params.role = 'buyer';
      } else if (activeTab === 'selling') {
        params.role = 'seller';
      } else if (activeTab === 'completed') {
        params.role = 'buyer';
        params.classification = 'completed';
      } else {
        params.role = 'all';
      }

      if (filter.classification !== 'all' && activeTab !== 'completed') {
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
        shipByDate: order.shipByDate ?? null,
        serviceName: order.fulfilmentSnapshot?.serviceName ?? order.fulfilmentSnapshot?.carrierId ?? null,
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
        formattedTotal={formatFromFiat(item.totalGbp, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })}
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

  // FlashList v2 performance: memoized outer renderItem prevents full re-render
  // of all visible order groups on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderGroupItem = useCallback(
    ({ item: group }: { item: DateGroup }) => (
      <View>
        {renderGroupHeader(group.label)}
        <FlashList
          data={group.data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={renderSeparator}
          scrollEnabled={false}
        />
      </View>
    ),
    [renderGroupHeader, keyExtractor, renderItem, renderSeparator]
  );

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
          subtitle="When you buy something, your orders will show up here."
          ctaLabel="Browse items"
          onCtaPress={() => navigation.navigate('MainTabs')}
        />
      );
    }

    if (activeTab === 'completed') {
      return (
        <EmptyState
          icon="checkmark-done-outline"
          title="No completed orders yet"
          subtitle="Orders you've received and confirmed will appear here."
          ctaLabel="Browse items"
          onCtaPress={() => navigation.navigate('MainTabs')}
        />
      );
    }

    if (activeTab === 'all') {
      return (
        <EmptyState
          icon="bag-outline"
          title="No orders yet"
          subtitle="When you buy or sell something, your orders will show up here."
          ctaLabel="Start shopping"
          onCtaPress={() => navigation.navigate('MainTabs')}
        />
      );
    }

    return (
      <EmptyState
        icon="pricetag-outline"
        title="No sales yet"
        subtitle="When you sell something, your orders will show up here."
        ctaLabel="List an item"
        onCtaPress={() => navigation.navigate('Sell')}
      />
    );
  }, [viewerId, debouncedQuery, hasActiveFilter, activeTab, navigation, handleClearSearch]);

  const renderLoading = useCallback(() => (
    <OrderRowSkeleton count={6} />
  ), []);

  const renderError = useCallback(() => (
    <View style={styles.errorContainer}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
      <Text style={styles.errorTitle}>{isOffline ? 'You are offline' : 'Orders could not be loaded'}</Text>
      <Text style={styles.errorSubtitle}>{isOffline ? 'Check your connection and try again.' : 'We couldn\'t load your orders. Tap below to try again.'}</Text>
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
  ), [fetchOrders, isOffline, colors.textMuted]);

  const renderListFooter = useCallback(() => {
    if (isLoadingMore) {
      return (
        <View style={styles.footerLoading}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
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
          <Text style={styles.footerEndText}>All orders loaded</Text>
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
      <ScreenHeader
        title="Orders"
        variant="large"
        onBack={() => navigation.goBack()}
        style={{
          paddingTop: insets.top,
          paddingBottom: Space.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
        rightAction={
          <Pressable
            onPress={() => setFilterSheetVisible(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`Filter orders${filterSummary ? `, current filter: ${filterSummary}` : ''}`}
          >
            <Ionicons
              name={hasActiveFilter ? 'filter' : 'filter-outline'}
              size={22}
              color={hasActiveFilter ? colors.brand : colors.textPrimary}
            />
          </Pressable>
        }
      />

      <OrdersTabRail
        activeTab={activeTab}
        allCount={0}
        buyingCount={0}
        sellingCount={0}
        completedCount={0}
        onChange={(tab) => { haptics.selection(); setActiveTab(tab); }}
      />

      {needsActionCount > 0 && !debouncedQuery.trim() && filter.classification === 'all' && (
        <Pressable
          style={[styles.needsActionBanner, { backgroundColor: colors.brandSubtle }]}
          onPress={() => setFilter({ classification: 'needs_action', year: null })}
          accessibilityRole="button"
          accessibilityLabel={`${needsActionCount} orders need your attention. Tap to view.`}
        >
          <Ionicons name="alert-circle-outline" size={16} color={colors.brand} />
          <Text style={[styles.needsActionText, { color: colors.brand }]}>
            {needsActionCount} {needsActionCount === 1 ? 'order' : 'orders'} need{needsActionCount === 1 ? 's' : ''} your attention
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </Pressable>
      )}

      <View style={styles.searchRow}>
        <ElevatedSurface variant="surface" style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by item, order number, member, or tracking"
            placeholderTextColor={colors.textMuted}
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
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
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

      {isOffline && orders.length > 0 ? (
        <OfflineBanner onRetry={() => void handleRefresh()} />
      ) : null}

      <FlashList
        data={groupedOrders}
        keyExtractor={(group) => group.key}
        renderItem={renderGroupItem}
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
            tintColor={colors.textSecondary}
            colors={[colors.textSecondary]}
          />
        }
        // Performance: order history can be long; FlashList v2 handles
        // recycling automatically.
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  needsActionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    backgroundColor: colors.surface,
  },
  needsActionText: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
    color: colors.brand,
  },
  searchRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    height: Control.chrome + Space.xs,
  },
  searchIcon: {
    marginLeft: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
  },
  filterSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.xs,
  },
  filterSummaryText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
    color: colors.textMuted,
  },
  clearFilterText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
    color: colors.brand,
  },
  groupHeader: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.xs + 2,
  },
  groupHeaderText: {
    fontSize: Type.label.size,
    lineHeight: Type.label.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.label.letterSpacing,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  listContent: {
    paddingBottom: Space.xl,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginLeft: Space.md + 80 + Space.md,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl * 2,
    gap: Space.md,
  },
  errorTitle: {
    fontSize: Type.sectionTitle.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  errorSubtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: Space.md - 2,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
    minHeight: Space.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
  },
  footerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
  },
  footerLoadingText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    color: colors.textMuted,
  },
  footerError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
  },
  footerErrorText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    color: colors.textMuted,
  },
  retryLink: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
    color: colors.brand,
  },
  footerEnd: {
    alignItems: 'center',
    paddingVertical: Space.md,
  },
  footerEndText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    color: colors.textMuted,
  },
  });
}