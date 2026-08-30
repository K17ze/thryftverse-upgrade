import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Linking } from 'react-native';
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
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Space, Radius, FontFamily, DockConstants, Control, Numeric } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import {
  fetchCoOwnOrderBook,
  fetchCoOwnDistributions,
  type CoOwnOrderBookSnapshot,
  type CoOwnDistribution,
  type MarketCoOwnAsset,
  type MarketCoOwnHolding,
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
  isRecommendationLook,
} from '../platform/product';
import type { RecommendationLook } from '../platform/product';
import {
  CoOwnRiskDisclosure,
  CoOwnAssetDetailSkeleton,
  CoOwnStateCanvas,
  CoOwnPriceChart,
  CoOwnFirstTradeGuide,
  CoOwnRightsSheet,
  CoOwnOrderBook,
  CoOwnCandleChart,
  CoOwnSupplySheet,
  CoOwnOverflowSheet,
  CoOwnPriceAlertForm,
  CANONICAL_RIGHTS_LABELS,
  type CoOwnRightsRow,
  type CoOwnCandleRange,
} from '../components/coown';
import { OwnershipStructureBar, HolderPositionSummary, FundamentalsSection } from '../components/asset';
import { MarketBookRow } from '../components/trade';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useSignupWall } from '../hooks/useSignupWall';
import { useAssetDetailSheets } from '../hooks/useAssetDetailSheets';
import { usePriceAlertForm } from '../hooks/usePriceAlertForm';
import { useFeatureFlag } from '../analytics';
import { useScreenCaptureProtection } from '../platform/screenCapture';

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
  const { currencyCode, formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const { requireAuth } = useSignupWall();

  // Feature flag — gates the enhanced Co-Own v2 UI (supply disclosure row +
  // beta badge). Defaults to false (current behaviour) when PostHog is not
  // loaded.
  const coOwnV2Enabled = useFeatureFlag('co_own_v2');

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

  const [orderBook, setOrderBook] = React.useState<CoOwnOrderBookSnapshot | null>(null);
  const [orderBookError, setOrderBookError] = React.useState(false);
  const [lastDistribution, setLastDistribution] = React.useState<CoOwnDistribution | null>(null);
  const [isResolvingConversation, setIsResolvingConversation] = React.useState(false);
  const [fullscreenIndex, setFullscreenIndex] = React.useState(0);
  const [pendingTradeSide, setPendingTradeSide] = React.useState<'buy' | 'sell' | null>(null);
  const [candleRange, setCandleRange] = React.useState<CoOwnCandleRange>('1W');
  const [showVolume, setShowVolume] = React.useState(false);

  // ── Sheet/expansion state (discriminated union for modal sheets) ──
  const { sheets, open: openSheet, close: closeSheet, toggle: toggleExpansion, setExpansion } = useAssetDetailSheets();
  const {
    fullscreenVisible,
    orderBookExpanded,
    fundamentalsExpanded,
    guideVisible,
    rightsSheetVisible,
    overflowVisible,
    supplySheetVisible,
    marketSectionExpanded,
    diligenceSectionExpanded,
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

  // ── Order book fetch (asset + holdings come from shared cache) ──
  React.useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setOrderBookError(false);
    setOrderBook(null);
    void fetchCoOwnOrderBook(assetId, { limit: 40 })
      .then((book) => { if (!cancelled) setOrderBook(book); })
      .catch(() => { if (!cancelled) setOrderBookError(true); });
    return () => { cancelled = true; };
  }, [assetId]);

  // Poll the order book every 15s so the depth chart and best bid/ask
  // stay fresh without manual refresh.
  React.useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    const intervalId = setInterval(() => {
      if (cancelled) return;
      fetchCoOwnOrderBook(assetId, { limit: 40 })
        .then((book) => { if (!cancelled) setOrderBook(book); })
        .catch(() => undefined);
    }, 15_000);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [assetId]);

  // ── Last distribution fetch — most recent settled distribution for this asset ──
  React.useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    void fetchCoOwnDistributions({ assetId, limit: 1 })
      .then((result) => {
        if (cancelled) return;
        setLastDistribution(result.items[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) return;
        setLastDistribution(null);
      });
    return () => { cancelled = true; };
  }, [assetId]);

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
    if (!assetId) return;
    setOrderBookError(false);
    void fetchCoOwnOrderBook(assetId, { limit: 40 })
      .then(setOrderBook)
      .catch(() => setOrderBookError(true));
  }, [assetId]);

  const retryHoldings = React.useCallback(() => {
    if (!currentUser?.id) return;
    holdingsQuery.refetch();
  }, [holdingsQuery, currentUser?.id]);

  // Pull-to-refresh — reloads asset, order book, and holdings in parallel.
  // Recourse status is fetched by the Due Diligence screen independently.
  const handleRefresh = React.useCallback(() => {
    if (!assetId) return;
    setRefreshing(true);
    void Promise.allSettled([
      assetQuery.refetch(),
      fetchCoOwnOrderBook(assetId, { limit: 40 }),
      currentUser?.id ? holdingsQuery.refetch() : Promise.resolve(),
    ]).then(([_, bookResult]) => {
      if (bookResult.status === 'fulfilled') {
        setOrderBook(bookResult.value as CoOwnOrderBookSnapshot);
        setOrderBookError(false);
      } else {
        setOrderBookError(true);
      }
      setRefreshing(false);
    });
  }, [assetId, assetQuery, holdingsQuery, currentUser?.id]);

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
  const reconciliationActive =
    orderBook != null && orderBook.reconciliationState !== 'reconciled';
  const marketSnapshot = asset.marketSnapshot ?? null;
  const marketSnapshotLabel = marketSnapshot?.asOf
    ? `Snapshot v${marketSnapshot.version} · ${new Date(marketSnapshot.asOf).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })}${dataStale && dataStaleAgeLabel ? ` · stale ${dataStaleAgeLabel}` : ''}`
    : dataStale && dataStaleAgeLabel
      ? `Last update ${dataStaleAgeLabel}`
      : undefined;

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
    navigation.push('ItemDetail', {
      itemId: recItem.id,
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

  // ── Asset dossier summary (spec P1-B §2) ──
  // The chapter summary shows only verified facts and missing critical
  // evidence, so the user can judge completeness at a glance.
  const dossierVerified: string[] = [];
  if (asset.authenticityStatus === 'verified') dossierVerified.push('Authenticated');
  if (asset.custodyInsured) dossierVerified.push('Insured custody');
  if (asset.rights?.version) dossierVerified.push(`Rights v${asset.rights.version}`);
  if (asset.appraisalValueGbp != null) dossierVerified.push('Appraised');
  const dossierMissing: string[] = [];
  if (asset.authenticityStatus !== 'verified') dossierMissing.push('authentication');
  if (hasIncompleteRights) dossierMissing.push('rights');
  if (asset.appraisalValueGbp == null) dossierMissing.push('valuation');
  if (!asset.custodyInsured) dossierMissing.push('insurance');
  const dossierSummary = dossierMissing.length > 0
    ? `${dossierVerified.join(' · ')}${dossierVerified.length > 0 ? ' · ' : ''}${dossierMissing.length} pending`
    : dossierVerified.join(' · ');

  // Document references available on the asset (spec P1-B §2 Documents
  // subsection). Only render the subsection when at least one document
  // URL is published — no empty sections.
  const dossierDocuments: { label: string; url: string; accessibilityLabel: string }[] = [];
  if (asset.escrowTermsUrl) dossierDocuments.push({ label: 'Escrow terms', url: asset.escrowTermsUrl, accessibilityLabel: 'Open escrow terms' });
  if (asset.safeguardingEvidenceUrl) dossierDocuments.push({ label: 'Safeguarding evidence', url: asset.safeguardingEvidenceUrl, accessibilityLabel: 'Open safeguarding evidence' });
  if (asset.safeguardingTermsUrl) dossierDocuments.push({ label: 'Safeguarding terms', url: asset.safeguardingTermsUrl, accessibilityLabel: 'Open safeguarding terms' });
  if (asset.buyerProtectionTermsUrl) dossierDocuments.push({ label: 'Buyer protection terms', url: asset.buyerProtectionTermsUrl, accessibilityLabel: 'Open buyer protection terms' });
  const hasDocuments = dossierDocuments.length > 0;

  // Valuation updated label — spec P1-B §7 language.
  const valuationUpdatedLabel = asset.appraisalValuedAt
    ? `Valuation updated ${new Date(asset.appraisalValuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : null;

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
          heightFraction={isVeryCompact ? 0.5 : isCompact ? 0.54 : 0.58}
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

          {/* Co-Own v2 beta badge — gated by the co_own_v2 feature flag.
              Additive indicator; absent when the flag is off (current behaviour). */}
          {coOwnV2Enabled ? (
            <View style={[styles.coOwnV2Badge, { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder }]}>
              <Ionicons name="diamond-outline" size={12} color={colors.brand} aria-hidden={true} />
              <Text style={[styles.coOwnV2BadgeText, { color: colors.brand }]} maxFontSizeMultiplier={1.3}>Co-Own v2</Text>
            </View>
          ) : null}

          {/* Issuer — shared seller row primitive, configured for
              institutional Co-Own issuers. Taps into issuer profile. */}
          <View style={styles.collectibleIssuerWrap}>
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
            />
          </View>

          {/* One-unit price — the dominant numeric value.
              Spec 14: `1 unit · 1ZE 1.24` */}
          <View style={styles.collectiblePriceRow}>
            <Text
              style={[styles.collectiblePriceValue, { color: colors.textPrimary }]}
              accessibilityRole="text"
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {formatCoOwnIze(marketSnapshot?.lastExecutionPriceGbp ?? asset.unitPriceGbp)}
            </Text>
            <Text style={[styles.collectiblePriceUnit, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
              per unit
            </Text>
          </View>

          {/* Availability + market state — flat factual line.
              Spec 14: `220 available`, `Market open`.
              Avoid "Continuous · Open" — use simple "Market open".
              State escalates only when actionability requires it. */}
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

          {/* Ownership structure — stacked bar showing supply breakdown.
              Your position (brand), other holders (textSecondary), available (surfaceAlt).
              Flat canvas element, no card chrome. Only shown when there is a meaningful
              allocation (not 100% available). */}
          {allocatedPct > 0 && (
            <OwnershipStructureBar
              yourSegmentPct={yourSegmentPct}
              otherHoldersSegmentPct={otherHoldersSegmentPct}
              availableSegmentPct={availableSegmentPct}
              isHolder={isHolder}
              holderCount={asset.holders}
            />
          )}
        </View>

        {/* ════════════════════════════════════════════════════════════
            Viewport 2 — Story, trust, holder position, market details
            ════════════════════════════════════════════════════════════ */}

        {/* ════════════════════════════════════════════════════════════
            Viewer-aware composition (spec P1-B §5)
            Holder: position → gain/loss → rights/distributions → market → trade
            Non-holder: asset → market → thesis/evidence → trade
            ════════════════════════════════════════════════════════════ */}

        {/* ── Holder position — right after identity/market state ──
            Spec P1-B §5: a holder needs position + gain/loss basis
            before market detail. Spec §7 language: "Your position". */}
        {isHolder && yourUnits != null && viewerPct != null ? (
          <HolderPositionSummary
            yourUnits={yourUnits}
            viewerPct={viewerPct}
            avgEntryPriceGbp={avgEntryPriceGbp}
            unrealizedPnlGbp={unrealizedPnlGbp}
            unrealizedPnlPct={unrealizedPnlPct}
          />
        ) : null}

        {/* ── Holder rights/distributions quick summary ──
            Spec P1-B §5: rights/distributions come before market for
            holders. Shows last distribution amount/date when available.
            Taps open the full rights sheet. */}
        {isHolder ? (
          <Pressable
            onPress={() => openSheet('rights')}
            hitSlop={4}
            style={({ pressed }) => [styles.trustFactualLine, pressed && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel={
              lastDistributionAmount != null && lastDistributionDate != null
                ? `Last distribution ${formatCoOwnIze(lastDistributionAmount)} on ${lastDistributionDate}. Review rights.`
                : 'Voting rights and distributions. Review rights.'
            }
          >
            <Text style={[styles.trustFactualText, { color: colors.textSecondary }]} numberOfLines={1}>
              {lastDistributionAmount != null && lastDistributionDate != null
                ? `Last distribution ${formatCoOwnIze(lastDistributionAmount)} · ${lastDistributionDate}`
                : `Voting rights · Next distribution`}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {/* ════════════════════════════════════════════════════════════
            Market details — progressive disclosure. For non-holders this
            comes before thesis/evidence (spec P1-B §5). For holders it
            comes after position/rights. Lower-priority freshness and
            connectivity notices live inside this chapter (spec P1-B §6).
            ════════════════════════════════════════════════════════════ */}
        <CommerceDetailDisclosureRow
          label={marketSectionExpanded ? 'Hide market details' : 'Market details'}
          summary={
            marketSnapshot?.lastExecutionPriceGbp != null
              ? `Last ${formatCoOwnIze(marketSnapshot.lastExecutionPriceGbp)}${spreadGbp != null ? ` · Spread ${formatCoOwnIze(spreadGbp)}` : ''}`
              : 'Price · chart · depth'
          }
          onPress={() => toggleExpansion('marketSection')}
          leadingIcon="trending-up-outline"
          accessibilityLabel="Toggle market details"
        />
        {marketSectionExpanded ? (
        <CommerceDetailSection
          label="Market details"
          variant="continuation"
        >
          {/* Connectivity + freshness notices sit inside the market
              chapter, not stacked above media (spec P1-B §6).
              Connectivity only matters when it prevents fresh
              execution; staleness only when it affects action. */}
          <CommerceDetailOfflineBanner isOffline={isOffline} />
          <CommerceDetailFreshnessBanner
            isRefreshing={refreshing}
            isStale={dataStale && !refreshing}
            onRetry={handleRefresh}
          />

          {/* Last settled / reference price */}
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
                  <Text style={[styles.marketStatusText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>
                    {reconciliationActive ? 'Trading paused · settling' : asset.isOpen ? 'Market open' : 'Market closed'}
                  </Text>
                  {dataStale && dataStaleAgeLabel && (
                    <Text style={[styles.marketStatusStale, { color: colors.warning }]}>Stale {dataStaleAgeLabel}</Text>
                  )}
                </View>
                <Text style={[styles.marketStatusRights, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
                  {orderBookError
                    ? 'Depth unavailable'
                    : `Spread ${spreadGbp != null ? formatCoOwnIze(spreadGbp) : 'Not available'}`}
                </Text>
              </View>
            }
          >
          <Pressable
            style={({ pressed }) => [
              styles.allocationIndicatorRow,
              { borderTopColor: colors.border },
              pressed && { opacity: 0.6 },
            ]}
            onPress={() => openSheet('supply')}
            accessibilityRole="button"
            accessibilityLabel={`Supply details · ${allocatedPct}% allocated, ${availableUnits} units available`}
          >
            <View style={[styles.allocationBar, { backgroundColor: colors.surfaceAlt, flex: 1 }]}>
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
            <Text style={[styles.allocationIndicatorText, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              {allocatedPct}% allocated · {availableUnits} units available
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </Pressable>
          </CommerceDetailTransactionSurface>

          {holdingsError ? (
            <CommerceDetailUnavailableInline
              title="Position unavailable"
              body="We could not verify your settled units. Trading is disabled until this refreshes."
              onRetry={retryHoldings}
            />
          ) : null}

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

          {/* Valuation — NAV comparison */}
          <CommerceDetailDisclosureRow
            label={fundamentalsExpanded ? 'Hide valuation' : 'Valuation'}
            summary={
              navPerUnitGbp != null
                ? `${formatFromFiat(navPerUnitGbp, currencyCode)} NAV / unit`
                : 'Reporting'
            }
            onPress={() => toggleExpansion('fundamentals')}
            leadingIcon="analytics-outline"
          />
          {fundamentalsExpanded ? (
            <FundamentalsSection
              referenceVsNavPct={referenceVsNavPct}
              navPerUnitLabel={navPerUnitGbp != null ? formatFromFiat(navPerUnitGbp, currencyCode) : 'Not available'}
              appraisalValuedAt={asset.appraisalValuedAt}
            />
          ) : null}

          {/* Market summary — best bid/ask. Tabular numerals, aligned
              values, restrained colour (no green/red pill per row).
              Spec P1-B §4. */}
          {orderBookError ? (
            <CommerceDetailUnavailableInline
              title="Live market unavailable"
              body="Bid and ask depth could not be loaded."
              onRetry={retryOrderBook}
            />
          ) : (
            <MarketBookRow bestBid={bestBid} bestAsk={bestAsk} />
          )}

          {/* Bids & asks — order book depth disclosure.
              State legend on first use (spec P1-B §4): explains the
              bid/ask colour coding so the depth table is legible. */}
          {!orderBookError && orderBook ? (
            <>
              <CommerceDetailDisclosureRow
                label={orderBookExpanded ? 'Hide bids & asks' : 'Bids & asks'}
                summary={`${orderBook.bids.length + orderBook.asks.length} offers`}
                onPress={() => toggleExpansion('orderBook')}
                leadingIcon="bar-chart-outline"
              />
              {orderBookExpanded ? (
                <>
                  {/* State legend — bid (buy) / ask (sell) colour key.
                      Restrained semantic dots, no coloured pill per row. */}
                  <View style={styles.marketLegendRow}>
                    <View style={styles.marketLegendItem}>
                      <View style={[styles.marketLegendDot, { backgroundColor: colors.coownUp }]} />
                      <Text style={[styles.marketLegendText, { color: colors.textMuted }]}>Bid (buy)</Text>
                    </View>
                    <View style={styles.marketLegendItem}>
                      <View style={[styles.marketLegendDot, { backgroundColor: colors.coownDown }]} />
                      <Text style={[styles.marketLegendText, { color: colors.textMuted }]}>Ask (sell)</Text>
                    </View>
                  </View>
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
                </>
              ) : null}
            </>
          ) : null}

          {/* Price alert — direct access from Market details */}
          <CommerceDetailDisclosureRow
            label="Price alert"
            summary="Get notified at a target price"
            onPress={openPriceAlert}
            leadingIcon="notifications-outline"
            accessibilityLabel="Create price alert"
          />
        </CommerceDetailSection>
        ) : null}

        {/* ── Thesis / evidence (non-holder) or context (holder) ──
            Non-holder: asset story + trust facts come AFTER market
            (spec P1-B §5: asset → market → thesis/evidence → trade).
            Holder: same content, placed after market as quiet context. */}

        {/* Short asset story — quiet editorial paragraph */}
        {asset.provenance ? (
          <View style={styles.assetStoryWrap}>
            <Text
              style={[styles.assetStoryText, { color: colors.textSecondary }]}
              numberOfLines={3}
              maxFontSizeMultiplier={2}
            >
              {asset.provenance}
            </Text>
            <Pressable
              onPress={() => navigation.navigate('AssetDueDiligence', { assetId: asset.id })}
              hitSlop={8}
              style={({ pressed }) => [styles.assetStoryLink, pressed && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel="Read full asset story"
            >
              <Text style={[styles.assetStoryLinkText, { color: colors.brand }]}>
                Read the full story
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.brand} />
            </Pressable>
          </View>
        ) : null}

        {/* Trust — flat factual line tapping into the dossier. */}
        {(() => {
          const trustFacts: string[] = [];
          if (asset.authenticityStatus === 'verified') {
            trustFacts.push('Authenticated');
          }
          if (asset.custodyInsured) {
            trustFacts.push('Insured custody');
          }
          if (asset.rights?.version) {
            trustFacts.push(`Rights v${asset.rights.version}`);
          }
          if (trustFacts.length === 0) return null;
          return (
            <Pressable
              onPress={() => setExpansion('diligenceSection', true)}
              hitSlop={4}
              style={({ pressed }) => [styles.trustFactualLine, pressed && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel={`Trust facts: ${trustFacts.join(', ')}. View asset dossier.`}
            >
              <Text style={[styles.trustFactualText, { color: colors.textSecondary }]}>
                {trustFacts.join(' · ')}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </Pressable>
          );
        })()}

        {/* ════════════════════════════════════════════════════════════
            Asset dossier — ONE consolidated chapter (spec P1-B §2).
            Subsections: Ownership & rights, Valuation, Documents,
            Custody / storage, Insurance, Governance / voting,
            Distributions, Risks, Audit trail. Summary shows verified
            facts + missing critical evidence. Dead capability rows
            (buyout) are omitted — no "Not available" module shown to
            every viewer regardless of relevance (spec P1-B §3).
            ════════════════════════════════════════════════════════════ */}
        <CommerceDetailDisclosureRow
          label={diligenceSectionExpanded ? 'Hide asset dossier' : 'Asset dossier'}
          summary={dossierSummary || undefined}
          onPress={() => toggleExpansion('diligenceSection')}
          leadingIcon="document-text-outline"
          accessibilityLabel="Toggle asset dossier"
        />
        {diligenceSectionExpanded ? (
        <CommerceDetailSection
          label="Asset dossier"
          variant="continuation"
        >
          {/* Stale market mark — inside the relevant chapter (spec P1-B
              §6: lower-priority notices sit inside the relevant chapter). */}
          {asset.staleMarkDays != null && asset.staleMarkDays > 7 && (
            <CommerceDetailMetricRow
              label="Market activity"
              value={`Pricing may be stale · ${asset.staleMarkDays}d since last market event`}
              muted
            />
          )}

          {/* ── Ownership & rights ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Ownership & rights
            </Text>
          </View>
          <CommerceDetailMetricRow
            label="Rights version"
            value={asset.rights?.version ? `v${asset.rights.version}` : 'Not published'}
            muted={!asset.rights?.version}
          />
          <CommerceDetailMetricRow
            label="Transferable"
            value={asset.rights ? (asset.rights.transferable ? 'Yes' : 'No') : 'To be confirmed'}
            muted={!asset.rights}
          />
          <CommerceDetailDisclosureRow
            label="Rights"
            count={CANONICAL_RIGHTS_LABELS.length}
            summary={hasIncompleteRights ? 'Pending' : undefined}
            onPress={() => openSheet('rights')}
            leadingIcon="document-text-outline"
            accessibilityLabel="Review rights"
          />

          {/* ── Valuation ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Valuation
            </Text>
          </View>
          <CommerceDetailMetricRow
            label="NAV / unit"
            value={navPerUnitGbp != null ? formatFromFiat(navPerUnitGbp, currencyCode) : 'Not available'}
            muted={navPerUnitGbp == null}
          />
          <CommerceDetailMetricRow
            label="Reference vs NAV"
            value={referenceVsNavPct != null
              ? `${referenceVsNavPct >= 0 ? '+' : ''}${referenceVsNavPct.toFixed(1)}%`
              : 'Not available'}
            muted={referenceVsNavPct == null}
          />
          <CommerceDetailMetricRow
            label="Appraisal"
            value={asset.appraisalValueGbp != null ? formatFromFiat(asset.appraisalValueGbp, currencyCode) : 'Not available'}
            muted={asset.appraisalValueGbp == null}
          />
          <CommerceDetailMetricRow
            label={valuationUpdatedLabel ?? 'Valuation updated'}
            value={asset.appraisalValuer ?? 'Independent appraisal'}
            muted={!asset.appraisalValuer}
          />

          {/* ── Documents ──
              Only rendered when at least one document URL is published
              (spec P1-B §2). No empty subsections. */}
          {hasDocuments ? (
            <View style={styles.dossierSubHeader}>
              <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
                Documents
              </Text>
            </View>
          ) : null}
          {hasDocuments
            ? dossierDocuments.map((doc) => (
                <CommerceDetailDisclosureRow
                  key={doc.label}
                  label={doc.label}
                  onPress={() => { void Linking.openURL(doc.url); }}
                  leadingIcon="document-text-outline"
                  accessibilityLabel={doc.accessibilityLabel}
                />
              ))
            : null}

          {/* ── Custody / storage ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Custody / storage
            </Text>
          </View>
          <CommerceDetailMetricRow
            label="Custodian"
            value={asset.custodianName ?? 'Not disclosed'}
            muted={!asset.custodianName}
          />
          <CommerceDetailMetricRow
            label="Location"
            value={asset.custodianLocation ?? 'Not disclosed'}
            muted={!asset.custodianLocation}
          />

          {/* ── Insurance ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Insurance
            </Text>
          </View>
          <CommerceDetailMetricRow
            label="Insured"
            value={asset.custodyInsured ? 'Yes' : 'Not insured'}
            muted={!asset.custodyInsured}
          />
          {asset.custodyPolicyRef ? (
            <CommerceDetailMetricRow label="Policy ref" value={asset.custodyPolicyRef} />
          ) : null}

          {/* ── Governance / voting ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Governance / voting
            </Text>
          </View>
          <CommerceDetailMetricRow
            label="Voting rights"
            value={asset.rights?.votingRights ?? 'To be confirmed'}
            muted={!asset.rights?.votingRights}
          />
          <CommerceDetailMetricRow
            label="Exit & proceeds"
            value={asset.rights?.exitRights ?? 'To be confirmed'}
            muted={!asset.rights?.exitRights}
          />

          {/* ── Distributions ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Distributions
            </Text>
          </View>
          <CommerceDetailMetricRow
            label="Next distribution"
            value={asset.rights?.economicRights ?? 'Not scheduled'}
            muted={!asset.rights?.economicRights}
          />
          {/* Last distribution — shows actual settled distribution data when available */}
          {lastDistribution != null && lastDistributionAmount != null ? (
            <>
              <CommerceDetailMetricRow
                label="Last distribution"
                value={formatCoOwnIze(lastDistributionAmount)}
              />
              {lastDistributionDate != null && (
                <CommerceDetailMetricRow
                  label="Last distribution date"
                  value={lastDistributionDate}
                />
              )}
              {lastDistributionPerUnit != null && (
                <CommerceDetailMetricRow
                  label="Per unit"
                  value={formatCoOwnIze(lastDistributionPerUnit)}
                />
              )}
              {lastDistribution.distributionType && (
                <CommerceDetailMetricRow
                  label="Type"
                  value={lastDistribution.distributionType}
                  muted
                />
              )}
              <Pressable
                onPress={() => navigation.navigate('DistributionHistory', { assetId: asset.id })}
                hitSlop={8}
                style={({ pressed }) => [styles.assetStoryLink, pressed && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel="View full distribution history"
              >
                <Text style={[styles.assetStoryLinkText, { color: colors.brand }]}>
                  Distribution history
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.brand} />
              </Pressable>
            </>
          ) : null}

          {/* ── Risks ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Risks
            </Text>
          </View>
          <CommerceDetailDisclosureRow
            label="Risk disclosure"
            onPress={() => openSheet('riskDisclosure')}
            leadingIcon="warning-outline"
            accessibilityLabel="View risks"
          />

          {/* ── Audit trail ──
              One disclosure into the full due-diligence surface
              (provenance · authentication · audit). No duplicate
              disclosure wrappers (spec P1-B §2). */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Audit trail
            </Text>
          </View>
          <CommerceDetailDisclosureRow
            label="Full due diligence"
            summary="Provenance · authentication · audit"
            onPress={() => navigation.navigate('AssetDueDiligence', { assetId: asset.id })}
            leadingIcon="document-text-outline"
            accessibilityLabel="View full due diligence"
          />
        </CommerceDetailSection>
        ) : null}

        {seenInLooksSection && seenInLooksSection.items.length > 0 && (
          <View style={styles.recommendationSection}>
            <RecommendationRail
              section={seenInLooksSection}
              listingId={asset.listingId}
              onPressItem={(recItem, sectionKey, position, reasonCode, personalised) => {
                if (isRecommendationLook(recItem)) {
                  handlePressLook(recItem);
                } else {
                  handlePressRecommendation(recItem as unknown as RecommendationItem, sectionKey, position, reasonCode, personalised);
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
          openPriceAlert();
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
  familyBadgeOverlay: {
    alignSelf: 'flex-start',
  },
  // ── Issuer identity extension ──
  identityExtension: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // ── Collectible-first identity (Viewport 1, spec 14 V3) ──
  // No card surface — clean canvas with a hairline separator below.
  // Spacing is deliberate: CommerceDetailIdentity handles eyebrow +
  // title, issuer row gets breathing room, price and availability
  // are factual lines.
  collectibleIdentity: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collectibleIssuerWrap: {
    marginTop: Space.md,
  },
  // Co-Own v2 beta badge — additive indicator gated by the co_own_v2 flag.
  coOwnV2Badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
    alignSelf: 'flex-start',
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xxs + 1,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Space.sm,
  },
  coOwnV2BadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
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
  // ── Trust factual line (spec 14 V3: flat, one tap target) ──
  trustFactualLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  trustFactualText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  // ── Asset story — quiet editorial paragraph before market data ──
  assetStoryWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
    gap: Space.xs,
  },
  assetStoryText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  assetStoryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: Space.xs,
    minHeight: Control.hit,
  },
  assetStoryLinkText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Elevated trust strip (near trade decision point) ──
  coOwnTrustStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.md,
  },
  coOwnTrustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  // Trust chip text uses captionElevated for quiet, professional readability.
  coOwnTrustChipText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
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
  // Status dot — 8pt, RadiusRoleValue.compactControl, semantic color only.
  marketStatusDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: RadiusRoleValue.compactControl,
  },
  // Status text — captionElevated (13/18/400) for quiet readability.
  marketStatusText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // Stale indicator — warning color, captionElevated.
  marketStatusStale: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // Rights/spread indicator — captionElevated for quiet metadata.
  marketStatusRights: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Allocation indicator (Layer 1 compact) ──
  allocationIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.lg,
    paddingTop: Space.lg,
  },
  allocationIndicatorText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
    flexShrink: 1,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
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
  // ── Viewer position header — calm, professional ownership display ──
  viewerPositionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.md,
    marginBottom: Space.lg,
  },
  viewerPositionCopy: {
    gap: Space.xs,
    flexShrink: 1,
  },
  viewerPositionValue: {
    fontSize: Numeric.priceList.size,
    lineHeight: Numeric.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: Numeric.priceList.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    flexShrink: 1,
  },
  viewerPositionMarketValue: {
    fontSize: Numeric.priceLarge.size,
    lineHeight: Numeric.priceLarge.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: Numeric.priceLarge.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // Position meta — captionElevated for quiet, professional labels.
  viewerPositionMeta: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Allocation bar (used in Layer 1 compact indicator) ──
  allocationBar: {
    height: Space.sm,
    borderRadius: RadiusRoleValue.pillAvatar,
    overflow: 'hidden',
  },
  allocationFill: {
    height: '100%',
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  // ── Dock state badge — calm, professional status ──
  // Uses bodyEmphasis (15/21/600) for clear hierarchy in the dock.
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
  // ── Asset dossier subsection headers (spec P1-B §2) ──
  // Quiet muted label with a hairline separator above, so each
  // subsection (Ownership & rights, Valuation, Custody, etc.) reads
  // as a distinct group without its own card surface.
  dossierSubHeader: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.md,
    paddingTop: Space.md,
  },
  dossierSubHeaderText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  // ── Market state legend (spec P1-B §4) ──
  // Clear bid/ask colour key on first use of the depth table.
  // Restrained semantic dots, no coloured pill per row.
  marketLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.xs,
  },
  marketLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  marketLegendDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  marketLegendText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
