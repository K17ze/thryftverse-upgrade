import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Text,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { haptics } from '../utils/haptics';
import { HapticPatterns } from '../utils/hapticPatterns';
import { useCurrencyContext } from '../context/CurrencyContext';
import { parseApiError } from '../lib/apiClient';
import { requestPushPermissionOnce } from '../lib/pushPermission';
import { Meta, BodyEmphasis, Headline } from '../components/ui/Text';
import { toIze, formatIzeAmount } from '../utils/currency';
import { Space, Radius, Typography, Type, DockConstants, LetterSpacing } from '../theme/designTokens';
import {
  getAuctionDetail,
  placeAuctionBid,
  buyAuctionNow,
  addToWatchlist,
  removeFromWatchlist,
  listAuctions,
  type AuctionDetail as AuctionDetailType,
  type AuctionBidActivity,
  type AuctionDetailResponse,
  type BuyNowResult,
  type MarketAuction,
} from '../services/marketApi';
import { BottomSheet } from '../components/BottomSheet';
import { BidSheet } from '../components/ui/BidSheet';
import { BuyNowSheet } from '../components/ui/BuyNowSheet';
import { FullscreenMediaViewer } from '../components/product/FullscreenMediaViewer';
import { RecommendationRail, ProductDetailSkeleton } from '../components/product';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { CommerceStickyDock, CommerceStateCanvas, CommerceRelatedRail, CategoryEvidence, CommerceMediaStage } from '../components/commerce';
import {
  CommerceDetailHeader,
  CommerceDetailIdentity,
  CommerceDetailTransactionSurface,
  CommerceDetailMetricRow,
  CommerceDetailDisclosureRow,
  CommerceDetailSection,
  CommerceDetailSellerRow,
  CommerceDetailStateDock,
  CommerceDetailMediaRail,
  CommerceDetailOfflineBanner,
  CommerceDetailFreshnessBanner,
  CommerceDetailUnavailableInline,
  COMMERCE_DETAIL_COMPACT_WIDTH,
} from '../components/commerce/detail';
import { resolveEvidenceGroups } from '../platform/commerce/categoryEvidence';
import {
  useBucketedServerClock,
  resolveAuctionTiming,
  type AuctionEffectiveState,
} from '../hooks/useServerClock';
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
import { createDmConversationOnApi } from '../services/chatApi';
import type { Listing } from '../services/listingsApi';
import {
  resolveStateAction,
  resolveDetailPriceLabel,
  resolveDetailPriceAmount,
  resolveDetailCountdown,
  resolveViewerContextMessage,
  isBuyNowAvailable,
  areBidControlsRemoved,
  buildDetailAccessibilityLabel,
  formatBidActivityRow,
  detectLifecycleTransition,
  type AuctionDetailInput,
  resolveReserveStatus,
} from '../utils/auctionDetailLogic';
import {
  AuctionStateBadge,
  AuctionCountdown,
  ReserveStatusBadge,
} from '../components/auction';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'AuctionDetail'>;

export default function AuctionDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const {
    auctionId,
    openBidSheet: shouldOpenBidSheet,
    initialBidAmount,
  } = route.params;
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates, displayMode } = useCurrencyContext();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const [auction, setAuction] = React.useState<AuctionDetailType | null>(null);
  const [bidActivity, setBidActivity] = React.useState<AuctionBidActivity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [bidActivityError, setBidActivityError] = React.useState(false);

  const [bidSheetVisible, setBidSheetVisible] = React.useState(false);
  const [buyNowSheetVisible, setBuyNowSheetVisible] = React.useState(false);
  const [isSubmittingBid, setIsSubmittingBid] = React.useState(false);
  const [isBuyNowLoading, setIsBuyNowLoading] = React.useState(false);
  const [watchToggling, setWatchToggling] = React.useState(false);
  // Per App Store / Google Play 2026 guidelines, push permission is requested
  // only after a meaningful user action — here, after the user watches/favorites
  // an auction for the first time. The ref guards within-session re-prompting;
  // requestPushPermissionOnce persists an AsyncStorage flag across sessions.
  const favoritePushAskedRef = React.useRef(false);
  const [isTransitionRefreshing, setIsTransitionRefreshing] = React.useState(false);
  const [bidHistorySheetVisible, setBidHistorySheetVisible] = React.useState(false);
  const [rulesSheetVisible, setRulesSheetVisible] = React.useState(false);
  const [mediaViewerVisible, setMediaViewerVisible] = React.useState(false);
  const [fullscreenMediaIndex, setFullscreenMediaIndex] = React.useState(0);
  const [overflowVisible, setOverflowVisible] = React.useState(false);
  const [relatedAuctions, setRelatedAuctions] = React.useState<MarketAuction[]>([]);
  const [relatedLoading, setRelatedLoading] = React.useState(false);

  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const [isResolvingConversation, setIsResolvingConversation] = React.useState(false);

  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < COMMERCE_DETAIL_COMPACT_WIDTH;
  const { isOffline } = useConnectivity();

  const serverNowRef = React.useRef<string | null>(null);
  const { secondClock, minuteClock, resync, needsResync, resyncFailed, markResyncFailed, clearResyncFailed } =
    useBucketedServerClock(serverNowRef.current);

  const prevLifecycleRef = React.useRef<AuctionEffectiveState | null>(null);

  // Guard against async state updates after the component unmounts.
  // fetchDetail and fetchRelatedAuctions both await network calls and
  // then call setState; without this guard those calls would fire on
  // an unmounted component, causing a memory-leak warning.
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchDetail = React.useCallback(async (): Promise<AuctionDetailResponse | null> => {
    try {
      const res = await getAuctionDetail(auctionId);
      if (!isMountedRef.current) return null;
      serverNowRef.current = res.serverNow;
      setAuction(res.auction);
      setBidActivity(res.bidActivity);
      setBidActivityError(false);
      setError(null);
      resync(res.serverNow);
      clearResyncFailed();
      return res;
    } catch (err) {
      if (!isMountedRef.current) return null;
      const parsed = parseApiError(err, 'Failed to load auction');
      setError(parsed.message);
      markResyncFailed();
      return null;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [auctionId, resync, clearResyncFailed, markResyncFailed]);

  React.useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const fetchRelatedAuctions = React.useCallback(async (category: string | null, currentId: string) => {
    setRelatedLoading(true);
    try {
      const result = await listAuctions({ status: 'live', category: category ?? undefined, limit: 6 });
      if (!isMountedRef.current) return;
      setRelatedAuctions(result.items.filter((a) => a.id !== currentId).slice(0, 4));
    } catch {
      if (!isMountedRef.current) return;
      setRelatedAuctions([]);
    } finally {
      if (isMountedRef.current) setRelatedLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (auction?.category) {
      void fetchRelatedAuctions(auction.category, auction.id);
    } else if (auction) {
      void fetchRelatedAuctions(null, auction.id);
    }
  }, [auction?.id, auction?.category, fetchRelatedAuctions]);

  React.useEffect(() => {
    if (needsResync) {
      void fetchDetail();
    }
  }, [needsResync, fetchDetail]);

  const effectiveState = React.useMemo(() => {
    if (!auction) return null;
    return resolveEffectiveState(auction, minuteClock);
  }, [auction, minuteClock]);

  React.useEffect(() => {
    if (!effectiveState) return;
    if (
      prevLifecycleRef.current !== null &&
      !isTransitionRefreshing &&
      detectLifecycleTransition(prevLifecycleRef.current, effectiveState)
    ) {
      setIsTransitionRefreshing(true);
      void fetchDetail().finally(() => {
        if (isMountedRef.current) setIsTransitionRefreshing(false);
      });
    }
    prevLifecycleRef.current = effectiveState;
  }, [effectiveState, fetchDetail, isTransitionRefreshing]);

  // Compound haptic feedback for viewer-state transitions. Fires once on
  const handleRefresh = () => {
    setRefreshing(true);
    void fetchDetail();
  };

  const handleToggleWatch = async () => {
    if (!auction || watchToggling) return;
    setWatchToggling(true);
    const wasWatching = auction.isWatched;
    setAuction({ ...auction, isWatched: !wasWatching });
    try {
      if (wasWatching) {
        await removeFromWatchlist(auctionId);
        show('Removed from watchlist', 'info');
      } else {
        await addToWatchlist(auctionId);
        show('Added to watchlist', 'info');
        // Contextual push permission prompt — ask once after the user adds an
        // item to their watchlist. Best-effort; never blocks the watch flow.
        if (!favoritePushAskedRef.current) {
          favoritePushAskedRef.current = true;
          requestPushPermissionOnce('favorite').catch(() => undefined);
        }
      }
    } catch {
      setAuction({ ...auction, isWatched: wasWatching });
      show('Failed to update watchlist', 'error');
    } finally {
      setWatchToggling(false);
    }
  };

  // Authoritative refresh that returns the fetched snapshot for transaction preflight
  const refreshDetailForTransaction = React.useCallback(async (): Promise<AuctionDetailResponse | null> => {
    return fetchDetail();
  }, [fetchDetail]);

  const openBidSheet = () => {
    if (!auction) return;
    setBidSheetVisible(true);
  };

  const closeBidSheet = () => {
    setBidSheetVisible(false);
  };

  // Auto-open BidSheet when arriving from an outbid notification
  React.useEffect(() => {
    if (shouldOpenBidSheet && auction && !loading && !bidSheetVisible) {
      // Only auto-open if the auction is still live (bidding is possible)
      const effectiveState = auction.lifecycle;
      if (effectiveState === 'live') {
        setBidSheetVisible(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldOpenBidSheet, auction, loading]);

  // PASS 6: Sheet owns transaction feedback. Parent only calls API and returns typed result.
  // No duplicate toast — sheet handles inline error/success presentation.
  const handleSubmitBid = async (gbpAmount: number, idempotencyKey: string): Promise<void> => {
    if (!auction || isSubmittingBid) return;
    setIsSubmittingBid(true);

    try {
      await placeAuctionBid(auction.id, { amountGbp: gbpAmount, idempotencyKey });
      // Post-success refresh — do not convert to error if refresh fails
      await fetchDetail();
    } catch (err) {
      // Sheet owns reconciliation refresh — parent does not duplicate
      throw err;
    } finally {
      setIsSubmittingBid(false);
    }
  };

  const openBuyNowSheet = () => {
    if (!auction?.buyNowPriceGbp || isBuyNowLoading) return;
    setBuyNowSheetVisible(true);
  };

  const closeBuyNowSheet = () => {
    setBuyNowSheetVisible(false);
  };

  // PASS 4: Buy Now calls dedicated API, verifies isBuyNow in response
  // PASS 6: Sheet owns feedback — no duplicate toast from parent
  const handleSubmitBuyNow = async (gbpAmount: number, idempotencyKey: string): Promise<BuyNowResult> => {
    if (!auction?.buyNowPriceGbp || isBuyNowLoading) throw new Error('Buy Now not available');
    setIsBuyNowLoading(true);

    try {
      const result = await buyAuctionNow(auction.id, {
        idempotencyKey,
        expectedPriceGbp: gbpAmount,
      });
      // Verify the response explicitly confirms Buy Now
      if (!result.isBuyNow) {
        throw new Error('The response did not confirm the Buy Now winning bid. Please try again.');
      }
      // Post-success refresh — do not convert to error if refresh fails
      try {
        await fetchDetail();
      } catch {
        // Retain successful transaction result; sheet shows sync-pending message
      }
      return result;
    } catch (err) {
      // Sheet owns reconciliation refresh — parent does not duplicate
      throw err;
    } finally {
      setIsBuyNowLoading(false);
    }
  };

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
      winnerBidderId: auction.winnerBidderId,
      lifecycle: auction.lifecycle,
      terminalReason: auction.terminalReason,
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
    return formatFromFiat(priceAmount, 'GBP');
  }, [priceLabel, priceAmount, formatFromFiat]);

  const countdown = React.useMemo(() => {
    if (!timing) return { text: '', isFinalMinutes: false, stage: 'plenty' as const };
    return resolveDetailCountdown(timing, secondClock, minuteClock);
  }, [timing, secondClock, minuteClock]);

  const countdownProgress = React.useMemo(() => {
    if (!auction || !timing) return undefined;
    const totalMs = new Date(auction.endsAt).getTime() - new Date(auction.startsAt).getTime();
    if (totalMs <= 0) return undefined;
    const elapsedMs = minuteClock - new Date(auction.startsAt).getTime();
    return Math.max(0, Math.min(1, elapsedMs / totalMs));
  }, [auction, timing, minuteClock]);

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

  const viewerContext = React.useMemo(() => {
    if (!detailInput || !timing) return null;
    return resolveViewerContextMessage(timing.effectiveState, detailInput.viewerState, detailInput, formatFromFiat);
  }, [detailInput, timing, formatFromFiat]);

  const isLive = effectiveState === 'live';
  const isUpcoming = effectiveState === 'upcoming';
  const isEnded = effectiveState === 'ended';
  const isCancelled = effectiveState === 'cancelled';
  const isSettled = effectiveState === 'settled';
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
  const showBidControls = !isTerminal && !isSeller;
  const treatmentStyle = stateAction?.viewerTreatment ?? 'none';

  // ── PRODUCT-01: unified view model + shared social state + seller trust + recommendations ──
  const viewModel = React.useMemo(() => {
    if (!auction) return null;
    return buildAuctionViewModel({
      auction,
      currentUserId: currentUser?.id,
    });
  }, [auction, currentUser?.id]);

  const social = useProductSocialState(viewModel);

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

  const handlePressRecommendation = React.useCallback((recItem: Listing) => {
    navigation.push('ItemDetail', { itemId: recItem.id });
  }, [navigation]);
  const handlePressLook = React.useCallback((lookItem: RecommendationLook) => {
    navigation.navigate('LookDetail', { lookId: lookItem.id });
  }, [navigation]);

  const handlePressRelatedAuction = React.useCallback((id: string) => {
    navigation.push('AuctionDetail', { auctionId: id });
  }, [navigation]);

  // Family badge state accent
  const familyStateAccent = isLive ? 'Live' : isUpcoming ? 'Upcoming' : isCancelled ? 'Cancelled'
    : isSettled ? 'Settled' : isEnded ? 'Ended' : null;

  // ── Canonical media array ──
  // Per spec 02_AUCTION §7: render the canonical media array through
  // CommerceMediaStage. Maintain imageUrl as a temporary compatibility
  // field.
  const auctionMediaItems = React.useMemo(() => {
    if (!auction) return [];
    if (auction.mediaItems && auction.mediaItems.length > 0) {
      return auction.mediaItems
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          id: item.id,
          uri: item.url,
          kind: item.type,
          posterUri: item.posterUrl,
          width: item.width,
          height: item.height,
          focalPoint: item.focalX != null && item.focalY != null
            ? { x: item.focalX, y: item.focalY }
            : null,
          fit: item.focalX != null && item.focalY != null ? 'cover' as const : 'contain' as const,
          altText: `${auction.title} ${item.type}`,
        }));
    }
    return auction.imageUrl
      ? [{
          uri: auction.imageUrl,
          kind: 'image' as const,
          fit: 'contain' as const,
          altText: auction.title,
        }]
      : [];
  }, [auction]);

  // ── Fulfilment summary ──
  // Per spec 02_AUCTION §8: backend-backed result/fulfilment contract.
  // The frontend must not invent next steps.
  const auctionFulfilment = auction?.fulfilment ?? null;
  const terminalAmountGbp =
    auction && auction.bidCount > 0 && Number.isFinite(auction.currentBidGbp)
      ? auction.currentBidGbp
      : null;
  const terminalAmountText =
    terminalAmountGbp != null
      ? formatFromFiat(terminalAmountGbp, 'GBP')
      : 'Amount unavailable';

  // Compute scroll bottom padding from dock geometry + safe area so the
  // sticky dock never covers the last content row.
  const hasDualDock = showBidControls && buyNowAvailable && stateAction?.secondary.type === 'buyNow' && !isBuyNowLoading;
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
          onSave={social.openCollectionPicker}
          onToggleFav={social.toggleLike}
          isFav={social.isLiked}
          isSaved={social.isSavedToCollection}
          showDefaultControls={false}
          heightFraction={isCompact ? 0.54 : 0.58}
          initialIndex={fullscreenMediaIndex}
          onActiveIndexChange={setFullscreenMediaIndex}
          onOpenFullscreen={(index) => {
            setFullscreenMediaIndex(index);
            setMediaViewerVisible(true);
          }}
          overlayTopContent={
            <View style={styles.stateBadgeOverlay}>
              <AuctionStateBadge
                state={isLive ? 'live' : isUpcoming ? 'upcoming' : isCancelled ? 'cancelled' : isSettled ? 'settled' : 'ended'}
              />
            </View>
          }
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
              onPress: social.openCollectionPicker,
              isActive: social.isSavedToCollection,
            },
          ]}
          onOverflow={() => setOverflowVisible(true)}
          showOverflow
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

        {/* ── Zone B — Identity seam ──
            One compact identity composition: eyebrow + title + condition.
            Per spec 02 §B + spec 05 §3: auction identity must NOT show
            price (the transaction surface owns the current bid) and
            must NOT show a second family/state chip (the media overlay
            already carries AuctionStateBadge). */}
        {/* ── Zone C — Auction transaction surface ──
            One strong contained module: current bid + bid count + reserve
            + countdown + viewer state. Replaces the stacked
            transactionModule + outbid/leading/watching blocks. Spec 02 §C
            + spec 04 §3/§4: "Integrate viewer state into the transaction
            surface rather than adding another full-width block." */}
        {!isTerminal && (
          <CommerceDetailTransactionSurface
            family="auction"
            flush
            surfaceColor={colors.surface}
            primaryLabel={priceLabel}
            primaryValue={priceText}
            headlineAside={
              <AuctionCountdown
                text={countdown.text}
                urgent={countdown.isFinalMinutes}
                stage={countdown.stage}
                progress={isLive ? countdownProgress : undefined}
                showProgress={isLive}
                prominent
              />
            }
            viewerState={
              viewerContext ? (
                <Text
                  style={[
                    styles.viewerStateLine,
                    viewerContext.treatment === 'warning' && { color: colors.danger },
                    viewerContext.treatment === 'calm' && { color: colors.success },
                    viewerContext.treatment === 'seller' && { color: colors.brand },
                    viewerContext.treatment === 'restrained' && { color: colors.textSecondary },
                  ]}
                  numberOfLines={2}
                  accessibilityLiveRegion="polite"
                >
                  {viewerContext.title}
                  {viewerContext.subtitle ? `  ·  ${viewerContext.subtitle}` : ''}
                </Text>
              ) : undefined
            }
            statusRow={reserveStatus !== 'none' ? (
              <View style={styles.transactionStatusRow}>
                <View style={styles.transactionReserveRow}>
                  <ReserveStatusBadge status={reserveStatus} showExplanation />
                  {reserveStatus === 'not-met' && isLive && (
                    <Text style={[styles.transactionReserveHint, { color: colors.textSecondary }]} numberOfLines={1}>
                      Bidding continues until reserve is met
                    </Text>
                  )}
                </View>
              </View>
            ) : undefined}
          >
            <View style={[styles.transactionBidActivityRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.transactionBidActivityLabel, { color: colors.textSecondary }]}>
                Bid activity
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
                  {formatFromFiat(auction.minimumNextBidGbp, 'GBP')}
                </Text>
              </View>
            )}
          </CommerceDetailTransactionSurface>
        )}

        {/* ── Terminal result — one compact module, no duplicate title/brand ──
            Spec 04 §7: "Terminal: one result state, one next valid
            action." The result state lives here; the dock carries the
            next valid action. */}
        {isTerminal && !isCancelled && (
          <View style={styles.terminalResultModule}>
            {viewerState === 'won' && (
              <>
                <Text style={[styles.terminalResultTitleWon, { color: colors.success }]}>You won</Text>
                <Text style={[styles.terminalResultValue, { color: colors.textPrimary }]}>
                  {terminalAmountText}
                </Text>
                <Text style={[styles.terminalResultNote, { color: colors.textSecondary }]}>
                  {auctionFulfilment?.buyerNextAction
                    ? auctionFulfilment.buyerNextAction
                    : auctionFulfilment?.fulfilmentStatus
                      ? `Fulfilment · ${auctionFulfilment.fulfilmentStatus.replace(/_/g, ' ')}`
                      : 'Fulfilment details are not available yet.'}
                </Text>
              </>
            )}
            {viewerState === 'lost' && (
              <>
                <Text style={[styles.terminalResultTitleLost, { color: colors.textPrimary }]}>Auction closed</Text>
                <Text style={[styles.terminalResultValue, { color: colors.textPrimary }]}>
                  {terminalAmountText}
                </Text>
                <Pressable
                  style={styles.discoverLinkInline}
                  onPress={() => navigation.navigate('AuctionHome')}
                  accessibilityRole="button"
                  accessibilityLabel="Discover similar auctions"
                >
                  <Ionicons name="search-outline" size={14} color={colors.brand} />
                  <Text style={[styles.discoverLinkInlineText, { color: colors.brand }]}>Discover similar</Text>
                  <Ionicons name="chevron-forward" size={12} color={colors.brand} />
                </Pressable>
              </>
            )}
            {viewerState === 'seller' && auction.bidCount > 0 && (
              <>
                <Text style={[styles.terminalResultTitleSold, { color: colors.success }]}>Sold</Text>
                <Text style={[styles.terminalResultValue, { color: colors.textPrimary }]}>
                  {terminalAmountText}
                </Text>
                <Text style={[styles.terminalResultNote, { color: colors.textSecondary }]}>
                  {auctionFulfilment?.sellerNextAction
                    ? auctionFulfilment.sellerNextAction
                    : auctionFulfilment?.fulfilmentStatus
                      ? `Fulfilment · ${auctionFulfilment.fulfilmentStatus.replace(/_/g, ' ')}`
                      : 'Fulfilment details are not available yet.'}
                </Text>
              </>
            )}
            {viewerState === 'seller' && auction.bidCount === 0 && (
              <Text style={[styles.terminalResultTitleLost, { color: colors.textPrimary }]}>Ended without bids</Text>
            )}
            {viewerState === 'not_participating' && (
              <>
                <Text style={[styles.terminalResultTitleLost, { color: colors.textPrimary }]}>Auction closed</Text>
                <Text style={[styles.terminalResultValue, { color: colors.textPrimary }]}>
                  {terminalAmountText}
                </Text>
              </>
            )}
          </View>
        )}

        {/* ── Cancelled terminal module ── */}
        {isCancelled && (
          <View style={styles.terminalResultModule}>
            <Text style={[styles.terminalResultTitleLost, { color: colors.textPrimary }]}>Auction cancelled</Text>
            <Text style={[styles.terminalResultNote, { color: colors.textSecondary }]}>
              Cancelled by the seller or platform. Any payment or release status appears in your orders.
            </Text>
          </View>
        )}

        <View style={[styles.identityExtension, { borderTopColor: colors.borderSubtle }]}>
          <CommerceDetailSellerRow
            name={auction.seller.displayName ?? auction.seller.username}
            verified={sellerTrustData?.verified}
            ratingLine={
              sellerTrustData?.rating != null
                ? `${sellerTrustData.rating.toFixed(1)}${sellerTrustData?.reviewCount != null ? ` · ${sellerTrustData.reviewCount} reviews` : ''}`
                : undefined
            }
            onPress={() => navigation.navigate('UserProfile', { userId: auction.seller.id })}
            primaryAction={
              !isSeller
                ? {
                    label: isResolvingConversation ? 'Starting…' : 'Message',
                    onPress: async () => {
                      if (!currentUser?.id) {
                        show('Sign in to message the seller.', 'error');
                        return;
                      }
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
                        show('Could not start conversation. Please try again.', 'error');
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
                      if (!currentUser?.id) {
                        show('Sign in to follow this seller.', 'error');
                        return;
                      }
                      sellerFollowMutation.mutate(undefined, {
                        onSuccess: (data) => {
                          show(data.isFollowing ? 'Followed seller' : 'Unfollowed seller', 'success');
                        },
                        onError: () => {
                          show('Could not follow seller. Please try again.', 'error');
                        },
                      });
                    },
                  }
                : undefined
            }
          />
        </View>

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
                priceText: formatFromFiat(relPrice, 'GBP'),
                izeText: displayMode !== 'fiat' ? formatIzeAmount(toIze(relPrice, 'GBP', goldRates), 2) : undefined,
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
              onPressItem={(recItem) => {
                if (isRecommendationLook(recItem)) {
                  handlePressLook(recItem);
                } else {
                  handlePressRecommendation(recItem as Listing);
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
                  accessibilityLabel: 'View your purchases',
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
            ? formatFromFiat(auction.minimumNextBidGbp, 'GBP')
            : priceText;
          const dockValueLabel = isLive && auction.minimumNextBidGbp > 0
            ? 'Min next bid'
            : priceLabel;
          // Show countdown as subtitle when live so urgency follows the
          // user as they scroll — they don't need to scroll up to see
          // time remaining.
          const dockSubtitle = isLive && countdown.text
            ? countdown.isFinalMinutes
              ? `Ends in ${countdown.text}`
              : countdown.text
            : isUpcoming && countdown.text
              ? countdown.text
              : undefined;
          const primaryType = stateAction.primary.type;
          return (
            <CommerceDetailStateDock
              value={dockValue}
              valueLabel={dockValueLabel}
              subtitle={dockSubtitle}
              thumbnailUri={auctionMediaItems[0]?.uri}
              showProtectionStrip={auction.buyerProtection ?? false}
              primaryAction={{
                label: stateAction.primary.label,
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
                  }
                },
                loading: isSubmittingBid || watchToggling,
                disabled: isSubmittingBid || watchToggling,
                accessibilityLabel: stateAction.primary.label,
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
                      accessibilityLabel: `Buy now for ${formatFromFiat(auction.buyNowPriceGbp ?? 0, 'GBP')}`,
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
      <BottomSheet
        visible={overflowVisible}
        onDismiss={() => setOverflowVisible(false)}
        snapPoint={0.4}
      >
        <View style={styles.sheetHeader}>
          <Headline style={styles.sheetTitle}>More actions</Headline>
        </View>
        <Pressable
          style={[styles.overflowRow, { borderColor: colors.borderSubtle }]}
          onPress={() => {
            setOverflowVisible(false);
            handleToggleWatch();
          }}
          accessibilityRole="button"
          accessibilityLabel={auction.isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
          accessibilityState={{ selected: auction.isWatched }}
        >
          <Ionicons
            name={auction.isWatched ? 'eye' : 'eye-outline'}
            size={20}
            color={auction.isWatched ? colors.brand : colors.textPrimary}
          />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>
            {auction.isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.overflowRow, { borderColor: colors.borderSubtle }]}
          onPress={() => {
            setOverflowVisible(false);
            social.openShare();
          }}
          accessibilityRole="button"
          accessibilityLabel="Share auction"
        >
          <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>Share auction</Text>
        </Pressable>
        <Pressable
          style={[styles.overflowRow, { borderColor: colors.borderSubtle }]}
          onPress={() => {
            setOverflowVisible(false);
            social.openCollectionPicker();
          }}
          accessibilityRole="button"
          accessibilityLabel={social.isSavedToCollection ? 'Saved to collection' : 'Save to collection'}
          accessibilityState={{ selected: social.isSavedToCollection }}
        >
          <Ionicons
            name={social.isSavedToCollection ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={social.isSavedToCollection ? colors.brand : colors.textPrimary}
          />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>
            {social.isSavedToCollection ? 'Saved to collection' : 'Save to collection'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.overflowRow, { borderColor: colors.borderSubtle }]}
          onPress={() => {
            setOverflowVisible(false);
            social.toggleLike();
          }}
          accessibilityRole="button"
          accessibilityLabel={social.isLiked ? 'Remove from wishlist' : 'Add to wishlist'}
          accessibilityState={{ selected: social.isLiked }}
        >
          <Ionicons
            name={social.isLiked ? 'heart' : 'heart-outline'}
            size={20}
            color={social.isLiked ? colors.danger : colors.textPrimary}
          />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>
            {social.isLiked ? 'Remove from wishlist' : 'Add to wishlist'}
          </Text>
        </Pressable>
        <View style={{ height: Space.md }} />
      </BottomSheet>

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
            countdownText: countdown.text,
          }}
          currencyCode={currencyCode}
          goldRates={goldRates}
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
          formatFromFiat={formatFromFiat}
          onSubmitBuyNow={handleSubmitBuyNow}
          onRefreshDetail={refreshDetailForTransaction}
        />
      )}

      {/* ── Bid history bottom sheet ── */}
      <BottomSheet
        visible={bidHistorySheetVisible}
        onDismiss={() => setBidHistorySheetVisible(false)}
        snapPoint={0.6}
      >
        <View style={styles.sheetHeader}>
          <Headline style={styles.sheetTitle}>Bid history</Headline>
          {auction && auction.bidCount > 0 && (
            <Meta style={[styles.sheetSubtitle, { color: colors.textMuted }]}>{auction.bidCount} bids</Meta>
          )}
        </View>

        {bidActivityError && (
          <View style={[styles.subSectionError, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.subSectionErrorText, { color: colors.textMuted }]}>Couldn't load bid history</Text>
            <Pressable
              onPress={() => { setBidActivityError(false); void fetchDetail(); }}
              style={({ pressed }) => pressed && { opacity: 0.5 }}
              accessibilityRole="button"
              accessibilityLabel="Retry loading bid history"
            >
              <Text style={[styles.retryText, { color: colors.brand }]}>Retry</Text>
            </Pressable>
          </View>
        )}

        {!bidActivityError && bidActivity.length === 0 && (
          <Text style={[styles.noBidsText, { color: colors.textMuted }]}>No bids placed yet.</Text>
        )}

        {!bidActivityError && bidActivity.length > 0 && (
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={[styles.bidList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {bidActivity.map((bid, index) => {
                const row = formatBidActivityRow(bid, index, formatFromFiat, serverNowRef.current);
                return (
                  <View
                    key={bid.id}
                    style={[styles.bidRow, { borderBottomColor: colors.border }, row.isTopBid && { backgroundColor: colors.surfaceAlt }]}
                  >
                    <View style={styles.bidRowLeft}>
                      {row.isViewer && (
                        <View style={[styles.viewerBadge, { backgroundColor: colors.brand }]}>
                          <Text style={[styles.viewerBadgeText, { color: colors.textInverse }]}>YOU</Text>
                        </View>
                      )}
                      <View style={styles.bidRowInfo}>
                        <View style={styles.bidRowNameLine}>
                          <Text style={[styles.bidderName, { color: colors.textSecondary }]}>{row.bidderLabel}</Text>
                          {row.isTopBid && (
                            <Text style={[styles.topBidLabel, { color: colors.success }]}>Top bid</Text>
                          )}
                        </View>
                        {row.relativeTime && (
                          <Text style={[styles.bidRelativeTime, { color: colors.textMuted }]}>{row.relativeTime}</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.bidRowRight}>
                      <Text style={[styles.bidAmount, { color: colors.textPrimary }]}>{row.amountText}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </BottomSheet>

      {/* ── How bidding works bottom sheet ── */}
      <BottomSheet
        visible={rulesSheetVisible}
        onDismiss={() => setRulesSheetVisible(false)}
        snapPoint={0.65}
      >
        <View style={styles.sheetHeader}>
          <Headline style={styles.sheetTitle}>How bidding works</Headline>
        </View>
        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.rulesContainer}>
            <View style={styles.ruleItem}>
              <View style={[styles.ruleNumber, { backgroundColor: colors.brand }]}>
                <Text style={[styles.ruleNumberText, { color: colors.textInverse }]}>1</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Place your bid</BodyEmphasis>
                <Text style={[styles.ruleDescription, { color: colors.textSecondary }]}>
                  Enter an amount equal to or above the minimum next bid shown. The system accepts your bid instantly if it's higher than the current top bid.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <View style={[styles.ruleNumber, { backgroundColor: colors.brand }]}>
                <Text style={[styles.ruleNumberText, { color: colors.textInverse }]}>2</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Outbid alerts</BodyEmphasis>
                <Text style={[styles.ruleDescription, { color: colors.textSecondary }]}>
                  If another bidder places a higher bid, you'll be notified immediately. Come back and place a new bid to reclaim the top spot.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <View style={[styles.ruleNumber, { backgroundColor: colors.brand }]}>
                <Text style={[styles.ruleNumberText, { color: colors.textInverse }]}>3</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Winning the auction</BodyEmphasis>
                <Text style={[styles.ruleDescription, { color: colors.textSecondary }]}>
                  When the auction ends, the highest eligible bidder wins. Payment and fulfilment actions appear only when the auction provides them.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <View style={[styles.ruleNumber, { backgroundColor: colors.brand }]}>
                <Text style={[styles.ruleNumberText, { color: colors.textInverse }]}>4</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Buy Now option</BodyEmphasis>
                <Text style={[styles.ruleDescription, { color: colors.textSecondary }]}>
                  Some auctions include a Buy Now price. Confirming it records the fixed-price winning bid and ends the auction immediately.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <View style={[styles.ruleNumber, { backgroundColor: colors.brand }]}>
                <Text style={[styles.ruleNumberText, { color: colors.textInverse }]}>5</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Reserve prices</BodyEmphasis>
                <Text style={[styles.ruleDescription, { color: colors.textSecondary }]}>
                  Some auctions have a hidden reserve price set by the seller. If the highest bid hasn't met the reserve when the auction ends, the seller isn't obligated to sell. The "Reserve met" badge means the current top bid has reached or exceeded this threshold.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <View style={[styles.ruleNumber, { backgroundColor: colors.brand }]}>
                <Text style={[styles.ruleNumberText, { color: colors.textInverse }]}>6</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Currency & payments</BodyEmphasis>
                <Text style={[styles.ruleDescription, { color: colors.textSecondary }]}>
                  Bids are placed in GBP and automatically converted to your local currency for display. Final settlement uses the 1ZE platform value.
                </Text>
              </View>
            </View>

            <View style={{ height: Space.xl }} />
          </View>
        </ScrollView>
      </BottomSheet>

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
    </View>
  );
}

function resolveEffectiveState(
  auction: AuctionDetailType,
  clockMs: number,
): 'cancelled' | 'settled' | 'upcoming' | 'live' | 'ended' {
  // 1. Cancelled — highest precedence
  if (auction.cancelledAt) return 'cancelled';
  // 2. Settled — explicit settlement
  if (auction.settledAt) return 'settled';
  // 3. Winner set or Buy Now terminal — ended regardless of dates
  if (auction.winnerBidderId) return 'ended';
  if (auction.terminalReason === 'buy_now') return 'ended';
  // 4. Authoritative lifecycle from backend
  if (auction.lifecycle === 'ended') return 'ended';
  if (auction.lifecycle === 'cancelled') return 'cancelled';
  if (auction.lifecycle === 'settled') return 'settled';
  // 5. Scheduled end according to server clock
  const endsMs = new Date(auction.endsAt).getTime();
  const startsMs = new Date(auction.startsAt).getTime();
  if (clockMs >= endsMs) return 'ended';
  // 6. Live
  if (clockMs >= startsMs) return 'live';
  // 7. Upcoming
  return 'upcoming';
}

// Viewer-state treatment and title colour maps were dead code from the
// pre-reconstruction implementation. The shared CommerceDetailTransactionSurface
// and inline viewer-state rendering now own this logic.

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.xl,
  },
  backBtn: {
    marginTop: Space.md,
    minWidth: 120,
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
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
  },
  bidActivityBidder: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
  },
  bidActivityAmount: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  bidActivityEmpty: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    paddingVertical: Space.sm,
  },
  bidActivityViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
  },
  bidActivityViewAllText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
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
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
  },
  itemDetailValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  descriptionText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    fontFamily: Typography.family.regular,
  },
  // ── Terminal result — one compact module ──
  // Per Design.md between-group spacing: 24px after media for a
  // deliberate chapter break. The terminal result is the first
  // content module after media in terminal states.
  terminalResultModule: {
    marginHorizontal: Space.md,
    marginTop: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  terminalResultTitleWon: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  terminalResultTitleLost: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  terminalResultTitleSold: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  terminalResultValue: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  terminalResultNote: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
  },
  // ── Transaction surface internal rows ──
  transactionBidActivityRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  transactionBidActivityLabel: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  transactionBidActivityValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
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
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: Type.metaElevated.letterSpacing,
  },
  transactionMinValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  transactionReserveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexWrap: 'wrap',
  },
  transactionReserveHint: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.regular,
    flexShrink: 1,
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
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.subtitle.letterSpacing,
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
  },
  ruleNumber: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ruleNumberText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.bold,
  },
  ruleContent: {
    flex: 1,
    gap: Space.xs,
  },
  ruleTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  ruleDescription: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
  },
  // ── Shared-shell reconstruction styles ──
  stateBadgeOverlay: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    gap: Space.xs,
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
  viewerStateLine: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  descriptionBlock: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  dockStateBadge: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: LetterSpacing.normal,
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
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  discoverLinkInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.sm + 4,
    alignSelf: 'center',
  },
  discoverLinkInlineText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  // ── Bid history sheet rows ──
  bidList: {
    overflow: 'hidden',
  },
  bidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bidRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  viewerBadge: {
    borderRadius: Radius.sm,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
  },
  viewerBadgeText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.meta.letterSpacing,
  },
  bidderName: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
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
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.regular,
  },
  bidRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  bidAmount: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  topBidLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.meta.letterSpacing,
  },
  noBidsText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
  },
  subSectionError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
  },
  subSectionErrorText: {},
  retryText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
  },
});
