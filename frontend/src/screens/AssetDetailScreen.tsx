import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../utils/haptics';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { openProductDetail } from '../platform/product/openProductDetail';
import { useStore } from '../store/useStore';
import { Space, Radius, FontFamily, DockConstants, Control, PressScale } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import {
  fetchCoOwnDistributions,
  fetchCoOwnAssetCorporateActions,
  listUserMarketHistory,
  type CoOwnDistribution,
  type CoOwnCorporateAction,
  type MarketCoOwnAsset,
} from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';
import {
  useCoOwnAssetQuery,
  useCoOwnHoldingsQuery,
} from '../platform/server/useCoOwnQueries';
import { CO_OWN_FEE_RATE } from '../utils/tradeFlow';
import { formatCoOwnIze } from '../utils/currency';
import {
  CommerceMediaStage,
  CommerceStateCanvas,
} from '../components/commerce';
import {
  CommerceDetailHeader,
  CommerceDetailIdentity,
  CommerceDetailSellerRow,
  CommerceDetailStateDock,
  CommerceDetailMediaRail,
} from '../components/commerce/detail';
import { RecommendationRail, FullscreenMediaViewer } from '../components/product';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { BottomSheet } from '../components/BottomSheet';
import { resolveCoOwnConversation } from '../utils/coOwnMessaging';
import {
  buildCoOwnViewModel,
  useProductSocialState,
  useRecommendations,
  useSellerTrust,
  useSellerFollow,
  isRecommendationLook,
} from '../platform/product';
import type { RecommendationLook } from '../platform/product';
import {
  CoOwnRiskDisclosure,
  CoOwnStateCanvas,
  CoOwnFirstTradeGuide,
  CoOwnRightsSheet,
  CoOwnSupplySheet,
  CoOwnOverflowSheet,
  CoOwnPriceAlertForm,
  CANONICAL_RIGHTS_LABELS,
  type CoOwnRightsRow,
  type CoOwnCandleRange,
} from '../components/coown';
import {
  AssetOverviewSection,
  AssetMarketSection,
  AssetOwnershipSection,
  CoOwnSegmentNav,
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
interface RecommendationItem {
  id: string;
  [key: string]: unknown;
}

// ── Corporate action row helpers ──
// The detail route takes display labels; build them from the action record
// without fabricating values (null → the detail screen shows em dashes).
function formatDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function corporateActionDateLabel(action: CoOwnCorporateAction): string {
  const source = action.payableDate ?? action.recordDate ?? action.exDate ?? action.createdAt;
  return new Date(source).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function corporateActionAmountLabel(action: CoOwnCorporateAction): string | undefined {
  if (action.perUnitValueGbpMinor == null) return undefined;
  const major = action.perUnitValueGbpMinor / 100;
  return `${major >= 0 ? '+' : ''}${formatCoOwnIze(major)}`;
}

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
  const upsertConversation = useStore((state) => state.upsertConversation);
  const isCoOwnWatched = useStore((state) => state.isCoOwnWatched);
  const toggleCoOwnWatch = useStore((state) => state.toggleCoOwnWatch);
  const { show } = useToast();
  const { requireAuth } = useSignupWall();

  const assetId = route.params?.assetId;

  // ── Shared cache (deduplicated with AssetDueDiligenceScreen) ──
  const assetQuery = useCoOwnAssetQuery(assetId);
  const holdingsQuery = useCoOwnHoldingsQuery(currentUser?.id);

  const asset = assetQuery.data ?? null;
  const isLoading = assetQuery.isLoading;
  const isError = assetQuery.isError;
  const yourHolding = holdingsQuery.data?.find((entry) => entry.assetId === assetId) ?? null;
  const yourUnits = currentUser?.id ? (yourHolding?.unitsOwned ?? null) : 0;
  const holdingsError = currentUser?.id ? holdingsQuery.isError : false;

  const [lastDistribution, setLastDistribution] = React.useState<CoOwnDistribution | null>(null);
  const [corporateActions, setCorporateActions] = React.useState<CoOwnCorporateAction[] | null>(null);
  const [distributionsFailed, setDistributionsFailed] = React.useState(false);
  const [corporateActionsFailed, setCorporateActionsFailed] = React.useState(false);
  const [hasActiveOrders, setHasActiveOrders] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [isResolvingConversation, setIsResolvingConversation] = React.useState(false);
  const [fullscreenIndex, setFullscreenIndex] = React.useState(0);
  const [pendingTradeSide, setPendingTradeSide] = React.useState<'buy' | 'sell' | null>(null);
  const [candleRange, setCandleRange] = React.useState<CoOwnCandleRange>('1W');
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

  // ── Last distribution fetch — most recent distribution for this asset.
  // The unclaimed badge treats only non-settled distributions as unclaimed;
  // a settled distribution is history, not an outstanding payout.
  React.useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setDistributionsFailed(false);
    void fetchCoOwnDistributions({ assetId, limit: 1 })
      .then((result) => {
        if (cancelled) return;
        setLastDistribution(result.items[0] ?? null);
        setDistributionsFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLastDistribution(null);
        setDistributionsFailed(true);
      });
    return () => { cancelled = true; };
  }, [assetId, refreshKey]);

  // ── Corporate actions — latest 3 events for the ownership timeline ──
  React.useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setCorporateActionsFailed(false);
    void fetchCoOwnAssetCorporateActions(assetId, { limit: 3 })
      .then((items) => {
        if (cancelled) return;
        setCorporateActions(items);
        setCorporateActionsFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCorporateActions(null);
        setCorporateActionsFailed(true);
      });
    return () => { cancelled = true; };
  }, [assetId, refreshKey]);

  // ── Active orders badge — the user's own co-own market history carries
  // order status; open/partially_filled entries for this asset light the
  // Market tab dot. Recent-window check (latest 50 entries), never fabricated.
  React.useEffect(() => {
    if (!assetId || !currentUser?.id) return;
    let cancelled = false;
    void listUserMarketHistory(currentUser.id, { channel: 'co-own', limit: 50 })
      .then((page) => {
        if (cancelled) return;
        setHasActiveOrders(page.items.some((item) =>
          item.referenceId === assetId
          && (item.status === 'open' || item.status === 'partially_filled')
        ));
      })
      .catch(() => {
        if (cancelled) return;
        setHasActiveOrders(false);
      });
    return () => { cancelled = true; };
  }, [assetId, currentUser?.id, refreshKey]);

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

  // Pull-to-refresh — reloads asset, order book, and holdings in parallel.
  // Bumping refreshKey also re-runs the distributions, corporate-actions,
  // and active-orders effects so every surface on the screen refreshes.
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

  // Market-data staleness computation (spec 07 §1.4)
  // Prefer the last settled execution timestamp from the market snapshot
  // (spec 03_COOWN §2) over asset.updatedAt — it is the most precise
  // signal for market-data freshness.
  const STALENESS_THRESHOLD_SECONDS = 24 * 60 * 60;
  const { dataStale, dataStaleAgeLabel } = React.useMemo(() => {
    if (!asset || !dataLoadedAt) return { dataStale: false, dataStaleAgeLabel: undefined };
    const snapshotTimestamp = asset.marketSnapshot?.asOf;
    const sourceTimestamp = snapshotTimestamp
      ? new Date(snapshotTimestamp).getTime()
      : asset.updatedAt
        ? new Date(asset.updatedAt).getTime()
        : dataLoadedAt;
    const ageSeconds = Math.max(0, (Date.now() - sourceTimestamp) / 1000);
    const stale = ageSeconds > STALENESS_THRESHOLD_SECONDS;
    if (!stale) return { dataStale: false, dataStaleAgeLabel: undefined };
    const ageLabel = ageSeconds > 86400 * 2
      ? `${Math.floor(ageSeconds / 86400)}d ago`
      : ageSeconds > 3600
        ? `${Math.floor(ageSeconds / 3600)}h ago`
        : `${Math.floor(ageSeconds / 60)}m ago`;
    return { dataStale: true, dataStaleAgeLabel: ageLabel };
  }, [asset, dataLoadedAt]);

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

  const { data: recommendationsData, isLoading: recsLoading } = useRecommendations(
    asset?.listingId
  );

  const { data: issuerTrust } = useSellerTrust(asset?.issuerId);
  const issuerFollowMutation = useSellerFollow(asset?.issuerId);

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
  const canMessageIssuer = currentUser?.id !== asset.issuerId;

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
  const referenceVsAppraisalPct = appraisedValuePerUnitGbp && appraisedValuePerUnitGbp > 0
    ? ((asset.unitPriceGbp - appraisedValuePerUnitGbp) / appraisedValuePerUnitGbp) * 100
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
  const feePct = Math.round(CO_OWN_FEE_RATE * 100);

  // ── Holder P&L (spec 09 upgrade) ──
  // avgEntryPriceGbp comes from the backend holdings contract.
  // Only show P&L if both entry and current value are known.
  const avgEntryPriceGbp = yourHolding?.avgEntryPriceGbp ?? null;
  const positionValueGbp = yourUnits != null ? asset.unitPriceGbp * yourUnits : null;
  const positionCostGbp = avgEntryPriceGbp != null && yourUnits != null
    ? avgEntryPriceGbp * yourUnits
    : null;
  const unrealizedPnlGbp = positionValueGbp != null && positionCostGbp != null
    ? positionValueGbp - positionCostGbp
    : null;
  const unrealizedPnlPct = positionCostGbp != null && positionCostGbp > 0 && unrealizedPnlGbp != null
    ? (unrealizedPnlGbp / positionCostGbp) * 100
    : null;

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
  const lastExecutionPriceGbp = marketSnapshot?.lastExecutionPriceGbp ?? null;
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

  const recommendationSections = recommendationsData?.sections ?? [];
  const railSections = recommendationSections.filter(
    (section) => section.key !== 'seen_in_looks' && section.key !== 'continue_exploring',
  );
  const seenInLooksSection = recommendationSections.find((s) => s.key === 'seen_in_looks');
  void recsLoading;
  void railSections;

  const handlePressRecommendation = (
    recItem: RecommendationItem,
    sectionKey?: string,
    position?: number,
    reasonCode?: string,
    personalised?: boolean,
  ) => {
    openProductDetail(navigation, {
      referenceKind: 'listing',
      canonicalId: recItem.id,
      sourceSurface: 'AssetDetail',
      sectionKey,
      position,
      reasonCode,
      personalised,
    });
  };
  const handlePressLook = (lookItem: RecommendationLook) => {
    navigation.navigate('LookDetail', { lookId: lookItem.id });
  };

  // Compute scroll bottom padding from dock geometry + safe area.
  const isDualActionDock =
    isHolder
    && asset.isOpen
    && availableUnits > 0
    && !holdingsError
    && !orderBookError
    && !reconciliationActive;
  const dockHeight = isDualActionDock
    ? DockConstants.dualActionHeight
    : DockConstants.singleActionHeight;
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + dockHeight + Space.md;

  const handleTradePress = (side: 'buy' | 'sell') => {
    if (!requireAuth('purchase')) return;
    if (holdingsError || yourUnits == null) {
      show('Your position is unavailable. Refresh it before trading.', 'error');
      return;
    }
    if (orderBookError || reconciliationActive) {
      show('The live market is unavailable while balances are reconciled.', 'error');
      return;
    }
    if (!coOwnCompliance.educationCompleted) {
      setPendingTradeSide(side);
      openSheet('guide');
      return;
    }
    navigation.navigate('Trade', { assetId: asset.id, side });
  };

  // Order book level tap → pre-fill the trade ticket with the selected price
  const handleSelectOrderBookLevel = (bookSide: 'bid' | 'ask', price: number) => {
    haptics.tap();
    const tradeSide: 'buy' | 'sell' = bookSide === 'ask' ? 'buy' : 'sell';
    if (!coOwnCompliance.educationCompleted) {
      setPendingTradeSide(tradeSide);
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
      navigation.navigate('Trade', { assetId: asset.id, side: pendingTradeSide });
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
  const rightsTbcEta = asset.rights?.tbcEtaDate ?? null;
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

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
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
        <View style={[styles.collectibleIdentity, { borderBottomColor: colors.borderSubtle }]}>
          <CommerceDetailIdentity
            family="co_own"
            density={isVeryCompact ? 'compact' : 'standard'}
            eyebrow={asset.legalVehicleName ?? undefined}
            title={asset.title}
            secondaryLine={`${availableUnits} of ${totalUnits} units available`}
            interestSignal={asset.holders != null ? `${asset.holders} holders` : undefined}
          />

          {/* Issuer — shared seller row primitive, configured for
              institutional Co-Own issuers. Taps into issuer profile.
              variant="rich" presents the full confidence row (avatar,
              name, verification badge, compact stats line) so issuer
              trust is visible in the first viewport. */}
          <View style={styles.collectibleIssuerWrap}>
            <CommerceDetailSellerRow
              roleLabel="Issuer"
              institutional
              variant="rich"
              avatarUri={asset.issuer?.avatar ?? undefined}
              name={issuerUsername}
              verified={asset.issuerVerification?.tier === 'id' || asset.issuerVerification?.tier === 'seller'}
              ratingLine={
                asset.issuerVerification?.tier === 'seller'
                  ? 'Trusted Seller'
                  : asset.issuerVerification?.tier === 'id'
                    ? 'ID Verified'
                    : asset.issuerVerification?.tier === 'email'
                      ? 'Email verified'
                      : undefined
              }
              locationLine={issuerTrust?.location ?? asset.issuer?.location ?? undefined}
              statsLine={
                issuerTrust
                  ? [
                      issuerTrust.completedSales != null ? `${issuerTrust.completedSales} sales` : null,
                      issuerTrust.rating != null ? `${issuerTrust.rating.toFixed(1)}★` : null,
                      issuerTrust.responseRate != null ? `${issuerTrust.responseRate}% response` : null,
                    ].filter(Boolean).join(' · ') || undefined
                  : undefined
              }
              onPress={() => openProfile(navigation, asset.issuerId, currentUser?.id)}
              primaryAction={
                canMessageIssuer
                  ? {
                      label: 'Message',
                      onPress: async () => {
                        if (!requireAuth('message_seller')) return;
                        if (!currentUser) return;
                        if (isResolvingConversation) return;
                        setIsResolvingConversation(true);
                        try {
                          const conversation = await resolveCoOwnConversation(
                            currentUser.id,
                            asset.issuerId,
                            issuerUsername,
                            asset.listingId,
                          );
                          upsertConversation(conversation);
                          navigation.navigate('Chat', {
                            conversationId: conversation.id,
                            focusQuery: issuerUsername,
                            partnerUserId: asset.issuerId,
                          });
                        } catch {
                          show('Unable to open conversation. Try again.', 'error');
                        } finally {
                          setIsResolvingConversation(false);
                        }
                      },
                    }
                  : undefined
              }
              secondaryAction={
                canMessageIssuer
                  ? {
                      label: issuerFollowMutation.isPending ? 'Following…' : (issuerTrust?.isFollowing ? 'Following' : 'Follow'),
                      onPress: () => {
                        if (!requireAuth('follow_seller')) return;
                        issuerFollowMutation.mutate(undefined, {
                          onSuccess: (data) => {
                            show(data.isFollowing ? 'Followed issuer' : 'Unfollowed issuer', 'success');
                          },
                          onError: () => {
                            show('Could not follow issuer. Try again.', 'error');
                          },
                        });
                      },
                    }
                  : undefined
              }
            />
          </View>

          {/* Dominant price — ONE number. Offering price during
              initial offering; last trade with timestamp when
              secondary trades exist; falls back to offering price. */}
          <View style={styles.collectiblePriceRow}>
            <Text
              style={[styles.collectiblePriceValue, { color: colors.textPrimary }]}
              accessibilityRole="text"
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {formatCoOwnIze(dominantPriceValue)}
            </Text>
            <Text style={[styles.collectiblePriceUnit, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
              {dominantPriceLabel === 'Last trade' && dominantPriceTimestamp
                ? `${dominantPriceLabel} · ${dominantPriceTimestamp}`
                : dominantPriceLabel}
            </Text>
          </View>

          {/* Availability + market state — flat factual line. */}
          <View style={styles.collectibleAvailabilityRow}>
            <Text style={[styles.collectibleAvailabilityText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
              {availableUnits} available
            </Text>
            <View style={[styles.collectibleAvailabilityDot, {
              backgroundColor: reconciliationActive
                ? colors.warning
                : asset.isOpen
                  ? colors.success
                  : colors.textMuted,
            }]} />
            <Text style={[styles.collectibleAvailabilityText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
              {reconciliationActive
                ? 'Orders paused'
                : asset.isOpen
                  ? 'Market open'
                  : 'Market closed'}
            </Text>
            {dataStale && dataStaleAgeLabel ? (
              <Text style={[styles.collectibleStaleText, { color: colors.warning }]}>
                · stale {dataStaleAgeLabel}
              </Text>
            ) : null}
          </View>

          {/* Lifecycle context — brief factual line derived from
              isOpen + availableUnits. Escalates only when the state
              changes what the user can do. */}
          <View style={styles.lifecycleContextRow}>
            <Text style={[styles.lifecycleContextText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
              {lifecycleState === 'initialOffering'
                ? `Offering in progress · ${allocatedPct}% allocated`
                : lifecycleState === 'secondaryTrading'
                  ? 'Secondary market · live quotes'
                  : lifecycleState === 'tradingPaused'
                    ? 'Trading paused · orders temporarily unavailable'
                    : 'Exit underway · proceeds distribution in progress'}
            </Text>
          </View>
        </View>

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
            ════════════════════════════════════════════════════════════ */}
        <CoOwnSegmentNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasActiveOrders={hasActiveOrders}
          hasUnclaimedDistributions={lastDistribution != null && lastDistribution.status !== 'settled'}
        />

        {activeTab === 'overview' && (
          <AssetOverviewSection
            asset={asset}
            candleData={candleData}
            candleRange={candleRange}
            onCandleRangeChange={setCandleRange}
            showVolume={showVolume}
            onToggleVolume={() => setShowVolume((v) => !v)}
            lastExecutionPriceGbp={lastExecutionPriceGbp}
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
            orderBookHasGap={orderBookHasGap}
            orderBookError={orderBookError}
            onRetryOrderBook={retryOrderBook}
            bestBid={bestBid}
            bestAsk={bestAsk}
            spreadGbp={spreadGbp}
            depthStatusLabel={depthStatusLabel}
            reconciliationActive={reconciliationActive}
            isOffline={isOffline}
            onOpenSupply={() => openSheet('supply')}
            onOpenPriceAlert={openPriceAlert}
            onSelectOrderBookLevel={handleSelectOrderBookLevel}
            lifecycleState={lifecycleState}
          />
        )}

        {activeTab === 'ownership' && (
          <AssetOwnershipSection
            isHolder={isHolder}
            yourUnits={yourUnits}
            viewerPct={viewerPct}
            avgEntryPriceGbp={avgEntryPriceGbp}
            unrealizedPnlGbp={unrealizedPnlGbp}
            unrealizedPnlPct={unrealizedPnlPct}
            yourSegmentPct={yourSegmentPct}
            otherHoldersSegmentPct={otherHoldersSegmentPct}
            availableSegmentPct={availableSegmentPct}
            availableUnits={availableUnits}
            totalUnits={totalUnits}
            onOpenRights={() => openSheet('rights')}
            lastDistribution={lastDistribution}
            lastDistributionAmount={lastDistributionAmount}
            lastDistributionDate={lastDistributionDate}
            lastDistributionPerUnit={lastDistributionPerUnit}
            onNavigateToDistributionHistory={() => navigation.navigate('DistributionHistory', { assetId: asset.id })}
            distributionsFailed={distributionsFailed}
            corporateActions={corporateActions}
            corporateActionsFailed={corporateActionsFailed}
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
          />
        )}

        {seenInLooksSection && seenInLooksSection.items.length > 0 && (
          <View style={styles.recommendationSection}>
            <RecommendationRail
              section={seenInLooksSection}
              listingId={asset.listingId}
              onPressItem={(recItem, sectionKey, position, reasonCode, personalised) => {
                if (isRecommendationLook(recItem)) {
                  handlePressLook(recItem);
                } else {
                  handlePressRecommendation({ id: recItem.id }, sectionKey, position, reasonCode, personalised);
                }
              }}
            />
          </View>
        )}
      </Reanimated.ScrollView>

      {/* ── Zone G — Sticky action dock ──
          Spec 03 §11: four state variants — tradable non-holder, tradable
          holder, rights incomplete, paused/closed. Blocked state includes
          a valid next step. No large passive warning card. */}
      {(() => {
        if (!isIssuer && (holdingsError || yourUnits == null)) {
          return (
            <CommerceDetailStateDock
              stateBadge={
                <Text style={[styles.dockStateBadge, { color: colors.textPrimary }]}>
                  Position unavailable
                </Text>
              }
              subtitle="Trading is disabled until your holdings are verified"
              primaryAction={{
                label: 'Retry position',
                onPress: retryHoldings,
              }}
            />
          );
        }

        if (!isIssuer && (orderBookError || reconciliationActive)) {
          return (
            <CommerceDetailStateDock
              stateBadge={
                <Text style={[styles.dockStateBadge, { color: colors.textPrimary }]}>
                  {reconciliationActive ? 'Market updating' : 'Market unavailable'}
                </Text>
              }
              subtitle={reconciliationActive ? 'Orders are paused while balances settle' : 'Live orders could not be verified'}
              primaryAction={{
                label: reconciliationActive ? 'Check status' : 'Try again',
                onPress: retryOrderBook,
                primary: false,
              }}
            />
          );
        }

        if (hasIncompleteRights && !isIssuer && asset.isOpen) {
          // Rights incomplete — open the rights sheet, not a passive warning.
          return (
            <CommerceDetailStateDock
              stateBadge={
                <Text style={[styles.dockStateBadge, { color: colors.textPrimary }]}>
                  Trading unavailable
                </Text>
              }
              subtitle="Rights review required"
              primaryAction={{
                label: 'Review rights',
                onPress: () => openSheet('rights'),
              }}
            />
          );
        }

        if (isIssuer) {
          return (
            <CommerceDetailStateDock
              stateBadge={
                <Text style={[styles.dockStateBadge, { color: colors.textPrimary }]}>
                  Issuer view
                </Text>
              }
              subtitle={`${availableUnits} units available`}
              primaryAction={{
                label: 'View orders',
                onPress: () => navigation.navigate('CoOwnOrderHistory'),
                accessibilityLabel: 'View co-own order history',
              }}
            />
          );
        }

        if (!asset.isOpen) {
          return (
            <CommerceDetailStateDock
              stateBadge={
                <Text style={[styles.dockStateBadge, { color: colors.textSecondary }]}>
                  Trading paused
                </Text>
              }
              subtitle="Temporarily unavailable"
              primaryAction={{
                label: 'View orders',
                onPress: () => navigation.navigate('CoOwnOrderHistory'),
              }}
            />
          );
        }

        if (availableUnits === 0 && !isHolder) {
          return (
            <CommerceDetailStateDock
              stateBadge={
                <Text style={[styles.dockStateBadge, { color: colors.textSecondary }]}>
                  Fully allocated
                </Text>
              }
              subtitle="Check the secondary market"
              primaryAction={{
                label: 'Browse secondary',
                onPress: () => handleTradePress('buy'),
              }}
            />
          );
        }

        return (
          <CommerceDetailStateDock
            showProtectionStrip={asset.buyerProtection ?? false}
            primaryAction={
              isHolder
                ? {
                    label: 'Sell',
                    onPress: () => handleTradePress('sell'),
                  }
                : {
                    label: 'Buy units',
                    onPress: () => handleTradePress('buy'),
                  }
            }
            secondaryAction={
              isHolder
                ? {
                    label: 'Buy more',
                    onPress: () => handleTradePress('buy'),
                  }
                : undefined
            }
          />
        );
      })()}

      {/* Save to collection + share */}
      <SaveToCollectionModal
        visible={social.collectionModalVisible}
        itemId={asset.id}
        onClose={social.closeCollectionPicker}
      />
      <ShareSheet
        visible={social.shareVisible}
        onDismiss={social.closeShare}
        url={`https://thryftverse.com/asset/${asset.id}`}
        title={asset.title}
      />

      {/* Fullscreen media viewer */}
      <FullscreenMediaViewer
        images={images}
        initialIndex={fullscreenIndex}
        visible={fullscreenVisible}
        onActiveIndexChange={setFullscreenIndex}
        onClose={() => closeSheet('fullscreen')}
      />

      {/* First-trade guided education */}
      <CoOwnFirstTradeGuide
        visible={guideVisible}
        onClose={() => { closeSheet('guide'); setPendingTradeSide(null); }}
        onComplete={handleGuideComplete}
        onContinueToTrade={pendingTradeSide ? handleGuideContinueToTrade : undefined}
      />

      {/* Rights & risks sheet — 13-row modal.
          Rows fail closed to "To be confirmed" when the backend does not
          expose the answer. For live instruments, TBC rows block trading. */}
      <CoOwnRightsSheet
        visible={rightsSheetVisible}
        onClose={() => closeSheet('rights')}
        disclosureVersion={asset.rights?.version ? `Rights v${asset.rights.version}` : 'Rights v1'}
        rights={rightsRows}
      />

      <BottomSheet
        visible={riskDisclosureVisible}
        onDismiss={() => closeSheet('riskDisclosure')}
        snapPoint={0.7}
      >
        <View style={[styles.riskDisclosureSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.riskDisclosureSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
            Risk disclosure
          </Text>
          <Pressable
            onPress={() => closeSheet('riskDisclosure')}
            hitSlop={12}
            style={({ pressed }) => [styles.sheetCloseTarget, pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }]}
            accessibilityLabel="Close risk disclosure"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={styles.riskDisclosureSheetScroll} contentContainerStyle={styles.riskDisclosureSheetContent}>
          <CoOwnRiskDisclosure
            disclosures={asset.riskDisclosures ?? null}
            onReportIssue={() => {
              closeSheet('riskDisclosure');
              navigation.navigate('CoOwnIssue', { assetId: asset.id });
            }}
          />
        </ScrollView>
      </BottomSheet>

      <CoOwnSupplySheet
        visible={supplySheetVisible}
        onClose={() => closeSheet('supply')}
        unitPriceLabel={formatCoOwnIze(asset.unitPriceGbp)}
        totalUnits={totalUnits}
        availableUnits={availableUnits}
        allocatedPct={allocatedPct}
        viewerUnits={yourUnits}
        viewerPct={viewerPct}
        settlementMode={asset.settlementMode}
        feePct={feePct}
        holderCount={asset.holders}
        status={asset.isOpen ? (availableUnits > 0 ? 'open' : 'closed') : 'paused'}
        supply={{
          authorised: null,
          issued: null,
          publicFloat: null,
          treasury: null,
        }}
        rightsVersion={asset.rights?.version ? `v${asset.rights.version}` : undefined}
      />

      {/* Overflow sheet — lower-frequency hero actions (Fav, Watch, Report). */}
      <CoOwnOverflowSheet
        visible={overflowVisible}
        onClose={() => closeSheet('overflow')}
        onShare={social.openShare}
        onOrderHistory={() => navigation.navigate('CoOwnOrderHistory')}
        onToggleFav={guardedToggleLike}
        isFav={social.isLiked}
        onWatch={() => {
          toggleCoOwnWatch(asset.id);
          closeSheet('overflow');
        }}
        isWatched={isWatched}
        onPriceAlert={() => {
          closeSheet('overflow');
          navigation.navigate('CoOwnPriceAlerts');
        }}
        onReport={() => {
          closeSheet('overflow');
          navigation.navigate('CoOwnIssue', { assetId: asset.id });
        }}
      />

      {/* Price alert creation modal — flagship treatment with semantic condition colours */}
      <CoOwnPriceAlertForm
        visible={priceAlertVisible}
        onClose={closePriceAlert}
        alertTargetPrice={alertTargetPrice}
        onAlertTargetPriceChange={setAlertTargetPrice}
        alertCondition={alertCondition}
        onAlertConditionChange={setAlertCondition}
        alertSubmitting={alertSubmitting}
        onSubmit={handleCreatePriceAlert}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // ── Collectible-first identity ──
  // No card surface — clean canvas with a hairline separator below.
  collectibleIdentity: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collectibleIssuerWrap: {
    marginTop: Space.md,
  },
  collectiblePriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    marginTop: Space.md,
  },
  collectiblePriceValue: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  collectiblePriceUnit: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  collectibleAvailabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexWrap: 'wrap',
    marginTop: Space.xs,
  },
  collectibleAvailabilityText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  collectibleAvailabilityDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  collectibleStaleText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Lifecycle context — brief factual line ──
  lifecycleContextRow: {
    marginTop: Space.xs,
  },
  lifecycleContextText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Risk disclosure sheet ──
  riskDisclosureSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetCloseTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskDisclosureSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
  },
  riskDisclosureSheetScroll: {
    flex: 1,
  },
  riskDisclosureSheetContent: {
    padding: Space.md,
  },
  // ── Dock state badge ──
  dockStateBadge: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  // ── Discovery ──
  recommendationSection: {
    marginTop: Space.lg,
  },
});
