import { Typography } from '../theme/designTokens';
import React, { useState } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, { useSharedValue, useAnimatedScrollHandler, FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { EmptyState } from '../components/EmptyState';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { useStore } from '../store/useStore';
import { CommerceUserOrder, listUserOrders } from '../services/commerceApi';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../constants/motion';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Type, Radius } from '../theme/designTokens';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { PremiumStatusPill } from '../components/ui/PremiumStatusPill';

const { width } = Dimensions.get('window');

type OrderItem = {
  id: string;
  title: string;
  images: string[];
  price: number;
  status: string;
  isDone: boolean;
};

type OrdersTab = 'buying' | 'selling';
type OrdersStatusFilter = 'All' | 'In Progress' | 'Cancelled' | 'Completed';

const ORDER_TAB_OPTIONS: Array<{ value: OrdersTab; label: string; accessibilityLabel: string }> = [
  { value: 'buying', label: 'Buying', accessibilityLabel: 'Show buying orders' },
  { value: 'selling', label: 'Selling', accessibilityLabel: 'Show selling orders' },
];

const ORDER_STATUS_FILTER_OPTIONS: Array<{ value: OrdersStatusFilter; label: string; accessibilityLabel: string }> = [
  { value: 'All', label: 'All', accessibilityLabel: 'Filter orders by all statuses' },
  { value: 'In Progress', label: 'In Progress', accessibilityLabel: 'Filter orders by in progress status' },
  { value: 'Cancelled', label: 'Cancelled', accessibilityLabel: 'Filter orders by cancelled status' },
  { value: 'Completed', label: 'Completed', accessibilityLabel: 'Filter orders by completed status' },
];

export default function MyOrdersScreen() {
  const navigation = useNavigation<any>();
  const { formatFromFiat } = useFormattedPrice();
  const { listings, refreshListings } = useBackendData();
  const reducedMotionEnabled = useReducedMotion();
  const currentUser = useStore((state) => state.currentUser);
  const viewerId = currentUser?.id;
  const [activeTab, setActiveTab] = useState<OrdersTab>('buying');
  const [backendOrders, setBackendOrders] = useState<CommerceUserOrder[]>([]);

  const listingPool = React.useMemo(() => listings, [listings]);

  const syncOrders = React.useCallback(async () => {
    if (!viewerId) return;
    try {
      const items = await listUserOrders(viewerId, 'all', 80);
      setBackendOrders(items);
    } catch {
      setBackendOrders([]);
    }
  }, [viewerId]);

  React.useEffect(() => {
    void syncOrders();
  }, [syncOrders]);

  // No mock fallback — only backend orders are shown

  const statusLabelByState: Record<string, string> = {
    created: 'Awaiting Payment',
    paid: 'Paid',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };

  const backendOrderCards: OrderItem[] = React.useMemo(() => {
    return backendOrders.map((order) => {
      const existingListing = listingPool.find((entry) => entry.id === order.listingId);
      const normalizedStatusLabel =
        order.status === 'shipped' && order.trackingNumber
          ? 'In Transit'
          : statusLabelByState[order.status] ?? 'In progress';

      return {
        id: order.id,
        title: existingListing?.title || order.listingTitle || 'Ordered item',
        images: existingListing?.images || [order.listingImageUrl ?? ''],
        price: existingListing?.price ?? order.totalGbp,
        status: normalizedStatusLabel,
        isDone: order.status === 'delivered' || order.status === 'cancelled',
      };
    });
  }, [backendOrders, listingPool]);

  const backendOrderById = React.useMemo(
    () => new Map(backendOrders.map((order) => [order.id, order])),
    [backendOrders]
  );

  const backendBuyingOrders = React.useMemo(
    () => backendOrderCards.filter((order) => backendOrderById.get(order.id)?.buyerId === viewerId),
    [backendOrderById, backendOrderCards, viewerId]
  );

  const backendSellingOrders = React.useMemo(
    () => backendOrderCards.filter((order) => backendOrderById.get(order.id)?.sellerId === viewerId),
    [backendOrderById, backendOrderCards, viewerId]
  );

  const activeOrders = React.useMemo(() => {
    return activeTab === 'buying' ? backendBuyingOrders : backendSellingOrders;
  }, [activeTab, backendBuyingOrders, backendSellingOrders]);

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrdersStatusFilter>('All');
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const handleRefresh = async () => {
    if (!viewerId) return;
    setRefreshing(true);
    await Promise.all([refreshListings(), syncOrders()]);
    setTimeout(() => setRefreshing(false), 400);
  };

  const filteredOrders = React.useMemo(() => {
    if (statusFilter === 'All') {
      return activeOrders;
    }

    if (statusFilter === 'Cancelled') {
      return activeOrders.filter((order) => /cancel/i.test(order.status));
    }

    if (statusFilter === 'Completed') {
      return activeOrders.filter((order) => order.isDone && !/cancel/i.test(order.status));
    }

    return activeOrders.filter((order) => !order.isDone && !/cancel/i.test(order.status));
  }, [activeOrders, statusFilter]);

  const AnimatedScrollView = Reanimated.createAnimatedComponent(ScrollView);

  // Map order status to premium pill tone
  const getStatusTone = (status: string): import('../components/ui/PremiumStatusPill').StatusPillTone => {
    const toneMap: Record<string, import('../components/ui/PremiumStatusPill').StatusPillTone> = {
      'pending': 'pending',
      'awaiting payment': 'pending',
      'paid': 'paid',
      'confirmed': 'paid',
      'shipped': 'shipped',
      'in transit': 'shipped',
      'delivered': 'delivered',
      'completed': 'delivered',
      'cancelled': 'error',
      'refunded': 'refunded',
      'in progress': 'pending',
    };
    return toneMap[status.toLowerCase()] || 'neutral';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
      
      <ScreenHeader
        title="My Orders"
        onBack={() => navigation.goBack()}
        variant="large"
      />

      {/* Restored Custom Tabs */}
      <AppSegmentControl
        style={styles.tabsContainer}
        options={ORDER_TAB_OPTIONS}
        value={activeTab}
        onChange={setActiveTab}
        fullWidth
        optionStyle={styles.tabBtn}
        optionActiveStyle={styles.activeTabBtn}
        optionTextStyle={styles.tabText}
        optionTextActiveStyle={styles.activeTabText}
      />

      {/* Filter Pills Horizontal List */}
      <AppSegmentControl
        style={styles.filterStrip}
        options={ORDER_STATUS_FILTER_OPTIONS}
        value={statusFilter}
        onChange={setStatusFilter}
        fullWidth
        optionStyle={styles.filterPill}
        optionActiveStyle={styles.activeFilterPill}
        optionTextStyle={styles.filterText}
        optionTextActiveStyle={styles.activeFilterText}
      />

      <View style={{ height: 8 }} />

      <View style={{ flex: 1 }}>
        <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={10} />
        
        <AnimatedScrollView 
          contentContainerStyle={[styles.content, filteredOrders.length === 0 && { flex: 1, justifyContent: 'center' }]} 
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="transparent"
              colors={['transparent']}
              progressBackgroundColor="transparent"
            />
          }
        >
          {!viewerId ? (
            <EmptyState
              icon="person-outline"
              title="Sign in to view orders"
              subtitle="Your buying and selling history appears here once you're signed in."
              ctaLabel="Sign In"
              onCtaPress={() => navigation.navigate('Login')}
            />
          ) : filteredOrders.length === 0 ? (
            <EmptyState
              icon="cube-outline"
              title={statusFilter === 'All' ? 'No orders yet' : `No ${statusFilter.toLowerCase()} orders`}
              subtitle={
                statusFilter === 'All'
                  ? `When you ${activeTab === 'buying' ? 'buy' : 'sell'} items, you'll track them here.`
                  : 'Try another status filter to view more orders.'
              }
              ctaLabel={activeTab === 'buying' ? 'Start Browsing' : 'List an Item'}
              onCtaPress={() => navigation.navigate(activeTab === 'buying' ? 'MainTabs' : 'Sell')}
            />
          ) : (
            filteredOrders.map((order, index) => {
              const backendMeta = backendOrderById.get(order.id);
              const trackingSnippet = backendMeta?.trackingNumber
                ? `${backendMeta.shippingProvider ? `${backendMeta.shippingProvider.toUpperCase()} · ` : ''}${backendMeta.trackingNumber}`
                : null;
              return (
                <Reanimated.View
                  key={order.id}
                  entering={
                    reducedMotionEnabled
                      ? undefined
                      : FadeInDown
                          .delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
                          .duration(Motion.list.enterDuration)
                  }
                >
                  <ElevatedSurface variant="surface" style={styles.cardGroup}>
                    <AnimatedPressable
                      style={styles.orderSummaryTap}
                      onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel={`Open order ${order.title}`}
                      accessibilityHint={`View details for this ${order.status.toLowerCase()} order`}
                    >
                      <View style={styles.orderRow}>
                        <CachedImage uri={getListingCoverUri(order.images, '')} style={styles.orderThumb} contentFit="cover" />
                        <View style={styles.orderInfo}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <PremiumStatusPill tone={getStatusTone(order.status)} label={order.status} compact />
                          </View>
                          <Text style={styles.orderTitle} numberOfLines={1}>{order.title}</Text>
                          {trackingSnippet ? <Text style={styles.orderTracking} numberOfLines={1}>{trackingSnippet}</Text> : null}
                          <Text style={styles.orderPrice}>{formatFromFiat(order.price, 'GBP', { displayMode: 'fiat' })}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                      </View>
                    </AnimatedPressable>
                  </ElevatedSurface>
                </Reanimated.View>
              );
            })
          )}
        </AnimatedScrollView>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  
  tabsContainer: { marginHorizontal: 20, backgroundColor: Colors.surface, borderRadius: 24, padding: 4, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 12, borderRadius: 20, borderWidth: 0, backgroundColor: 'transparent' },
  activeTabBtn: { backgroundColor: Colors.surfaceAlt },
  tabText: { fontSize: 14, fontFamily: Typography.family.semibold, color: Colors.textMuted },
  activeTabText: { color: Colors.textPrimary },

  filterStrip: { marginHorizontal: 20, gap: 10 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  activeFilterPill: { backgroundColor: Colors.textPrimary, borderColor: Colors.textPrimary },
  filterText: { fontSize: 13, fontFamily: Typography.family.medium, color: Colors.textSecondary },
  activeFilterText: { color: Colors.background, fontFamily: Typography.family.bold },

  content: { paddingHorizontal: 20, paddingBottom: 40 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginTop: 16 },
  emptySub: { fontSize: 14, fontFamily: Typography.family.regular, color: Colors.textSecondary, textAlign: 'center', marginTop: 8 },

  cardGroup: { borderRadius: Radius.lg, padding: 16, marginBottom: 16, marginHorizontal: 0 },
  orderSummaryTap: {
    borderRadius: 16,
  },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  orderThumb: { width: 70, height: 70, borderRadius: 16 },
  orderInfo: { flex: 1, justifyContent: 'center' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  orderStatus: { fontSize: 12, fontFamily: Typography.family.bold, letterSpacing: 0.5 },
  orderStatusDone: { fontSize: 12, fontFamily: Typography.family.bold, letterSpacing: 0.5 },
  orderTitle: { fontSize: 16, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: 4 },
  orderTracking: { fontSize: 12, fontFamily: Typography.family.medium, color: Colors.textMuted, marginBottom: 4 },
  orderPrice: { fontSize: 14, fontFamily: Typography.family.medium, color: Colors.textSecondary },
  buyerText: { fontSize: 12, fontFamily: Typography.family.regular, color: Colors.textMuted },
  counterpartyRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  counterpartyIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterpartyAvatar: { width: 24, height: 24, borderRadius: 12 },
  counterpartyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  counterpartyMessageBtn: {
    minHeight: 34,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  counterpartyMessageBtnText: {
    fontSize: 11,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
});
