import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, FontFamily, DockConstants } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList, ROOT_STACK_ROUTES, type RootStackRouteName } from '../navigation/types';

import { FlagshipScreen, FlagshipHeader, FlagshipState, SellerHubSkeleton } from '../components/flagship';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { OfflineBanner } from '../components/OfflineBanner';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
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
import { track } from '../analytics';

// Domain modules, one per pillar.
import { SellerPillarTiles } from '../components/seller/SellerPillarTiles';
import { SellerExecutiveHero } from '../components/seller/SellerExecutiveHero';
import { SellerTrustStrip } from '../components/seller/SellerTrustStrip';
import { SellerOrdersModule } from '../components/seller/SellerOrdersModule';
import { SellerAnalyticsModule, type SellerSparklinePoint } from '../components/seller/SellerAnalyticsModule';
import { SellerClosetModule } from '../components/seller/SellerClosetModule';
import { SellerListingsModule } from '../components/seller/SellerListingsModule';
import { SellerOpportunitiesModule } from '../components/seller/SellerOpportunitiesModule';
import { SellerHubDock } from '../components/seller/SellerHubDock';
import {
  formatGbp,
  toOrderPreviews,
  splitTasks,
  summarizeTriage,
  toSavedRailItems,
  toOwnListingRailItems,
} from '../components/seller/hubViewModels';

type NavT = NativeStackNavigationProp<RootStackParamList>;

/** Per-resource fetch lifecycle — replaces the overloaded `data === null` signal. */
type ResourceStatus = 'loading' | 'ready' | 'failed';

/** Runs one hub resource fetch and drives its status. Never rejects — a
 *  rejected promise becomes 'failed' + null data, rendered as an inline
 *  retry row instead of an indefinite skeleton. */
async function fetchHubResource<T>(
  label: string,
  fetcher: () => Promise<T>,
  setData: (value: T | null) => void,
  setStatus: (status: ResourceStatus) => void,
): Promise<void> {
  setStatus('loading');
  try {
    setData(await fetcher());
    setStatus('ready');
  } catch (err: unknown) {
    console.warn(`[SellerHub] ${label} fetch failed:`, err instanceof Error ? err.message : err);
    setData(null);
    setStatus('failed');
  }
}

export default function SellerHubScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
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
  const [sellingOrdersStatus, setSellingOrdersStatus] = useState<ResourceStatus>('loading');
  const [ownListingsStatus, setOwnListingsStatus] = useState<ResourceStatus>('loading');
  const [dailyPointsStatus, setDailyPointsStatus] = useState<ResourceStatus>('loading');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [importError, setImportError] = useState(false);

  // Single-resource loaders — reused by load(), pull-to-refresh, and each
  // module's inline retry. Each resets its status to 'loading' on entry.
  const loadOrders = useCallback(() => {
    const userId = currentUser?.id;
    if (!userId) return Promise.resolve();
    return fetchHubResource('orders', async () => (await listUserOrders(userId, { role: 'seller', limit: 6 })).items, setSellingOrders, setSellingOrdersStatus);
  }, [currentUser?.id]);
  const loadOwnListings = useCallback(() => {
    const userId = currentUser?.id;
    if (!userId) return Promise.resolve();
    return fetchHubResource('own listings', async () => (await fetchUserListingsFromApi(userId, { limit: 6 })).items, setOwnListings, setOwnListingsStatus);
  }, [currentUser?.id]);
  const loadDailyPoints = useCallback(() => {
    const userId = currentUser?.id;
    if (!userId) return Promise.resolve();
    return fetchHubResource('daily breakdown', () => fetchDailyBreakdown(userId, '30d'), setDailyPoints, setDailyPointsStatus);
  }, [currentUser?.id]);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const [hubOverview, importResult] = await Promise.all([
        fetchSellerHubOverview(),
        fetchImportBatches()
          .then((batches) => ({ batches, error: false }))
          .catch(() => ({ batches: [] as BatchSummaryDTO[], error: true })),
        // Never reject — a failed rail gets an inline retry, not a screen error.
        loadOrders(),
        loadOwnListings(),
        loadDailyPoints(),
      ]);
      setOverview(hubOverview);
      // P1 fix: propagate import batch data and error flag into state —
      // dropping it left the catalog import task unreachable and failures invisible.
      setImportBatches(importResult.batches);
      setImportError(importResult.error);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [currentUser?.id, loadOrders, loadOwnListings, loadDailyPoints]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
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
      navigation.navigate(typedRoute, { batchId: activeBatch.id });
      return;
    }
    (navigation.navigate as (screen: RootStackRouteName) => void)(typedRoute);
  };

  // S0 haptic grammar: pure navigation pushes are silent — the pushed screen
  // is the confirmation. Haptics live on the pressables that need them
  // (Transfer light, List-new-piece medium), not in these handlers.
  const handleOpenWallet = () => { navigation.navigate('Wallet'); };
  const handleViewAllOrders = () => { navigation.navigate('MyOrders'); };
  const handleOpenOrder = useCallback((orderId: string) => {
    navigation.navigate('OrderDetail', { orderId });
  }, [navigation]);
  const handleOpenItem = useCallback((itemId: string) => {
    navigation.navigate('ItemDetail', { itemId });
  }, [navigation]);
  const handleNavigateToListings = () => { navigation.navigate('MyListings'); };
  const handleNavigateToCloset = () => { navigation.navigate('Closet'); };
  const handleNavigateToAnalytics = () => { navigation.navigate('SellerAnalytics'); };

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

  const { topTask, tasks, money, inventory, businessPulse, freshness, trust, opportunities } = overview;
  const { pendingOrdersCount, atStakeGbp } = summarizeTriage(tasks);
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

        {/* Zone 1 · The work — orders to dispatch (media rail with SLA
            chips), then the flat task queue (offers, listing issues,
            payout holds, imports). Failed fetch → inline retry. */}
        {sellingOrdersStatus === 'failed' && (
          <SyncRetryBanner message="Couldn't load orders." onRetry={() => void loadOrders()}
            telemetryContext="seller_hub_orders" containerStyle={styles.resourceErrorBanner} />
        )}
        <SellerOrdersModule
          orders={orderPreviews}
          isOrdersLoading={sellingOrdersStatus === 'loading' && sellingOrders === null}
          ordersFailed={sellingOrdersStatus === 'failed'}
          tasks={pillarTasks}
          topTask={pillarTopTask}
          pendingOrdersCount={pendingOrdersCount}
          atStakeGbp={atStakeGbp}
          orders30dCount={businessPulse?.orders ?? 0}
          tasksStale={tasksStale}
          formatMoney={formatGbp}
          onOpenOrder={handleOpenOrder}
          onNavigateToTask={handleNavigateToTask}
          onViewAllOrders={handleViewAllOrders}
        />

        {/* Zone 2 · The money — liquidity posture once the work is clear. */}
        <SellerExecutiveHero
          money={money}
          formatMoney={formatGbp}
          onOpenWallet={handleOpenWallet}
        />

        {/* Evidenced reputation — quiet row under the money panel;
            renders only when the backend owns a trust row. */}
        <SellerTrustStrip
          trust={trust ?? null}
          stale={freshness.trust?.state !== 'fresh'}
        />

        {/* Zone 3 · Destinations — quick-access grid demoted below the
            work and the money: Wallet / Orders / Analytics / Closet. */}
        <SellerPillarTiles
          pendingOrdersCount={pendingOrdersCount}
          walletBalanceLabel={money ? formatGbp(money.availableGbp) : undefined}
          onOpenWallet={handleOpenWallet}
          onOpenOrders={handleViewAllOrders}
          onOpenAnalytics={handleNavigateToAnalytics}
          onOpenCloset={handleNavigateToCloset}
        />

        {/* Catalog: the seller's live listings rail. */}
        {ownListingsStatus === 'failed' && (
          <SyncRetryBanner message="Couldn't load your listings." onRetry={() => void loadOwnListings()}
            telemetryContext="seller_hub_listings" containerStyle={styles.resourceErrorBanner} />
        )}
        <SellerListingsModule
          activeCount={inventory.active}
          listedValueLabel={inventory.listedValueGbp > 0 ? `${formatGbp(inventory.listedValueGbp)} listed` : null}
          items={listingRailItems}
          onViewAll={handleNavigateToListings}
          onItemPress={handleOpenItem}
          isLoading={ownListingsStatus === 'loading' && ownListings === null}
          isFailed={ownListingsStatus === 'failed'}
        />

        {/* Performance: net sales, trend, traffic sparkline. */}
        {dailyPointsStatus === 'failed' && (
          <SyncRetryBanner message="Couldn't load store views." onRetry={() => void loadDailyPoints()}
            telemetryContext="seller_hub_views" containerStyle={styles.resourceErrorBanner} />
        )}
        <SellerAnalyticsModule
          netSalesGbp={businessPulse?.netSalesGbp ?? null}
          trendPct={businessPulse?.netSalesPrevPeriodPct ?? null}
          orders30d={businessPulse?.orders ?? null}
          completeness={businessPulse?.completeness ?? null}
          sparkline={sparkline}
          isSparklineLoading={dailyPointsStatus === 'loading' && dailyPoints === null}
          isSparklineFailed={dailyPointsStatus === 'failed'}
          formatMoney={formatGbp}
          onPress={handleNavigateToAnalytics}
        />

        {/* Closet: saved pieces rail — the least operational destination. */}
        <SellerClosetModule
          savedCount={savedItemsCount}
          items={savedRailItems}
          onViewAll={handleNavigateToCloset}
          onItemPress={handleOpenItem}
          isLoading={false}
        />

        {/* Zone 4 · Growth — near-winners (views without sales); null
            or empty renders nothing. Sits last. */}
        <SellerOpportunitiesModule
          opportunities={opportunities ?? null}
          formatMoney={formatGbp}
          onItemPress={handleOpenItem}
          onViewAll={handleNavigateToListings}
        />
      </ScrollView>

      {/* Sticky bottom dock: primary action pinned outside the scroll. */}
      <SellerHubDock onListNewPiece={() => navigation.navigate('Sell')} />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: Space.xxl + DockConstants.singleActionHeight,
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
    resourceErrorBanner: { marginHorizontal: Space.md, marginTop: Space.lg },
  });
}
