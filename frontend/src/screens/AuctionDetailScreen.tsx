import React, { useRef } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useSharedValue, useAnimatedScrollHandler, FadeIn } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { Motion } from '../theme/motionTokens';
import { CommerceStateCanvas } from '../components/commerce';
import { CommerceDetailHeader } from '../components/commerce/detail';
import {
  buildAuctionViewModel,
  useProductSocialState,
} from '../platform/product';
import { useStore } from '../store/useStore';
import { useSignupWall } from '../hooks/useSignupWall';
import { AuctionTerminalResult } from '../components/auction';
import {
  AuctionDetailHero,
  AuctionDetailStatusBanners,
  AuctionBidPanel,
  AuctionDetailSellerSection,
  AuctionDetailInfoSections,
  AuctionDetailDiscovery,
  AuctionDetailDock,
  AuctionDetailSheets,
} from '../components/auctiondetail';
import { useAuctionDetail } from '../hooks/useAuctionDetail';
import { useAuctionDetailPresentation } from '../hooks/auctiondetail';
import { track } from '../analytics/track';

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
  } = route.params ?? {};
  const { requireAuth } = useSignupWall();
  const { currencySymbol } = useFormattedPrice();
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
  const [sellerActionsVisible, setSellerActionsVisible] = React.useState(false);

  React.useEffect(() => {
    track('auction_viewed', { auction_id: auctionId });
  }, [auctionId]);

  const currentUser = useStore((state) => state.currentUser);

  const { isCommerceCompact: isCompact } = useBreakpoint();
  const reducedMotion = useReducedMotion();

  // All derived presentation state — canonical detail input, timing,
  // countdown, price, presentation state, accessibility label, lifecycle
  // and viewer flags, media, terminal fulfilment labels, and dock
  // geometry. Lives in hooks/auctiondetail; relocations are verbatim.
  const derived = useAuctionDetailPresentation({
    auction,
    effectiveState,
    secondClock,
    minuteClock,
    isBuyNowLoading,
    currentUserId: currentUser?.id,
    bottomInset: insets.bottom,
  });

  // ── PRODUCT-01: unified view model + shared social state ──
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

  const handleTrackBid = React.useCallback(
    async (gbpAmount: number, idempotencyKey: string, maxBidGbp?: number) => {
      await handleSubmitBid(gbpAmount, idempotencyKey, maxBidGbp);
      track('auction_bid_placed', { auction_id: auctionId, bid_amount: gbpAmount });
    },
    [auctionId, handleSubmitBid],
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CommerceStateCanvas
          state="loading"
          family="auction"
          heroFraction={isCompact ? 0.54 : 0.58}
        />
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

  const sheetVisible =
    sellerActionsVisible || bidSheetVisible || buyNowSheetVisible ||
    overflowVisible || bidHistorySheetVisible || rulesSheetVisible ||
    mediaViewerVisible;

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
        contentContainerStyle={{ paddingBottom: derived.scrollBottomPadding }}
        accessibilityElementsHidden={sheetVisible}
        importantForAccessibility={sheetVisible ? 'no-hide-descendants' : 'auto'}
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
        {/* ── Zone A — Media stage + collapsed media rail ── */}
        <AuctionDetailHero
          auction={auction}
          mediaItems={derived.auctionMediaItems}
          scrollY={scrollY}
          isCompact={isCompact}
          accessibilityLabel={derived.accessibilityLabel}
          isSavedToCollection={social.isSavedToCollection}
          isLiked={social.isLiked}
          activeIndex={fullscreenMediaIndex}
          onBack={() => navigation.goBack()}
          onShare={social.openShare}
          onOpenCollectionPicker={guardedOpenCollectionPicker}
          onToggleLike={guardedToggleLike}
          onActiveIndexChange={setFullscreenMediaIndex}
          onOpenFullscreen={(index) => {
            setFullscreenMediaIndex(index);
            setMediaViewerVisible(true);
          }}
          onOverflow={() => setOverflowVisible(true)}
        />

        {/* ── Countdown bar + offline/freshness + post-end banners ── */}
        <AuctionDetailStatusBanners
          isLive={derived.isLive}
          liveMsToEnd={derived.liveMsToEnd}
          isUpcoming={derived.isUpcoming}
          liveMsToStart={derived.liveMsToStart}
          isTransitionRefreshing={isTransitionRefreshing}
          refreshing={refreshing}
          needsResync={needsResync}
          resyncFailed={resyncFailed}
          onRetry={handleRefresh}
          isReserveNotMet={derived.isReserveNotMet}
          isAwaitingPayment={derived.isAwaitingPayment}
          isPaymentExpired={derived.isPaymentExpired}
          isSecondChanceOffered={derived.isSecondChanceOffered}
          isSeller={derived.isSeller}
          viewerState={derived.viewerState}
          isSecondChanceRecipient={derived.isSecondChanceRecipient}
          paymentDeadlineCountdown={derived.paymentDeadlineCountdown}
        />

        {/* ── Zone C — Auction transaction surface ── */}
        <AuctionBidPanel
          isTerminal={derived.isTerminal}
          priceLabel={derived.priceLabel}
          priceText={derived.priceText}
          primaryState={derived.primaryState}
          reserveStatus={derived.reserveStatus}
          subordinateStateText={derived.subordinateStateText}
          isLive={derived.isLive}
          viewerState={derived.viewerState}
          bidCount={auction.bidCount}
          minimumNextBidGbp={auction.minimumNextBidGbp}
        />

        {/* ── Terminal result — one compact module, no duplicate title/brand ──
            Spec 04 §7: "Terminal: one result state, one next valid
            action." The result state lives here; the dock carries the
            next valid action. */}
        <AuctionTerminalResult
          isTerminal={derived.isTerminal}
          isCancelled={derived.isCancelled}
          viewerState={derived.viewerState}
          isPaymentConfirmed={derived.isPaymentConfirmed}
          isSettled={derived.isSettled}
          hasValidWinner={derived.hasValidWinner}
          terminalAmountText={derived.terminalAmountText}
          winnerSubtitle={derived.winnerSubtitle}
          sellerSaleTitle={derived.sellerSaleTitle}
          sellerSubtitle={derived.sellerSubtitle}
          onDiscoverSimilar={() => navigation.navigate('AuctionHome')}
        />

        {/* ── Seller identity extension + seller cancel link ── */}
        <AuctionDetailSellerSection
          auction={auction}
          isSeller={derived.isSeller}
          isLive={derived.isLive}
          isUpcoming={derived.isUpcoming}
          isCancelLoading={isCancelLoading}
          onCancelAuction={handleCancelAuction}
        />

        {/* ── Zone E — Item details, bid activity, auction rules ── */}
        <AuctionDetailInfoSections
          auction={auction}
          bidActivity={bidActivity}
          bidActivityError={bidActivityError}
          isLive={derived.isLive}
          serverNow={serverNowRef.current}
          onViewAllBids={() => setBidHistorySheetVisible(true)}
          onShowRules={() => setRulesSheetVisible(true)}
        />

        {/* ── Zone F — Discovery: related auctions + seen-in-looks rails ── */}
        <AuctionDetailDiscovery
          auction={auction}
          relatedAuctions={relatedAuctions}
          secondClock={secondClock}
        />
      </Reanimated.ScrollView>

      {/* ── Zone G — Sticky action dock ──
          Shared shell dock. Per spec 02_AUCTION §4: the body owns the
          detailed terminal result; the dock contains the action only.
          Do not repeat "You won", "Auction closed", "Sold" or "Ended
          without bids" in both the body and the dock. */}
      <AuctionDetailDock
        auction={auction}
        derived={derived}
        transactions={{
          isSubmittingBid,
          watchToggling,
          isBuyNowLoading,
          isPayLoading,
          isAcceptHighestBidLoading,
          isAcceptSecondChanceLoading,
          isDeclineSecondChanceLoading,
          openBidSheet,
          toggleWatch: handleToggleWatch,
          openBuyNowSheet,
          acceptHighestBid: handleAcceptHighestBid,
          payNow: handlePayNow,
          acceptSecondChance: handleAcceptSecondChance,
          declineSecondChance: handleDeclineSecondChance,
        }}
        onOpenSellerActions={() => setSellerActionsVisible(true)}
      />

      {/* ── Sheets + modals (rendered outside the a11y-hidden scroll
          content so they stay reachable while open) ── */}
      <AuctionDetailSheets
        auction={auction}
        derived={derived}
        effectiveState={effectiveState}
        social={social}
        minuteClock={minuteClock}
        serverNow={serverNowRef.current}
        bidActivity={bidActivity}
        bidActivityError={bidActivityError}
        initialBidAmount={initialBidAmount}
        overflowVisible={overflowVisible}
        bidSheetVisible={bidSheetVisible}
        buyNowSheetVisible={buyNowSheetVisible}
        bidHistorySheetVisible={bidHistorySheetVisible}
        sellerActionsVisible={sellerActionsVisible}
        rulesSheetVisible={rulesSheetVisible}
        mediaViewerVisible={mediaViewerVisible}
        fullscreenMediaIndex={fullscreenMediaIndex}
        onDismissOverflow={() => setOverflowVisible(false)}
        onToggleWatch={handleToggleWatch}
        onOpenCollectionPicker={guardedOpenCollectionPicker}
        onToggleLike={guardedToggleLike}
        onDismissBidSheet={closeBidSheet}
        onSubmitBid={handleTrackBid}
        onReviewBuyNow={() => {
          setBidSheetVisible(false);
          setBuyNowSheetVisible(true);
        }}
        onDismissBuyNowSheet={closeBuyNowSheet}
        onSubmitBuyNow={handleSubmitBuyNow}
        onRefreshDetail={refreshDetailForTransaction}
        onDismissBidHistory={() => setBidHistorySheetVisible(false)}
        onRetryBidHistory={() => { setBidActivityError(false); void fetchDetail(); }}
        onDismissSellerActions={() => setSellerActionsVisible(false)}
        onViewBids={() => setBidHistorySheetVisible(true)}
        onCancelAuction={handleCancelAuction}
        isCancelLoading={isCancelLoading}
        onDismissRules={() => setRulesSheetVisible(false)}
        onMediaIndexChange={setFullscreenMediaIndex}
        onCloseMediaViewer={() => setMediaViewerVisible(false)}
        cancelAuctionConfirmation={cancelAuctionConfirmation}
        onDismissConfirmation={dismissCancelAuctionConfirmation}
      />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
