import React, { useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useSharedValue, useAnimatedScrollHandler, FadeIn } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useToast } from '../context/ToastContext';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { Motion } from '../theme/motionTokens';
import { haptics } from '../utils/haptics';
import { HapticPatterns } from '../utils/hapticPatterns';
import { useCurrencyContext } from '../context/CurrencyContext';
import { toIze, formatIzeAmount } from '../utils/currency';
import { Space, FontFamily, DockConstants, LetterSpacing } from '../theme/designTokens';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { TypographyV2 } from '../theme/typography.v2';
import { BidSheet } from '../components/ui/BidSheet';
import { BuyNowSheet } from '../components/ui/BuyNowSheet';
import { FullscreenMediaViewer } from '../components/product/FullscreenMediaViewer';
import { RecommendationRail, ProductDetailSkeleton } from '../components/product';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { CommerceStateCanvas, CommerceRelatedRail, CategoryEvidence, CommerceMediaStage } from '../components/commerce';
import {
  CommerceDetailHeader,
  CommerceDetailIdentity,
  CommerceDetailTransactionSurface,
  CommerceDetailDisclosureRow,
  CommerceDetailSection,
  CommerceDetailSellerRow,
  CommerceDetailStateDock,
  CommerceDetailMediaRail,
  CommerceDetailOfflineBanner,
  CommerceDetailFreshnessBanner,
  CommerceDetailUnavailableInline,
} from '../components/commerce/detail';
import { resolveEvidenceGroups } from '../platform/commerce/categoryEvidence';
import { resolveAuctionTiming } from '../hooks/useServerClock';
import {
  buildAuctionViewModel,
  useProductSocialState,
  useRecommendations,
  useSellerTrust,
  useSellerFollow,
  isRecommendationLook,
} from '../platform/product';
import type { RecommendationLook } from '../platform/product';
import { useStore } from '../store/useStore';
import { useSignupWall } from '../hooks/useSignupWall';
import { createDmConversationOnApi } from '../services/chatApi';
import type { Listing } from '../services/listingsApi';
import {
  resolveStateAction,
  resolveAuctionPresentationState,
  resolveDetailPriceLabel,
  resolveDetailPriceAmount,
  resolveDetailCountdown,
  isBuyNowAvailable,
  buildDetailAccessibilityLabel,
  formatBidActivityRow,
  resolvePaymentDeadlineCountdown,
  formatCountdownSentence,
  type AuctionDetailInput,
  resolveReserveStatus,
  buildAuctionMediaItems,
  resolveTerminalAmountText,
  auctionHasValidWinner,
  isAuctionPaymentConfirmed,
  resolveSellerSaleTitle,
  resolveWinnerSubtitle,
  resolveSellerSubtitle,
  resolveLiveMsToEnd,
  resolveLiveMsToStart,
  resolveCountdownColor,
  resolveHasDualDock,
} from '../utils/auctionDetailLogic';
import {
  ReserveStatusBadge,
  AuctionCountdownBar,
  AuctionPostEndBanners,
  AuctionTerminalResult,
  AuctionOverflowSheet,
  AuctionBidHistorySheet,
  AuctionRulesSheet,
} from '../components/auction';
import { useAuctionDetail } from '../hooks/useAuctionDetail';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'AuctionDetail'>;

export default function AuctionDetailScreen() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'AuctionDetailScreen');
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const {
    auctionId,
    openBidSheet: shouldOpenBidSheet,
    initialBidAmount,
  } = route.params;
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const { formatFromFiat, currencySymbol } = useFormattedPrice();
  const { currencyCode, fxRates, displayMode } = useCurrencyContext();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const {
    auction,
    bidActivity,
    loading,
    refreshing,
    error,
    bidActivityError,
    setBidActivityError,
    relatedAuctions,
    relatedLoading,
    lastFetchAt,
    setLoading,
    serverNowRef,
    secondClock,
    minuteClock,
    needsResync,
    resyncFailed,
    isTransitionRefreshing,
    effectiveState,
    bidSheetVisible,
    setBidSheetVisible,
    buyNowSheetVisible,
    setBuyNowSheetVisible,
    isSubmittingBid,
    isBuyNowLoading,
    watchToggling,
    isCancelLoading,
    isPayLoading,
    isAcceptHighestBidLoading,
    isAcceptSecondChanceLoading,
    isDeclineSecondChanceLoading,
    fetchDetail,
    handleRefresh,
    handleToggleWatch,
    openBidSheet,
    closeBidSheet,
    handleSubmitBid,
    openBuyNowSheet,
    closeBuyNowSheet,
    handleSubmitBuyNow,
    handleAcceptHighestBid,
    handlePayNow,
    handleAcceptSecondChance,
    handleDeclineSecondChance,
    handleCancelAuction,
    cancelAuctionConfirmation,
    dismissCancelAuctionConfirmation,
    refreshDetailForTransaction,
  } = useAuctionDetail(auctionId, {
    openBidSheet: shouldOpenBidSheet,
    initialBidAmount,
  });

  const [bidHistorySheetVisible, setBidHistorySheetVisible] = React.useState(false);
  const [rulesSheetVisible, setRulesSheetVisible] = React.useState(false);
  const [mediaViewerVisible, setMediaViewerVisible] = React.useState(false);
  const [fullscreenMediaIndex, setFullscreenMediaIndex] = React.useState(0);
  const [overflowVisible, setOverflowVisible] = React.useState(false);

  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const [isResolvingConversation, setIsResolvingConversation] = React.useState(false);

  const { isCommerceCompact: isCompact } = useBreakpoint();
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();

  const detailInput: AuctionDetailInput | null = React.useMemo(() => {
    if (!auction) return null;
    return {
      id: auction.id,
      listingId: auction.listingId,
      sellerId: auction.seller.id,
      title: auction.title,
      imageUrl: auction.imageUrl,
      brand: auction.brand,
      category: auction.category,
      conditionLabel: auction.conditionLabel,
      description: auction.description,
      startsAt: auction.startsAt,
      endsAt: auction.endsAt,
      startingBidGbp: auction.startingBidGbp,
      currentBidGbp: auction.currentBidGbp,
      minimumNextBidGbp: auction.minimumNextBidGbp,
      buyNowPriceGbp: auction.buyNowPriceGbp,
      reservePriceGbp: auction.reservePriceGbp,
      bidCount: auction.bidCount,
      viewerState: auction.viewerState,
      isWatched: auction.isWatched,
      cancelledAt: auction.cancelledAt,
      settledAt: auction.settledAt,
      paidAt: auction.paidAt,
      paymentDeadlineAt: auction.paymentDeadlineAt,
      secondChanceOfferedTo: auction.secondChanceOfferedTo,
      cancelledBy: auction.cancelledBy,
      cancelledReason: auction.cancelledReason,
      antiSniping: auction.antiSniping,
      winnerBidderId: auction.winnerBidderId,
      auctionSequence: auction.auctionSequence,
      lifecycle: auction.lifecycle,
      terminalReason: auction.terminalReason,
      fulfilment: auction.fulfilment ?? null,
    };
  }, [auction]);

  const timing = React.useMemo(() => {
    if (!auction || !effectiveState) return null;
    const clockMs = minuteClock;
    return {
      effectiveState,
      msToStart: Math.max(0, new Date(auction.startsAt).getTime() - clockMs),
      msToEnd: Math.max(0, new Date(auction.endsAt).getTime() - clockMs),
    } as const;
  }, [auction, effectiveState, minuteClock]);

  const stateAction = React.useMemo(() => {
    if (!detailInput || !timing) return null;
    return resolveStateAction(timing.effectiveState, detailInput.viewerState, detailInput);
  }, [detailInput, timing]);

  const priceLabel = React.useMemo(() => {
    if (!detailInput || !timing) return 'Starting bid' as const;
    return resolveDetailPriceLabel(detailInput, timing.effectiveState);
  }, [detailInput, timing]);

  const priceAmount = React.useMemo(() => {
    if (!detailInput) return 0;
    return resolveDetailPriceAmount(detailInput);
  }, [detailInput]);

  const priceText = React.useMemo(() => {
    if (priceLabel === 'No bids') return 'No bids';
    return formatFromFiat(priceAmount, currencyCode);
  }, [priceLabel, priceAmount, formatFromFiat]);

  const countdown = React.useMemo(() => {
    if (!timing) return { text: '', isFinalMinutes: false, stage: 'plenty' as const };
    return resolveDetailCountdown(timing, secondClock, minuteClock);
  }, [timing, secondClock, minuteClock]);

  // Canonical presentation state for badge, primary sentence, and dock.
  const presentation = React.useMemo(() => {
    if (!detailInput || !effectiveState || !countdown) return null;
    return resolveAuctionPresentationState(
      effectiveState,
      detailInput.viewerState,
      detailInput,
      countdown.stage,
    );
  }, [detailInput, effectiveState, countdown]);

  const accessibilityLabel = React.useMemo(() => {
    if (!detailInput || !timing) return '';
    return buildDetailAccessibilityLabel(
      detailInput,
      timing,
      priceLabel,
      priceText,
      countdown.text,
      detailInput.viewerState,
    );
  }, [detailInput, timing, priceLabel, priceText, countdown.text]);

  const isLive = effectiveState === 'live';
  const isUpcoming = effectiveState === 'upcoming';
  const isEnded = effectiveState === 'ended';
  const isCancelled = effectiveState === 'cancelled';
  const isSettled = effectiveState === 'settled';
  const isReserveNotMet = effectiveState === 'reserve_not_met';
  const isAwaitingPayment = effectiveState === 'awaiting_payment';
  const isPaymentExpired = effectiveState === 'payment_expired';
  const isSecondChanceOffered = effectiveState === 'second_chance_offered';
  const isPostEnd = isReserveNotMet || isAwaitingPayment || isPaymentExpired || isSecondChanceOffered;
  const isTerminal = isEnded || isCancelled || isSettled;
  const viewerState = auction?.viewerState ?? 'not_participating';

  // Compound haptic feedback when the viewer's auction outcome transitions
  // into "outbid" (warning) and "won" (double celebration) so the
  // user feels the auction outcome the moment the backend reflects it.
  const prevViewerStateRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (prevViewerStateRef.current === viewerState) return;
    if (viewerState === 'outbid' && prevViewerStateRef.current !== null) {
      HapticPatterns.outbid();
    }
    if (viewerState === 'won' && prevViewerStateRef.current !== null) {
      HapticPatterns.auctionWon();
    }
    prevViewerStateRef.current = viewerState;
  }, [viewerState]);

  const isSeller = viewerState === 'seller';
  const buyNowAvailable = detailInput ? isBuyNowAvailable(detailInput, effectiveState ?? 'upcoming') : false;
  const reserveStatus = detailInput ? resolveReserveStatus(detailInput) : 'none';
  const showBidControls = !isTerminal && !isPostEnd && !isSeller;

  // ── Second-chance recipient detection ──
  // The backend sets secondChanceOfferedTo to a specific user ID. Only
  // that user sees accept/decline controls. Falls back to viewerState
  // (outbid/lost) when the backend hasn't populated the field yet.
  const isSecondChanceRecipient = React.useMemo(() => {
    if (!auction) return false;
    if (auction.secondChanceOfferedTo && currentUser?.id) {
      return auction.secondChanceOfferedTo === currentUser.id;
    }
    return (isPaymentExpired || isSecondChanceOffered) &&
      (viewerState === 'outbid' || viewerState === 'lost');
  }, [auction, currentUser?.id, isPaymentExpired, isSecondChanceOffered, viewerState]);

  // ── Payment deadline countdown ──
  // Uses the same server-clock pattern as the auction end countdown so
  // the deadline ticks down with the same per-second precision.
  const paymentDeadlineCountdown = React.useMemo(() => {
    if (!auction?.paymentDeadlineAt) return null;
    return resolvePaymentDeadlineCountdown(auction.paymentDeadlineAt, secondClock);
  }, [auction?.paymentDeadlineAt, secondClock]);

  // ── PRODUCT-01: unified view model + shared social state + seller trust + recommendations ──
  const viewModel = React.useMemo(() => {
    if (!auction) return null;
    return buildAuctionViewModel({
      auction,
      currentUserId: currentUser?.id,
      currencySymbol,
    });
  }, [auction, currentUser?.id, currencySymbol]);

  const social = useProductSocialState(viewModel);

  // Guest gating: wrap save/like actions with the soft signup wall so
  // guests can browse auctions freely but cannot commit to saving or
  // liking without an account.
  const guardedOpenCollectionPicker = React.useCallback(() => {
    if (!requireAuth('save_item')) return;
    social.openCollectionPicker();
  }, [requireAuth, social]);
  const guardedToggleLike = React.useCallback(() => {
    if (!requireAuth('save_item')) return;
    social.toggleLike();
  }, [requireAuth, social]);

  const { data: sellerTrustData } = useSellerTrust(auction?.seller.id);
  const sellerFollowMutation = useSellerFollow(auction?.seller.id);

  const { data: recommendationsData, isLoading: recsLoading } = useRecommendations(
    auction?.listingId
  );
  const recommendationSections = React.useMemo(
    () => recommendationsData?.sections ?? [],
    [recommendationsData],
  );
  const railSections = React.useMemo(
    () =>
      recommendationSections.filter(
        (section) => section.key !== 'seen_in_looks' && section.key !== 'continue_exploring',
      ),
    [recommendationSections],
  );
  const seenInLooksSection = React.useMemo(
    () => recommendationSections.find((s) => s.key === 'seen_in_looks'),
    [recommendationSections],
  );
  void recsLoading;
  void railSections;

  const handlePressRecommendation = React.useCallback(
    (
      recItem: Listing,
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
    },
    [navigation],
  );
  const handlePressLook = React.useCallback((lookItem: RecommendationLook) => {
    navigation.navigate('LookDetail', { lookId: lookItem.id });
  }, [navigation]);

  const handlePressRelatedAuction = React.useCallback((id: string) => {
    navigation.push('AuctionDetail', { auctionId: id });
  }, [navigation]);

  // ── Canonical media array ──
  // Per spec 02_AUCTION §7: render the canonical media array through
  // CommerceMediaStage. Maintain imageUrl as a temporary compatibility
  // field.
  const auctionMediaItems = React.useMemo(() => {
    if (!auction) return [];
    return buildAuctionMediaItems(auction);
  }, [auction]);

  // ── Fulfilment summary ──
  // Per spec 02_AUCTION §8: backend-backed result/fulfilment contract.
  // The frontend must not invent next steps.
  const auctionFulfilment = auction?.fulfilment ?? null;
  const terminalAmountText = auction
    ? resolveTerminalAmountText(auction, formatFromFiat)
    : 'Amount unavailable';

  // ── Truthful terminal sale-state labels (audit P0.5) ──
  // `ended` is not `settled`. Derive the sale title from the authoritative
  // effective state + backend payment status so the body never says "Sold"
  // (implying settlement) for an auction that has only ended.
  const isPaymentConfirmed = isAuctionPaymentConfirmed(auctionFulfilment);
  const hasValidWinner = auctionHasValidWinner(auction);
  const sellerSaleTitle = resolveSellerSaleTitle(hasValidWinner, isSettled, isPaymentConfirmed);
  const winnerSubtitle = resolveWinnerSubtitle(auctionFulfilment, isSettled, isPaymentConfirmed);
  const sellerSubtitle = resolveSellerSubtitle(hasValidWinner, auctionFulfilment, isSettled, isPaymentConfirmed);

  // ── One primary state sentence (audit: reduce simultaneous state cues) ──
  // Above the fold, show ONE dominant sentence that communicates the most
  // important state. All other cues (auction state badge, live indicator,
  // urgency color, viewer signals) demote to subordinate metadata so the
  // page reads like precise instrumentation, not a casino dashboard.
  const liveMsToEnd = React.useMemo(() => {
    if (!auction) return 0;
    return resolveLiveMsToEnd(auction, secondClock);
  }, [auction, secondClock]);

  const liveMsToStart = React.useMemo(() => {
    if (!auction) return 0;
    return resolveLiveMsToStart(auction, secondClock);
  }, [auction, secondClock]);

  // Countdown color changes only at meaningful thresholds.
  // < 10 seconds = danger, < 1 minute = warning, otherwise neutral.
  // This is the single accent for urgency — not every element is red.
  const countdownColor = React.useMemo(() => {
    return resolveCountdownColor(isLive, liveMsToEnd, colors);
  }, [isLive, liveMsToEnd, colors]);

  // Primary state sentence — one dominant line above the fold.
  // Priority: outbid > leading > reserve not met > countdown > ended.
  // Do NOT infer winner until server result — terminal sentences are
  // derived from the authoritative effectiveState + fulfilment contract.
  const primaryState = React.useMemo<{
    text: string;
    color: string;
  } | null>(() => {
    if (!presentation) return null;
    const colorByKey: Record<typeof presentation.colorKey, string> = {
      brand: colors.brand,
      success: colors.success,
      danger: colors.danger,
      warning: colors.warning,
      textPrimary: colors.textPrimary,
      textSecondary: colors.textSecondary,
      textMuted: colors.textMuted,
    };
    return {
      text: presentation.viewerMessage ?? presentation.stateLabel,
      color: colorByKey[presentation.colorKey],
    };
  }, [presentation, colors]);

  // The dedicated countdown bar owns time display; avoid a second
  // countdown line in the transaction surface.
  const subordinateStateText = React.useMemo<string | null>(() => {
    return null;
  }, []);

  // Compute scroll bottom padding from dock geometry + safe area so the
  // sticky dock never covers the last content row.
  const hasDualDock = resolveHasDualDock({
    showBidControls,
    buyNowAvailable,
    secondaryActionType: stateAction?.secondary.type ?? 'none',
    isBuyNowLoading,
    isPostEnd,
    isReserveNotMet,
    isSeller,
    bidCount: auction?.bidCount ?? 0,
    isPaymentExpired,
    isSecondChanceOffered,
    isSecondChanceRecipient,
  });
  const dockHeight = hasDualDock
    ? DockConstants.dualActionHeight
    : DockConstants.singleActionHeight;
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + dockHeight + Space.md;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Space.md }}
          accessibilityLabel="Loading auction details"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <ProductDetailSkeleton />
        </ScrollView>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <CommerceStateCanvas
          state="error"
          family="auction"
          title="Unable to load auction"
          message={error}
          onRetry={() => {
            setLoading(true);
            void fetchDetail();
          }}
          retryLabel="Try again"
          secondaryActionLabel="Go Back"
          onSecondaryAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  if (!auction) {
    return (
      <View style={styles.container}>
        <CommerceStateCanvas
          state="unavailable"
          family="auction"
          title="Auction not found"
          message="This auction may have ended, been removed, or is no longer available."
          onRetry={() => navigation.navigate('AuctionHome')}
          retryLabel="Back to auctions"
        />
      </View>
    );
  }

  return (
    <Reanimated.View
      ref={a11yRef}
      testID="auction-detail-screen"
      entering={reducedMotion ? FadeIn.duration(0) : FadeIn.duration(Motion.transitions.mediaLoad.duration)}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Collapsed scrolling header ──
          Quiet glyph hit targets, no large rounded-square containers.
          Spec 02 shape system: separate hit area from visible shape. */}
      <CommerceDetailHeader
        scrollY={scrollY}
        title={auction.title}
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: 'share-outline',
          label: 'Share auction',
          onPress: social.openShare,
        }}
      />

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        accessibilityElementsHidden={bidSheetVisible || buyNowSheetVisible || overflowVisible || bidHistorySheetVisible || rulesSheetVisible || mediaViewerVisible}
        importantForAccessibility={bidSheetVisible || buyNowSheetVisible || overflowVisible || bidHistorySheetVisible || rulesSheetVisible || mediaViewerVisible ? 'no-hide-descendants' : 'auto'}
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
        {/* ── Zone A — Media stage ──
            CommerceMediaStage handles paging/zoom/fullscreen only.
            CommerceDetailMediaRail overlays the max-3-visible-controls
            (Back, Share, Watch) + overflow (Save, Like). Spec 02 §A:
            "Maximum visible utility controls over media: three." Spec 04
            §1: "Watch is the auction participation state. Save-to-
            collection may remain in overflow." */}
        <CommerceMediaStage
          media={auctionMediaItems}
          objectId={auction.id}
          topInset={insets.top}
          scrollY={scrollY}
          onBack={() => navigation.goBack()}
          onShare={social.openShare}
          onSave={guardedOpenCollectionPicker}
          onToggleFav={guardedToggleLike}
          isFav={social.isLiked}
          isSaved={social.isSavedToCollection}
          showDefaultControls={false}
          showThumbnailStrip={auctionMediaItems.length > 1}
          heightFraction={isCompact ? 0.54 : 0.58}
          initialIndex={fullscreenMediaIndex}
          onActiveIndexChange={setFullscreenMediaIndex}
          onOpenFullscreen={(index) => {
            setFullscreenMediaIndex(index);
            setMediaViewerVisible(true);
          }}
          overlayBottomContent={
            <View accessible accessibilityLabel={accessibilityLabel}>
              <CommerceDetailIdentity
                family="auction"
                tone="media"
                density={isCompact ? 'compact' : 'standard'}
                eyebrow={auction.brand ?? auction.category ?? 'Auction lot'}
                title={auction.title}
                secondaryLine={auction.conditionLabel ?? undefined}
              />
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
              onPress: guardedOpenCollectionPicker,
              isActive: social.isSavedToCollection,
            },
          ]}
          onOverflow={() => setOverflowVisible(true)}
          showOverflow
        />

        {/* ── Prominent countdown timer bar ──
            Sits at the top of the content, immediately below the media
            stage. Red when < 1 hour remaining (urgency). Shows the
            server-authoritative countdown so the user always knows the
            time state without scrolling. */}
        <AuctionCountdownBar
          isLive={isLive}
          liveMsToEnd={liveMsToEnd}
          isUpcoming={isUpcoming}
          liveMsToStart={liveMsToStart}
        />

        {/* ── Offline banner ──
            Per spec 05 §14: offline state must be designed, not a blank
            screen. Cached auction data may still be visible. */}
        <CommerceDetailOfflineBanner isOffline={isOffline} />

        {/* ── Freshness indicator ──
            Surfaces stale, reconnecting, and refresh-failed states so the
            user never sees a live countdown that is silently disconnected.
            R02: realtime screens expose freshness, not just data.
            Consolidates the former custom resync banner — the freshness
            banner already renders the refresh-failed state with retry. */}
        <CommerceDetailFreshnessBanner
          isRefreshing={isTransitionRefreshing || refreshing}
          isStale={needsResync && !isTransitionRefreshing}
          refreshFailed={resyncFailed}
          onRetry={handleRefresh}
        />

        {/* ── Post-end lifecycle status banners ──
            Flat, restrained bars using the same countdownBar geometry.
            One icon + one line of truthful copy. No decorative chrome.
            Color comes from the theme via the presentation state's
            colorKey so the banner stays consistent with the dock and
            primary state sentence. */}
        <AuctionPostEndBanners
          isReserveNotMet={isReserveNotMet}
          isAwaitingPayment={isAwaitingPayment}
          isPaymentExpired={isPaymentExpired}
          isSecondChanceOffered={isSecondChanceOffered}
          isSeller={isSeller}
          viewerState={viewerState}
          isSecondChanceRecipient={isSecondChanceRecipient}
          paymentDeadlineCountdown={paymentDeadlineCountdown}
        />

        {/* ── Zone C — Auction transaction surface ──
            One primary state sentence above the fold. The countdown,
            viewer signals, and reserve status demote to subordinate
            metadata so only one state element has primary visual weight.
            Reserve status is factual only — no persuasive gap copy.
            Urgency chrome is reduced: the countdown owns the single
            accent colour, applied only at meaningful thresholds. */}
        {!isTerminal && (
          <CommerceDetailTransactionSurface
            family="auction"
            flush
            surfaceColor={colors.surface}
            primaryLabel={priceLabel}
            primaryValue={priceText}
            headlineAside={
              primaryState ? (
                <Text
                  style={[
                    styles.primaryStateSentence,
                    { color: primaryState.color },
                  ]}
                  numberOfLines={1}
                  accessibilityLiveRegion="polite"
                >
                  {primaryState.text}
                </Text>
              ) : undefined
            }
            statusRow={reserveStatus !== 'none' ? (
              <View style={styles.transactionStatusRow}>
                <ReserveStatusBadge status={reserveStatus} />
              </View>
            ) : undefined}
          >
            {/* Subordinate metadata — countdown demotes here when the
                viewer-state sentence dominates so only one state element
                has primary visual weight. */}
            {subordinateStateText ? (
              <Text
                style={[styles.subordinateMetadata, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {subordinateStateText}
              </Text>
            ) : null}
            <View style={[styles.transactionBidActivityRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.transactionBidActivityLabel, { color: colors.textSecondary }]}>
                {isLive ? 'Live bids' : 'Bid activity'}
              </Text>
              <Text style={[styles.transactionBidActivityValue, { color: colors.textPrimary }]}>
                {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
              </Text>
            </View>
            {/* Minimum to lead (outbid) — actionable emphasis inside the
                surface. The dock carries the "Bid again" action. */}
            {isLive && viewerState === 'outbid' && auction.minimumNextBidGbp > 0 && (
              <View style={[styles.transactionMinRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.transactionMinLabel, { color: colors.textSecondary }]}>
                  Minimum to lead
                </Text>
                <Text style={[styles.transactionMinValue, { color: colors.textPrimary }]}>
                  {formatFromFiat(auction.minimumNextBidGbp, currencyCode)}
                </Text>
              </View>
            )}
          </CommerceDetailTransactionSurface>
        )}

        {/* ── Terminal result — one compact module, no duplicate title/brand ──
            Spec 04 §7: "Terminal: one result state, one next valid
            action." The result state lives here; the dock carries the
            next valid action. */}
        <AuctionTerminalResult
          isTerminal={isTerminal}
          isCancelled={isCancelled}
          viewerState={viewerState}
          isPaymentConfirmed={isPaymentConfirmed}
          isSettled={isSettled}
          hasValidWinner={hasValidWinner}
          terminalAmountText={terminalAmountText}
          winnerSubtitle={winnerSubtitle}
          sellerSaleTitle={sellerSaleTitle}
          sellerSubtitle={sellerSubtitle}
          onDiscoverSimilar={() => navigation.navigate('AuctionHome')}
        />

        <View style={[styles.identityExtension, { borderTopColor: colors.borderSubtle }]}>
          <CommerceDetailSellerRow
            name={auction.seller.displayName ?? auction.seller.username}
            verified={sellerTrustData?.verified}
            ratingLine={
              sellerTrustData?.rating != null
                ? `${sellerTrustData.rating.toFixed(1)}${sellerTrustData?.reviewCount != null ? ` · ${sellerTrustData.reviewCount} reviews` : ''}`
                : undefined
            }
            onPress={() => openProfile(navigation, auction.seller.id, currentUser?.id)}
            primaryAction={
              !isSeller
                ? {
                    label: isResolvingConversation ? 'Starting…' : 'Message',
                    onPress: async () => {
                      if (!requireAuth('message_seller')) return;
                      if (isResolvingConversation) return;
                      setIsResolvingConversation(true);
                      try {
                        const conversation = await createDmConversationOnApi({
                          recipientUserId: auction.seller.id,
                        });
                        upsertConversation(conversation);
                        navigation.navigate('Chat', {
                          conversationId: conversation.id,
                          partnerUserId: auction.seller.id,
                        });
                      } catch {
                        show('Could not start conversation. Try again.', 'error');
                      } finally {
                        setIsResolvingConversation(false);
                      }
                    },
                  }
                : undefined
            }
            secondaryAction={
              !isSeller
                ? {
                    label: sellerFollowMutation.isPending ? 'Following…' : (sellerTrustData?.isFollowing ? 'Following' : 'Follow'),
                    onPress: () => {
                      if (!requireAuth('follow_seller')) return;
                      sellerFollowMutation.mutate(undefined, {
                        onSuccess: (data) => {
                          show(data.isFollowing ? 'Followed seller' : 'Unfollowed seller', 'success');
                        },
                        onError: () => {
                          show('Could not follow seller. Try again.', 'error');
                        },
                      });
                    },
                  }
                : undefined
            }
          />
        </View>

        {/* ── Seller cancel action ──
            Restrained: a muted text link in a secondary position, not a
            prominent CTA. Only shown to the seller when the auction is
            still live or upcoming (cancellable states). Destructive
            intent signalled by the text, not by a red button. */}
        {isSeller && (isLive || isUpcoming) && (
          <View style={styles.sellerCancelRow}>
            <Pressable
              onPress={handleCancelAuction}
              disabled={isCancelLoading}
              accessibilityRole="button"
              accessibilityLabel="Cancel this auction"
              style={({ pressed }) => pressed && { opacity: 0.5 }}
            >
              <Text style={[styles.sellerCancelText, { color: colors.textMuted }]}>
                {isCancelLoading ? 'Cancelling…' : 'Cancel auction'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── Zone E — Item details ──
            Per spec 02_AUCTION §5: wrap description, category evidence,
            condition and authenticity inside one deliberate "Item
            details" section. Do not leave description and evidence as
            independent unlabelled blocks. */}
        <CommerceDetailSection label="Item details" divider variant="editorial">
          {auction.description && (
            <View style={styles.descriptionBlock}>
              <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>
                {auction.description}
              </Text>
            </View>
          )}

          {(() => {
            const evidenceGroups = resolveEvidenceGroups({
              category: auction.category,
              brand: auction.brand,
              condition: auction.conditionLabel,
              description: auction.description,
            });
            return evidenceGroups.length > 0 ? (
              <CategoryEvidence groups={evidenceGroups} />
            ) : null;
          })()}

          {auction.conditionLabel && (
            <View style={styles.itemDetailRow}>
              <Text style={[styles.itemDetailLabel, { color: colors.textSecondary }]}>
                Condition
              </Text>
              <Text style={[styles.itemDetailValue, { color: colors.textPrimary }]}>
                {auction.conditionLabel}
              </Text>
            </View>
          )}
        </CommerceDetailSection>

        {/* ── Bid activity — one compact pattern ──
            Per spec 02_AUCTION §3: consolidate bid history into one
            presentation. Section label "Bid activity", latest bid row,
            bid count, one "View all bids" action. Do not show both a
            disclosure row and a three-row preview. */}
        {(auction.bidCount > 0 || bidActivityError) && (
          <CommerceDetailSection label="Bid activity" divider variant="editorial">
          {bidActivityError ? (
            <CommerceDetailUnavailableInline
              title="Bid activity unavailable"
              body="Pull to refresh and try again."
            />
          ) : auction.bidCount > 0 && bidActivity.length > 0 ? (
            (() => {
              const topBid = formatBidActivityRow(bidActivity[0], 0, formatFromFiat, serverNowRef.current);
              return (
                <View style={styles.bidActivityRow} accessibilityLiveRegion="polite">
                  <View style={styles.bidActivityLeft}>
                    <Text style={[styles.bidActivityLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                      Leading bid
                    </Text>
                    <Text style={[styles.bidActivityBidder, { color: colors.textPrimary }]} numberOfLines={1}>
                      {topBid.bidderLabel}
                      {topBid.relativeTime ? `  ·  ${topBid.relativeTime}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.bidActivityAmount, { color: colors.textPrimary }]}>
                    {topBid.amountText}
                  </Text>
                </View>
              );
            })()
          ) : null}
          {!bidActivityError && auction.bidCount > 0 && (
            <Pressable
              style={styles.bidActivityViewAll}
              onPress={() => setBidHistorySheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`View all ${auction.bidCount} bids`}
            >
              <Text style={[styles.bidActivityViewAllText, { color: colors.brand }]}>
                {`View all ${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'}`}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.brand} />
            </Pressable>
          )}
          </CommerceDetailSection>
        )}

        {/* Auction rules — disclosure row, not a large card. Spec 04 §6. */}
        <CommerceDetailSection label="Auction rules" divider>
          <CommerceDetailDisclosureRow
            label="How bidding works"
            onPress={() => setRulesSheetVisible(true)}
            leadingIcon="information-circle-outline"
            accessibilityLabel="View bidding rules"
          />
        </CommerceDetailSection>

        {/* ── Zone F — Discovery ──
            Discovery begins only after the core product decision is
            understandable. Spec 02 §F. */}
        {relatedAuctions.length > 0 && (
          <CommerceRelatedRail
            label={auction.category ? `More ${auction.category.toLowerCase()} auctions` : 'More auctions'}
            items={relatedAuctions.map((rel) => {
              const relTiming = resolveAuctionTiming(rel, secondClock);
              const relPrice = rel.bidCount > 0 ? rel.currentBidGbp : rel.startingBidGbp;
              const relStateLabel = relTiming.effectiveState === 'live' ? 'LIVE'
                : relTiming.effectiveState === 'upcoming' ? 'SOON'
                : relTiming.effectiveState === 'cancelled' ? 'CANCELLED'
                : relTiming.effectiveState === 'settled' ? 'SETTLED'
                : 'ENDED';
              const relTimeLabel = relTiming.effectiveState === 'live'
                ? `${Math.floor(relTiming.msToEnd / 60000)}m left`
                : relTiming.effectiveState === 'upcoming'
                ? `in ${Math.floor(relTiming.msToStart / 60000)}m`
                : '';
              return {
                id: rel.id,
                title: rel.title,
                imageUrl: rel.imageUrl,
                priceText: formatFromFiat(relPrice, currencyCode),
                sizeText: displayMode !== 'fiat' ? formatIzeAmount(toIze(relPrice, currencyCode, fxRates), 2) : undefined,
                badgeText: relStateLabel,
                mode: 'auction' as const,
                stateText: relStateLabel,
                countdownText: relTimeLabel || undefined,
              };
            })}
            onPressItem={handlePressRelatedAuction}
          />
        )}

        {/* The slim seller row near identity is the primary seller
            presentation. The full SellerTrustCard is not rendered by
            default — the slim row already carries Follow/Message and
            navigates to the full profile on tap. Spec 04: "choose either
            the slim seller row or the full seller card as the primary
            presentation; do not show both by default." */}

        {/* ── Discovery — maximum one related-auctions rail + one Seen in
            Looks rail. Per spec 02_AUCTION §9: no generic duplicate
            recommendation rails after that. */}
        {seenInLooksSection && seenInLooksSection.items.length > 0 && (
          <View style={styles.recommendationSection}>
            <RecommendationRail
              section={seenInLooksSection}
              listingId={auction.listingId}
              onPressItem={(recItem, sectionKey, position, reasonCode, personalised) => {
                if (isRecommendationLook(recItem)) {
                  handlePressLook(recItem);
                } else {
                  handlePressRecommendation(recItem as Listing, sectionKey, position, reasonCode, personalised);
                }
              }}
            />
          </View>
        )}
      </Reanimated.ScrollView>

      {/* ── Zone G — Sticky action dock ──
          Shared shell dock. Per spec 02_AUCTION §4: the body owns the
          detailed terminal result; the dock contains the action only.
          Do not repeat "You won", "Auction closed", "Sold" or "Ended
          without bids" in both the body and the dock. */}
      {(() => {
        // Terminal — dock carries the next valid action only.
        // The body terminal result module already shows the result
        // message and value; the dock must not duplicate it.
        if (isTerminal) {
          // Determine the next valid action for each terminal state.
          let terminalAction: { label: string; onPress: () => void; accessibilityLabel: string } | undefined;

          if (viewerState === 'won') {
            // Winner — only expose the backend-backed fulfilment action.
            terminalAction = auctionFulfilment?.orderId
              ? {
                  label: auctionFulfilment.buyerNextAction ?? 'View order',
                  onPress: () => {
                    navigation.navigate('OrderDetail', { orderId: auctionFulfilment.orderId! });
                  },
                  accessibilityLabel: auctionFulfilment.buyerNextAction ?? 'View auction order',
                }
              : {
                  label: 'View purchases',
                  onPress: () => navigation.navigate('MyOrders'),
                  accessibilityLabel: 'Purchases',
                };
          } else if (viewerState === 'lost' || (isSeller && auction.bidCount === 0)) {
            terminalAction = {
              label: 'Discover similar',
              onPress: () => navigation.navigate('AuctionHome'),
              accessibilityLabel: 'Discover similar auctions',
            };
          } else if (isSeller && auction.bidCount > 0) {
            // Seller with a sale — fulfilment next step.
            terminalAction = auctionFulfilment?.orderId
              ? {
                  label: auctionFulfilment.sellerNextAction ?? 'View order',
                  onPress: () => {
                    navigation.navigate('OrderDetail', { orderId: auctionFulfilment.orderId! });
                  },
                  accessibilityLabel: auctionFulfilment.sellerNextAction ?? 'View sale order',
                }
              : {
                  label: 'Seller centre',
                  onPress: () => navigation.navigate('SellerAuctionCentre'),
                  accessibilityLabel: 'Open seller auction centre',
                };
          } else {
            // Not participating (or any other terminal state) — offer
            // discovery as the next valid step so the dock is never
            // empty in a terminal state.
            terminalAction = {
              label: 'Discover similar',
              onPress: () => navigation.navigate('AuctionHome'),
              accessibilityLabel: 'Discover similar auctions',
            };
          }

          return terminalAction ? (
            <CommerceDetailStateDock
              primaryAction={terminalAction}
            />
          ) : null;
        }

        // ── Post-end lifecycle states ──
        // reserve_not_met, awaiting_payment, payment_expired,
        // second_chance_offered. The body status banner communicates the
        // state; the dock carries the single next valid action. Uses
        // presentation.stateLabel for the dock badge so the dock and
        // banner stay in sync.
        if (isPostEnd) {
          const postEndBadge = presentation ? (
            <Text style={[styles.dockStateBadge, { color: colors.textPrimary }]}>
              {presentation.stateLabel}
            </Text>
          ) : undefined;

          // Reserve not met — seller can accept highest bid; others get discovery.
          if (isReserveNotMet) {
            if (isSeller && auction.bidCount > 0) {
              return (
                <CommerceDetailStateDock
                  stateBadge={postEndBadge}
                  value={terminalAmountText}
                  valueLabel="Highest bid"
                  primaryAction={{
                    label: isAcceptHighestBidLoading ? 'Accepting…' : 'Accept highest bid',
                    onPress: () => { haptics.press(); void handleAcceptHighestBid(); },
                    loading: isAcceptHighestBidLoading,
                    disabled: isAcceptHighestBidLoading,
                    accessibilityLabel: 'Accept the highest bid',
                  }}
                  secondaryAction={{
                    label: 'Manage',
                    onPress: () => navigation.navigate('SellerAuctionCentre'),
                    accessibilityLabel: 'Manage auction in seller centre',
                    primary: false,
                  }}
                />
              );
            }
            return (
              <CommerceDetailStateDock
                stateBadge={postEndBadge}
                value={terminalAmountText}
                valueLabel="Highest bid"
                primaryAction={{
                  label: 'Discover similar',
                  onPress: () => navigation.navigate('AuctionHome'),
                  accessibilityLabel: 'Discover similar auctions',
                }}
              />
            );
          }

          // Awaiting payment — winner pays; seller/others wait.
          if (isAwaitingPayment) {
            if (viewerState === 'won') {
              return (
                <CommerceDetailStateDock
                  stateBadge={postEndBadge}
                  value={terminalAmountText}
                  valueLabel="Amount due"
                  subtitle={paymentDeadlineCountdown && !paymentDeadlineCountdown.isExpired
                    ? `Pay within ${paymentDeadlineCountdown.text}`
                    : undefined}
                  primaryAction={{
                    label: isPayLoading ? 'Processing…' : 'Pay now',
                    onPress: () => { haptics.press(); void handlePayNow(); },
                    loading: isPayLoading,
                    disabled: isPayLoading,
                    accessibilityLabel: 'Pay for this auction now',
                  }}
                  secondaryAction={auctionFulfilment?.orderId
                    ? {
                        label: 'View order',
                        onPress: () => navigation.navigate('OrderDetail', { orderId: auctionFulfilment.orderId! }),
                        accessibilityLabel: 'View auction order',
                        primary: false,
                      }
                    : undefined}
                />
              );
            }
            if (isSeller) {
              return (
                <CommerceDetailStateDock
                  stateBadge={postEndBadge}
                  value={terminalAmountText}
                  valueLabel="Highest bid"
                  subtitle="Awaiting buyer payment"
                  primaryAction={{
                    label: 'Manage auction',
                    onPress: () => navigation.navigate('SellerAuctionCentre'),
                    accessibilityLabel: 'Manage auction in seller centre',
                  }}
                />
              );
            }
            return (
              <CommerceDetailStateDock
                stateBadge={postEndBadge}
                value={terminalAmountText}
                valueLabel="Final bid"
                primaryAction={{
                  label: 'Discover similar',
                  onPress: () => navigation.navigate('AuctionHome'),
                  accessibilityLabel: 'Discover similar auctions',
                }}
              />
            );
          }

          // Payment expired / second chance offered — recipient gets
          // accept/decline; everyone else gets discovery.
          if (isPaymentExpired || isSecondChanceOffered) {
            if (isSecondChanceRecipient) {
              return (
                <CommerceDetailStateDock
                  stateBadge={postEndBadge}
                  value={terminalAmountText}
                  valueLabel="Second chance"
                  subtitle={paymentDeadlineCountdown && !paymentDeadlineCountdown.isExpired
                    ? `${paymentDeadlineCountdown.text} to decide`
                    : undefined}
                  primaryAction={{
                    label: isAcceptSecondChanceLoading ? 'Accepting…' : 'Accept second chance',
                    onPress: () => { haptics.press(); void handleAcceptSecondChance(); },
                    loading: isAcceptSecondChanceLoading,
                    disabled: isAcceptSecondChanceLoading,
                    accessibilityLabel: 'Accept the second chance offer',
                  }}
                  secondaryAction={{
                    label: isDeclineSecondChanceLoading ? 'Declining…' : 'Decline',
                    onPress: () => { haptics.tap(); void handleDeclineSecondChance(); },
                    loading: isDeclineSecondChanceLoading,
                    disabled: isDeclineSecondChanceLoading,
                    accessibilityLabel: 'Decline the second chance offer',
                    primary: false,
                  }}
                />
              );
            }
            return (
              <CommerceDetailStateDock
                stateBadge={postEndBadge}
                value={terminalAmountText}
                valueLabel="Final bid"
                primaryAction={{
                  label: 'Discover similar',
                  onPress: () => navigation.navigate('AuctionHome'),
                  accessibilityLabel: 'Discover similar auctions',
                }}
              />
            );
          }
        }

        // Seller view — calm state, no primary action.
        if (isSeller) {
          return (
            <CommerceDetailStateDock
              stateBadge={
                <Text style={[styles.dockStateBadge, { color: colors.textPrimary }]}>
                  Seller view
                </Text>
              }
              subtitle={
                isUpcoming
                  ? 'Your auction is scheduled'
                  : `${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'} so far`
              }
              primaryAction={{
                label: 'Manage auction',
                onPress: () => navigation.navigate('SellerAuctionCentre'),
                accessibilityLabel: 'Manage auction in seller centre',
              }}
            />
          );
        }

        // Live bidder — current/min next bid + Place bid (+ optional Buy now).
        if (showBidControls && stateAction && stateAction.primary.type !== 'none') {
          const dockValue = isLive && auction.minimumNextBidGbp > 0
            ? formatFromFiat(auction.minimumNextBidGbp, currencyCode)
            : priceText;
          const dockValueLabel = isLive && auction.minimumNextBidGbp > 0
            ? 'Min next bid'
            : priceLabel;
          // Show countdown as subtitle when live so urgency follows the
          // user as they scroll — they don't need to scroll up to see
          // time remaining. Uses the same per-second format as the
          // primary state sentence for consistency.
          const dockSubtitle = isLive && liveMsToEnd > 0
            ? `Ends in ${formatCountdownSentence(liveMsToEnd)}`
            : isUpcoming && liveMsToStart > 0
              ? `Starts in ${formatCountdownSentence(liveMsToStart)}`
              : undefined;
          const primaryType = stateAction.primary.type;
          // For upcoming state, use "Notify me" as the primary label to
          // make the notification intent explicit (P4-10 spec).
          const primaryLabel = isUpcoming && primaryType === 'watchAuction'
            ? (auction.isWatched ? 'Watching' : 'Notify me')
            : stateAction.primary.label;
          return (
            <CommerceDetailStateDock
              value={dockValue}
              valueLabel={dockValueLabel}
              subtitle={dockSubtitle}
              thumbnailUri={auctionMediaItems[0]?.uri}
              showProtectionStrip={auction.buyerProtection ?? false}
              primaryAction={{
                label: primaryLabel,
                onPress: () => {
                  if (primaryType === 'placeBid' || primaryType === 'increaseBid' || primaryType === 'bidAgain') {
                    HapticPatterns.bidPlaced();
                    openBidSheet();
                  } else if (primaryType === 'watchAuction') {
                    haptics.tap();
                    void handleToggleWatch();
                  } else if (primaryType === 'viewSimilar') {
                    haptics.tap();
                    navigation.navigate('MainTabs', { screen: 'Explore' });
                  } else if (primaryType === 'viewResult') {
                    // Result continuation: won auction → navigate to checkout
                    // to complete payment, or to order detail if already paid.
                    haptics.tap();
                    if (auction.listingId) {
                      navigation.navigate('Checkout', { itemId: auction.listingId });
                    }
                  } else if (primaryType === 'viewOutcome') {
                    // Seller result continuation: navigate to seller auction
                    // centre to view sale outcome and arrange shipping.
                    haptics.tap();
                    navigation.navigate('SellerAuctionCentre');
                  } else if (primaryType === 'viewPerformance') {
                    haptics.tap();
                    navigation.navigate('SellerAuctionCentre');
                  }
                },
                loading: isSubmittingBid || watchToggling,
                disabled: isSubmittingBid || watchToggling,
                accessibilityLabel: primaryLabel,
              }}
              secondaryAction={
                buyNowAvailable && stateAction.secondary.type === 'buyNow'
                  ? {
                      // Per spec 02_AUCTION §6: button labels are
                      // "Place bid", "Bid again", "Increase bid", "Buy
                      // now". Price stays above buttons or inside the
                      // transaction surface, not in the button label.
                      label: isBuyNowLoading ? 'Processing…' : 'Buy now',
                      onPress: () => { haptics.press(); openBuyNowSheet(); },
                      disabled: isBuyNowLoading,
                      loading: isBuyNowLoading,
                      accessibilityLabel: `Buy now for ${formatFromFiat(auction.buyNowPriceGbp ?? 0, currencyCode)}`,
                    }
                  : undefined
              }
            />
          );
        }

        return null;
      })()}

      {/* ── Overflow sheet — Watchlist, Save to collection, wishlist (lower-frequency
          actions kept off the hero per spec 04 §1). ── */}
      <AuctionOverflowSheet
        visible={overflowVisible}
        onDismiss={() => setOverflowVisible(false)}
        isWatched={auction.isWatched}
        isUpcoming={isUpcoming}
        isSavedToCollection={social.isSavedToCollection}
        isLiked={social.isLiked}
        onToggleWatch={handleToggleWatch}
        onShare={social.openShare}
        onOpenCollectionPicker={guardedOpenCollectionPicker}
        onToggleLike={guardedToggleLike}
      />

      {/* ── Bid transaction sheet ── */}
      {auction && (
        <BidSheet
          visible={bidSheetVisible}
          onDismiss={closeBidSheet}
          auction={{
            id: auction.id,
            title: auction.title,
            imageUrl: auction.imageUrl,
            currentBidGbp: auction.currentBidGbp,
            minimumNextBidGbp: auction.minimumNextBidGbp,
            endsAt: auction.endsAt,
            sellerName: auction.seller.displayName ?? auction.seller.username,
            effectiveState: effectiveState ?? 'upcoming',
            isSeller,
            countdownText: isLive && liveMsToEnd > 0
              ? `Ends in ${formatCountdownSentence(liveMsToEnd)}`
              : isUpcoming && liveMsToStart > 0
                ? `Starts in ${formatCountdownSentence(liveMsToStart)}`
                : countdown.text,
          }}
          currencyCode={currencyCode}
          fxRates={fxRates}
          formatFromFiat={formatFromFiat}
          onSubmitBid={handleSubmitBid}
          onRefreshDetail={refreshDetailForTransaction}
          onReviewBuyNow={() => {
            setBidSheetVisible(false);
            setBuyNowSheetVisible(true);
          }}
          serverClockMs={minuteClock}
          initialBidAmount={initialBidAmount}
        />
      )}

      {/* ── Buy Now transaction sheet ── */}
      {auction && (
        <BuyNowSheet
          visible={buyNowSheetVisible}
          onDismiss={closeBuyNowSheet}
          auction={{
            id: auction.id,
            title: auction.title,
            imageUrl: auction.imageUrl,
            buyNowPriceGbp: auction.buyNowPriceGbp,
            sellerName: auction.seller.displayName ?? auction.seller.username,
            effectiveState: effectiveState ?? 'upcoming',
            isSeller,
          }}
          currencyCode={currencyCode}
          fxRates={fxRates}
          formatFromFiat={formatFromFiat}
          onSubmitBuyNow={handleSubmitBuyNow}
          onRefreshDetail={refreshDetailForTransaction}
        />
      )}

      {/* ── Bid history bottom sheet ── */}
      <AuctionBidHistorySheet
        visible={bidHistorySheetVisible}
        onDismiss={() => setBidHistorySheetVisible(false)}
        bidActivity={bidActivity}
        bidActivityError={bidActivityError}
        bidCount={auction.bidCount}
        serverNow={serverNowRef.current}
        formatFromFiat={formatFromFiat}
        onRetry={() => { setBidActivityError(false); void fetchDetail(); }}
      />

      {/* ── How bidding works bottom sheet ── */}
      <AuctionRulesSheet
        visible={rulesSheetVisible}
        onDismiss={() => setRulesSheetVisible(false)}
      />

      {/* ── Fullscreen media viewer ── */}
      <FullscreenMediaViewer
        media={auctionMediaItems}
        initialIndex={fullscreenMediaIndex}
        visible={mediaViewerVisible}
        onActiveIndexChange={setFullscreenMediaIndex}
        onClose={() => setMediaViewerVisible(false)}
      />

      {/* ── PRODUCT-01: Save to collection + share (shared social actions) ── */}
      <SaveToCollectionModal
        visible={social.collectionModalVisible}
        itemId={auction.id}
        onClose={social.closeCollectionPicker}
      />
      <ShareSheet
        visible={social.shareVisible}
        onDismiss={social.closeShare}
        url={`https://thryftverse.com/auction/${auction.id}`}
        title={auction.title}
      />

      <ConfirmationSheet
        visible={!!cancelAuctionConfirmation}
        onDismiss={dismissCancelAuctionConfirmation}
        title={cancelAuctionConfirmation?.title ?? ''}
        message={cancelAuctionConfirmation?.message}
        confirmLabel={cancelAuctionConfirmation?.confirmLabel}
        cancelLabel={cancelAuctionConfirmation?.cancelLabel}
        onConfirm={() => {
          const req = cancelAuctionConfirmation;
          dismissCancelAuctionConfirmation();
          if (req) void req.onConfirm();
        }}
        variant={cancelAuctionConfirmation?.variant ?? 'danger'}
      />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  recommendationSection: {
    marginTop: Space.md,
  },
  // ── Bid activity (consolidated pattern per spec 02_AUCTION §3) ──
  bidActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  bidActivityLeft: {
    flexDirection: 'column',
    gap: Space.xs,
    flexShrink: 1,
  },
  bidActivityLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
  },
  bidActivityBidder: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  bidActivityAmount: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  bidActivityViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
  },
  bidActivityViewAllText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  // ── Item details rows (per spec 02_AUCTION §5) ──
  itemDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  itemDetailLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
  },
  itemDetailValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  descriptionText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 4,
    fontFamily: FontFamily.regular,
  },
  // ── Terminal result — one compact module ──
  // Per Design.md between-group spacing: 24px after media for a
  // deliberate chapter break. The terminal result is the first
  // content module after media in terminal states.
  terminalResultModule: {
    marginHorizontal: Space.md,
    marginTop: Space.lg,
    paddingVertical: Space.md,
    gap: Space.sm,
  },
  terminalResultTitleWon: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  terminalResultTitleLost: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  terminalResultTitleSold: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  terminalResultValue: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  terminalResultNote: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
  },
  // ── Prominent countdown timer bar ──
  // Sits at the top of content, immediately below the media stage.
  // Red background when < 1 hour (urgency), surface otherwise.
  // Color-dependent values are applied inline in the render section.
  countdownBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countdownBarText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    flex: 1,
  },
  countdownBarUrgencyDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: (Space.xs + 2) / 2,
  },
  // ── Transaction surface internal rows ──
  // Primary state sentence — one dominant line in the headline aside.
  // Uses tabular numerals so per-second countdown updates don't cause
  // layout shift. Color is applied inline from the primaryState memo
  // so only one accent communicates urgency.
  primaryStateSentence: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // Subordinate metadata — countdown demotes here when the viewer-state
  // sentence dominates. Kept small and neutral so it never competes
  // with the primary state sentence.
  subordinateMetadata: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
    marginTop: Space.sm,
  },
  transactionBidActivityRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  transactionBidActivityLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
  },
  transactionBidActivityValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  transactionMinRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  transactionMinLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing,
  },
  transactionMinValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  transactionStatusRow: {
    gap: Space.xs,
  },
  // ── Bottom sheet styles ──
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: Space.md,
  },
  sheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  sheetSubtitle: {},
  sheetScroll: {
    flex: 1,
  },
  rulesContainer: {
    gap: Space.lg,
  },
  ruleItem: {
    flexDirection: 'row',
    gap: Space.md,
    alignItems: 'flex-start',
  },
  ruleNumber: {
    width: Space.xl,
    height: Space.xl,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  ruleNumberText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  ruleContent: {
    flex: 1,
    gap: Space.xs,
  },
  ruleTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  ruleDescription: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
  },
  // ── Seller identity extension ──
  // Tight rhythm: the seller row follows the transaction surface
  // or terminal result. paddingVertical Space.sm + xs (12px) keeps
  // the seller row connected to the content above without excessive
  // white space, while the hairline border provides visual separation.
  identityExtension: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent', // overridden inline with theme color
  },
  descriptionBlock: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  dockStateBadge: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: LetterSpacing.normal,
    fontVariant: ['tabular-nums'],
  },
  overflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Space.xxl,
  },
  overflowRowText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
  },
  discoverLinkInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.smMd,
    alignSelf: 'center',
  },
  discoverLinkInlineText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
  },
  // ── Seller cancel action ──
  // Restrained: a muted text link centered in a secondary position.
  // Not a prominent CTA — destructive intent is communicated by the
  // text itself, not by a red button or card container.
  sellerCancelRow: {
    alignItems: 'center',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  sellerCancelText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
  },
  // ── Bid history sheet rows ──
  // Per 2026 Apple HIG: compact flat rows, not cards. No outer
  // container border or background — just hairline-separated rows
  // on the sheet's own surface. The top bid gets a subtle tint.
  bidList: {
    // No card container — flat rows on the sheet surface.
  },
  bidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bidRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  viewerBadge: {
    borderRadius: RadiusRoleValue.compactControl,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
  },
  viewerBadgeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  bidderName: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  bidRowInfo: {
    flexDirection: 'column',
    gap: Space.xs,
  },
  bidRowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  bidRelativeTime: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  bidRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  bidAmount: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  topBidLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  noBidsText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
  },
  subSectionError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: RadiusRoleValue.mediaThumbnail,
  },
  subSectionErrorText: {},
  retryText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
  },
});
