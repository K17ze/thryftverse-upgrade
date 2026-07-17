import React from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Type, Typography, DockConstants } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { fetchCoOwnAssetById, fetchCoOwnOrderBook, fetchCoOwnHoldings } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';
import { CO_OWN_FEE_RATE } from '../utils/tradeFlow';
import {
  CommerceMediaStage,
  CategoryEvidence,
} from '../components/commerce';
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
  CoOwnIssuerCard,
  CoOwnTrustPanel,
  CoOwnRiskDisclosure,
  CoOwnStickyActionDock,
  CoOwnAssetDetailSkeleton,
  CoOwnStateCanvas,
  CoOwnPriceChart,
  CoOwnWatchButton,
  CoOwnFirstTradeGuide,
  CoOwnMarketStatusStrip,
  CoOwnValueStrip,
  CoOwnAssetDossier,
  CoOwnRightsSheet,
  CANONICAL_RIGHTS_LABELS,
  type CoOwnRightsRow,
} from '../components/coown';

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

export default function AssetDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors, isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 390;
  const isVeryCompact = screenWidth < 340;
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
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

  const headerStyle = useAnimatedStyle(() => {
    const threshold = 200;
    const opacity = interpolate(scrollY.value, [threshold - 60, threshold], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" style={isDark ? 'light' : 'dark'} />
        <CoOwnAssetDetailSkeleton />
      </View>
    );
  }

  if (isError || !asset) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" style={isDark ? 'light' : 'dark'} />
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
  const issuerUsername = issuerTrust?.username || 'Issuer';
  const canMessageIssuer = currentUser?.id !== asset.issuerId;

  const availableUnits = Math.max(0, asset.availableUnits);
  const totalUnits = asset.totalUnits;
  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;
  const viewerPct = totalUnits > 0 ? Math.round((yourUnits / totalUnits) * 100 * 10) / 10 : 0;
  const feePct = Math.round(CO_OWN_FEE_RATE * 100);

  const bestBid = orderBook.bids.length > 0 ? orderBook.bids[0] : null;
  const bestAsk = orderBook.asks.length > 0 ? orderBook.asks[0] : null;

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

  const settlementLabel = asset.settlementMode === 'GBP' ? 'GBP' : asset.settlementMode === 'TVUSD' ? 'TVUSD' : 'GBP + TVUSD';

  // Compute scroll bottom padding from dock geometry + safe area.
  // Compact mode stacks price above actions (taller dock); very compact also
  // stacks the holder Sell / Buy more actions vertically.
  const isDualActionDock = isHolder && asset.isOpen && availableUnits > 0;
  const isTradeDock = asset.isOpen && (availableUnits > 0 || isHolder) && !isIssuer;
  const dockHeight = isTradeDock && isCompact
    ? (isVeryCompact && isDualActionDock ? DockConstants.stackedActionHeight + 32 : DockConstants.stackedActionHeight)
    : isDualActionDock
      ? DockConstants.dualActionHeight
      : DockConstants.singleActionHeight;
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + dockHeight;

  const handleTradePress = (side: 'buy' | 'sell') => {
    if (!coOwnCompliance.educationCompleted) {
      setPendingTradeSide(side);
      setGuideVisible(true);
      return;
    }
    navigation.navigate('Trade', { assetId: asset.id, side });
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar translucent backgroundColor="transparent" style={isDark ? 'light' : 'dark'} />

      {/* Collapsed header — appears on scroll */}
      <Reanimated.View style={[styles.collapsedHeader, { paddingTop: Math.max(insets.top, Space.sm), backgroundColor: colors.background }, headerStyle]}>
        <View style={styles.collapsedRow}>
          <AnimatedPressable
            style={[styles.collapsedBackBtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            scaleValue={0.92}
            hapticFeedback="light"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={[styles.collapsedTitle, { color: colors.textPrimary }]} numberOfLines={1}>{asset.title}</Text>
          <AnimatedPressable
            style={[styles.collapsedBackBtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={() => navigation.navigate('CoOwnOrderHistory')}
            accessibilityLabel="View order history"
            accessibilityRole="button"
            scaleValue={0.92}
            hapticFeedback="light"
          >
            <Ionicons name="time-outline" size={20} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>
      </Reanimated.View>

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
      >
        {/* Hero — large media stage */}
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
          showSaveControl
          showFavControl
          heightFraction={isCompact ? 0.52 : 0.65}
          onOpenFullscreen={handleOpenFullscreen}
          overlayTopContent={
            <View style={styles.familyBadgeOverlay}>
              <ProductFamilyBadge family="co_own" stateAccent={familyStateAccent} compact />
            </View>
          }
        />

        {/* Product identity block — flat editorial section */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(80)}
          style={styles.identityStage}
        >
          <View style={styles.identityHeaderRow}>
            <View style={styles.identityHeaderLeft}>
              <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Co-Own item</Text>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{asset.title}</Text>
            </View>
            <CoOwnWatchButton assetId={asset.id} assetTitle={asset.title} />
          </View>
          {asset.description ? (
            <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={4}>{asset.description}</Text>
          ) : null}
        </Reanimated.View>

        {/* Value strip — three-column Market/Fundamental/Cash.
            Replaces the single-price display. Fails closed ("—") for
            facts the backend does not yet expose. Never zero, never fabricated. */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(100)}
          style={styles.sectionWrap}
        >
          <CoOwnValueStrip
            last={bestBid || bestAsk ? undefined : undefined}
            bid={bestBid ? { price: bestBid.unitPriceGbp ?? 0, size: bestBid.units ?? 0 } : undefined}
            ask={bestAsk ? { price: bestAsk.unitPriceGbp ?? 0, size: bestAsk.units ?? 0 } : undefined}
            spread={bestBid && bestAsk ? Math.abs((bestAsk.unitPriceGbp ?? 0) - (bestBid.unitPriceGbp ?? 0)) : undefined}
            nav={undefined}
            premiumPct={null}
            nextDistribution={null}
            nextReporting={null}
          />
        </Reanimated.View>

        {/* Market-status strip — sticky-on-scroll, single source of truth
            for market microstructure state. Fails closed to "Closed" when
            the backend does not expose market mode. */}
        <CoOwnMarketStatusStrip
          mode={asset.isOpen ? 'continuous' : 'closed'}
          sessionLabel={asset.isOpen ? 'Open' : 'Closed'}
          disclosureVersion={asset.rightsVersion ?? undefined}
          onOpenRights={() => setRightsSheetVisible(true)}
        />

        {/* Issuer card — trustworthy identity */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(120)}
          style={styles.sectionWrap}
        >
          <CoOwnIssuerCard
            username={issuerUsername}
            avatarUri={issuerTrust?.avatar ?? null}
            verified={issuerTrust?.verified}
            rating={issuerTrust?.rating ?? null}
            reviewCount={issuerTrust?.reviewCount ?? null}
            location={issuerTrust?.location ?? null}
            memberSince={issuerTrust?.memberSince ?? null}
            onPress={() => navigation.navigate('UserProfile', { userId: asset.issuerId })}
            onMessage={canMessageIssuer ? async () => {
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
            } : undefined}
            canMessage={canMessageIssuer}
          />
        </Reanimated.View>

        {/* Ownership panel — clear, visual, understandable */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(160)}
          style={styles.sectionWrap}
        >
          <CoOwnOwnershipPanel
            unitPriceLabel={formatFromFiat(asset.unitPriceGbp, 'GBP')}
            totalUnits={totalUnits}
            availableUnits={availableUnits}
            allocatedPct={allocatedPct}
            viewerUnits={yourUnits}
            viewerPct={viewerPct}
            settlementMode={asset.settlementMode}
            feePct={feePct}
            holderCount={asset.holders}
            status={asset.isOpen ? (availableUnits > 0 ? 'open' : 'closed') : 'paused'}
          />
        </Reanimated.View>

        {/* Price chart — sparkline with period selector */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(170)}
          style={styles.sectionWrap}
        >
          <CoOwnPriceChart
            assetId={asset.id}
            unitPriceGbp={asset.unitPriceGbp}
            marketMovePct24h={asset.marketMovePct24h ?? 0}
            volume24hGbp={asset.volume24hGbp ?? 0}
          />
        </Reanimated.View>

        {/* Category evidence — editorial details when available */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(180)}
          style={styles.sectionWrap}
        >
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
        </Reanimated.View>

        {/* Trust panel — authenticity, protection, storage */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(200)}
          style={styles.sectionWrap}
        >
          <CoOwnTrustPanel
            authenticityStatus={asset.authenticityStatus ?? null}
            buyerProtection={asset.buyerProtection ?? false}
            storageInfo={asset.storageInfo ?? null}
            possessionInfo={asset.possessionInfo ?? null}
          />
        </Reanimated.View>

        {/* Asset dossier — provenance/condition/custody/insurance/appraisal.
            Renders only when the backend exposes dossier data. Fails closed
            (not rendered) when absent — never fabricated. */}
        {(asset.provenance || asset.conditionGrade || asset.custodyLocation || asset.appraisalValue) && (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(220)}
            style={styles.sectionWrap}
          >
            <CoOwnAssetDossier
              provenance={asset.provenance}
              condition={asset.conditionGrade ? {
                grade: asset.conditionGrade,
                reportUri: asset.conditionReportUri,
                inspectedAt: asset.conditionInspectedAt,
              } : undefined}
              custody={asset.custodyLocation ? {
                location: asset.custodyLocation,
                custodian: asset.custodyCustodian ?? '—',
                insured: asset.custodyInsured ?? false,
                policyRef: asset.custodyPolicyRef,
              } : undefined}
              appraisal={asset.appraisalValue ? {
                value: asset.appraisalValue,
                currency: asset.appraisalCurrency ?? 'GBP',
                valuedAt: asset.appraisalValuedAt ?? '—',
                method: asset.appraisalMethod ?? '—',
                valuer: asset.appraisalValuer,
                rangeLow: asset.appraisalRangeLow,
                rangeHigh: asset.appraisalRangeHigh,
                nextScheduled: asset.appraisalNextScheduled,
              } : undefined}
            />
          </Reanimated.View>
        )}

        {/* Rights & risks entry — opens the 13-row rights sheet modal.
            Each row must have an answer or "To be confirmed" (prelaunch only). */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(240)}
          style={styles.sectionWrap}
        >
          <Pressable
            style={[styles.rightsEntry, { borderColor: colors.border }]}
            onPress={() => setRightsSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="View rights and risks"
          >
            <View style={styles.rightsEntryLeft}>
              <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.rightsEntryText, { color: colors.textPrimary }]}>
                Rights & risks
              </Text>
            </View>
            {asset.rightsVersion && (
              <View style={[styles.rightsVersionChip, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.rightsVersionText, { color: colors.textMuted }]} numberOfLines={1}>
                  {asset.rightsVersion}
                </Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </Pressable>
        </Reanimated.View>

        {/* Risk disclosure — honest limitations */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(240)}
          style={styles.sectionWrap}
        >
          <CoOwnRiskDisclosure
            onReportIssue={() => navigation.navigate('CoOwnIssue', { assetId: asset.id })}
          />
        </Reanimated.View>

        {/* Order book — secondary, collapsed by default */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(280)}
          style={styles.sectionWrap}
        >
          <Pressable
            style={[styles.collapsibleHeader, { borderColor: colors.border }]}
            onPress={() => setOrderBookExpanded((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={orderBookExpanded ? 'Collapse live market' : 'Expand live market'}
            accessibilityState={{ expanded: orderBookExpanded }}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Live market</Text>
              <Text style={[styles.collapsibleSubtext, { color: colors.textMuted }]} numberOfLines={1}>
                {orderBook.bids.length + orderBook.asks.length} offers
              </Text>
            </View>
            <Ionicons
              name={orderBookExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
          {orderBookExpanded && (
            <View style={[styles.orderBookGrid, isCompact && styles.orderBookGridCompact, { borderColor: colors.border }]}>
              <View style={styles.orderBookCol}>
                <View style={styles.orderBookHeader}>
                  <Ionicons name="arrow-up-circle-outline" size={14} color={colors.success} />
                  <Text style={[styles.orderBookHeaderText, { color: colors.textSecondary }]} numberOfLines={1}>Buy interest</Text>
                </View>
                {bestBid && (
                  <Text style={[styles.orderBookBest, { color: colors.textPrimary }]} numberOfLines={1}>
                    Best: {formatFromFiat(bestBid.unitPriceGbp, 'GBP')}
                  </Text>
                )}
                {orderBook.bids.slice(0, 5).map((entry: any, i: number) => (
                  <View key={`bid-${i}`} style={styles.orderBookRow}>
                    <Text style={[styles.orderBookPrice, { color: colors.textPrimary, flexShrink: 1, minWidth: 0 }]} numberOfLines={1}>{formatFromFiat(entry.unitPriceGbp, 'GBP')}</Text>
                    <Text style={[styles.orderBookUnits, { color: colors.textSecondary, flexShrink: 0 }]} numberOfLines={1}>{entry.units}u</Text>
                  </View>
                ))}
                {orderBook.bids.length === 0 && (
                  <Text style={[styles.orderBookEmpty, { color: colors.textMuted }]} numberOfLines={1}>No buy interest yet</Text>
                )}
              </View>

              <View style={[styles.orderBookDivider, { backgroundColor: colors.border }, isCompact && styles.orderBookDividerCompact]} />

              <View style={styles.orderBookCol}>
                <View style={styles.orderBookHeader}>
                  <Ionicons name="arrow-down-circle-outline" size={14} color={colors.danger} />
                  <Text style={[styles.orderBookHeaderText, { color: colors.textSecondary }]} numberOfLines={1}>Sell availability</Text>
                </View>
                {bestAsk && (
                  <Text style={[styles.orderBookBest, { color: colors.textPrimary }]} numberOfLines={1}>
                    Best: {formatFromFiat(bestAsk.unitPriceGbp, 'GBP')}
                  </Text>
                )}
                {orderBook.asks.slice(0, 5).map((entry: any, i: number) => (
                  <View key={`ask-${i}`} style={styles.orderBookRow}>
                    <Text style={[styles.orderBookPrice, { color: colors.textPrimary, flexShrink: 1, minWidth: 0 }]} numberOfLines={1}>{formatFromFiat(entry.unitPriceGbp, 'GBP')}</Text>
                    <Text style={[styles.orderBookUnits, { color: colors.textSecondary, flexShrink: 0 }]} numberOfLines={1}>{entry.units}u</Text>
                  </View>
                ))}
                {orderBook.asks.length === 0 && (
                  <Text style={[styles.orderBookEmpty, { color: colors.textMuted }]} numberOfLines={1}>No sell offers yet</Text>
                )}
              </View>
            </View>
          )}
        </Reanimated.View>

        {/* Buyout link — only for holders, non-issuers */}
        {isHolder && !isIssuer && (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(300)}
            style={styles.sectionWrap}
          >
            <Pressable
              style={[styles.buyoutLink, { borderColor: colors.border }]}
              onPress={() => navigation.navigate('Buyout', { assetId: asset.id })}
              accessibilityRole="button"
              accessibilityLabel="Open buyout options for your units"
            >
              <Ionicons name="swap-horizontal-outline" size={15} color={colors.textSecondary} />
              <Text style={[styles.buyoutLinkText, { color: colors.textSecondary }]}>Buyout options</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </Pressable>
          </Reanimated.View>
        )}

        {/* Seen in Looks */}
        {seenInLooksSection && seenInLooksSection.items.length > 0 && (
          <View style={styles.recommendationSection}>
            <RecommendationRail
              section={seenInLooksSection}
              listingId={asset.listingId}
              onPressItem={(recItem) => {
                if (isRecommendationLook(recItem)) {
                  handlePressLook(recItem);
                } else {
                  handlePressRecommendation(recItem as RecommendationItem);
                }
              }}
            />
          </View>
        )}

        {/* Personalised recommendation rails */}
        {recsLoading && railSections.length === 0 ? null : (
          railSections.map((section) => (
            <View key={section.key} style={styles.recommendationSection}>
              <RecommendationRail
                section={section}
                listingId={asset.listingId}
                onPressItem={(recItem) => {
                  if (isRecommendationLook(recItem)) {
                    handlePressLook(recItem);
                  } else {
                    handlePressRecommendation(recItem as RecommendationItem);
                  }
                }}
              />
            </View>
          ))
        )}
      </Reanimated.ScrollView>

      {/* Sticky action dock — viewer-specific CTAs */}
      <CoOwnStickyActionDock>
        {isIssuer ? (
          <View style={[styles.issuerDock, { backgroundColor: colors.brand + '14', borderColor: colors.brand + '40' }]}>
            <View style={[styles.issuerDockIcon, { backgroundColor: colors.brand + '22' }]}>
              <Ionicons name="storefront-outline" size={16} color={colors.brand} />
            </View>
            <View style={styles.issuerDockBody}>
              <Text style={[styles.issuerDockTitle, { color: colors.textPrimary }]} numberOfLines={1}>Issuer view</Text>
              <Text style={[styles.issuerDockText, { color: colors.textSecondary }]} numberOfLines={1}>
                {availableUnits} units in treasury
              </Text>
            </View>
          </View>
        ) : !asset.isOpen ? (
          <View style={[styles.issuerDock, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <View style={[styles.issuerDockIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="pause-circle-outline" size={16} color={colors.textSecondary} />
            </View>
            <View style={styles.issuerDockBody}>
              <Text style={[styles.issuerDockTitle, { color: colors.textPrimary }]} numberOfLines={1}>Trading paused</Text>
              <Text style={[styles.issuerDockText, { color: colors.textMuted }]} numberOfLines={1}>
                Temporarily unavailable
              </Text>
            </View>
          </View>
        ) : availableUnits === 0 && !isHolder ? (
          <View style={[styles.issuerDock, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <View style={[styles.issuerDockIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
            </View>
            <View style={styles.issuerDockBody}>
              <Text style={[styles.issuerDockTitle, { color: colors.textPrimary }]} numberOfLines={1}>Fully allocated</Text>
              <Text style={[styles.issuerDockText, { color: colors.textMuted }]} numberOfLines={1}>
                Check the secondary market
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.dockRow, isCompact && styles.dockRowCompact]}>
            <View style={[styles.dockPriceSection, isCompact && styles.dockPriceSectionCompact]}>
              <Text style={[styles.dockPriceLabel, { color: colors.textMuted }]} numberOfLines={1}>Unit price</Text>
              <Text style={[styles.dockPriceValue, { color: colors.textPrimary }]} numberOfLines={1}>{formatFromFiat(asset.unitPriceGbp, 'GBP')}</Text>
            </View>
            <View style={[styles.dockActions, isCompact && styles.dockActionsCompact, isVeryCompact && isHolder && styles.dockActionsStacked]}>
              {isHolder && (
                <AnimatedPressable
                  style={[
                    styles.dockSecondaryBtn,
                    { borderColor: colors.border },
                    isVeryCompact && styles.dockSecondaryBtnStacked,
                  ]}
                  onPress={() => handleTradePress('sell')}
                  accessibilityLabel="Sell your units"
                  accessibilityRole="button"
                  scaleValue={0.97}
                  hapticFeedback="medium"
                >
                  <Text style={[styles.dockSecondaryText, { color: colors.textPrimary }]} numberOfLines={1}>Sell</Text>
                </AnimatedPressable>
              )}
              <AppButton
                title={isHolder ? 'Buy more' : 'Buy units'}
                variant="primary"
                size="md"
                onPress={() => handleTradePress('buy')}
                accessibilityLabel={isHolder ? 'Buy more units' : 'Buy units in this Co-Own'}
                style={[
                  styles.dockPrimaryBtn,
                  isCompact && styles.dockPrimaryBtnCompact,
                  isVeryCompact && isHolder && styles.dockPrimaryBtnStacked,
                ]}
                hapticFeedback="medium"
              />
            </View>
          </View>
        )}
      </CoOwnStickyActionDock>

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
        rights={CANONICAL_RIGHTS_LABELS.map((label) => {
          const row = (asset.rightsRows as CoOwnRightsRow[] | undefined)?.find((r) => r.label === label);
          return row ?? { label, answer: 'To be confirmed', isTbc: true };
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  collapsedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  collapsedBackBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  collapsedTitle: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
    textAlign: 'center',
    marginHorizontal: Space.sm,
  },
  identityStage: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.xs,
  },
  identityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  identityHeaderLeft: {
    flex: 1,
    gap: Space.xs,
  },
  eyebrow: {
    fontSize: Type.metaElevated.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: Type.display.size,
    fontFamily: Typography.family.bold,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: 22,
    marginTop: Space.xs,
  },
  sectionWrap: {
    paddingHorizontal: Space.md,
    marginTop: Space.lg,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collapsibleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  collapsibleSubtext: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  orderBookGrid: {
    flexDirection: 'row',
    paddingTop: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  orderBookGridCompact: {
    flexDirection: 'column',
  },
  orderBookCol: {
    flex: 1,
    gap: Space.xs,
    minWidth: 0,
  },
  orderBookDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: Space.md,
  },
  orderBookDividerCompact: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 0,
    marginVertical: Space.md,
  },
  orderBookHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Space.xs,
  },
  orderBookHeaderText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  orderBookBest: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    marginBottom: Space.xs,
  },
  orderBookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  orderBookPrice: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  orderBookUnits: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  orderBookEmpty: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    paddingVertical: Space.sm,
  },
  buyoutLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  buyoutLinkText: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  recommendationSection: {
    marginTop: Space.lg,
  },
  familyBadgeOverlay: {
    alignSelf: 'flex-start',
  },
  issuerDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  issuerDockIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  issuerDockBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  issuerDockTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.1,
  },
  issuerDockText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
  },
  dockRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Space.sm,
  },
  dockPriceSection: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
  },
  dockPriceSectionCompact: {
    flex: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  dockPriceLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  dockPriceValue: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
  },
  dockActions: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
    flexShrink: 1,
  },
  dockActionsCompact: {
    flex: 0,
    flexShrink: 0,
  },
  dockActionsStacked: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
  },
  dockSecondaryBtn: {
    minHeight: 44,
    paddingVertical: Space.sm + 4,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  dockSecondaryBtnStacked: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockSecondaryText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  dockPrimaryBtn: {
    minWidth: 140,
    flexShrink: 1,
  },
  dockPrimaryBtnCompact: {
    minWidth: 0,
    flex: 1,
  },
  dockPrimaryBtnStacked: {
    flex: 0,
    width: '100%',
  },
  // ── Rights & risks entry ──
  rightsEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
  },
  rightsEntryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  rightsEntryText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  rightsVersionChip: {
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  rightsVersionText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
  },
});
