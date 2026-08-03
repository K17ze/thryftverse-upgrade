import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, useWindowDimensions, Modal, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../utils/haptics';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Space, Type, Typography, Radius, DockConstants } from '../theme/designTokens';
import {
  fetchCoOwnAssetById,
  fetchCoOwnOrderBook,
  fetchCoOwnHoldings,
  refreshCoOwnAppraisal,
  fetchCoOwnRecourseStatus,
  createVerificationDemand,
  signRecourseAgreement,
  type CoOwnOrderBookSnapshot,
  type MarketCoOwnAsset,
  type CoOwnRecourseStatus,
  createCoOwnPriceAlert,
} from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';
import { CO_OWN_FEE_RATE } from '../utils/tradeFlow';
import { formatCoOwnIze } from '../utils/currency';
import {
  CommerceMediaStage,
  CategoryEvidence,
} from '../components/commerce';
import {
  CommerceDetailHeader,
  CommerceDetailIdentity,
  CommerceDetailTransactionSurface,
  CommerceDetailMetricRow,
  CommerceDetailDisclosureRow,
  CommerceDetailSection,
  CommerceDetailSellerRow,
  CommerceDetailUnavailableInline,
  CommerceDetailStateDock,
  CommerceDetailMediaRail,
  CommerceDetailOfflineBanner,
  CommerceDetailFreshnessBanner,
  COMMERCE_DETAIL_COMPACT_WIDTH,
} from '../components/commerce/detail';
import { ProductFamilyBadge, RecommendationRail, FullscreenMediaViewer } from '../components/product';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { BottomSheet } from '../components/BottomSheet';
import { resolveEvidenceGroups } from '../platform/commerce/categoryEvidence';
import { resolveCoOwnConversation } from '../utils/coOwnMessaging';
import {
  buildCoOwnViewModel,
  useProductSocialState,
  useRecommendations,
  useSellerTrust,
  isRecommendationLook,
} from '../platform/product';
import type { RecommendationLook } from '../platform/product';
import {
  CoOwnOwnershipPanel,
  CoOwnTrustPanel,
  CoOwnRecoursePanel,
  CoOwnRiskDisclosure,
  CoOwnAssetDetailSkeleton,
  CoOwnStateCanvas,
  CoOwnPriceChart,
  CoOwnFirstTradeGuide,
  CoOwnAssetDossier,
  CoOwnRightsSheet,
  CoOwnOrderBook,
  CoOwnCandleChart,
  CoOwnSupplySheet,
  CoOwnOverflowSheet,
  CoOwnMarketOverview,
  CANONICAL_RIGHTS_LABELS,
  type CoOwnRightsRow,
  type CoOwnCandleRange,
} from '../components/coown';
import { AppButton } from '../components/ui/AppButton';
import { useConnectivity } from '../hooks/useConnectivity';

type RouteT = RouteProp<RootStackParamList, 'AssetDetail'>;
type NavT = StackNavigationProp<RootStackParamList>;

// Local type for recommendation items — replaces the mockData Listing import.
// The recommendation rail returns items that have an `id` field; we only need
// that to navigate to ItemDetail. We do not import the full Listing type from
// mockData because this screen must not depend on mock data types.
interface RecommendationItem {
  id: string;
  [key: string]: unknown;
}

/** Format rights version for the badge — spec wants "v2 · Jul 2026" format.
 *  Accepts raw strings like "Rights v1", "v2", or "v2 · Jul 2026" and normalises. */
function formatRightsVersion(raw: string): string {
  // Already formatted
  if (raw.includes('·')) return raw;
  // Extract version number if present
  const versionMatch = raw.match(/v\d+/i);
  const version = versionMatch ? versionMatch[0].toLowerCase() : raw;
  return version;
}

export default function AssetDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors, isDark } = useAppTheme();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < COMMERCE_DETAIL_COMPACT_WIDTH;
  const isVeryCompact = screenWidth < 340;
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const isCoOwnWatched = useStore((state) => state.isCoOwnWatched);
  const toggleCoOwnWatch = useStore((state) => state.toggleCoOwnWatch);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();

  const assetId = route.params?.assetId;

  const [asset, setAsset] = React.useState<MarketCoOwnAsset | null>(null);
  const [isRefreshingAppraisal, setIsRefreshingAppraisal] = React.useState(false);
  const [orderBook, setOrderBook] = React.useState<CoOwnOrderBookSnapshot | null>(null);
  const [orderBookError, setOrderBookError] = React.useState(false);
  const [yourUnits, setYourUnits] = React.useState<number | null>(currentUser?.id ? null : 0);
  const [holdingsError, setHoldingsError] = React.useState(false);
  const [recourseStatus, setRecourseStatus] = React.useState<CoOwnRecourseStatus | null>(null);
  const [verificationDemandLoading, setVerificationDemandLoading] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [isResolvingConversation, setIsResolvingConversation] = React.useState(false);
  const [fullscreenIndex, setFullscreenIndex] = React.useState(0);
  const [fullscreenVisible, setFullscreenVisible] = React.useState(false);
  const [orderBookExpanded, setOrderBookExpanded] = React.useState(false);
  const [fundamentalsExpanded, setFundamentalsExpanded] = React.useState(false);
  const [guideVisible, setGuideVisible] = React.useState(false);
  const [pendingTradeSide, setPendingTradeSide] = React.useState<'buy' | 'sell' | null>(null);
  const [rightsSheetVisible, setRightsSheetVisible] = React.useState(false);
  const [overflowVisible, setOverflowVisible] = React.useState(false);
  const [supplySheetVisible, setSupplySheetVisible] = React.useState(false);
  const [candleRange, setCandleRange] = React.useState<CoOwnCandleRange>('1W');
  const [showVolume, setShowVolume] = React.useState(false);
  // Price alert creation
  const [priceAlertVisible, setPriceAlertVisible] = React.useState(false);
  const [alertTargetPrice, setAlertTargetPrice] = React.useState('');
  const [alertCondition, setAlertCondition] = React.useState<'above' | 'below'>('above');
  const [alertSubmitting, setAlertSubmitting] = React.useState(false);

  const handleCreatePriceAlert = React.useCallback(async () => {
    if (!assetId) return;
    const priceNum = parseFloat(alertTargetPrice);
    if (!priceNum || priceNum <= 0) {
      show('Enter a valid target price', 'error');
      return;
    }
    const priceMinor = Math.round(priceNum * 100);
    setAlertSubmitting(true);
    try {
      await createCoOwnPriceAlert(assetId, alertCondition, priceMinor);
      haptics.success();
      show(`Price alert set: ${alertCondition} £${priceNum.toFixed(2)}`, 'success');
      setPriceAlertVisible(false);
      setAlertTargetPrice('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create alert';
      show(message, 'error');
    } finally {
      setAlertSubmitting(false);
    }
  }, [assetId, alertTargetPrice, alertCondition, show]);

  const [dataLoadedAt, setDataLoadedAt] = React.useState<number | null>(null);
  // Per spec 03_COOWN §5: dossier collapsed by default.
  const [dossierExpanded, setDossierExpanded] = React.useState(false);
  // Per spec 03_COOWN §8: risk disclosure collapsed by default, opens
  // in a modal sheet via "View risk disclosure" disclosure row.
  const [riskDisclosureVisible, setRiskDisclosureVisible] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const coOwnCompliance = useStore((s) => s.coOwnCompliance);
  const updateCoOwnCompliance = useStore((s) => s.updateCoOwnCompliance);

  const handleOpenFullscreen = (index: number) => {
    setFullscreenIndex(index);
    setFullscreenVisible(true);
  };

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  React.useEffect(() => {
    if (!assetId) { setIsLoading(false); setIsError(true); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);
    setOrderBookError(false);
    setHoldingsError(false);
    setOrderBook(null);
    setYourUnits(currentUser?.id ? null : 0);

    void Promise.allSettled([
      fetchCoOwnAssetById(assetId),
      fetchCoOwnOrderBook(assetId, { limit: 40 }),
      currentUser?.id ? fetchCoOwnHoldings(currentUser.id) : Promise.resolve([]),
      fetchCoOwnRecourseStatus(assetId).catch(() => null),
    ]).then(([assetResult, bookResult, holdingsResult, recourseResult]) => {
      if (cancelled) return;

      if (assetResult.status === 'rejected') {
        const parsed = parseApiError(assetResult.reason, 'Unable to load asset');
        show(parsed.message, 'error');
        setIsError(true);
        setIsLoading(false);
        return;
      }

      setAsset(assetResult.value);
      setDataLoadedAt(Date.now());

      if (bookResult.status === 'fulfilled') {
        setOrderBook(bookResult.value);
      } else {
        setOrderBookError(true);
      }

      if (holdingsResult.status === 'fulfilled') {
        const holding = holdingsResult.value.find((entry) => entry.assetId === assetId);
        setYourUnits(holding?.unitsOwned ?? 0);
      } else {
        setHoldingsError(true);
        setYourUnits(null);
      }

      if (recourseResult.status === 'fulfilled' && recourseResult.value) {
        setRecourseStatus(recourseResult.value);
      }

      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [assetId, currentUser?.id, show]);

  const retryOrderBook = React.useCallback(() => {
    if (!assetId) return;
    setOrderBookError(false);
    void fetchCoOwnOrderBook(assetId, { limit: 40 })
      .then(setOrderBook)
      .catch(() => setOrderBookError(true));
  }, [assetId]);

  const retryHoldings = React.useCallback(() => {
    if (!assetId || !currentUser?.id) return;
    setHoldingsError(false);
    void fetchCoOwnHoldings(currentUser.id)
      .then((holdings) => {
        const holding = holdings.find((entry) => entry.assetId === assetId);
        setYourUnits(holding?.unitsOwned ?? 0);
      })
      .catch(() => {
        setYourUnits(null);
        setHoldingsError(true);
      });
  }, [assetId, currentUser?.id]);

  // Pull-to-refresh — reloads asset, order book, holdings, and recourse
  // status in parallel. The recourse fetch is non-fatal (catch → null)
  // so a recourse endpoint failure doesn't block the rest of the refresh.
  const handleRefresh = React.useCallback(() => {
    if (!assetId) return;
    setRefreshing(true);
    void Promise.allSettled([
      fetchCoOwnAssetById(assetId),
      fetchCoOwnOrderBook(assetId, { limit: 40 }),
      currentUser?.id ? fetchCoOwnHoldings(currentUser.id) : Promise.resolve([]),
      fetchCoOwnRecourseStatus(assetId).catch(() => null),
    ]).then(([assetResult, bookResult, holdingsResult, recourseResult]) => {
      if (assetResult.status === 'fulfilled') {
        setAsset(assetResult.value);
        setDataLoadedAt(Date.now());
      }
      if (bookResult.status === 'fulfilled') {
        setOrderBook(bookResult.value);
        setOrderBookError(false);
      } else {
        setOrderBookError(true);
      }
      if (holdingsResult.status === 'fulfilled') {
        const holding = holdingsResult.value.find((entry) => entry.assetId === assetId);
        setYourUnits(holding?.unitsOwned ?? 0);
        setHoldingsError(false);
      } else if (currentUser?.id) {
        setYourUnits(null);
        setHoldingsError(true);
      }
      if (recourseResult.status === 'fulfilled' && recourseResult.value) {
        setRecourseStatus(recourseResult.value);
      }
      setRefreshing(false);
    });
  }, [assetId, currentUser?.id]);

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

  const { data: recommendationsData, isLoading: recsLoading } = useRecommendations(
    asset?.listingId
  );

  const { data: issuerTrust } = useSellerTrust(asset?.issuerId);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnAssetDetailSkeleton />
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
          subtitle="This Co-Own item may have been delisted or does not exist."
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
          subtitle="This market returned an invalid supply snapshot. Trading is disabled until it is corrected."
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
  const navPerUnitGbp = asset.appraisalValueGbp && totalUnits > 0
    ? asset.appraisalValueGbp / totalUnits
    : null;
  const referenceVsNavPct = navPerUnitGbp && navPerUnitGbp > 0
    ? ((asset.unitPriceGbp - navPerUnitGbp) / navPerUnitGbp) * 100
    : null;
  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;
  const viewerPct = yourUnits != null && totalUnits > 0
    ? Math.round((yourUnits / totalUnits) * 100 * 10) / 10
    : null;
  const feePct = Math.round(CO_OWN_FEE_RATE * 100);

  const bestBid = orderBook && orderBook.bids.length > 0 ? orderBook.bids[0] : null;
  const bestAsk = orderBook && orderBook.asks.length > 0 ? orderBook.asks[0] : null;
  const spreadGbp = bestBid?.unitPriceGbp != null && bestAsk?.unitPriceGbp != null
    ? Math.max(0, bestAsk.unitPriceGbp - bestBid.unitPriceGbp)
    : null;
  const reconciliationActive =
    orderBook != null && orderBook.reconciliationState !== 'reconciled';
  // ── Market snapshot ──
  // Per spec 03_COOWN §2: backend-backed market snapshot. The frontend
  // must not label reference price as "Last trade" without settled-
  // execution proof. marketSnapshot is null until the backend exposes
  // lastExecutionPriceGbp.
  const marketSnapshot = asset.marketSnapshot ?? null;
  const marketSnapshotLabel = marketSnapshot?.asOf
    ? `Snapshot v${marketSnapshot.version} · ${new Date(marketSnapshot.asOf).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })}${dataStale && dataStaleAgeLabel ? ` · stale ${dataStaleAgeLabel}` : ''}`
    : dataStale && dataStaleAgeLabel
      ? `Last update ${dataStaleAgeLabel}`
      : undefined;

  // ── Candle data gating ──
  // Per spec 03_COOWN §4: only expose the candle toggle when real OHLC
  // candles exist. Do not pass an empty candle component. The API returns
  // candles in {timestamp, openGbp, ...} format; the chart expects
  // {t, o, h, l, c, v} — map at the call site.
  const apiCandles = asset.candles ?? [];
  const hasCandleData = apiCandles.length > 0;
  const candleData = apiCandles.map((c) => ({
    t: new Date(c.timestamp).getTime(),
    o: c.openGbp,
    h: c.highGbp,
    l: c.lowGbp,
    c: c.closeGbp,
    v: c.volume,
  }));

  const images = asset.imageUrl ? [asset.imageUrl] : [];
  // Co-Own assets don't carry a marketplace category/condition/description
  // (those are listing-level fields). The dossier evidence groups are
  // derived from the trust profile instead.
  const dossierEvidenceGroups = resolveEvidenceGroups({
    category: null,
    condition: asset.conditionGrade ?? null,
    description: asset.provenance ?? null,
  });
  const hasTrustDetails = Boolean(
    asset.authenticityStatus
    || asset.buyerProtection
    || asset.custodianName
    || asset.custodianLocation,
  );
  const hasStructuredDossier = Boolean(
    asset.provenance?.length
    || asset.conditionGrade
    || asset.custodianLocation
    || asset.appraisalValueGbp
    || asset.legalVehicleType,
  );
  const hasExpandedDossier = dossierEvidenceGroups.length > 0
    || hasTrustDetails
    || hasStructuredDossier;

  const recommendationSections = recommendationsData?.sections ?? [];
  const railSections = recommendationSections.filter(
    (section) => section.key !== 'seen_in_looks' && section.key !== 'continue_exploring',
  );
  const seenInLooksSection = recommendationSections.find((s) => s.key === 'seen_in_looks');
  void recsLoading;
  void railSections;

  const handlePressRecommendation = (recItem: RecommendationItem) => {
    navigation.push('ItemDetail', { itemId: recItem.id });
  };
  const handlePressLook = (lookItem: RecommendationLook) => {
    navigation.navigate('LookDetail', { lookId: lookItem.id });
  };

  const familyStateAccent = asset.listingTier === 'preview'
    ? 'Preview'
    : asset.listingTier === 'delisted'
      ? 'Delisted'
      : !asset.isOpen ? 'Closed' : availableUnits <= 0 ? 'Unavailable' : 'Open';

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
      setGuideVisible(true);
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
      setGuideVisible(true);
      return;
    }
    navigation.navigate('Trade', { assetId: asset.id, side: tradeSide, limitPrice: price });
  };

  const handleGuideComplete = () => {
    updateCoOwnCompliance({ educationCompleted: true });
    setGuideVisible(false);
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        {/* ── Offline banner ──
            Per spec 05 §14: offline state must be designed, not a blank
            screen. Cached asset data may still be visible. Uses the shared
            CommerceDetailOfflineBanner for consistency across all detail
            surfaces. */}
        <CommerceDetailOfflineBanner isOffline={isOffline} />

        {/* ── Freshness indicator ──
            Surfaces stale, reconnecting, and refresh-failed states for the
            realtime market data on this screen. Same shared primitive as
            AuctionDetailScreen. */}
        <CommerceDetailFreshnessBanner
          isRefreshing={refreshing}
          isStale={dataStale && !refreshing}
          onRetry={handleRefresh}
        />

        {/* ── Zone A — Media stage ──
            CommerceMediaStage handles paging/zoom/fullscreen only.
            CommerceDetailMediaRail overlays the max-3-visible-controls
            (Back, Share, Saved) + overflow (Fav, Watch, Report).
            Spec 02 §A: "Maximum visible utility controls over media: three." */}
        <CommerceMediaStage
          images={images}
          objectId={asset.id}
          topInset={insets.top}
          scrollY={scrollY}
          onBack={() => navigation.goBack()}
          onShare={social.openShare}
          onSave={social.openCollectionPicker}
          onToggleFav={social.toggleLike}
          isFav={social.isLiked}
          isSaved={social.isSavedToCollection}
          showDefaultControls={false}
          heightFraction={isVeryCompact ? 0.5 : isCompact ? 0.54 : 0.58}
          initialIndex={fullscreenIndex}
          onActiveIndexChange={setFullscreenIndex}
          onOpenFullscreen={handleOpenFullscreen}
          overlayTopContent={
            <View style={styles.familyBadgeOverlay}>
              <ProductFamilyBadge family="co_own" stateAccent={familyStateAccent} compact />
            </View>
          }
          overlayBottomContent={
            <CommerceDetailIdentity
              family="co_own"
              tone="media"
              density={isVeryCompact ? 'compact' : 'standard'}
              eyebrow={asset.legalVehicleName ?? 'Fractional asset'}
              title={asset.title}
              secondaryLine={`${availableUnits} of ${totalUnits} units available`}
              interestSignal={asset.holders != null ? `${asset.holders} holders` : undefined}
            />
          }
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
              onPress: social.openCollectionPicker,
              isActive: social.isSavedToCollection,
            },
          ]}
          onOverflow={() => setOverflowVisible(true)}
          showOverflow
        />

        {/* Issuer confidence remains on the page canvas. It is visually
            connected to the asset story without forcing identity into a
            finance-themed colour block. */}
        <View style={[styles.identityExtension, { borderBottomColor: colors.borderSubtle }]}>
          <CommerceDetailSellerRow
            roleLabel="Issuer"
            institutional
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
            onPress={() => navigation.navigate('UserProfile', { userId: asset.issuerId })}
            primaryAction={
              canMessageIssuer
                ? {
                    label: 'Message',
                    onPress: async () => {
                      if (!currentUser?.id) {
                        show('Sign in to message the issuer.', 'error');
                        return;
                      }
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
                        show('Unable to open conversation. Please try again.', 'error');
                      } finally {
                        setIsResolvingConversation(false);
                      }
                    },
                  }
                : undefined
            }
          />
        </View>

        {/* ── Zone C — Family transaction module ──
            The one non-media surface near the top: reference price,
            top-of-book, depth and market mode. It follows the active
            light/dark theme and stays flat/full-width rather than becoming
            a dashboard card or a forced trading-terminal canvas.
            Spec 02 §C + spec 03 §2/§3: do not label reference price as
            "Last trade" without settled-execution proof. Use "Reference
            unit price" unless the backend provides lastExecutionPriceGbp. */}
        <CoOwnMarketOverview>
          <CommerceDetailTransactionSurface
            family="co_own"
            flush
            surfaceColor="transparent"
            primaryLabel={marketSnapshot?.lastExecutionPriceGbp != null ? 'Last settled trade' : 'Reference unit price'}
            primaryValue={formatCoOwnIze(marketSnapshot?.lastExecutionPriceGbp ?? asset.unitPriceGbp)}
            statusRow={
              <View style={styles.marketStatusRow}>
                <View style={styles.marketStatusCluster}>
                  <View
                    style={[
                      styles.marketStatusDot,
                      {
                        backgroundColor: reconciliationActive
                          ? colors.warning
                          : asset.isOpen
                            ? colors.success
                            : colors.textMuted,
                      },
                    ]}
                  />
                  <Text style={[styles.marketStatusText, { color: colors.textPrimary }]}>
                    {reconciliationActive ? 'Orders paused · settling' : asset.isOpen ? 'Continuous · Open' : 'Closed'}
                  </Text>
                  {dataStale && dataStaleAgeLabel && (
                    <Text style={[styles.marketStatusStale, { color: colors.warning }]}>Stale {dataStaleAgeLabel}</Text>
                  )}
                </View>
                <Text style={[styles.marketStatusRights, { color: colors.textSecondary }]}>
                  {orderBookError
                    ? 'Depth unavailable'
                    : `Spread ${spreadGbp != null ? formatCoOwnIze(spreadGbp) : 'Not available'}`}
                </Text>
              </View>
            }
          >
          {orderBookError ? (
            <CommerceDetailUnavailableInline
              title="Live market unavailable"
              body="Reference pricing remains visible, but bid and ask depth could not be loaded."
              onRetry={retryOrderBook}
            />
          ) : (
            <View style={[styles.marketBookRow, { borderTopColor: colors.border }]}>
              <View style={styles.marketBookSide}>
                <Text style={[styles.marketBookLabel, { color: colors.textSecondary }]}>Highest bid</Text>
                <Text style={[styles.marketBookValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                  {bestBid?.unitPriceGbp != null ? `${formatCoOwnIze(bestBid.unitPriceGbp)} × ${bestBid.units ?? 0}` : 'No bid'}
                </Text>
              </View>
              <View style={[styles.marketBookDivider, { backgroundColor: colors.border }]} />
              <View style={styles.marketBookSide}>
                <Text style={[styles.marketBookLabel, { color: colors.textSecondary }]}>Lowest ask</Text>
                <Text style={[styles.marketBookValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                  {bestAsk?.unitPriceGbp != null ? `${formatCoOwnIze(bestAsk.unitPriceGbp)} × ${bestAsk.units ?? 0}` : 'No ask'}
                </Text>
              </View>
            </View>
          )}
          {!orderBookError && orderBook ? (
            <>
              <CommerceDetailDisclosureRow
                label={orderBookExpanded ? 'Hide market depth' : 'Explore market depth'}
                summary={`${orderBook.bids.length + orderBook.asks.length} offers`}
                onPress={() => setOrderBookExpanded((prev) => !prev)}
                leadingIcon="bar-chart-outline"
              />
              {orderBookExpanded ? (
                <CoOwnOrderBook
                  embedded
                  bids={orderBook.bids.map((level) => ({
                    price: level.unitPriceGbp,
                    size: level.units,
                    orderCount: level.orderCount,
                  }))}
                  asks={orderBook.asks.map((level) => ({
                    price: level.unitPriceGbp,
                    size: level.units,
                    orderCount: level.orderCount,
                  }))}
                  visibleLevels={5}
                  lastPrice={marketSnapshot?.lastExecutionPriceGbp ?? undefined}
                  lastAgeSeconds={undefined}
                  mode={asset.isOpen ? 'continuous' : 'closed'}
                  onSelectLevel={handleSelectOrderBookLevel}
                />
              ) : null}
            </>
          ) : null}
          <CommerceDetailDisclosureRow
            label={fundamentalsExpanded ? 'Hide valuation facts' : 'Review valuation facts'}
            summary={
              navPerUnitGbp != null
                ? `${formatFromFiat(navPerUnitGbp, 'GBP')} NAV / unit`
                : 'Valuation · reporting'
            }
            onPress={() => setFundamentalsExpanded((prev) => !prev)}
            leadingIcon="analytics-outline"
          />
          {fundamentalsExpanded ? (
            <View style={[styles.fundamentalsStacked, { borderTopColor: colors.border }]}>
              <View style={styles.fundamentalsRow}>
                <Text style={[styles.fundamentalsLabel, { color: colors.textSecondary }]}>Reference vs NAV</Text>
                <Text style={[styles.fundamentalsValue, { color: colors.textPrimary }]}>
                  {referenceVsNavPct != null
                    ? `${referenceVsNavPct >= 0 ? '+' : ''}${referenceVsNavPct.toFixed(1)}%`
                    : 'Not available'}
                </Text>
              </View>
              <View style={styles.fundamentalsRow}>
                <Text style={[styles.fundamentalsLabel, { color: colors.textSecondary }]}>NAV / unit</Text>
                <Text style={[styles.fundamentalsValue, { color: colors.textPrimary }]}>
                  {navPerUnitGbp != null
                    ? formatFromFiat(navPerUnitGbp, 'GBP')
                    : 'Not available'}
                </Text>
              </View>
              <View style={styles.fundamentalsRow}>
                <Text style={[styles.fundamentalsLabel, { color: colors.textSecondary }]}>Next report</Text>
                <Text style={[styles.fundamentalsValue, { color: colors.textPrimary }]}>
                  {asset.appraisalValuedAt
                    ? new Date(asset.appraisalValuedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                    : 'Not scheduled'}
                </Text>
              </View>
              <View style={styles.fundamentalsRow}>
                <Text style={[styles.fundamentalsLabel, { color: colors.textSecondary }]}>Distribution</Text>
                <Text style={[styles.fundamentalsValue, { color: colors.textPrimary }]}>Not scheduled</Text>
              </View>
            </View>
          ) : null}
          </CommerceDetailTransactionSurface>
        </CoOwnMarketOverview>

        <CommerceDetailSection
          label={isHolder ? 'Your ownership' : 'Current ownership'}
          divider
          variant="editorial"
        >
          {holdingsError ? (
            <CommerceDetailUnavailableInline
              title="Position unavailable"
              body="We could not verify your settled units. Trading is disabled until this refreshes."
              onRetry={retryHoldings}
            />
          ) : isHolder && yourUnits != null && viewerPct != null ? (
            <View style={styles.viewerPositionHeader}>
              <View style={styles.viewerPositionCopy}>
                <Text style={[styles.viewerPositionValue, { color: colors.textPrimary }]}>
                  {yourUnits} units · {viewerPct.toFixed(1)}%
                </Text>
                <Text style={[styles.viewerPositionMeta, { color: colors.textSecondary }]}>
                  Your settled position
                </Text>
              </View>
              <View style={styles.viewerPositionCopy}>
                <Text style={[styles.viewerPositionMarketValue, { color: colors.textPrimary }]}>
                  {formatCoOwnIze(asset.unitPriceGbp * yourUnits)}
                </Text>
                <Text style={[styles.viewerPositionMeta, { color: colors.textSecondary, textAlign: 'right' }]}>
                  Reference value
                </Text>
              </View>
            </View>
          ) : null}
          <View style={styles.supplySummary}>
            <View style={styles.supplyMetric}>
              <Text style={[styles.supplyMetricLabel, { color: colors.textSecondary }]}>
                Available
              </Text>
              <Text style={[styles.supplyUnits, { color: colors.textPrimary }]}>
                {availableUnits} / {totalUnits} units
              </Text>
            </View>
            <View style={[styles.supplyMetric, styles.supplyMetricTrailing]}>
              <Text style={[styles.supplyMetricLabel, { color: colors.textSecondary }]}>
                Allocated
              </Text>
              <Text style={[styles.supplyAllocated, { color: colors.textPrimary }]}>
                {allocatedPct}%
              </Text>
            </View>
          </View>
          <View style={[styles.allocationBar, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.allocationFill,
                {
                  backgroundColor: colors.brand,
                  width: `${Math.min(100, allocatedPct)}%`,
                },
              ]}
            />
          </View>
          {asset.holders != null && (
            <Text style={[styles.supplyHolders, { color: colors.textSecondary }]}>
              {asset.holders} holders
            </Text>
          )}
          {/* Per spec 03_COOWN §6: do not infer treasury, authorised,
              issued, public float or sponsor locked. Use Available
              units, Allocated units, Holder count. Omit treasury
              language until explicit nullable backend fields exist. */}
          <CommerceDetailDisclosureRow
            label="View supply structure"
            summary="Available · allocated · holders"
            onPress={() => setSupplySheetVisible(true)}
            leadingIcon="layers-outline"
          />
        </CommerceDetailSection>

        {/* ── Price history ──
            Spec 03 §6: empty state shows compact inline "No settled trade
            history yet"; error state shows "Price history unavailable" +
            Retry. Do not show +0.0%. Do not reserve a large blank chart.
            Movement is passed as nullable — missing movement is never
            coerced to zero. */}
        {/* ── Price history ──
            Per spec 03_COOWN §4: only expose the line/candle toggle
            when real OHLC candles exist. Do not pass an empty candle
            component merely to satisfy a layout path. */}
        <CommerceDetailSection label="Price history" divider variant="editorial">
          <CoOwnPriceChart
            assetId={asset.id}
            unitPriceGbp={asset.unitPriceGbp}
            marketMovePct24h={asset.marketMovePct24h ?? null}
            volume24hGbp={asset.volume24hGbp ?? null}
            lastAgeSeconds={undefined}
            change24hTimestamp={undefined}
            candleChart={
              hasCandleData ? (
                <CoOwnCandleChart
                  candles={candleData}
                  range={candleRange}
                  onRangeChange={setCandleRange}
                  showVolume={showVolume}
                  lastPrice={marketSnapshot?.lastExecutionPriceGbp ?? undefined}
                  lastAgeSeconds={undefined}
                />
              ) : undefined
            }
          />
        </CommerceDetailSection>

        {/* ── Asset evidence ──
            Combined category evidence + trust panel + dossier into one
            "Asset dossier" section. Spec 03 §8: "Combine category evidence,
            authenticity, condition, storage, insurance and appraisal into
            one Asset dossier section." */}
        {/* ── Asset dossier — collapsed by default ──
            Per spec 03_COOWN §5: default summary shows maximum five
            decision facts (Authenticity, Condition, Storage, Insurance,
            Latest appraisal). Full dossier opens via "View full asset
            dossier" disclosure. Do not render — rows; omit missing. */}
        {hasExpandedDossier ? (
          <CommerceDetailSection label="Asset dossier" divider variant="editorial">
            {/* Trust chips — flat inline icon+text, same pattern as
                ItemDetailScreen. Surfaces key trust signals without
                requiring a tap. Per AGENTS.md: flat canvas, no cards.
                Fail closed: chips only render when the backend provides
                the substantiating field. */}
            {(() => {
              const chips: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [];
              if (asset.authenticityStatus === 'verified') {
                chips.push({ icon: 'ribbon-outline', label: 'Authenticated' });
              }
              if (asset.buyerProtection) {
                chips.push({ icon: 'shield-checkmark-outline', label: 'Buyer protection' });
              }
              if (asset.custodianName) {
                chips.push({ icon: 'cube-outline', label: 'Custodied' });
              }
              if (asset.custodyInsured && asset.custodyInsurer) {
                chips.push({ icon: 'checkmark-circle-outline', label: 'Insured' });
              }
              if (asset.legalVehicleType && asset.legalVehicleType !== 'none') {
                chips.push({ icon: 'business-outline', label: 'SPV' });
              }
              if (chips.length === 0) return null;
              return (
                <View style={styles.trustChipsRow}>
                  {chips.map((chip, i) => (
                    <View key={i} style={styles.trustChip}>
                      <Ionicons name={chip.icon} size={16} color={colors.textSecondary} />
                      <Text style={[styles.trustChipText, { color: colors.textSecondary }]} numberOfLines={1}>
                        {chip.label}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })()}
            {/* Summary facts — maximum five decision facts. Fail closed. */}
            {asset.authenticityStatus === 'verified' && (
              <CommerceDetailMetricRow
                label="Authenticity"
                value={asset.authenticityMethod ? `Verified · ${asset.authenticityMethod}` : 'Verified'}
              />
            )}
            {asset.conditionGrade && (
              <CommerceDetailMetricRow
                label="Condition"
                value={asset.conditionGrade}
              />
            )}
            {asset.custodianLocation && (
              <CommerceDetailMetricRow
                label="Storage"
                value={asset.custodianLocation}
              />
            )}
            {asset.appraisalStaleDays != null && asset.appraisalStaleDays > 180 && (
              <View style={styles.staleAppraisalRow}>
                <CommerceDetailMetricRow
                  label="Appraisal"
                  value={`Stale · ${asset.appraisalStaleDays}d since last valuation`}
                />
                {isIssuer && (
                  <Pressable
                    style={[styles.refreshBtn, { borderColor: colors.border, opacity: isRefreshingAppraisal ? 0.5 : 1 }]}
                    disabled={isRefreshingAppraisal}
                    onPress={async () => {
                      if (isRefreshingAppraisal) return;
                      setIsRefreshingAppraisal(true);
                      try {
                        await refreshCoOwnAppraisal(assetId, { appraisalValueGbp: asset.appraisalValueGbp ?? 0, appraisalValuer: 'Issuer refresh' });
                        show('Appraisal refresh requested', 'success');
                        // Reload asset to get updated stale days
                        const updated = await fetchCoOwnAssetById(assetId);
                        setAsset(updated);
                      } catch {
                        show('Unable to refresh appraisal', 'error');
                      } finally {
                        setIsRefreshingAppraisal(false);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={isRefreshingAppraisal ? 'Refreshing appraisal' : 'Refresh appraisal'}
                  >
                    <Text style={[styles.refreshBtnText, { color: colors.brand }]}>{isRefreshingAppraisal ? 'Refreshing…' : 'Refresh'}</Text>
                  </Pressable>
                )}
              </View>
            )}
            {/* WS6: Stale market mark — show when no public market events
                have been logged in >7 days. Fail closed (omit when null). */}
            {asset.staleMarkDays != null && asset.staleMarkDays > 7 && (
              <CommerceDetailMetricRow
                label="Market activity"
                value={`Pricing may be stale · ${asset.staleMarkDays}d since last market event`}
              />
            )}
            <CommerceDetailDisclosureRow
              label={dossierExpanded ? 'Hide full asset dossier' : 'View full asset dossier'}
              onPress={() => setDossierExpanded((prev) => !prev)}
              leadingIcon="document-text-outline"
              accessibilityLabel={dossierExpanded ? 'Hide full asset dossier' : 'View full asset dossier'}
            />

            {/* Full dossier — expanded on demand */}
            {dossierExpanded && (
              <>
                {dossierEvidenceGroups.length > 0 ? (
                  <CategoryEvidence groups={dossierEvidenceGroups} />
                ) : null}

                <CoOwnTrustPanel
                  authenticityStatus={asset.authenticityStatus ?? null}
                  authenticityMethod={asset.authenticityMethod ?? null}
                  buyerProtection={asset.buyerProtection ?? false}
                  buyerProtectionTermsUrl={asset.buyerProtectionTermsUrl ?? null}
                  custodianName={asset.custodianName ?? null}
                  custodianLocation={asset.custodianLocation ?? null}
                  custodyInsured={asset.custodyInsured ?? false}
                  custodyInsurer={asset.custodyInsurer ?? null}
                  custodyCoverageGbp={asset.custodyCoverageGbp ?? null}
                  custodyPolicyRef={asset.custodyPolicyRef ?? null}
                  legalVehicleType={asset.legalVehicleType ?? null}
                  legalVehicleName={asset.legalVehicleName ?? null}
                  legalVehicleJurisdiction={asset.legalVehicleJurisdiction ?? null}
                />

                {/* WS7: Seller accountability — recourse agreement, personal
                    liability, verification demands. Shows the seller's
                    signed personal guarantee and any active verification
                    requests from unit holders. */}
                <CoOwnRecoursePanel
                  recourseAgreementSigned={asset.recourseAgreementSigned ?? false}
                  recourseStatus={asset.recourseStatus ?? 'pending'}
                  totalTradedValueGbp={asset.totalTradedValueGbp}
                  activeVerificationDemands={asset.activeVerificationDemands}
                  agreement={recourseStatus?.agreement ?? null}
                  sellerLiability={recourseStatus?.sellerLiability ?? null}
                  verificationDemands={recourseStatus?.verificationDemands}
                  isHolder={(yourUnits ?? 0) > 0}
                  isIssuer={isIssuer}
                  onRequestVerification={async () => {
                    if (!assetId) return;
                    setVerificationDemandLoading(true);
                    try {
                      await createVerificationDemand(assetId, 'authenticity');
                      show('Verification request sent to seller', 'success');
                      // Refresh recourse status
                      const updated = await fetchCoOwnRecourseStatus(assetId);
                      setRecourseStatus(updated);
                    } catch {
                      show('Could not send verification request', 'error');
                    } finally {
                      setVerificationDemandLoading(false);
                    }
                  }}
                  onRespondToVerification={(demandId) => {
                    navigation.navigate('VerificationResponse', { assetId, demandId });
                  }}
                />

                {(asset.provenance || asset.conditionGrade || asset.custodianLocation || asset.appraisalValueGbp) && (
                  <CoOwnAssetDossier
                    provenance={asset.provenance ? [{ event: 'Provenance', date: '', note: asset.provenance }] : undefined}
                    condition={asset.conditionGrade ? {
                      grade: asset.conditionGrade,
                    } : undefined}
                    storage={asset.custodianLocation ? {
                      location: asset.custodianLocation,
                      custodian: asset.custodianName ?? '—',
                      insured: asset.custodyInsured ?? false,
                      policyRef: asset.custodyPolicyRef ?? undefined,
                    } : undefined}
                    appraisal={asset.appraisalValueGbp != null ? {
                      value: asset.appraisalValueGbp,
                      currency: 'GBP',
                      valuedAt: asset.appraisalValuedAt ?? '',
                      method: '—',
                      valuer: asset.appraisalValuer ?? undefined,
                    } : undefined}
                  />
                )}

                {/* Trust audit trail — append-only history of trust-profile
                    changes (SEC Rule 17Ad-7 pattern). Fail closed when empty. */}
                {asset.trustAuditEvents && asset.trustAuditEvents.length > 0 ? (
                  <View style={[styles.auditTrailWrap, { borderTopColor: colors.borderSubtle }]}>
                    <Text style={[styles.auditTrailTitle, { color: colors.textSecondary }]}>
                      Trust history
                    </Text>
                    {asset.trustAuditEvents.map((evt, i) => (
                      <View key={i} style={styles.auditTrailRow}>
                        <Text style={[styles.auditTrailEvent, { color: colors.textMuted }]} numberOfLines={1}>
                          {evt.eventType.replace(/_/g, ' ')}
                        </Text>
                        <Text style={[styles.auditTrailDate, { color: colors.textMuted }]} numberOfLines={1}>
                          {new Date(evt.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* WS6: Market audit trail — price marks, supply changes,
                    listing tier transitions. Fail closed when empty. */}
                {asset.marketAuditEvents && asset.marketAuditEvents.length > 0 ? (
                  <View style={[styles.auditTrailWrap, { borderTopColor: colors.borderSubtle }]}>
                    <Text style={[styles.auditTrailTitle, { color: colors.textSecondary }]}>
                      Market history
                    </Text>
                    {asset.marketAuditEvents.map((evt) => (
                      <View key={evt.id} style={styles.auditTrailRow}>
                        <Text style={[styles.auditTrailEvent, { color: colors.textMuted }]} numberOfLines={1}>
                          {evt.eventType.replace(/_/g, ' ')}
                        </Text>
                        <Text style={[styles.auditTrailDate, { color: colors.textMuted }]} numberOfLines={1}>
                          {new Date(evt.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={[styles.auditTrailWrap, { borderTopColor: colors.borderSubtle }]}>
                    <Text style={[styles.auditTrailTitle, { color: colors.textSecondary }]}>
                      Market history
                    </Text>
                    <Text style={[styles.auditTrailEvent, { color: colors.textMuted }]}>
                      No market history yet
                    </Text>
                  </View>
                )}
              </>
            )}
          </CommerceDetailSection>
        ) : null}

        {/* ── Rights and risk ──
            Default summary: completion state + one critical plain-language
            statement + "Review N terms". Full sheet keeps all canonical rows.
            Spec 03 §9. */}
        {/* ── Rights & risks — compressed ──
            Per spec 03_COOWN §8: default summary shows one critical
            plain-language statement + "Review N terms" + "View risk
            disclosure". Both expand via disclosure rows, not inline
            blocks. */}
        <CommerceDetailSection label="Rights & risks" divider variant="editorial">
          <View style={styles.rightsSummary}>
            <Text style={[styles.rightsCriticalStatement, { color: colors.textPrimary }]}>
              You own units in the asset, not the physical item.
            </Text>
          </View>
          <CommerceDetailMetricRow
            label="Full-asset buyout"
            value="Not available"
            muted
          />
          <CommerceDetailDisclosureRow
            label="Review rights"
            count={CANONICAL_RIGHTS_LABELS.length}
            summary={asset.rights?.version ? formatRightsVersion(`v${asset.rights.version}`) : undefined}
            onPress={() => setRightsSheetVisible(true)}
            leadingIcon="document-text-outline"
          />
          <CommerceDetailDisclosureRow
            label="View risk disclosure"
            onPress={() => setRiskDisclosureVisible(true)}
            leadingIcon="warning-outline"
            accessibilityLabel="View risk disclosure"
          />
        </CommerceDetailSection>

        {/* ── Zone F — Discovery ──
            Per spec 03_COOWN §9: maximum one discovery rail. Do not
            render generic duplicate recommendation rails after that. */}
        {seenInLooksSection && seenInLooksSection.items.length > 0 && (
          <View style={styles.recommendationSection}>
            <RecommendationRail
              section={seenInLooksSection}
              listingId={asset.listingId}
              onPressItem={(recItem) => {
                if (isRecommendationLook(recItem)) {
                  handlePressLook(recItem);
                } else {
                  handlePressRecommendation(recItem as unknown as RecommendationItem);
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
              subtitle="Complete rights disclosure"
              primaryAction={{
                label: 'Review rights',
                onPress: () => setRightsSheetVisible(true),
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

        // Tradable states — per spec 03_COOWN §7: holder primary =
        // "Sell", secondary = "Buy more"; non-holder primary = "Buy units".
        return (
          <CommerceDetailStateDock
            value={formatCoOwnIze(asset.unitPriceGbp)}
            valueLabel="Unit price"
            thumbnailUri={asset.imageUrl ?? undefined}
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
        onClose={() => setFullscreenVisible(false)}
      />

      {/* First-trade guided education */}
      <CoOwnFirstTradeGuide
        visible={guideVisible}
        onClose={() => { setGuideVisible(false); setPendingTradeSide(null); }}
        onComplete={handleGuideComplete}
        onContinueToTrade={pendingTradeSide ? handleGuideContinueToTrade : undefined}
      />

      {/* Rights & risks sheet — 13-row modal.
          Rows fail closed to "To be confirmed" when the backend does not
          expose the answer. For live instruments, TBC rows block trading. */}
      <CoOwnRightsSheet
        visible={rightsSheetVisible}
        onClose={() => setRightsSheetVisible(false)}
        disclosureVersion={asset.rights?.version ? `Rights v${asset.rights.version}` : 'Rights v1'}
        rights={rightsRows}
      />

      {/* Risk disclosure sheet — per spec 03_COOWN §8: collapsed by
          default, opens in a BottomSheet via "View risk disclosure".
          Uses the shared BottomSheet primitive for consistency with all
          other detail surfaces. */}
      <BottomSheet
        visible={riskDisclosureVisible}
        onDismiss={() => setRiskDisclosureVisible(false)}
        snapPoint={0.7}
      >
        <View style={[styles.riskDisclosureSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.riskDisclosureSheetTitle, { color: colors.textPrimary }]}>
            Risk disclosure
          </Text>
          <Pressable
            onPress={() => setRiskDisclosureVisible(false)}
            hitSlop={12}
            style={({ pressed }) => [styles.sheetCloseTarget, pressed && { opacity: 0.5 }]}
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
              setRiskDisclosureVisible(false);
              navigation.navigate('CoOwnIssue', { assetId: asset.id });
            }}
          />
        </ScrollView>
      </BottomSheet>

      {/* Supply structure sheet — per spec 03_COOWN §6: do not infer
          treasury, authorised, issued, public float or sponsor locked
          from available units. Pass null for inferred values until
          explicit backend fields exist. */}
      <CoOwnSupplySheet
        visible={supplySheetVisible}
        onClose={() => setSupplySheetVisible(false)}
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
        onClose={() => setOverflowVisible(false)}
        onShare={social.openShare}
        onOrderHistory={() => navigation.navigate('CoOwnOrderHistory')}
        onToggleFav={social.toggleLike}
        isFav={social.isLiked}
        onWatch={() => {
          toggleCoOwnWatch(asset.id);
          setOverflowVisible(false);
        }}
        isWatched={isWatched}
        onPriceAlert={() => {
          setOverflowVisible(false);
          setPriceAlertVisible(true);
        }}
        onReport={() => {
          setOverflowVisible(false);
          navigation.navigate('CoOwnIssue', { assetId: asset.id });
        }}
      />

      {/* Price alert creation modal — flagship treatment with semantic condition colours */}
      <Modal
        visible={priceAlertVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPriceAlertVisible(false)}
      >
        <Pressable style={priceAlertStyles.overlay} onPress={() => setPriceAlertVisible(false)}>
          <Pressable style={[priceAlertStyles.sheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            {/* Header with icon */}
            <View style={priceAlertStyles.headerRow}>
              <View style={[priceAlertStyles.headerIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="notifications" size={20} color={colors.textInverse} />
              </View>
              <View style={priceAlertStyles.headerText}>
                <Text style={[priceAlertStyles.sheetTitle, { color: colors.textPrimary }]}>Create price alert</Text>
                <Text style={[priceAlertStyles.sheetSubtitle, { color: colors.textSecondary }]}>
                  Get notified when the price {alertCondition === 'above' ? 'rises above' : 'drops below'} your target.
                </Text>
              </View>
            </View>

            {/* Condition selector — semantic colours */}
            <Text style={[priceAlertStyles.inputLabel, { color: colors.textSecondary }]}>Condition</Text>
            <View style={priceAlertStyles.conditionRow}>
              {(['above', 'below'] as const).map((c) => {
                const isSelected = alertCondition === c;
                const semanticColor = c === 'above' ? colors.success : colors.danger;
                return (
                  <Pressable
                    key={c}
                    style={({ pressed }) => [
                      priceAlertStyles.conditionTab,
                      {
                        backgroundColor: isSelected ? semanticColor : colors.surfaceAlt,
                        borderColor: isSelected ? semanticColor : colors.border,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => { haptics.tap(); setAlertCondition(c); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Alert when price goes ${c}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Ionicons
                      name={c === 'above' ? 'arrow-up' : 'arrow-down'}
                      size={18}
                      color={isSelected ? '#fff' : colors.textSecondary}
                    />
                    <Text style={[priceAlertStyles.conditionText, { color: isSelected ? '#fff' : colors.textSecondary }]}>
                      {c === 'above' ? 'Above' : 'Below'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Price input */}
            <Text style={[priceAlertStyles.inputLabel, { color: colors.textSecondary }]}>Target price (£)</Text>
            <TextInput
              style={[priceAlertStyles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
              value={alertTargetPrice}
              onChangeText={setAlertTargetPrice}
              placeholder="e.g. 25.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              accessibilityLabel="Target price"
            />

            <View style={priceAlertStyles.actions}>
              <AppButton
                title="Cancel"
                onPress={() => setPriceAlertVisible(false)}
                variant="secondary"
                size="md"
                style={{ flex: 1, marginRight: Space.sm }}
              />
              <AppButton
                title={alertSubmitting ? 'Creating…' : 'Create alert'}
                onPress={() => { haptics.tap(); void handleCreatePriceAlert(); }}
                variant="primary"
                size="md"
                disabled={alertSubmitting || !alertTargetPrice}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  familyBadgeOverlay: {
    alignSelf: 'flex-start',
  },
  // ── Issuer identity extension ──
  // Per Design.md between-group spacing: the issuer row is a distinct
  // group. paddingVertical Space.md (16px) gives proper breathing room
  // for avatar + name + verification + actions.
  identityExtension: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // ── Market status row (inside transaction surface) ──
  marketStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  marketStatusCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  marketStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  marketStatusText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
  },
  marketStatusStale: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
  },
  marketStatusRights: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
  },
  // ── Market book row (bid/ask inside transaction surface) ──
  marketBookRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.sm,
    paddingTop: Space.sm,
  },
  marketBookSide: {
    flex: 1,
    gap: Space.xs,
  },
  marketBookDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: Space.sm,
  },
  marketBookLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  marketBookValue: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // ── Secondary facts (NAV / distribution / report) ──
  marketSecondaryFacts: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.sm,
  },
  marketSecondaryFact: {
    flex: 1,
    gap: Space.xs,
  },
  marketSecondaryLabel: {
    fontSize: Type.metaElevated.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  marketSecondaryValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight,
    fontVariant: ['tabular-nums'],
  },
  // ── Fundamentals — stacked layout (per spec 03_COOWN §1) ──
  fundamentalsStacked: {
    marginTop: Space.xs,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Space.sm,
  },
  fundamentalsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  fundamentalsLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    flexShrink: 0,
  },
  fundamentalsValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    flexShrink: 1,
  },
  // Unavailable fundamentals values: italic, no tabular nums.
  fundamentalsValueUnavailable: {
    fontStyle: 'italic',
    fontVariant: [],
  },
  // ── Risk disclosure sheet (per spec 03_COOWN §8) ──
  // Uses the shared BottomSheet primitive; only the header and scroll
  // content styles are screen-local.
  riskDisclosureSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetCloseTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskDisclosureSheetTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    lineHeight: Type.subtitle.lineHeight,
  },
  riskDisclosureSheetScroll: {
    flex: 1,
  },
  riskDisclosureSheetContent: {
    padding: Space.md,
  },
  // ── Viewer position ──
  // Trust chips — flat inline icon+text pairs. Same pattern as
  // ItemDetailScreen. No card, no surface fill, no border.
  trustChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    paddingBottom: Space.md,
  },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  trustChipText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
  },
  auditTrailWrap: {
    gap: Space.xs,
    paddingTop: Space.md,
    marginTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  auditTrailTitle: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs,
  },
  auditTrailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  auditTrailEvent: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    textTransform: 'capitalize',
  },
  auditTrailDate: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
  },
  viewerPositionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  // Stale appraisal refresh action
  staleAppraisalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  refreshBtn: {
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  refreshBtnText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  viewerPositionCopy: {
    gap: Space.xs,
    flexShrink: 1,
  },
  viewerPositionValue: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  viewerPositionMarketValue: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  viewerPositionMeta: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.captionElevated.lineHeight,
  },
  // ── Supply summary ──
  supplySummary: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  supplyMetric: {
    gap: Space.xs,
    flex: 1,
  },
  supplyMetricTrailing: {
    alignItems: 'flex-end',
  },
  supplyMetricLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  supplyUnits: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.subtitle.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  supplyAllocated: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  allocationBar: {
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  allocationFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  supplyHolders: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    marginTop: Space.sm,
  },
  // ── Rights summary ──
  rightsSummary: {
    paddingVertical: Space.sm,
  },
  rightsCriticalStatement: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    lineHeight: Type.bodyEmphasis.lineHeight,
  },
  // ── Unavailable exit row (truthful disabled state) ──
  unavailableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    minHeight: 44,
  },
  unavailableRowLabelCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 1,
  },
  unavailableRowLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    flexShrink: 1,
  },
  unavailableRowSummary: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
  },
  // ── Dock state badge ──
  dockStateBadge: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
  },
  // ── Discovery ──
  recommendationSection: {
    marginTop: Space.md,
  },
});

const priceAlertStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Space.lg,
    paddingBottom: Space.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    marginBottom: Space.lg,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
    marginBottom: 2,
  },
  sheetSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: 18,
  },
  conditionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  conditionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  conditionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  inputLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    marginBottom: Space.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    marginBottom: Space.lg,
  },
  actions: {
    flexDirection: 'row',
  },
});
