import React from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '../utils/haptics';
import { RouteProp, useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useStore } from '../store/useStore';
import { Space, DockConstants } from '../theme/designTokens';
import {
  fetchCoOwnDistributions,
  fetchCoOwnAssetCorporateActions,
  fetchMyCoOwnAssetOrders,
  cancelCoOwnOrder,
  listCoOwnAssets,
  type CoOwnDistribution,
  type CoOwnCorporateAction,
  type MarketCoOwnAsset,
  type MarketHistoryItem,
} from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';
import {
  useCoOwnAssetQuery,
  useCoOwnHoldingsQuery,
  useInvalidateCoOwnAsset,
} from '../platform/server/useCoOwnQueries';
import { CO_OWN_FEE_RATE } from '../utils/tradeFlow';
import { formatCoOwnIze } from '../utils/currency';
import {
  CommerceMediaStage,
  CommerceStateCanvas,
} from '../components/commerce';
import {
  CommerceDetailHeader,
  CommerceDetailMediaRail,
} from '../components/commerce/detail';
import {
  buildCoOwnViewModel,
  useProductSocialState,
  useSellerTrust,
} from '../platform/product';
import {
  CoOwnStateCanvas,
  CANONICAL_RIGHTS_LABELS,
  type CoOwnRightsRow,
  type CoOwnCandleRange,
  type CoOwnChartType,
} from '../components/coown';
import { AssetDetailModals } from '../components/coown/asset-detail/AssetDetailModals';
import {
  AssetOverviewSection,
  AssetMarketSection,
  AssetOwnershipSection,
  AssetDetailDock,
  AssetDetailIdentity,
  RelatedAssetsRail,
  CoOwnSegmentNav,
  CoOwnScrollContext,
  type CoOwnDetailTab,
} from '../components/coown/asset-detail';
import {
  deriveLifecycleState,
  type AssetLifecycleState,
} from '../components/coown/asset-detail/types';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useSignupWall } from '../hooks/useSignupWall';
import { useAssetDetailSheets } from '../hooks/useAssetDetailSheets';
import { usePriceAlertForm } from '../hooks/usePriceAlertForm';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { useCoOwnOrderBookStream } from '../hooks/useCoOwnOrderBookStream';

type RouteT = RouteProp<RootStackParamList, 'AssetDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

// Local type for recommendation items — replaces the mockData Listing import.
// The recommendation rail returns items that have an `id` field; we only need
// that to navigate to ItemDetail. We do not import the full Listing type from
// mockData because this screen must not depend on mock data types.

// ── Corporate action row helpers ──
// Extracted to corporateActionHelpers.ts — shared with AssetOwnershipSection.
import { formatDayMonth, corporateActionDateLabel, corporateActionAmountLabel } from '../components/coown/asset-detail/corporateActionHelpers';

export default function AssetDetailScreen() {
  useScreenCaptureProtection();
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors, isDark } = useAppTheme();
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { isCommerceCompact: isCompact, isVeryCompact } = useBreakpoint();
  const currentUser = useStore((state) => state.currentUser);
  const isCoOwnWatched = useStore((state) => state.isCoOwnWatched);
  const toggleCoOwnWatch = useStore((state) => state.toggleCoOwnWatch);
  const { show } = useToast();
  const { requireAuth } = useSignupWall();

  const assetId = route.params?.assetId;

  // ── Shared cache (deduplicated with AssetDueDiligenceScreen) ──
  const assetQuery = useCoOwnAssetQuery(assetId);
  const holdingsQuery = useCoOwnHoldingsQuery(currentUser?.id);
  const invalidateCoOwnAsset = useInvalidateCoOwnAsset();

  const asset = assetQuery.data ?? null;
  const isLoading = assetQuery.isLoading;
  const isError = assetQuery.isError;
  const yourHolding = holdingsQuery.data?.find((entry) => entry.assetId === assetId) ?? null;
  const yourUnits = currentUser?.id
    ? (holdingsQuery.data ? (yourHolding?.unitsOwned ?? 0) : null)
    : 0;
  const holdingsError = currentUser?.id ? holdingsQuery.isError : false;

  const [lastDistribution, setLastDistribution] = React.useState<CoOwnDistribution | null>(null);
  const [corporateActions, setCorporateActions] = React.useState<CoOwnCorporateAction[] | null>(null);
  const [distributionsFailed, setDistributionsFailed] = React.useState(false);
  const [distributionsLoading, setDistributionsLoading] = React.useState(true);
  const [corporateActionsFailed, setCorporateActionsFailed] = React.useState(false);
  const [corporateActionsLoading, setCorporateActionsLoading] = React.useState(true);
  const [hasActiveOrders, setHasActiveOrders] = React.useState(false);
  const [yourOpenOrders, setYourOpenOrders] = React.useState<MarketHistoryItem[] | null>(null);
  const [yourOpenOrdersFailed, setYourOpenOrdersFailed] = React.useState(false);
  const [yourOpenOrdersLoading, setYourOpenOrdersLoading] = React.useState(false);
  const [cancellingOrderId, setCancellingOrderId] = React.useState<number | null>(null);
  const [openOrdersRetryNonce, setOpenOrdersRetryNonce] = React.useState(0);
  const retryOpenOrders = React.useCallback(() => setOpenOrdersRetryNonce(value => value + 1), []);
  const [relatedAssets, setRelatedAssets] = React.useState<MarketCoOwnAsset[]>([]);
  const [relatedAssetsLoading, setRelatedAssetsLoading] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [fullscreenIndex, setFullscreenIndex] = React.useState(0);
  // F22: the pending trade intent carries the full draft (side + optional
  // pre-selected limit price) so a first-trade education interruption
  // never silently drops the level the user tapped in the book.
  const [pendingTradeSide, setPendingTradeSide] = React.useState<{
    side: 'buy' | 'sell';
    limitPrice?: number;
  } | null>(null);
  const [candleRange, setCandleRange] = React.useState<CoOwnCandleRange>('1W');
  const [chartType, setChartType] = React.useState<CoOwnChartType>('candle');
  const [showVolume, setShowVolume] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<CoOwnDetailTab>('overview');

  // ── Sheet/expansion state (discriminated union for modal sheets) ──
  const { sheets, open: openSheet, close: closeSheet } = useAssetDetailSheets();
  const {
    fullscreenVisible,
    guideVisible,
    rightsSheetVisible,
    overflowVisible,
    supplySheetVisible,
    riskDisclosureVisible,
  } = sheets;

  // ── Price alert creation form state ──
  const {
    priceAlertVisible,
    alertTargetPrice,
    alertCondition,
    alertSubmitting,
    setAlertTargetPrice,
    setAlertCondition,
    openPriceAlert,
    closePriceAlert,
    handleSubmit: handleCreatePriceAlert,
  } = usePriceAlertForm(assetId);

  // Progressive disclosure — expert sections collapsed by default so the
  // first viewport shows identity, story, trust, and holder position.

  const [dataLoadedAt, setDataLoadedAt] = React.useState<number | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  // Refresh open orders when the screen regains focus (e.g. returning from
  // TradeConfirm → CoOwnOrderHistory → back). Without this, the local
  // yourOpenOrders state can be stale after a trade because it is not
  // backed by React Query and the effect dependencies don't change on
  // navigation focus.
  useFocusEffect(
    React.useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, [])
  );

  // The order book is a snapshot-plus-delta stream. The hook resynchronises
  // after sequence gaps, reconnects, and foreground returns; the detail page
  // consumes one authoritative stream instead of maintaining a second poller.
  const {
    orderBook,
    isStreaming: orderBookStreaming,
    hasGap: orderBookHasGap,
    hasError: orderBookError,
    refetch: refetchOrderBook,
  } = useCoOwnOrderBookStream(assetId ?? null);

  const coOwnCompliance = useStore((s) => s.coOwnCompliance);
  const updateCoOwnCompliance = useStore((s) => s.updateCoOwnCompliance);

  const handleOpenFullscreen = (index: number) => {
    setFullscreenIndex(index);
    openSheet('fullscreen');
  };

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    if (!reducedMotion) {
      scrollY.value = event.contentOffset.y;
    }
  });

  // ── CoOwnScrollContext provider ──
  // CoOwnSegmentNav calls scrollToY(navY) on tab switch to bring the
  // segmented nav back into view. Wire the context to the ScrollView
  // ref so the call is live instead of a no-op default.
  const scrollRef = React.useRef<Reanimated.ScrollView>(null);
  const scrollToY = React.useCallback((y: number) => {
    scrollRef.current?.scrollTo({ y, animated: true });
  }, []);
  const coOwnScrollValue = React.useMemo(() => ({ scrollToY }), [scrollToY]);

  // ── Last distribution fetch — most recent distribution for this asset.
  // The unclaimed badge treats only non-settled distributions as unclaimed;
  // a settled distribution is history, not an outstanding payout.
  React.useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setDistributionsFailed(false);
    setDistributionsLoading(true);
    void fetchCoOwnDistributions({ assetId, limit: 1 })
      .then((result) => {
        if (cancelled) return;
        setLastDistribution(result.items[0] ?? null);
        setDistributionsFailed(false);
        setDistributionsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLastDistribution(null);
        setDistributionsFailed(true);
        setDistributionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [assetId, refreshKey]);

  // ── Corporate actions — latest 3 events for the ownership timeline ──
  React.useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setCorporateActionsFailed(false);
    setCorporateActionsLoading(true);
    void fetchCoOwnAssetCorporateActions(assetId, { limit: 3 })
      .then((items) => {
        if (cancelled) return;
        setCorporateActions(items);
        setCorporateActionsFailed(false);
        setCorporateActionsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCorporateActions(null);
        setCorporateActionsFailed(true);
        setCorporateActionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [assetId, refreshKey]);

  // ── Related assets — same issuer, excluding the current asset.
  // Fetches up to 8 open sibling assets for a compact horizontal rail
  // below the tabbed content. Closed/delisted assets are filtered out
  // so the rail never navigates to a broken surface. State is reset
  // before each fetch to prevent stale sibling leakage on asset change.
  React.useEffect(() => {
    if (!asset?.issuerId || !assetId) {
      setRelatedAssets([]);
      setRelatedAssetsLoading(false);
      return;
    }
    let cancelled = false;
    // P1 #11 fix: reset before fetch so stale siblings don't flash.
    setRelatedAssets([]);
    setRelatedAssetsLoading(true);
    void listCoOwnAssets({ issuerId: asset.issuerId, openOnly: true, limit: 9 })
      .then((items) => {
        if (cancelled) return;
        // P1 #7 fix: exclude closed/delisted assets and the current asset.
        const siblings = items
          .filter((a) => a.id !== assetId && a.isOpen && a.listingTier !== 'delisted')
          .slice(0, 8);
        setRelatedAssets(siblings);
        setRelatedAssetsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRelatedAssets([]);
        setRelatedAssetsLoading(false);
      });
    return () => { cancelled = true; };
  }, [asset?.issuerId, assetId, refreshKey]);

  // ── Active orders badge + open-orders panel data — the user's own
  // co-own market history carries order status; open/partially_filled
  // entries for this asset light the Market tab dot AND populate the
  // inline open-orders panel. Anonymous viewers get null (panel hidden).
  React.useEffect(() => {
    if (!assetId || !currentUser?.id) {
      setYourOpenOrders(null);
      setYourOpenOrdersFailed(false);
      setYourOpenOrdersLoading(false);
      setHasActiveOrders(false);
      return;
    }
    let cancelled = false;
    // P0 fix: reset state before fetch so stale cross-asset/user data
    // never leaks into the new fetch cycle.
    setYourOpenOrders(null);
    setYourOpenOrdersFailed(false);
    setYourOpenOrdersLoading(true);
    setHasActiveOrders(false);
    // P1 fix: use the dedicated asset-scoped my-orders endpoint instead of
    // filtering a 200-item account-history window. This returns only the
    // current user's open/partially_filled orders for this asset.
    void fetchMyCoOwnAssetOrders(assetId, { limit: 50 })
      .then((orders) => {
        if (cancelled) return;
        // Map MarketCoOwnOrder to MarketHistoryItem shape so the downstream
        // UI (AssetMarketSection) can consume the same contract.
        const mapped: MarketHistoryItem[] = orders.map((o) => ({
          id: `coown-order-${o.id}`,
          channel: 'co-own',
          action: o.side === 'buy' ? 'buy-units' : 'sell-units',
          referenceId: assetId,
          // Gross notional — unitPriceGbp * units. totalGbp is side-dependent
          // (cost for buys, net proceeds for sells) and is 0 for new open
          // orders, so it must not be used as the uniform amount field.
          amountGbp: o.unitPriceGbp * o.units,
          units: o.units,
          filledUnits: o.filledUnits ?? null,
          remainingUnits: o.remainingUnits ?? null,
          unitPriceGbp: o.unitPriceGbp,
          feeGbp: o.feeGbp,
          status: o.status,
          orderType: o.orderType ?? null,
          note: null,
          timestamp: o.createdAt,
          orderId: o.id,
        }));
        setYourOpenOrders(mapped);
        setHasActiveOrders(mapped.length > 0);
        setYourOpenOrdersLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setYourOpenOrders(null);
        setYourOpenOrdersFailed(true);
        setHasActiveOrders(false);
        setYourOpenOrdersLoading(false);
      });
    return () => { cancelled = true; };
  }, [assetId, currentUser?.id, refreshKey, openOrdersRetryNonce]);

  // Track when asset data first arrives for staleness computation
  React.useEffect(() => {
    if (asset) setDataLoadedAt(Date.now());
  }, [asset]);

  // Show error toast on asset fetch failure
  React.useEffect(() => {
    if (assetQuery.error) {
      const parsed = parseApiError(assetQuery.error, 'Unable to load asset');
      show(parsed.message, 'error');
    }
  }, [assetQuery.error, show]);

  const retryOrderBook = React.useCallback(() => {
    void refetchOrderBook();
  }, [refetchOrderBook]);

  const retryHoldings = React.useCallback(() => {
    if (!currentUser?.id) return;
    holdingsQuery.refetch();
  }, [holdingsQuery, currentUser?.id]);

  // ── Cancel an open order ──
  // Optimistic removal from the local list, then API call. On failure,
  // restore by re-fetching and toast the error. The cancel endpoint
  // requires the authenticated user's identity.
  // P1 #3: Cancel is blocked during reconciliation (balances settling)
  // but allowed when the market is closed — resting orders can be
  // withdrawn even when new orders are paused.
  // P1 #15: Verify the order exists in the local list and belongs to
  // this asset before calling the API.
  const handleCancelOrder = React.useCallback((orderId: number) => {
    if (!assetId || !currentUser?.id || cancellingOrderId != null) return;
    // P1 #15: fail closed — verify the order is in our list for this asset
    const orderExists = yourOpenOrders?.some(
      (o) => o.orderId === orderId && o.referenceId === assetId
    );
    if (!orderExists) {
      show('Order not found. Refresh and try again.', 'error');
      return;
    }
    // P1 #3: block cancel during reconciliation — compute inline since
    // reconciliationActive is declared later in the render flow.
    const orderBookReconciling = orderBook != null && orderBook.reconciliationState !== 'reconciled';
    if (orderBookReconciling) {
      show('Orders cannot be cancelled while balances are reconciling.', 'error');
      return;
    }
    haptics.tap();
    setCancellingOrderId(orderId);
    // Keep the order visible until the server acknowledges cancellation.
    void cancelCoOwnOrder(assetId, orderId, currentUser.id)
      .then(() => {
        setCancellingOrderId(null);
        setYourOpenOrders(prev => prev?.filter(order => order.orderId !== orderId) ?? null);
        // Invalidate cached order book / holdings so returning views show
        // the updated state after the cancellation. Also explicitly refetch
        // the streaming order book — the stream manages its own snapshot
        // state and does not observe React Query invalidations.
        invalidateCoOwnAsset(assetId, currentUser.id);
        void refetchOrderBook();
        // Refresh the badge state
        setRefreshKey((k) => k + 1);
      })
      .catch((err) => {
        setCancellingOrderId(null);
        const parsed = parseApiError(err, 'Could not cancel order');
        show(parsed.message, 'error');
        // Reconcile the authoritative order state after a failed response.
        setRefreshKey((k) => k + 1);
      });
  }, [assetId, currentUser?.id, show, yourOpenOrders, orderBook, invalidateCoOwnAsset, refetchOrderBook, cancellingOrderId]);

  // Pull-to-refresh — reloads asset, order book, and holdings in parallel.
  // Bumping refreshKey also re-runs the distributions, corporate-actions,
  // active-orders, and related-assets effects so every surface refreshes.
  // The refresh spinner stays up until the primary fetches settle; the
  // refreshKey-triggered effects run concurrently and settle on their own.
  // Recourse status is fetched by the Due Diligence screen independently.
  const handleRefresh = React.useCallback(() => {
    if (!assetId) return;
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    void Promise.allSettled([
      assetQuery.refetch(),
      refetchOrderBook(),
      currentUser?.id ? holdingsQuery.refetch() : Promise.resolve(),
    ]).then(() => {
      setRefreshing(false);
    });
  }, [assetId, assetQuery, holdingsQuery, currentUser?.id, refetchOrderBook]);

  // ── Hooks must run before conditional returns (Rules of Hooks) ──

  // Market-data staleness computation (spec 07 §1.4). `asOf` is only the
  // response assembly time; use the backend source watermark instead so a
  // freshly fetched stale mark cannot appear live.
  //
  // F13: observation freshness and fact age are separate truths. A live
  // streaming book proves the transport is fresh — an old last execution
  // in a quiet market is an honest old fact (labelled in the identity),
  // not a disconnected market. Only backend-declared connection states
  // or a stale mark can flag staleness while the book streams; when no
  // live transport exists, elapsed time remains the fallback signal.
  const STALENESS_THRESHOLD_SECONDS = 24 * 60 * 60;
  const { dataStale, dataStaleAgeLabel } = React.useMemo(() => {
    if (!asset || !dataLoadedAt) return { dataStale: false, dataStaleAgeLabel: undefined };
    const snapshot = asset.marketSnapshot;
    const hasSecondaryMarket = asset.marketStatus === 'trading'
      || (asset.marketStatus == null && asset.availableUnits === 0);
    const sourceTimestamp = snapshot?.sourceAsOf
      ? new Date(snapshot.sourceAsOf).getTime()
      : snapshot?.lastExecutionAt
        ? new Date(snapshot.lastExecutionAt).getTime()
        : hasSecondaryMarket && asset.updatedAt
          ? new Date(asset.updatedAt).getTime()
          : dataLoadedAt;
    const ageSeconds = Number.isFinite(sourceTimestamp)
      ? Math.max(0, (Date.now() - sourceTimestamp) / 1000)
      : Number.POSITIVE_INFINITY;
    const staleByStatus = snapshot?.connectionStatus === 'stale'
      || snapshot?.connectionStatus === 'degraded'
      || (asset.staleMarkDays != null && asset.staleMarkDays > 7);
    const stale = staleByStatus
      || (hasSecondaryMarket
        && !orderBookStreaming
        && ageSeconds > STALENESS_THRESHOLD_SECONDS);
    if (!stale) return { dataStale: false, dataStaleAgeLabel: undefined };
    const ageLabel = !Number.isFinite(ageSeconds)
      ? 'age unavailable'
      : ageSeconds > 86400 * 2
      ? `${Math.floor(ageSeconds / 86400)}d ago`
      : ageSeconds > 3600
        ? `${Math.floor(ageSeconds / 3600)}h ago`
        : `${Math.floor(ageSeconds / 60)}m ago`;
    return { dataStale: true, dataStaleAgeLabel: ageLabel };
  }, [asset, dataLoadedAt, orderBookStreaming]);

  const supplyIsValid = React.useMemo(() => {
    if (!asset) return false;
    return (
      Number.isInteger(asset.totalUnits)
      && asset.totalUnits > 0
      && Number.isInteger(asset.availableUnits)
      && asset.availableUnits >= 0
      && asset.availableUnits <= asset.totalUnits
    );
  }, [asset]);

  const viewModel = React.useMemo(() => {
    if (!asset || !supplyIsValid) return null;
    return buildCoOwnViewModel({
      asset,
      viewerUnits: yourUnits ?? 0,
      orderBook,
      currentUserId: currentUser?.id,
    });
  }, [asset, supplyIsValid, yourUnits, orderBook, currentUser?.id]);

  const social = useProductSocialState(viewModel);

  // Guest gating: wrap save/like actions with the soft signup wall so
  // guests can browse Co-Own assets freely but cannot commit to saving
  // or liking without an account.
  const guardedOpenCollectionPicker = React.useCallback(() => {
    if (!requireAuth('save_item')) return;
    social.openCollectionPicker();
  }, [requireAuth, social]);
  const guardedToggleLike = React.useCallback(() => {
    if (!requireAuth('save_item')) return;
    social.toggleLike();
  }, [requireAuth, social]);

  const { data: issuerTrust } = useSellerTrust(asset?.issuerId);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CommerceStateCanvas state="loading" family="coown" />
      </View>
    );
  }

  if (isError || !asset) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnStateCanvas
          variant="error"
          title="Item not found"
          subtitle="This item may have been delisted."
          actionLabel="Back to Co-Own"
          onAction={() => navigation.navigate('CoOwnHub')}
        />
      </View>
    );
  }

  if (!supplyIsValid) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnStateCanvas
          variant="error"
          title="Supply data unavailable"
          subtitle="Trading is disabled until this is corrected."
          actionLabel="Back to Co-Own"
          onAction={() => navigation.navigate('CoOwnHub')}
        />
      </View>
    );
  }

  const isIssuer = currentUser?.id === asset.issuerId;
  const isHolder = yourUnits != null && yourUnits > 0;
  const isWatched = isCoOwnWatched(asset.id);
  const issuerUsername =
    asset.issuer?.displayName
    || asset.issuer?.username
    || issuerTrust?.username
    || 'Issuer';

  const availableUnits = asset.availableUnits;
  const totalUnits = asset.totalUnits;

  // ── Lifecycle state ──
  // Derived from isOpen + availableUnits. If the backend later
  // publishes offeringStatus / marketStatus, deriveLifecycleState
  // prefers those fields.
  const lifecycleState: AssetLifecycleState = deriveLifecycleState(asset);
  const isInitialOffering = lifecycleState === 'initialOffering';

  const appraisedValuePerUnitGbp = asset.appraisalValueGbp && totalUnits > 0
    ? asset.appraisalValueGbp / totalUnits
    : null;
  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;
  const viewerPct = yourUnits != null && totalUnits > 0
    ? Math.round((yourUnits / totalUnits) * 100 * 10) / 10
    : null;
  // Ownership structure segments for the stacked bar visualization.
  // yourUnits comes from the holdings contract; otherHolders is derived.
  const yourUnitsInt = yourUnits ?? 0;
  const otherHoldersUnits = Math.max(0, totalUnits - availableUnits - yourUnitsInt);
  const yourSegmentPct = totalUnits > 0 ? (yourUnitsInt / totalUnits) * 100 : 0;
  const otherHoldersSegmentPct = totalUnits > 0 ? (otherHoldersUnits / totalUnits) * 100 : 0;
  const availableSegmentPct = totalUnits > 0 ? (availableUnits / totalUnits) * 100 : 0;
  // Last distribution formatted values
  const lastDistributionAmount = lastDistribution?.amountGbpMinor != null
    ? lastDistribution.amountGbpMinor / 100
    : null;
  const lastDistributionDate = lastDistribution?.settledAt
    ? new Date(lastDistribution.settledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : lastDistribution?.createdAt
      ? new Date(lastDistribution.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : null;
  const lastDistributionPerUnit = lastDistribution?.perUnitGbpMinor != null
    ? lastDistribution.perUnitGbpMinor / 100
    : null;
  const feePct = Math.round((asset.tradingFeeRate ?? CO_OWN_FEE_RATE) * 100);

  const bestBid = orderBook && orderBook.bids.length > 0 ? orderBook.bids[0] : null;
  const bestAsk = orderBook && orderBook.asks.length > 0 ? orderBook.asks[0] : null;
  const spreadGbp = bestBid?.unitPriceGbp != null && bestAsk?.unitPriceGbp != null
    ? Math.max(0, bestAsk.unitPriceGbp - bestBid.unitPriceGbp)
    : null;
  const depthStatusLabel = orderBookHasGap
    ? 'Resyncing depth'
    : orderBookStreaming
      ? 'Live depth'
      : orderBook
        ? 'Snapshot depth'
        : 'Depth unavailable';
  const reconciliationActive =
    orderBook != null && orderBook.reconciliationState !== 'reconciled';
  const marketSnapshot = asset.marketSnapshot ?? null;
  const movePct24h = marketSnapshot?.marketMovePct24h ?? asset.marketMovePct24h ?? null;
  const bestBidGbp = marketSnapshot?.bestBidGbp ?? asset.bestBidGbp ?? null;
  const bestAskGbp = marketSnapshot?.bestAskGbp ?? asset.bestAskGbp ?? null;
  const lastExecutionPriceGbp = marketSnapshot?.lastExecutionPriceGbp ?? null;
  // Reference-vs-appraisal percentage — the signed delta between the
  // last settled trade price and the per-unit appraisal. Null when
  // either value is missing. Positive = premium, negative = discount.
  const referenceVsAppraisalPct =
    lastExecutionPriceGbp != null && appraisedValuePerUnitGbp && appraisedValuePerUnitGbp > 0
      ? ((lastExecutionPriceGbp - appraisedValuePerUnitGbp) / appraisedValuePerUnitGbp) * 100
      : null;
  const lastExecutionAgeSeconds = marketSnapshot?.lastExecutionAt
    ? Math.max(0, Math.floor((Date.now() - new Date(marketSnapshot.lastExecutionAt).getTime()) / 1000))
    : null;
  const hasTrades = lastExecutionPriceGbp != null;
  // ── Dominant price ──
  // ONE price display in the header. During initial offering the
  // offering price dominates. Once secondary trades exist, the last
  // trade price with timestamp dominates. Falls back to offering
  // price when no trades have occurred.
  const dominantPriceLabel = isInitialOffering
    ? 'Offering price'
    : hasTrades
      ? 'Last trade'
      : 'Offering price';
  const dominantPriceValue = isInitialOffering || lastExecutionPriceGbp == null
    ? asset.unitPriceGbp
    : lastExecutionPriceGbp;
  const dominantPriceTimestamp = hasTrades && !isInitialOffering && marketSnapshot?.lastExecutionAt
    ? new Date(marketSnapshot.lastExecutionAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  // ── Holder P&L (spec 09 upgrade) ──
  // F06: the position mark uses the SAME price the headline shows, so the
  // detail mark and the hero price can never disagree. The basis is
  // labelled in the ownership section — marked value is not estimated
  // sale proceeds.
  const avgEntryPriceGbp = yourHolding?.avgEntryPriceGbp ?? null;
  const positionValueGbp = yourUnits != null ? dominantPriceValue * yourUnits : null;
  const positionMarkBasis: 'last trade' | 'reference price' = hasTrades && !isInitialOffering
    ? 'last trade'
    : 'reference price';
  const positionCostGbp = avgEntryPriceGbp != null && yourUnits != null
    ? avgEntryPriceGbp * yourUnits
    : null;
  const unrealizedPnlGbp = positionValueGbp != null && positionCostGbp != null
    ? positionValueGbp - positionCostGbp
    : null;
  const unrealizedPnlPct = positionCostGbp != null && positionCostGbp > 0 && unrealizedPnlGbp != null
    ? (unrealizedPnlGbp / positionCostGbp) * 100
    : null;

  const apiCandles = asset.candles ?? [];
  const candleData = apiCandles.map((c) => ({
    t: new Date(c.timestamp).getTime(),
    o: c.openGbp,
    h: c.highGbp,
    l: c.lowGbp,
    c: c.closeGbp,
    v: c.volume,
  }));

  const images = asset.imageUrl ? [asset.imageUrl] : [];

  // Compute scroll bottom padding from dock geometry + safe area.
  const isDualActionDock =
    isHolder
    && !isInitialOffering
    && asset.isOpen
    && availableUnits > 0
    && !holdingsError
    && !orderBookError
    && orderBook?.source === 'live'
    && !reconciliationActive
    && !(lifecycleState === 'secondaryTrading' && dataStale);
  const dockHeight = isDualActionDock
    ? DockConstants.dualActionHeight
    : DockConstants.singleActionHeight;
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + dockHeight + Space.md;

  const handleTradePress = (side: 'buy' | 'sell') => {
    if (!requireAuth('purchase')) return;
    if (isInitialOffering && side === 'sell') {
      show('Selling opens after the initial allocation closes.', 'info');
      return;
    }
    if (holdingsError || yourUnits == null) {
      show('Your position is unavailable. Refresh it before trading.', 'error');
      return;
    }
    const canBuyPrimaryOffering = isInitialOffering && side === 'buy' && availableUnits > 0;
    if (!canBuyPrimaryOffering && (orderBookError || !orderBook || orderBook.source !== 'live' || reconciliationActive)) {
      show('The live market is unavailable while balances are reconciled.', 'error');
      return;
    }
    if (lifecycleState === 'secondaryTrading' && dataStale) {
      show('Market data is stale. Refresh before trading.', 'error');
      return;
    }
    if (!coOwnCompliance.educationCompleted) {
      setPendingTradeSide({ side });
      openSheet('guide');
      return;
    }
    navigation.navigate('Trade', { assetId: asset.id, side });
  };

  // Order book level tap → pre-fill the trade ticket with the selected price
  const handleSelectOrderBookLevel = (bookSide: 'bid' | 'ask', price: number) => {
    haptics.tap();
    if (!orderBook || orderBook.source !== 'live') {
      show('Live market data is unavailable. Refresh before trading.', 'error');
      return;
    }
    if (lifecycleState === 'secondaryTrading' && dataStale) {
      show('Market data is stale. Refresh before trading.', 'error');
      return;
    }
    const tradeSide: 'buy' | 'sell' = bookSide === 'ask' ? 'buy' : 'sell';
    if (!coOwnCompliance.educationCompleted) {
      setPendingTradeSide({ side: tradeSide, limitPrice: price });
      openSheet('guide');
      return;
    }
    navigation.navigate('Trade', { assetId: asset.id, side: tradeSide, limitPrice: price });
  };

  const handleGuideComplete = () => {
    updateCoOwnCompliance({ educationCompleted: true });
    closeSheet('guide');
  };

  const handleGuideContinueToTrade = () => {
    if (pendingTradeSide) {
      navigation.navigate('Trade', {
        assetId: asset.id,
        side: pendingTradeSide.side,
        limitPrice: pendingTradeSide.limitPrice,
      });
    }
    setPendingTradeSide(null);
  };

  // Rights rows — fail closed to "To be confirmed" when the backend hasn't
  // published per-label rights answers. The backend returns a versioned
  // rights document (asset.rights) with summaryTerms, not per-label rows.
  // Per-label rows will be exposed in a future API revision; until then,
  // every row is TBC so we never fabricate rights guarantees.
  // WS5: when the rights document has tbcReason/tbcEtaDate, surface them
  // so the user knows when to expect confirmation and why it's pending.
  const rightsTbcReason = asset.rights?.tbcReason ?? null;
  const rightsTbcEtaDate = asset.rights?.tbcEtaDate ?? null;
  // GAP 3 fix: when the backend has published structured rights
  // (economic/voting/exit/fee), use them instead of forcing every row
  // to TBC. The structured fields map to the canonical labels so the
  // user sees real answers, not boilerplate "To be confirmed."
  const structuredRightsMap: Record<string, string | null> = {
    'Distributions': asset.rights?.economicRights ?? null,
    'Voting rights': asset.rights?.votingRights ?? null,
    'Exit & proceeds': asset.rights?.exitRights ?? null,
    'Operating costs': asset.rights?.feeRights ?? null,
  };
  const rightsRows: CoOwnRightsRow[] = CANONICAL_RIGHTS_LABELS.map((label) => {
    const structured = structuredRightsMap[label] ?? null;
    if (structured) {
      return { label, answer: structured, isTbc: false };
    }
    return {
      label,
      answer: rightsTbcReason ?? 'To be confirmed',
      isTbc: true,
      tbcReason: rightsTbcReason,
      tbcEtaDate: rightsTbcEtaDate,
    };
  });
  const hasIncompleteRights = rightsRows.some((r) => r.isTbc);

  // Document references available on the asset (spec P1-B §2 Documents
  // subsection). Only render the subsection when at least one document
  // URL is published — no empty sections.
  const dossierDocuments: { label: string; url: string; accessibilityLabel: string }[] = [];
  if (asset.escrowTermsUrl) dossierDocuments.push({ label: 'Escrow terms', url: asset.escrowTermsUrl, accessibilityLabel: 'Open escrow terms' });
  if (asset.safeguardingEvidenceUrl) dossierDocuments.push({ label: 'Safeguarding evidence', url: asset.safeguardingEvidenceUrl, accessibilityLabel: 'Open safeguarding evidence' });
  if (asset.safeguardingTermsUrl) dossierDocuments.push({ label: 'Safeguarding terms', url: asset.safeguardingTermsUrl, accessibilityLabel: 'Open safeguarding terms' });
  if (asset.buyerProtectionTermsUrl) dossierDocuments.push({ label: 'Buyer protection terms', url: asset.buyerProtectionTermsUrl, accessibilityLabel: 'Open buyer protection terms' });
  const hasDocuments = dossierDocuments.length > 0;

  return (
    <View testID="asset-detail-screen" style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Collapsed scrolling header ──
          Quiet glyph hit targets, no large rounded-square containers.
          Spec 02 shape system: separate hit area from visible shape. */}
      <CommerceDetailHeader
        scrollY={scrollY}
        title={asset.title}
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: 'share-outline',
          label: 'Share asset',
          onPress: social.openShare,
        }}
      />

      <CoOwnScrollContext.Provider value={coOwnScrollValue}>
      <Reanimated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        stickyHeaderIndices={[3]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        }
      >
        {/* ── Zone A — Media stage (unobstructed) ──
            Spec 14 V3: media breathes first. No identity, no family
            badge, no taxonomy overlaid on photography. Back/share/save
            controls float via CommerceDetailMediaRail. State appears
            only when actionability requires it (below, on clean canvas). */}
        <CommerceMediaStage
          images={images}
          objectId={asset.id}
          topInset={insets.top}
          scrollY={scrollY}
          onBack={() => navigation.goBack()}
          onShare={social.openShare}
          onSave={guardedOpenCollectionPicker}
          onToggleFav={guardedToggleLike}
          isFav={social.isLiked}
          isSaved={social.isSavedToCollection}
          showDefaultControls={false}
          heightFraction={isVeryCompact ? 0.3 : isCompact ? 0.28 : 0.26}
          initialIndex={fullscreenIndex}
          onActiveIndexChange={setFullscreenIndex}
          onOpenFullscreen={handleOpenFullscreen}
        />
        <CommerceDetailMediaRail
          onBack={() => navigation.goBack()}
          topInset={insets.top}
          rightActions={[
            {
              icon: 'share-outline',
              label: 'Share',
              onPress: social.openShare,
            },
            {
              icon: social.isSavedToCollection ? 'bookmark' : 'bookmark-outline',
              activeIcon: 'bookmark',
              label: social.isSavedToCollection ? 'Saved to collection' : 'Save to collection',
              onPress: guardedOpenCollectionPicker,
              isActive: social.isSavedToCollection,
            },
          ]}
          onOverflow={() => openSheet('overflow')}
          showOverflow
        />

        {/* ════════════════════════════════════════════════════════════
            Viewport 1 — Collectible-first identity on clean canvas
            Spec 14 V3: title, one context line, issuer, one-unit
            price, availability, and market state live BELOW media on
            clean canvas — not overlaid on photography. No Co-Own
            family badge (redundant inside Co-Own). No card surface.
            Uses the shared CommerceDetailIdentity primitive with
            family="co_own" for structural consistency across all
            commerce detail surfaces.
            ════════════════════════════════════════════════════════════ */}
        <AssetDetailIdentity
          asset={asset}
          isVeryCompact={isVeryCompact}
          dominantPriceValue={dominantPriceValue}
          dominantPriceLabel={dominantPriceLabel}
          dominantPriceTimestamp={dominantPriceTimestamp}
          movePct24h={movePct24h}
          isInitialOffering={isInitialOffering}
          allocatedPct={allocatedPct}
          availableUnits={availableUnits}
          reconciliationActive={reconciliationActive}
          dataStale={dataStale}
          dataStaleAgeLabel={dataStaleAgeLabel}
          lifecycleState={lifecycleState}
          bestBidGbp={bestBidGbp}
          bestAskGbp={bestAskGbp}
          issuerUsername={issuerUsername}
          issuerTrust={issuerTrust}
          currentUserId={currentUser?.id}
          onPressIssuer={() => openProfile(navigation, asset.issuerId, currentUser?.id)}
        />

        {/* ════════════════════════════════════════════════════════════
            Viewer-aware composition (spec P1-B §5)
            Holder: position → rights → market → overview
            Non-holder: overview → market → ownership
            Each section is a self-contained presentational component;
            the orchestrator manages state, data, and ordering.
            ════════════════════════════════════════════════════════════ */}
        {/* ════════════════════════════════════════════════════════════
            Local Section Navigation: Overview · Market · Ownership
            Spec 03_COOWN: Replaces stacked disclosure accordions with
            an authored segmented control for instant scannability.
            Pinned via stickyHeaderIndices so tab switching stays
            reachable while scrolling. The opaque wrapper ensures
            scrolling content does not show through the transparent
            nav background.
            ════════════════════════════════════════════════════════════ */}
        <View style={[styles.stickyNavContainer, { backgroundColor: colors.background }]}>
          <CoOwnSegmentNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            hasActiveOrders={hasActiveOrders}
            hasUnclaimedDistributions={lastDistribution != null && lastDistribution.status !== 'settled'}
          />
        </View>

        {activeTab === 'overview' && (
          <AssetOverviewSection
            asset={asset}
            candleData={candleData}
            candleRange={candleRange}
            onCandleRangeChange={setCandleRange}
            chartType={chartType}
            onChartTypeChange={setChartType}
            showVolume={showVolume}
            onToggleVolume={() => setShowVolume((v) => !v)}
            lastExecutionPriceGbp={lastExecutionPriceGbp}
            lastExecutionAgeSeconds={lastExecutionAgeSeconds}
            marketDataStale={dataStale}
            marketDataAgeLabel={dataStaleAgeLabel}
            appraisedValuePerUnitGbp={appraisedValuePerUnitGbp}
            referenceVsAppraisalPct={referenceVsAppraisalPct}
            dossierDocuments={dossierDocuments}
            hasDocuments={hasDocuments}
            onOpenDiligence={() => navigation.navigate('AssetDueDiligence', { assetId: asset.id })}
            onOpenRiskDisclosure={() => openSheet('riskDisclosure')}
            lifecycleState={lifecycleState}
          />
        )}

        {activeTab === 'market' && (
          <AssetMarketSection
            asset={asset}
            orderBook={orderBook}
            orderBookStreaming={orderBookStreaming}
            orderBookError={orderBookError}
            onRetryOrderBook={retryOrderBook}
            bestBid={bestBid}
            bestAsk={bestAsk}
            spreadGbp={spreadGbp}
            depthStatusLabel={depthStatusLabel}
            reconciliationActive={reconciliationActive}
            marketDataStale={dataStale}
            marketDataAgeLabel={dataStaleAgeLabel}
            isOffline={isOffline}
            onOpenPriceAlert={openPriceAlert}
            onSelectOrderBookLevel={handleSelectOrderBookLevel}
            lifecycleState={lifecycleState}
            yourOpenOrders={yourOpenOrders}
            yourOpenOrdersFailed={yourOpenOrdersFailed}
            yourOpenOrdersLoading={yourOpenOrdersLoading}
            onCancelOrder={handleCancelOrder}
            cancellingOrderId={cancellingOrderId}
          />
        )}

        {activeTab === 'ownership' && (
          <AssetOwnershipSection
            isHolder={isHolder}
            yourUnits={yourUnits}
            reservedUnits={yourHolding?.reservedUnits ?? null}
            sellableUnits={yourHolding?.reservedUnits != null
              ? Math.max(0, yourHolding.unitsOwned - yourHolding.reservedUnits) : null}
            holdingsLoading={Boolean(currentUser && holdingsQuery.isLoading)}
            viewerPct={viewerPct}
            positionValueGbp={positionValueGbp}
            positionMarkBasis={positionMarkBasis}
            avgEntryPriceGbp={avgEntryPriceGbp}
            unrealizedPnlGbp={unrealizedPnlGbp}
            unrealizedPnlPct={unrealizedPnlPct}
            yourSegmentPct={yourSegmentPct}
            otherHoldersSegmentPct={otherHoldersSegmentPct}
            availableSegmentPct={availableSegmentPct}
            availableUnits={availableUnits}
            totalUnits={totalUnits}
            holderCount={asset.holders ?? null}
            rights={asset.rights}
            onOpenRights={() => openSheet('rights')}
            lastDistribution={lastDistribution}
            lastDistributionAmount={lastDistributionAmount}
            lastDistributionDate={lastDistributionDate}
            lastDistributionPerUnit={lastDistributionPerUnit}
            onNavigateToDistributionHistory={() => navigation.navigate('DistributionHistory', { assetId: asset.id })}
            distributionsFailed={distributionsFailed}
            distributionsLoading={distributionsLoading}
            corporateActions={corporateActions}
            corporateActionsFailed={corporateActionsFailed}
            corporateActionsLoading={corporateActionsLoading}
            onNavigateToCorporateAction={(action) => navigation.navigate('CorporateActionDetail', {
              assetId: asset.id,
              actionType: action.actionType,
              dateLabel: corporateActionDateLabel(action),
              effectLabel: action.description ?? action.title,
              amountLabel: corporateActionAmountLabel(action),
              status: action.status,
              recordDateLabel: action.recordDate ? `Record date: ${formatDayMonth(action.recordDate)}` : undefined,
              paymentDateLabel: action.payableDate ? `Payment: ${formatDayMonth(action.payableDate)}` : undefined,
              actionId: action.id,
            })}
            onOpenBuyout={() => navigation.navigate('Buyout', { assetId: asset.id })}
            lockupEndDate={asset.lockupEndDate ?? null}
            activeBuyoutOfferPriceGbp={asset.activeBuyoutOffer?.priceGbp ?? null}
            activeBuyoutOfferPremiumPct={asset.activeBuyoutOffer?.premiumPct ?? null}
            activeBuyoutOfferExpiry={asset.activeBuyoutOffer?.expiry ?? null}
            feeSchedule={asset.feeSchedule ?? undefined}
          />
        )}

        {/* ════════════════════════════════════════════════════════════
            Related Assets — same issuer, compact horizontal rail.
            Both Kalshi and Polymarket surface related/sibling markets
            below the market content. For ThryftVerse this is same-issuer
            assets — other fractional collectibles from the same SPV/issuer.
            Flat horizontal scroll — image, title, price, and availability
            state only. No card chrome per item (anti-AI: flat canvas,
            spacing, and press feedback carry the structure).
            State coverage: loading (heading + spinner), empty (hidden),
            error (hidden — discovery enhancement), populated (rail).
            ════════════════════════════════════════════════════════════ */}
        <RelatedAssetsRail
          assets={relatedAssets}
          loading={relatedAssetsLoading}
          issuerUsername={issuerUsername}
          onPressAsset={(assetId) => navigation.push('AssetDetail', { assetId })}
        />

      </Reanimated.ScrollView>
      </CoOwnScrollContext.Provider>

      {/* ── Zone G — Sticky action dock ──
          Extracted into AssetDetailDock — 7 state variants with the
          dominant price passed into the default state. */}
      <AssetDetailDock
        isIssuer={isIssuer}
        isHolder={isHolder}
        isInitialOffering={isInitialOffering}
        assetIsOpen={asset.isOpen}
        holdingsError={holdingsError}
        yourUnits={yourUnits}
        orderBookError={orderBookError}
        reconciliationActive={reconciliationActive}
        hasIncompleteRights={hasIncompleteRights}
        availableUnits={availableUnits}
        priceLabel={dominantPriceLabel}
        priceValue={formatCoOwnIze(dominantPriceValue)}
        showProtectionStrip={Boolean(asset.buyerProtection && asset.buyerProtectionTermsUrl)}
        onRetryHoldings={retryHoldings}
        onRetryOrderBook={retryOrderBook}
        onOpenSheet={openSheet}
        onNavigateOrderHistory={() => navigation.navigate('CoOwnOrderHistory')}
        onTradePress={handleTradePress}
        openOrderCount={yourOpenOrders?.length ?? 0}
        hasUnclaimedDistribution={lastDistribution != null && lastDistribution.status !== 'settled'}
        onSwitchToMarket={() => setActiveTab('market')}
        onSwitchToOwnership={() => setActiveTab('ownership')}
      />

      {/* Domain-isolated modals and bottom sheets */}
      <AssetDetailModals
        asset={asset}
        images={images}
        fullscreenIndex={fullscreenIndex}
        onActiveFullscreenIndexChange={setFullscreenIndex}
        fullscreenVisible={fullscreenVisible}
        guideVisible={guideVisible}
        pendingTradeSide={pendingTradeSide}
        rightsSheetVisible={rightsSheetVisible}
        riskDisclosureVisible={riskDisclosureVisible}
        supplySheetVisible={supplySheetVisible}
        overflowVisible={overflowVisible}
        priceAlertVisible={priceAlertVisible}
        alertTargetPrice={alertTargetPrice}
        alertCondition={alertCondition}
        alertSubmitting={alertSubmitting}
        alertDenomination="GBP"
        alertTriggerBasis={
          asset.lastTradePriceGbp != null || asset.marketSnapshot?.lastExecutionPriceGbp != null
            ? 'last_trade'
            : 'reference'
        }
        alertCurrentPriceGbp={
          asset.marketSnapshot?.lastExecutionPriceGbp != null
            ? asset.marketSnapshot.lastExecutionPriceGbp
            : asset.lastTradePriceGbp != null
              ? asset.lastTradePriceGbp
              : asset.unitPriceGbp
        }
        yourUnits={yourUnits}
        totalUnits={totalUnits}
        availableUnits={availableUnits}
        allocatedPct={allocatedPct}
        viewerPct={viewerPct}
        feePct={feePct}
        rightsRows={rightsRows}
        isWatched={isWatched}
        social={social}
        onCloseSheet={closeSheet}
        onClearPendingTradeSide={() => setPendingTradeSide(null)}
        onGuideComplete={handleGuideComplete}
        onGuideContinueToTrade={handleGuideContinueToTrade}
        onToggleFav={guardedToggleLike}
        onToggleWatch={toggleCoOwnWatch}
        onClosePriceAlert={closePriceAlert}
        onAlertTargetPriceChange={setAlertTargetPrice}
        onAlertConditionChange={setAlertCondition}
        onCreatePriceAlert={handleCreatePriceAlert}
        onNavigateOrderHistory={() => navigation.navigate('CoOwnOrderHistory')}
        onNavigatePriceAlerts={() => navigation.navigate('CoOwnPriceAlerts')}
        onNavigateIssue={() => navigation.navigate('CoOwnIssue', { assetId: asset.id })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stickyNavContainer: {
    // Opaque background is applied inline via colors.background so
    // scrolling content does not show through the pinned nav. The
    // hairline bottom border comes from CoOwnSegmentNav itself.
  },
});
