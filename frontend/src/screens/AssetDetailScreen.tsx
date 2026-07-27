import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions, Modal } from 'react-native';
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
  FadeInDown,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Space, Type, Typography, DockConstants } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { fetchCoOwnAssetById, fetchCoOwnOrderBook, fetchCoOwnHoldings } from '../services/marketApi';
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
} from '../components/commerce/detail';
import { ProductFamilyBadge, RecommendationRail, FullscreenMediaViewer } from '../components/product';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
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
  CoOwnRiskDisclosure,
  CoOwnAssetDetailSkeleton,
  CoOwnStateCanvas,
  CoOwnPriceChart,
  CoOwnFirstTradeGuide,
  CoOwnAssetDossier,
  CoOwnRightsSheet,
  CoOwnOrderBook,
  CoOwnCandleChart,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
  CoOwnSupplySheet,
  CoOwnOverflowSheet,
  CANONICAL_RIGHTS_LABELS,
  type CoOwnRightsRow,
  type CoOwnBookLevel,
  type CoOwnCandleRange,
} from '../components/coown';
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
  const reducedMotionEnabled = useReducedMotion();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 390;
  const isVeryCompact = screenWidth < 340;
  const isTablet = screenWidth >= 768;
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const isCoOwnWatched = useStore((state) => state.isCoOwnWatched);
  const toggleCoOwnWatch = useStore((state) => state.toggleCoOwnWatch);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();

  const assetId = route.params?.assetId;

  const [asset, setAsset] = React.useState<any>(null);
  const [orderBook, setOrderBook] = React.useState<{ bids: any[]; asks: any[] }>({ bids: [], asks: [] });
  const [yourUnits, setYourUnits] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [isResolvingConversation, setIsResolvingConversation] = React.useState(false);
  const [fullscreenIndex, setFullscreenIndex] = React.useState(0);
  const [fullscreenVisible, setFullscreenVisible] = React.useState(false);
  const [orderBookExpanded, setOrderBookExpanded] = React.useState(false);
  const [guideVisible, setGuideVisible] = React.useState(false);
  const [pendingTradeSide, setPendingTradeSide] = React.useState<'buy' | 'sell' | null>(null);
  const [rightsSheetVisible, setRightsSheetVisible] = React.useState(false);
  const [overflowVisible, setOverflowVisible] = React.useState(false);
  const [supplySheetVisible, setSupplySheetVisible] = React.useState(false);
  const [candleRange, setCandleRange] = React.useState<CoOwnCandleRange>('1W');
  const [showVolume, setShowVolume] = React.useState(false);
  const [dataLoadedAt, setDataLoadedAt] = React.useState<number | null>(null);
  // Per spec 03_COOWN §5: dossier collapsed by default.
  const [dossierExpanded, setDossierExpanded] = React.useState(false);
  // Per spec 03_COOWN §8: risk disclosure collapsed by default, opens
  // in a modal sheet via "View risk disclosure" disclosure row.
  const [riskDisclosureVisible, setRiskDisclosureVisible] = React.useState(false);

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

    Promise.all([
      fetchCoOwnAssetById(assetId),
      fetchCoOwnOrderBook(assetId, { limit: 40 }).catch(() => ({ bids: [], asks: [] })),
      currentUser?.id ? fetchCoOwnHoldings(currentUser.id).catch(() => []) : Promise.resolve([]),
    ])
      .then(([fetchedAsset, fetchedBook, holdings]) => {
        if (cancelled) return;
        setAsset(fetchedAsset);
        setOrderBook(fetchedBook);
        setDataLoadedAt(Date.now());
        const holding = holdings.find((h) => h.assetId === assetId);
        setYourUnits(holding?.unitsOwned ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load asset');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [assetId, currentUser?.id, show]);

  // ── Hooks must run before conditional returns (Rules of Hooks) ──

  // Market-data staleness computation (spec 07 §1.4)
  const STALENESS_THRESHOLD_SECONDS = 24 * 60 * 60;
  const { dataStale, dataStaleAgeLabel } = React.useMemo(() => {
    if (!asset || !dataLoadedAt) return { dataStale: false, dataStaleAgeLabel: undefined };
    const sourceTimestamp = asset.updatedAt ? new Date(asset.updatedAt).getTime() : dataLoadedAt;
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

  const viewModel = React.useMemo(() => {
    if (!asset) return null;
    return buildCoOwnViewModel({
      asset,
      viewerUnits: yourUnits,
      orderBook,
      currentUserId: currentUser?.id,
    });
  }, [asset, yourUnits, orderBook, currentUser?.id]);

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

  const isIssuer = currentUser?.id === asset.issuerId;
  const isHolder = yourUnits > 0;
  const isWatched = isCoOwnWatched(asset.id);
  const issuerUsername = issuerTrust?.username || 'Issuer';
  const canMessageIssuer = currentUser?.id !== asset.issuerId;

  const availableUnits = Math.max(0, asset.availableUnits);
  const totalUnits = asset.totalUnits;
  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;
  const viewerPct = totalUnits > 0 ? Math.round((yourUnits / totalUnits) * 100 * 10) / 10 : 0;
  const feePct = Math.round(CO_OWN_FEE_RATE * 100);

  const bestBid = orderBook.bids.length > 0 ? orderBook.bids[0] : null;
  const bestAsk = orderBook.asks.length > 0 ? orderBook.asks[0] : null;
  const spreadGbp = bestBid?.unitPriceGbp != null && bestAsk?.unitPriceGbp != null
    ? Math.max(0, bestAsk.unitPriceGbp - bestBid.unitPriceGbp)
    : null;

  // ── Market snapshot ──
  // Per spec 03_COOWN §2: backend-backed market snapshot. The frontend
  // must not label reference price as "Last trade" without settled-
  // execution proof. marketSnapshot is null until the backend exposes
  // lastExecutionPriceGbp.
  const marketSnapshot = (asset as any).marketSnapshot ?? null;

  // ── Candle data gating ──
  // Per spec 03_COOWN §4: only expose the candle toggle when real OHLC
  // candles exist. Do not pass an empty candle component.
  const candleData: any[] = (asset as any).candles ?? [];
  const hasCandleData = candleData.length > 0;

  const images = asset.imageUrl ? [asset.imageUrl] : [];

  const recommendationSections = recommendationsData?.sections ?? [];
  const railSections = recommendationSections.filter(
    (s) => s.key !== 'seen_in_looks' && s.key !== 'continue_exploring'
  );
  const seenInLooksSection = recommendationSections.find((s) => s.key === 'seen_in_looks');

  const handlePressRecommendation = (recItem: RecommendationItem) => {
    navigation.push('ItemDetail', { itemId: recItem.id });
  };
  const handlePressLook = (lookItem: RecommendationLook) => {
    navigation.navigate('LookDetail', { lookId: lookItem.id });
  };

  const familyStateAccent = !asset.isOpen ? 'Closed' : availableUnits <= 0 ? 'Unavailable' : 'Open';

  // Compute scroll bottom padding from dock geometry + safe area.
  const isDualActionDock = isHolder && asset.isOpen && availableUnits > 0;
  const dockHeight = isDualActionDock
    ? DockConstants.dualActionHeight
    : DockConstants.singleActionHeight;
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + dockHeight + Space.md;

  const handleTradePress = (side: 'buy' | 'sell') => {
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

  // Rights rows — fail closed to "To be confirmed" when backend doesn't expose.
  const rightsRows = CANONICAL_RIGHTS_LABELS.map((label) => {
    const row = (asset.rightsRows as CoOwnRightsRow[] | undefined)?.find((r) => r.label === label);
    return row ?? { label, answer: 'To be confirmed', isTbc: true };
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
          icon: 'time-outline',
          label: 'View order history',
          onPress: () => navigation.navigate('CoOwnOrderHistory'),
        }}
      />

      <CoOwnOfflineBanner isOffline={isOffline} />
      <CoOwnReconciliationBanner isActive={false} />

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
      >
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
          heightFraction={isVeryCompact ? 0.48 : isCompact ? 0.5 : 0.56}
          onOpenFullscreen={handleOpenFullscreen}
          overlayTopContent={
            <View style={styles.familyBadgeOverlay}>
              <ProductFamilyBadge family="co_own" stateAccent={familyStateAccent} compact />
            </View>
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
        />

        {/* ── Zone B — Identity seam ──
            One compact identity composition: eyebrow + title + secondary
            truth line. The family badge lives on the media stage above;
            the dominant price lives in the transaction surface below.
            Spec 02 §B + spec 03 §2: no repeated family labels, no
            repeated price. */}
        <CommerceDetailIdentity
          family="co_own"
          density={isVeryCompact ? 'compact' : 'standard'}
          eyebrow={asset.category ?? undefined}
          title={asset.title}
          secondaryLine={dataStale && dataStaleAgeLabel ? `Last update ${dataStaleAgeLabel}` : undefined}
          interestSignal={asset.holders ? `${asset.holders} holders` : undefined}
        />

        {/* Slim issuer confidence row — replaces the large CoOwnIssuerCard.
            Spec 03 §2: "Do not render a second large issuer card when the
            slim row is present." */}
        <View style={styles.identityExtension}>
          <CommerceDetailSellerRow
            roleLabel="Issuer"
            name={issuerUsername}
            verified={issuerTrust?.verified}
            ratingLine={
              issuerTrust?.rating != null
                ? `${issuerTrust.rating.toFixed(1)}${issuerTrust?.reviewCount != null ? ` · ${issuerTrust.reviewCount} reviews` : ''}`
                : undefined
            }
            locationLine={issuerTrust?.location ?? undefined}
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
            The one strongly contained module near the top: reference
            price + top-of-book + market mode. Replaces the three-column
            CoOwnValueStrip + CoOwnMarketStatusStrip.
            Spec 02 §C + spec 03 §2/§3: do not label reference price as
            "Last trade" without settled-execution proof. Use "Reference
            unit price" unless the backend provides lastExecutionPriceGbp. */}
        <CommerceDetailTransactionSurface
          family="co_own"
          primaryLabel={marketSnapshot?.lastExecutionPriceGbp != null ? 'Last settled trade' : 'Reference unit price'}
          primaryValue={formatCoOwnIze(marketSnapshot?.lastExecutionPriceGbp ?? asset.unitPriceGbp)}
          statusRow={
            <View style={styles.marketStatusRow}>
              <View style={styles.marketStatusCluster}>
                <Text style={[styles.marketStatusText, { color: asset.isOpen ? colors.success : colors.textSecondary }]}>
                  {asset.isOpen ? 'Continuous · Open' : 'Closed'}
                </Text>
                {dataStale && dataStaleAgeLabel && (
                  <Text style={[styles.marketStatusStale, { color: colors.warning }]}>Stale {dataStaleAgeLabel}</Text>
                )}
              </View>
              <View style={styles.marketStatusCluster}>
                <Text style={[styles.marketStatusRights, { color: colors.textSecondary }]}>
                  Spread {spreadGbp != null ? formatCoOwnIze(spreadGbp) : 'Not available'}
                </Text>
                {asset.rightsVersion && (
                  <Pressable
                    onPress={() => setRightsSheetVisible(true)}
                    hitSlop={8}
                    accessibilityLabel={`Rights version ${formatRightsVersion(asset.rightsVersion)}`}
                  >
                    <Text style={[styles.marketStatusRights, { color: colors.textSecondary }]}>
                      {formatRightsVersion(asset.rightsVersion)}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          }
        >
          <View style={[styles.marketBookRow, { borderTopColor: colors.borderSubtle }]}>
            <View style={styles.marketBookSide}>
              <Text style={[styles.marketBookLabel, { color: colors.textMuted }]}>Bid</Text>
              <Text style={[styles.marketBookValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                {bestBid?.unitPriceGbp != null ? `${formatCoOwnIze(bestBid.unitPriceGbp)} × ${bestBid.units ?? 0}` : 'No bid'}
              </Text>
            </View>
            <View style={[styles.marketBookDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.marketBookSide}>
              <Text style={[styles.marketBookLabel, { color: colors.textMuted }]}>Ask</Text>
              <Text style={[styles.marketBookValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                {bestAsk?.unitPriceGbp != null ? `${formatCoOwnIze(bestAsk.unitPriceGbp)} × ${bestAsk.units ?? 0}` : 'No ask'}
              </Text>
            </View>
          </View>
        </CommerceDetailTransactionSurface>

        {/* ── Fundamentals — stacked layout, not three columns ──
            Per spec 03_COOWN §1: replace the compact-phone three-column
            fundamentals strip with a stacked layout. Three equal columns
            feel cramped on phones. */}
        <View style={[styles.fundamentalsStacked, { borderBottomColor: colors.borderSubtle }]}>
          <View style={styles.fundamentalsRow}>
            <Text style={[styles.fundamentalsLabel, { color: colors.textMuted }]}>NAV / unit</Text>
            <Text style={[styles.fundamentalsValue, { color: colors.textSecondary }]} numberOfLines={2}>
              {asset.appraisalValue && totalUnits > 0
                ? formatFromFiat(asset.appraisalValue / totalUnits, 'GBP')
                : 'Not available'}
            </Text>
          </View>
          <View style={styles.fundamentalsRow}>
            <Text style={[styles.fundamentalsLabel, { color: colors.textMuted }]}>Reporting</Text>
            <Text style={[styles.fundamentalsValue, { color: colors.textSecondary }]} numberOfLines={2}>
              {asset.appraisalNextScheduled ? `Next report · ${asset.appraisalNextScheduled}` : 'Next report · Not scheduled'}
            </Text>
          </View>
          <View style={styles.fundamentalsRow}>
            <Text style={[styles.fundamentalsLabel, { color: colors.textMuted }]}>Distribution</Text>
            <Text style={[styles.fundamentalsValue, { color: colors.textSecondary }]} numberOfLines={2}>
              Not scheduled
            </Text>
          </View>
        </View>

        {/* ── Zone D — Viewer context ──
            Compact personalised surface — only when the viewer owns units.
            Spec 03 §4: "Use a compact personalised surface." Appears before
            generic supply. */}
        {isHolder && (
          <CommerceDetailSection label="Your position" divider>
            <View style={styles.viewerPositionHeader}>
              <Text style={[styles.viewerPositionValue, { color: colors.textPrimary }]}>
                {yourUnits} units · {viewerPct.toFixed(1)}% ownership
              </Text>
              <Text style={[styles.viewerPositionMarketValue, { color: colors.textPrimary }]}>
                {formatCoOwnIze(asset.unitPriceGbp * yourUnits)}
              </Text>
            </View>
            <Text style={[styles.viewerPositionMeta, { color: colors.textMuted }]}>
              Settlement {asset.settlementMode === 'ONEZE' ? '1ZE'
                : asset.settlementMode === 'TVUSD' ? 'TVUSD'
                : asset.settlementMode === 'GBP' ? 'GBP'
                : 'GBP + TVUSD'}
            </Text>
          </CommerceDetailSection>
        )}

        {/* ── Zone E — Availability and supply ──
            Default view: units available + allocated bar + holder count.
            Full ledger moved to "View supply structure" disclosure.
            Spec 03 §5: "Do not keep the full five-row accounting ledger
            expanded by default." */}
        <CommerceDetailSection label="Availability" divider>
          <View style={styles.supplySummary}>
            <Text style={[styles.supplyUnits, { color: colors.textPrimary }]}>
              {availableUnits} units available
            </Text>
            <Text style={[styles.supplyAllocated, { color: colors.textSecondary }]}>
              {allocatedPct}% allocated
            </Text>
          </View>
          <View style={[styles.allocationBar, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.allocationFill,
                { backgroundColor: colors.brand, width: `${Math.min(100, allocatedPct)}%` },
              ]}
            />
          </View>
          {asset.holders != null && (
            <Text style={[styles.supplyHolders, { color: colors.textMuted }]}>
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
        <CommerceDetailSection label="Price history" divider>
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
                  lastPrice={asset.unitPriceGbp}
                  lastAgeSeconds={undefined}
                />
              ) : undefined
            }
          />
        </CommerceDetailSection>

        {/* ── Order book ──
            Collapsed by default on phone. Summary is in the transaction
            surface above. Spec 03 §7: "Keep collapsed by default." */}
        <CommerceDetailSection label="Live market" divider>
          <CommerceDetailDisclosureRow
            label="Order book"
            summary={`${orderBook.bids.length + orderBook.asks.length} offers`}
            onPress={() => setOrderBookExpanded((prev) => !prev)}
            leadingIcon="bar-chart-outline"
          />
          {orderBookExpanded && (
            <CoOwnOrderBook
              bids={orderBook.bids as CoOwnBookLevel[]}
              asks={orderBook.asks as CoOwnBookLevel[]}
              visibleLevels={5}
              lastPrice={asset.unitPriceGbp}
              lastAgeSeconds={undefined}
              mode={asset.isOpen ? 'continuous' : 'closed'}
              onSelectLevel={handleSelectOrderBookLevel}
            />
          )}
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
        <CommerceDetailSection label="Asset dossier" divider>
          {/* Summary facts — maximum five decision facts */}
          {asset.authenticityStatus && (
            <CommerceDetailMetricRow
              label="Authenticity"
              value={asset.authenticityStatus}
            />
          )}
          {asset.conditionGrade && (
            <CommerceDetailMetricRow
              label="Condition"
              value={asset.conditionGrade}
            />
          )}
          {asset.custodyLocation && (
            <CommerceDetailMetricRow
              label="Storage"
              value={asset.custodyLocation}
            />
          )}
          {asset.custodyInsured != null && (
            <CommerceDetailMetricRow
              label="Insurance"
              value={asset.custodyInsured ? 'Covered' : 'Not covered'}
            />
          )}
          {asset.appraisalValue != null && (
            <CommerceDetailMetricRow
              label="Latest appraisal"
              value={formatFromFiat(asset.appraisalValue, asset.appraisalCurrency ?? 'GBP')}
              subLabel={asset.appraisalValuedAt ?? undefined}
            />
          )}

          {/* NAV vs reference price — one compact metric row */}
          {asset.appraisalValue && totalUnits > 0 && (
            <CommerceDetailMetricRow
              label="Reference vs NAV"
              value={`${(() => {
                const navPerUnit = asset.appraisalValue / totalUnits;
                const pct = ((asset.unitPriceGbp - navPerUnit) / navPerUnit) * 100;
                return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
              })()}`}
              subLabel="NAV is an appraisal, not an executable price"
            />
          )}

          <CommerceDetailDisclosureRow
            label="View full asset dossier"
            onPress={() => setDossierExpanded((prev) => !prev)}
            leadingIcon="document-text-outline"
            accessibilityLabel="View full asset dossier"
          />

          {/* Full dossier — expanded on demand */}
          {dossierExpanded && (
            <>
              {(() => {
                const evidenceGroups = resolveEvidenceGroups({
                  category: asset.category,
                  condition: asset.conditionLabel,
                  description: asset.description,
                });
                return evidenceGroups.length > 0 ? (
                  <CategoryEvidence groups={evidenceGroups} />
                ) : null;
              })()}

              <CoOwnTrustPanel
                authenticityStatus={asset.authenticityStatus ?? null}
                buyerProtection={asset.buyerProtection ?? false}
                storageInfo={asset.storageInfo ?? null}
                possessionInfo={asset.possessionInfo ?? null}
              />

              {(asset.provenance || asset.conditionGrade || asset.custodyLocation || asset.appraisalValue) && (
                <CoOwnAssetDossier
                  provenance={asset.provenance}
                  condition={asset.conditionGrade ? {
                    grade: asset.conditionGrade,
                    reportUri: asset.conditionReportUri,
                    inspectedAt: asset.conditionInspectedAt,
                  } : undefined}
                  storage={asset.custodyLocation ? {
                    location: asset.custodyLocation,
                    custodian: asset.custodyCustodian,
                    insured: asset.custodyInsured ?? false,
                    policyRef: asset.custodyPolicyRef,
                  } : undefined}
                  appraisal={asset.appraisalValue ? {
                    value: asset.appraisalValue,
                    currency: asset.appraisalCurrency ?? 'GBP',
                    valuedAt: asset.appraisalValuedAt,
                    method: asset.appraisalMethod,
                    valuer: asset.appraisalValuer,
                    rangeLow: asset.appraisalRangeLow,
                    rangeHigh: asset.appraisalRangeHigh,
                    nextScheduled: asset.appraisalNextScheduled,
                  } : undefined}
                />
              )}
            </>
          )}
        </CommerceDetailSection>

        {/* ── Rights and risk ──
            Default summary: completion state + one critical plain-language
            statement + "Review N terms". Full sheet keeps all canonical rows.
            Spec 03 §9. */}
        {/* ── Rights & risks — compressed ──
            Per spec 03_COOWN §8: default summary shows one critical
            plain-language statement + "Review N terms" + "View risk
            disclosure". Both expand via disclosure rows, not inline
            blocks. */}
        <CommerceDetailSection label="Rights & risks" divider>
          <View style={styles.rightsSummary}>
            <Text style={[styles.rightsCriticalStatement, { color: colors.textPrimary }]}>
              You own units in the asset, not the physical item.
            </Text>
          </View>
          <CommerceDetailDisclosureRow
            label="Review rights"
            count={CANONICAL_RIGHTS_LABELS.length}
            summary={asset.rightsVersion ? formatRightsVersion(asset.rightsVersion) : undefined}
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

        {/* ── Exit language ──
            Spec 03 §10: "Do not show Buyout options when the only
            available route is not full-asset buyout." The Buyout row is
            rendered as a truthful unavailable state — it does not
            navigate to a Buyout flow that does not exist. */}
        {isHolder && !isIssuer && (
          <CommerceDetailSection label="Exit options" divider>
            <CommerceDetailDisclosureRow
              label="Sell units"
              summary="Secondary market"
              onPress={() => handleTradePress('sell')}
              leadingIcon="arrow-down-circle-outline"
            />
            <CommerceDetailDisclosureRow
              label="Transfer restrictions"
              summary="Units are transferable on the secondary market"
              onPress={() => setRightsSheetVisible(true)}
              leadingIcon="lock-closed-outline"
            />
            <View style={styles.unavailableRow}>
              <View style={styles.unavailableRowLabelCluster}>
                <Ionicons name="swap-horizontal-outline" size={18} color={colors.textMuted} />
                <Text style={[styles.unavailableRowLabel, { color: colors.textMuted }]} numberOfLines={1}>
                  Full-asset buyout
                </Text>
              </View>
              <Text style={[styles.unavailableRowSummary, { color: colors.textMuted }]} numberOfLines={1}>
                Not available
              </Text>
            </View>
          </CommerceDetailSection>
        )}

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
        if (hasIncompleteRights && !isIssuer && asset.isOpen) {
          // Rights incomplete — open the rights sheet, not a passive warning.
          return (
            <CommerceDetailStateDock
              stateBadge={
                <Text style={[styles.dockStateBadge, { color: colors.warning }]}>
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
              subtitle={`${availableUnits} units in treasury`}
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
        disclosureVersion={asset.rightsVersion ?? 'Rights v1'}
        rights={rightsRows}
      />

      {/* Risk disclosure modal — per spec 03_COOWN §8: collapsed by
          default, opens in a modal sheet via "View risk disclosure". */}
      <Modal
        visible={riskDisclosureVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRiskDisclosureVisible(false)}
      >
        <View style={styles.riskDisclosureModalOverlay}>
          <View style={[styles.riskDisclosureModalSheet, { backgroundColor: colors.background }]}>
            <View style={styles.riskDisclosureModalHeader}>
              <Text style={[styles.riskDisclosureModalTitle, { color: colors.textPrimary }]}>
                Risk disclosure
              </Text>
              <Pressable
                onPress={() => setRiskDisclosureVisible(false)}
                hitSlop={12}
                accessibilityLabel="Close risk disclosure"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={styles.riskDisclosureModalScroll} contentContainerStyle={styles.riskDisclosureModalContent}>
              <CoOwnRiskDisclosure
                onReportIssue={() => {
                  setRiskDisclosureVisible(false);
                  navigation.navigate('CoOwnIssue', { assetId: asset.id });
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

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
        rightsVersion={asset.rightsVersion ?? undefined}
      />

      {/* Overflow sheet — lower-frequency hero actions (Fav, Watch, Report). */}
      <CoOwnOverflowSheet
        visible={overflowVisible}
        onClose={() => setOverflowVisible(false)}
        onToggleFav={social.toggleLike}
        isFav={social.isLiked}
        onWatch={() => {
          toggleCoOwnWatch(asset.id);
          setOverflowVisible(false);
        }}
        isWatched={isWatched}
        onReport={() => {
          setOverflowVisible(false);
          navigation.navigate('CoOwnIssue', { assetId: asset.id });
        }}
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
  identityExtension: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
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
  marketStatusText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
  },
  marketStatusStale: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  marketStatusRights: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  // ── Market book row (bid/ask inside transaction surface) ──
  marketBookRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
    marginTop: Space.sm,
    paddingTop: Space.sm,
  },
  marketBookSide: {
    flex: 1,
    gap: 2,
  },
  marketBookDivider: {
    width: 1,
    marginHorizontal: Space.sm,
  },
  marketBookLabel: {
    fontSize: Type.metaElevated.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  marketBookValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  // ── Secondary facts (NAV / distribution / report) ──
  marketSecondaryFacts: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: 1,
    gap: Space.sm,
  },
  marketSecondaryFact: {
    flex: 1,
    gap: 2,
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
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: 1,
    gap: Space.sm,
  },
  fundamentalsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  fundamentalsLabel: {
    fontSize: Type.metaElevated.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
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
  // ── Risk disclosure modal (per spec 03_COOWN §8) ──
  riskDisclosureModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  riskDisclosureModalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  riskDisclosureModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  riskDisclosureModalTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    lineHeight: Type.subtitle.lineHeight,
  },
  riskDisclosureModalScroll: {
    flex: 1,
  },
  riskDisclosureModalContent: {
    padding: Space.md,
  },
  // ── Viewer position ──
  viewerPositionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginBottom: Space.xs,
  },
  viewerPositionValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  viewerPositionMarketValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  viewerPositionMeta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
  },
  // ── Supply summary ──
  supplySummary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  supplyUnits: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
  },
  supplyAllocated: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  allocationBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  allocationFill: {
    height: '100%',
    borderRadius: 2,
  },
  supplyHolders: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs,
  },
  // ── Rights summary ──
  rightsSummary: {
    paddingVertical: Space.sm,
  },
  rightsCriticalStatement: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    lineHeight: Type.body.lineHeight + 2,
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
    marginTop: Space.lg,
  },
});
