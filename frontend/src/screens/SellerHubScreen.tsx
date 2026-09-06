import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, FontFamily, DockConstants, Elevation } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList, ROOT_STACK_ROUTES, type RootStackRouteName } from '../navigation/types';

import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader, FlagshipState, SellerHubSkeleton } from '../components/flagship';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { OfflineBanner } from '../components/OfflineBanner';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import {
  listUserOrders,
  fetchDailyBreakdown,
  type CommerceUserOrder,
  type DailyBreakdownPoint,
} from '../services/commerceApi';
import { fetchUserListingsFromApi, type ListingApiItem } from '../services/listingsApi';
import { fetchSellerHubOverview, type SellerHubOverview, type SellerHubTask } from '../services/sellerHubApi';
import { fetchImportBatches, type BatchSummaryDTO } from '../services/catalogImportApi';
import { haptics } from '../utils/haptics';
import { track } from '../analytics';

// Domain modules, one per pillar.
import { SellerExecutiveHero } from '../components/seller/SellerExecutiveHero';
import { SellerOrdersModule } from '../components/seller/SellerOrdersModule';
import { SellerAnalyticsModule, type SellerSparklinePoint } from '../components/seller/SellerAnalyticsModule';
import { SellerClosetModule } from '../components/seller/SellerClosetModule';
import { SellerListingsModule } from '../components/seller/SellerListingsModule';
import {
  formatGbp,
  toOrderPreviews,
  splitTasks,
  toSavedRailItems,
  toOwnListingRailItems,
} from '../components/seller/hubViewModels';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function SellerHubScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((s) => s.currentUser);
  const savedProducts = useStore((s) => s.savedProducts);
  const wishlist = useStore((s) => s.wishlist);
  const savedItemsCount = (savedProducts?.length ?? 0) + (wishlist?.length ?? 0);
  const { listings } = useBackendData();

  const [overview, setOverview] = useState<SellerHubOverview | null>(null);
  const [importBatches, setImportBatches] = useState<BatchSummaryDTO[]>([]);
  const [sellingOrders, setSellingOrders] = useState<CommerceUserOrder[] | null>(null);
  const [ownListings, setOwnListings] = useState<ListingApiItem[] | null>(null);
  const [dailyPoints, setDailyPoints] = useState<DailyBreakdownPoint[] | null>(null);
  const [isSparklineLoading, setSparklineLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [importError, setImportError] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const [hubOverview, ordersResult, ownListingsResult, daily] = await Promise.all([
        fetchSellerHubOverview(),
        listUserOrders(currentUser.id, { role: 'seller', limit: 6 }).catch((err: unknown) => {
          console.warn('[SellerHub] orders fetch failed:', err instanceof Error ? err.message : err);
          return null;
        }),
        fetchUserListingsFromApi(currentUser.id, { limit: 6 }).catch((err: unknown) => {
          console.warn('[SellerHub] own listings fetch failed:', err instanceof Error ? err.message : err);
          return null;
        }),
        fetchDailyBreakdown(currentUser.id, '30d').catch((err: unknown) => {
          console.warn('[SellerHub] daily breakdown fetch failed:', err instanceof Error ? err.message : err);
          return null;
        }),
        fetchImportBatches()
          .then((batches) => ({ batches, error: false }))
          .catch(() => ({ batches: [] as BatchSummaryDTO[], error: true })),
      ]);
      setOverview(hubOverview);
      setSellingOrders(ordersResult ? ordersResult.items : null);
      setOwnListings(ownListingsResult ? ownListingsResult.items : null);
      setDailyPoints(daily);
      setSparklineLoading(false);
      setImportError(false);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setSparklineLoading(true);
    load().finally(() => {
      if (mounted) setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  useEffect(() => {
    track('seller_dashboard_viewed');
  }, []);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const handleNavigateToTask = (task: SellerHubTask) => {
    const route = task.actionRoute as string;
    if (!ROOT_STACK_ROUTES.includes(route as RootStackRouteName)) {
      console.warn(`[SellerHub] Unknown task route: ${route}`);
      return;
    }
    const typedRoute = route as RootStackRouteName;
    if (typedRoute === 'CatalogImportProgress') {
      const activeBatch = importBatches.find((b) => b.status !== 'completed' && b.status !== 'cancelled');
      if (!activeBatch) {
        // batchId is a required param; without a known active batch there is
        // nothing truthful to open. Pull-to-refresh recovers the batch list.
        return;
      }
      haptics.tap();
      navigation.navigate(typedRoute, { batchId: activeBatch.id });
      return;
    }
    haptics.tap();
    (navigation.navigate as (screen: RootStackRouteName) => void)(typedRoute);
  };

  const handleOpenWallet = () => { haptics.tap(); navigation.navigate('Wallet'); };
  const handleViewAllOrders = () => { haptics.tap(); navigation.navigate('MyOrders'); };
  const handleOpenOrder = useCallback((orderId: string) => {
    haptics.tap();
    navigation.navigate('OrderDetail', { orderId });
  }, [navigation]);
  const handleOpenItem = useCallback((itemId: string) => {
    haptics.tap();
    navigation.navigate('ItemDetail', { itemId });
  }, [navigation]);
  const handleNavigateToListings = () => { haptics.tap(); navigation.navigate('MyListings'); };
  const handleNavigateToCloset = () => { haptics.tap(); navigation.navigate('Closet'); };
  const handleNavigateToAnalytics = () => { haptics.tap(); navigation.navigate('SellerAnalytics'); };

  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
        <SellerHubSkeleton />
      </FlagshipScreen>
    );
  }

  if (loadError && !overview) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
        <FlagshipState
          variant="error"
          title="Couldn't load your store"
          subtitle="Check your network connection and retry."
          actionLabel="Retry"
          onAction={() => {
            setLoadError(false);
            setIsLoading(true);
            void load().finally(() => setIsLoading(false));
          }}
        />
      </FlagshipScreen>
    );
  }

  if (!overview) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
        <FlagshipState
          variant="empty"
          title="No store data yet"
          subtitle="Start selling to see your store"
          actionLabel="List an item"
          onAction={() => navigation.navigate('Sell')}
        />
      </FlagshipScreen>
    );
  }

  const { topTask, tasks, money, inventory, businessPulse, freshness } = overview;
  const pendingOrdersCount = tasks
    .filter((t) => t.type === 'ship_order')
    .reduce((sum, t) => sum + t.count, 0);
  const tasksStale = ['orders', 'offers', 'payout_holds'].some(
    (source) => freshness[source]?.state !== 'fresh'
  );

  const orderPreviews = sellingOrders ? toOrderPreviews(sellingOrders) : [];
  const { tasks: pillarTasks, topTask: pillarTopTask } = splitTasks(overview, orderPreviews.length > 0);

  const savedRailItems = toSavedRailItems(savedProducts ?? [], wishlist ?? [], listings, formatGbp);
  const listingRailItems = ownListings ? toOwnListingRailItems(ownListings, formatGbp) : [];

  const sparkline: SellerSparklinePoint[] | null =
    dailyPoints?.map((d) => ({ date: d.date, value: d.views })) ?? null;

  return (
    <FlagshipScreen
      testID="seller-hub-screen"
      header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <OfflineBanner onRetry={() => void onRefresh()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Partial-state notice when import status failed. */}
        {importError && (
          <View style={styles.importErrorBanner}>
            <AppIcon concept="warning" size={IconSize.xs} color="warning" opticalCenter accessible={false} />
            <Text style={[styles.importErrorText, { color: colors.textSecondary }]}>
              Couldn't load import status. Pull to retry.
            </Text>
          </View>
        )}

        {/* Pillar 1 - Wallet: liquidity posture. */}
        <SellerExecutiveHero
          money={money}
          formatMoney={formatGbp}
          onOpenWallet={handleOpenWallet}
        />

        {/* Pillar 2 - Orders: media rail + task queue. */}
        <SellerOrdersModule
          orders={orderPreviews}
          tasks={pillarTasks}
          topTask={pillarTopTask}
          pendingOrdersCount={pendingOrdersCount}
          orders30dCount={businessPulse?.orders ?? 0}
          tasksStale={tasksStale}
          formatMoney={formatGbp}
          onOpenOrder={handleOpenOrder}
          onNavigateToTask={handleNavigateToTask}
          onViewAllOrders={handleViewAllOrders}
        />

        {/* Pillar 3 - Analytics: net sales, trend, sparkline. */}
        <SellerAnalyticsModule
          netSalesGbp={businessPulse?.netSalesGbp ?? null}
          trendPct={businessPulse?.netSalesPrevPeriodPct ?? null}
          orders30d={businessPulse?.orders ?? null}
          completeness={businessPulse?.completeness ?? null}
          sparkline={sparkline}
          isSparklineLoading={isSparklineLoading}
          formatMoney={formatGbp}
          onPress={handleNavigateToAnalytics}
        />

        {/* Pillar 4 - Closet: saved pieces rail. */}
        <SellerClosetModule
          savedCount={savedItemsCount}
          items={savedRailItems}
          onViewAll={handleNavigateToCloset}
          onItemPress={handleOpenItem}
        />

        {/* Catalog: the seller's live listings rail. */}
        <SellerListingsModule
          activeCount={inventory.active}
          listedValueLabel={inventory.listedValueGbp > 0 ? `${formatGbp(inventory.listedValueGbp)} listed` : null}
          items={listingRailItems}
          onViewAll={handleNavigateToListings}
          onItemPress={handleOpenItem}
        />
      </ScrollView>

      {/* Sticky bottom dock: primary action pinned outside the scroll. */}
      <View
        pointerEvents="box-none"
        style={[styles.primaryDock, { paddingBottom: Math.max(Space.lg, insets.bottom + Space.sm) }]}
      >
        <AnimatedPressable
          style={[styles.primaryActionBtn, { backgroundColor: colors.brand }]}
          onPress={() => navigation.navigate('Sell')}
          activeOpacity={0.8}
          scaleValue={0.97}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel="List a new piece"
        >
          <AppIcon concept="add" size={IconSize.sm} color="textInverse" opticalCenter accessible={false} />
          <Text style={[styles.primaryActionText, { color: colors.textInverse }]}>List new piece</Text>
        </AnimatedPressable>
      </View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: Space.xxl + 72,
    },
    importErrorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginHorizontal: Space.md,
      marginTop: Space.xs,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    importErrorText: { fontSize: TypographyV2.caption.size, fontFamily: FontFamily.regular, flex: 1 },
    primaryDock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: Space.md,
      paddingBottom: Space.lg,
    },
    primaryActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      height: DockConstants.primaryButtonHeight,
      borderRadius: Radius.full,
      ...Elevation.card,
    },
    primaryActionText: { fontSize: TypographyV2.bodyStrong.size, fontFamily: FontFamily.bold },
  });
}
