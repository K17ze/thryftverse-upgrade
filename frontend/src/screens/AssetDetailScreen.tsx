import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, useWindowDimensions, Modal, TextInput, Image } from 'react-native';
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
import { Space, FontFamily, DockConstants, Stroke, Control, LetterSpacing, Numeric } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import {
  fetchCoOwnOrderBook,
  type CoOwnOrderBookSnapshot,
  type MarketCoOwnAsset,
  type MarketCoOwnHolding,
  createCoOwnPriceAlert,
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
  CommerceDetailTransactionSurface,
  CommerceDetailMetricRow,
  CommerceDetailDisclosureRow,
  CommerceDetailSection,
  CommerceDetailUnavailableInline,
  CommerceDetailStateDock,
  CommerceDetailMediaRail,
  CommerceDetailOfflineBanner,
  CommerceDetailFreshnessBanner,
  COMMERCE_DETAIL_COMPACT_WIDTH,
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
  CANONICAL_RIGHTS_LABELS,
  type CoOwnRightsRow,
  type CoOwnCandleRange,
} from '../components/coown';
import { AppButton } from '../components/ui/AppButton';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';

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
  const reducedMotion = useReducedMotion();
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

  const handlePressRecommendation = (recItem: RecommendationItem) => {
    navigation.push('ItemDetail', { itemId: recItem.id });
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
          onSave={social.openCollectionPicker}
          onToggleFav={social.toggleLike}
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
              onPress: social.openCollectionPicker,
              isActive: social.isSavedToCollection,
            },
          ]}
          onOverflow={() => setOverflowVisible(true)}
          showOverflow
        />

        {/* ════════════════════════════════════════════════════════════
            Viewport 1 — Collectible-first identity on clean canvas
            Spec 14 V3: title, one context line, issuer, one-unit
            price, availability, and market state live BELOW media on
            clean canvas — not overlaid on photography. No Co-Own
            family badge (redundant inside Co-Own). No card surface.
            ════════════════════════════════════════════════════════════ */}
        <View style={[styles.collectibleIdentity, { borderBottomColor: colors.borderSubtle }]}>
          {/* Title group — eyebrow + title tightly paired so the legal
              vehicle reads as a caption to the asset name, not as a
              separate section. */}
          <View style={styles.collectibleTitleGroup}>
            {asset.legalVehicleName ? (
              <Text
                style={[styles.collectibleEyebrow, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {asset.legalVehicleName}
              </Text>
            ) : null}

            {/* Asset title — the dominant text object under media */}
            <Text
              style={[styles.collectibleTitle, { color: colors.textPrimary }]}
              numberOfLines={2}
              accessibilityRole="header"
            >
              {asset.title}
            </Text>
          </View>

          {/* Issuer — compact row with avatar, name, verification,
              and message action. Taps into issuer profile. */}
          <View style={styles.collectibleIssuerRow}>
            <Pressable
              onPress={() => openProfile(navigation, asset.issuerId, currentUser?.id)}
              style={({ pressed }) => [styles.collectibleIssuerTarget, pressed && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel={`Issuer ${issuerUsername}`}
            >
              <View style={[styles.collectibleIssuerAvatar, { backgroundColor: colors.surfaceAlt }]}>
                {asset.issuer?.avatar ? (
                  <Image
                    source={{ uri: asset.issuer.avatar }}
                    style={styles.collectibleIssuerAvatarImg}
                  />
                ) : (
                  <Ionicons name="business-outline" size={16} color={colors.textSecondary} />
                )}
              </View>
              <View style={styles.collectibleIssuerCopy}>
                <Text
                  style={[styles.collectibleIssuerName, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {issuerUsername}
                </Text>
                {(asset.issuerVerification?.tier === 'id' || asset.issuerVerification?.tier === 'seller') ? (
                  <View style={styles.collectibleIssuerVerified}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={[styles.collectibleIssuerVerifiedText, { color: colors.textSecondary }]}>
                      {asset.issuerVerification?.tier === 'seller' ? 'Trusted Seller' : 'ID Verified'}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
            {canMessageIssuer ? (
              <Pressable
                onPress={async () => {
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
                    show('Unable to open conversation. Try again.', 'error');
                  } finally {
                    setIsResolvingConversation(false);
                  }
                }}
                hitSlop={8}
                style={({ pressed }) => [styles.collectibleMessageTarget, pressed && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel={`Message ${issuerUsername}`}
              >
                <Ionicons name="chatbubble-outline" size={20} color={colors.brand} />
              </Pressable>
            ) : null}
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
            >
              {formatCoOwnIze(marketSnapshot?.lastExecutionPriceGbp ?? asset.unitPriceGbp)}
            </Text>
            <Text style={[styles.collectiblePriceUnit, { color: colors.textSecondary }]}>
              per unit
            </Text>
          </View>

          {/* Availability + market state — flat factual line.
              Spec 14: `220 available`, `Market open`.
              Avoid "Continuous · Open" — use simple "Market open".
              State escalates only when actionability requires it. */}
          <View style={styles.collectibleAvailabilityRow}>
            <Text style={[styles.collectibleAvailabilityText, { color: colors.textSecondary }]}>
              {availableUnits} available
            </Text>
            <View style={[styles.collectibleAvailabilityDot, {
              backgroundColor: reconciliationActive
                ? colors.warning
                : asset.isOpen
                  ? colors.success
                  : colors.textMuted,
            }]} />
            <Text style={[styles.collectibleAvailabilityText, { color: colors.textSecondary }]}>
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
        </View>

        {/* ════════════════════════════════════════════════════════════
            Viewport 2 — Story, trust, holder position, market details
            ════════════════════════════════════════════════════════════ */}

        {/* Short asset story — quiet editorial paragraph */}
        {asset.provenance ? (
          <View style={styles.assetStoryWrap}>
            <Text
              style={[styles.assetStoryText, { color: colors.textSecondary }]}
              numberOfLines={3}
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

        {/* Trust — flat factual line tapping into Due Diligence.
            Spec 14 V3: `Authenticated · Insured custody · Rights v2`.
            No trust score, no chip icons. One line, one tap target. */}
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
              onPress={() => navigation.navigate('AssetDueDiligence', { assetId: asset.id })}
              hitSlop={4}
              style={({ pressed }) => [styles.trustFactualLine, pressed && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel={`Trust facts: ${trustFacts.join(', ')}. View due diligence.`}
            >
              <Text style={[styles.trustFactualText, { color: colors.textSecondary }]}>
                {trustFacts.join(' · ')}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </Pressable>
          );
        })()}

        {/* Holder position — quiet summary.
            Spec 14 V3: `You own 12 units · 3.4%`.
            More detail lives in Portfolio, not here. */}
        {isHolder && yourUnits != null && viewerPct != null ? (
          <View style={styles.holderPositionSummary}>
            <Text style={[styles.holderPositionText, { color: colors.textSecondary }]}>
              You own {yourUnits} units · {viewerPct.toFixed(1)}%
            </Text>
          </View>
        ) : null}

        {/* ════════════════════════════════════════════════════════════
            Market details — deferred microstructure
            Spec 14 V3: last settled price, bid/ask, spread, depth,
            chart, volume, NAV comparison, price alert. This is NOT
            in the first viewport.
            ════════════════════════════════════════════════════════════ */}
        <CommerceDetailSection
          label="Market details"
          divider
          variant="editorial"
        >
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
                  <Text style={[styles.marketStatusText, { color: colors.textPrimary }]}>
                    {reconciliationActive ? 'Orders paused · settling' : asset.isOpen ? 'Market open' : 'Closed'}
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
          <Pressable
            style={({ pressed }) => [
              styles.allocationIndicatorRow,
              { borderTopColor: colors.border },
              pressed && { opacity: 0.6 },
            ]}
            onPress={() => setSupplySheetVisible(true)}
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
            <Text style={[styles.allocationIndicatorText, { color: colors.textSecondary }]} numberOfLines={1}>
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
                ? `${formatFromFiat(navPerUnitGbp, 'GBP')} NAV / unit`
                : 'Reporting'
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

          {/* Market summary — best bid/ask/spread */}
          {orderBookError ? (
            <CommerceDetailUnavailableInline
              title="Live market unavailable"
              body="Bid and ask depth could not be loaded."
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

          {/* Bids & asks — order book depth disclosure */}
          {!orderBookError && orderBook ? (
            <>
              <CommerceDetailDisclosureRow
                label={orderBookExpanded ? 'Hide bids & asks' : 'Bids & asks'}
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

          {/* Price alert — direct access from Market details */}
          <CommerceDetailDisclosureRow
            label="Price alert"
            summary="Get notified at a target price"
            onPress={() => setPriceAlertVisible(true)}
            leadingIcon="notifications-outline"
            accessibilityLabel="Create price alert"
          />
        </CommerceDetailSection>

        <CommerceDetailSection label="Due diligence" divider variant="editorial">
          {/* Stale market mark — show when no public market events have
              been logged in >7 days. Fail closed (omit when null). */}
          {asset.staleMarkDays != null && asset.staleMarkDays > 7 && (
            <CommerceDetailMetricRow
              label="Market activity"
              value={`Pricing may be stale · ${asset.staleMarkDays}d since last market event`}
            />
          )}
          <CommerceDetailDisclosureRow
            label="Due diligence"
            summary="Provenance · authentication · custody · valuation · rights · risks · audit"
            onPress={() => navigation.navigate('AssetDueDiligence', { assetId: asset.id })}
            leadingIcon="document-text-outline"
            accessibilityLabel="View due diligence"
          />
          {/* Rights — kept accessible on the main screen for trading-blocked
              states (rights incomplete). The full 13-row sheet opens here. */}
          <CommerceDetailDisclosureRow
            label="Rights"
            count={CANONICAL_RIGHTS_LABELS.length}
            summary={asset.rights?.version ? formatRightsVersion(`v${asset.rights.version}`) : undefined}
            onPress={() => setRightsSheetVisible(true)}
            leadingIcon="document-text-outline"
          />
          {/* Risks — quick access to the risk disclosure sheet. Full
              risk detail also lives in the Due Diligence screen. */}
          <CommerceDetailDisclosureRow
            label="Risks"
            onPress={() => setRiskDisclosureVisible(true)}
            leadingIcon="warning-outline"
            accessibilityLabel="View risks"
          />
        </CommerceDetailSection>

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
        <View style={priceAlertStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPriceAlertVisible(false)} />
          <View style={[priceAlertStyles.sheet, { backgroundColor: colors.surface }]}>
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
                      color={isSelected ? colors.textInverse : colors.textSecondary}
                    />
                    <Text style={[priceAlertStyles.conditionText, { color: isSelected ? colors.textInverse : colors.textSecondary }]}>
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
          </View>
        </View>
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
  identityExtension: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // ── Collectible-first identity (Viewport 1, spec 14 V3) ──
  // No card surface — clean canvas with a hairline separator below.
  // Spacing is deliberate: title group is tight, issuer and price
  // get breathing room, availability is a footnote to price.
  collectibleIdentity: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collectibleTitleGroup: {
    gap: Space.xs,
  },
  collectibleEyebrow: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  collectibleTitle: {
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
  },
  collectibleIssuerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.md,
  },
  collectibleIssuerTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit,
    flexShrink: 1,
  },
  collectibleIssuerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectibleIssuerAvatarImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  collectibleIssuerCopy: {
    flexShrink: 1,
    gap: 1,
  },
  collectibleIssuerName: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  collectibleIssuerVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectibleIssuerVerifiedText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  collectibleMessageTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 4,
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
  // ── Holder position summary (spec 14 V3: quiet) ──
  holderPositionSummary: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
  },
  holderPositionText: {
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
  // ── Market book row (bid/ask inside transaction surface) ──
  marketBookRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.lg,
    paddingTop: Space.lg,
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
  marketBookSide: {
    flex: 1,
    gap: Space.xs,
  },
  marketBookDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: Space.sm,
  },
  // Market book labels — captionElevated for quiet hierarchy.
  marketBookLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // Market book values — Numeric.priceList (20/24/700) with tabular-nums.
  marketBookValue: {
    fontSize: Numeric.priceList.size,
    lineHeight: Numeric.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: Numeric.priceList.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // ── Fundamentals — stacked layout ──
  fundamentalsStacked: {
    marginTop: Space.lg,
    paddingTop: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Space.md,
  },
  fundamentalsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  // Fundamentals label — captionElevated for quiet hierarchy.
  fundamentalsLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    flexShrink: 0,
  },
  // Fundamentals value — bodyEmphasis (15/21/600) with tabular-nums.
  fundamentalsValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    textAlign: 'right',
    flexShrink: 1,
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
});

const priceAlertStyles = StyleSheet.create({
  // ── Price alert sheet — calm, professional modal ──
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: RadiusRoleValue.standalonePanel,
    borderTopRightRadius: RadiusRoleValue.standalonePanel,
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
    width: Control.hit,
    height: Control.hit,
    borderRadius: RadiusRoleValue.pillAvatar,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    marginBottom: Space.xs - 2,
  },
  // Sheet subtitle — captionElevated for quiet, professional explanation.
  sheetSubtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
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
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.standard,
  },
  // Condition text uses body (14/20/400) for clear readability.
  conditionText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  // Input label — captionElevated for quiet hierarchy.
  inputLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginBottom: Space.xs,
  },
  // Price input — tabular-nums for stable numeric entry.
  input: {
    borderWidth: Stroke.standard,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
    marginBottom: Space.lg,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
  },
});
