import React from 'react';
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
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { Motion } from '../theme/motionTokens';
import { haptics } from '../utils/haptics';
import { HapticPatterns } from '../utils/hapticPatterns';
import { useCurrencyContext } from '../context/CurrencyContext';
import { parseApiError } from '../lib/apiClient';
import { requestPushPermissionWithSoftAsk } from '../lib/pushPermission';
import { Meta, BodyEmphasis, Headline } from '../components/ui/Text';
import { toIze, formatIzeAmount } from '../utils/currency';
import { Space, FontFamily, DockConstants, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
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
  isBuyNowAvailable,
  buildDetailAccessibilityLabel,
  formatBidActivityRow,
  detectLifecycleTransition,
  type AuctionDetailInput,
  resolveReserveStatus,
} from '../utils/auctionDetailLogic';
import {
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
  // requestPushPermissionWithSoftAsk shows an in-app pre-prompt before the
  // one-shot OS prompt and persists an AsyncStorage flag across sessions.
  const favoritePushAskedRef = React.useRef(false);
  const [isTransitionRefreshing, setIsTransitionRefreshing] = React.useState(false);
  const [bidHistorySheetVisible, setBidHistorySheetVisible] = React.useState(false);
  const [rulesSheetVisible, setRulesSheetVisible] = React.useState(false);
  const [mediaViewerVisible, setMediaViewerVisible] = React.useState(false);
  const [fullscreenMediaIndex, setFullscreenMediaIndex] = React.useState(0);
  const [overflowVisible, setOverflowVisible] = React.useState(false);
  const [relatedAuctions, setRelatedAuctions] = React.useState<MarketAuction[]>([]);
  const [relatedLoading, setRelatedLoading] = React.useState(false);
  const [lastFetchAt, setLastFetchAt] = React.useState<number | null>(null);

  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const [isResolvingConversation, setIsResolvingConversation] = React.useState(false);

  const { isCommerceCompact: isCompact } = useBreakpoint();
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();

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

  // ── Refresh-in-progress guard ────────────────────────────────────
  // Prevents race conditions between 5 independent refresh sources:
  // polling, manual pull-to-refresh, lifecycle transitions, server clock
  // resync, and post-bid refresh. Without this guard, concurrent
  // fetchDetail() calls cause UI flickering, state thrashing, and
  // excessive API load — the root cause of the "worse" auction experience.
  const isFetchingRef = React.useRef(false);

  const fetchDetail = React.useCallback(async (): Promise<AuctionDetailResponse | null> => {
    // Block concurrent calls — the most recent caller will get null.
    // This is safe because the next polling tick or user action will retry.
    if (isFetchingRef.current) return null;
    isFetchingRef.current = true;
    try {
      const res = await getAuctionDetail(auctionId);
      if (!isMountedRef.current) return null;
      serverNowRef.current = res.serverNow;
      setAuction(res.auction);
      setBidActivity(res.bidActivity);
      setBidActivityError(false);
      setError(null);
      setLastFetchAt(Date.now());
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
      isFetchingRef.current = false;
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
        // Upcoming auctions: make the notification intent explicit so the
        // user understands watching = "notify me when this goes live."
        // (audit 08 P1: upcoming notification toggle)
        const isUpcomingAuction = effectiveState === 'upcoming';
        show(
          isUpcomingAuction ? 'Watching · we’ll notify you when it goes live' : 'Added to watchlist',
          'info',
        );
        // Contextual push permission prompt — ask once after the user adds an
        // item to their watchlist. Best-effort; never blocks the watch flow.
        if (!favoritePushAskedRef.current) {
          favoritePushAskedRef.current = true;
          requestPushPermissionWithSoftAsk('favorite').catch(() => undefined);
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
        throw new Error('The response did not confirm the Buy Now winning bid. Try again.');
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
    return formatFromFiat(priceAmount, 'GBP');
  }, [priceLabel, priceAmount, formatFromFiat]);

  const countdown = React.useMemo(() => {
    if (!timing) return { text: '', isFinalMinutes: false, stage: 'plenty' as const };
    return resolveDetailCountdown(timing, secondClock, minuteClock);
  }, [timing, secondClock, minuteClock]);

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
  const isTerminal = isEnded || isCancelled || isSettled;

  // ── Real-time polling for live auctions ──────────────────────────
  // During a live auction, poll the backend every 10s so competing bids,
  // outbid status, and bid activity update without manual refresh.
  // Upcoming auctions poll every 45s (price changes are unlikely but
  // the auction may transition to live). Terminal auctions stop polling.
  // The isFetchingRef guard inside fetchDetail prevents overlapping calls.
  const pollIntervalMs = isLive ? 10_000 : isUpcoming ? 45_000 : 0;

  React.useEffect(() => {
    if (pollIntervalMs === 0) return;
    if (isSubmittingBid || isBuyNowLoading) return;
    const interval = setInterval(() => {
      if (isMountedRef.current && !isSubmittingBid && !isBuyNowLoading && !isFetchingRef.current) {
        void fetchDetail();
      }
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [pollIntervalMs, isLive, isUpcoming, fetchDetail, isSubmittingBid, isBuyNowLoading]);
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

  // ── Truthful terminal sale-state labels (audit P0.5) ──
  // `ended` is not `settled`. Derive the sale title from the authoritative
  // effective state + backend payment status so the body never says "Sold"
  // (implying settlement) for an auction that has only ended.
  const isPaymentConfirmed = auctionFulfilment?.paymentStatus === 'paid';
  const hasValidWinner = auction != null && auction.winnerBidderId != null && auction.bidCount > 0;
  const sellerSaleTitle = !hasValidWinner
    ? 'Ended without bids'
    : isSettled
      ? 'Sold'
      : isPaymentConfirmed
        ? 'Sold · settlement pending'
        : 'Sold · awaiting payment';
  const winnerSubtitle = isSettled
    ? (auctionFulfilment?.buyerNextAction
        ? auctionFulfilment.buyerNextAction
        : auctionFulfilment?.fulfilmentStatus
          ? `Fulfilment · ${auctionFulfilment.fulfilmentStatus.replace(/_/g, ' ')}`
          : 'Fulfilment details are not available yet.')
    : isPaymentConfirmed
      ? 'Payment confirmed · settlement pending'
      : (auctionFulfilment?.buyerNextAction
          ? auctionFulfilment.buyerNextAction
          : 'Complete payment to secure your win.');
  const sellerSubtitle = !hasValidWinner
    ? 'No bids were received.'
    : (auctionFulfilment?.sellerNextAction
        ? auctionFulfilment.sellerNextAction
        : isSettled
          ? (auctionFulfilment?.fulfilmentStatus
              ? `Fulfilment · ${auctionFulfilment.fulfilmentStatus.replace(/_/g, ' ')}`
              : 'Fulfilment details are not available yet.')
          : isPaymentConfirmed
            ? 'Payment confirmed · settlement pending.'
            : 'Awaiting buyer payment.');

  // ── One primary state sentence (audit: reduce simultaneous state cues) ──
  // Above the fold, show ONE dominant sentence that communicates the most
  // important state. All other cues (auction state badge, live indicator,
  // urgency color, viewer signals) demote to subordinate metadata so the
  // page reads like precise instrumentation, not a casino dashboard.
  const liveMsToEnd = React.useMemo(() => {
    if (!auction) return 0;
    return Math.max(0, new Date(auction.endsAt).getTime() - secondClock);
  }, [auction, secondClock]);

  const liveMsToStart = React.useMemo(() => {
    if (!auction) return 0;
    return Math.max(0, new Date(auction.startsAt).getTime() - secondClock);
  }, [auction, secondClock]);

  // Countdown color changes only at meaningful thresholds.
  // < 10 seconds = danger, < 1 minute = warning, otherwise neutral.
  // This is the single accent for urgency — not every element is red.
  const countdownColor = React.useMemo(() => {
    if (!isLive) return colors.textPrimary;
    if (liveMsToEnd <= 10_000) return colors.danger;
    if (liveMsToEnd <= 60_000) return colors.warning;
    return colors.textPrimary;
  }, [isLive, liveMsToEnd, colors]);

  // Primary state sentence — one dominant line above the fold.
  // Priority: outbid > leading > reserve not met > countdown > ended.
  // Do NOT infer winner until server result — terminal sentences are
  // derived from the authoritative effectiveState + fulfilment contract.
  const primaryState = React.useMemo<{
    text: string;
    color: string;
  } | null>(() => {
    if (!timing || !detailInput || !auction) return null;

    // Terminal states — server-confirmed end
    if (isEnded || isSettled) {
      if (viewerState === 'won' && !isPaymentConfirmed && !isSettled) {
        return { text: 'Payment required', color: colors.warning };
      }
      return { text: 'Ended', color: colors.textMuted };
    }
    if (isCancelled) {
      return { text: 'Cancelled', color: colors.textMuted };
    }

    // Live — viewer-state sentences dominate over countdown
    if (isLive) {
      if (viewerState === 'outbid') {
        return { text: 'Outbid', color: colors.warning };
      }
      if (viewerState === 'leading') {
        return { text: "You're highest bidder", color: colors.success };
      }
      if (reserveStatus === 'not-met') {
        return { text: 'Reserve not met', color: colors.textPrimary };
      }
      // Default — countdown is the primary sentence
      return { text: `Ends in ${formatCountdownSentence(liveMsToEnd)}`, color: countdownColor };
    }

    // Upcoming
    if (isUpcoming) {
      return { text: `Starts in ${formatCountdownSentence(liveMsToStart)}`, color: colors.brand };
    }

    return null;
  }, [timing, detailInput, auction, isEnded, isSettled, isCancelled, isLive, isUpcoming, viewerState, isPaymentConfirmed, reserveStatus, liveMsToEnd, liveMsToStart, countdownColor, colors]);

  // Subordinate metadata — countdown demotes here when viewer state
  // dominates the primary sentence. Kept small and neutral so it never
  // competes with the primary state sentence.
  const subordinateStateText = React.useMemo<string | null>(() => {
    if (!isLive || !auction) return null;
    // Only show subordinate countdown when the primary sentence is NOT
    // the countdown itself (i.e., viewer state or reserve dominates).
    const primaryIsCountdown =
      primaryState?.text.startsWith('Ends in') || primaryState?.text.startsWith('Starts in');
    if (primaryIsCountdown) return null;
    if (liveMsToEnd <= 0) return null;
    return `Ends in ${formatCountdownSentence(liveMsToEnd)}`;
  }, [isLive, auction, primaryState, liveMsToEnd]);

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
    <Reanimated.View
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
          onSave={social.openCollectionPicker}
          onToggleFav={social.toggleLike}
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
              onPress: social.openCollectionPicker,
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
        {isLive && liveMsToEnd > 0 && (
          <View
            style={[
              styles.countdownBar,
              {
                backgroundColor: liveMsToEnd < 60 * 60 * 1000
                  ? colors.danger
                  : colors.surface,
                borderBottomColor: colors.border,
              },
            ]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Time remaining: ${formatCountdownSentence(liveMsToEnd)}`}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color={liveMsToEnd < 60 * 60 * 1000 ? colors.textInverse : colors.textSecondary}
            />
            <Text
              style={[
                styles.countdownBarText,
                {
                  color: liveMsToEnd < 60 * 60 * 1000
                    ? colors.textInverse
                    : colors.textPrimary,
                  fontVariant: ['tabular-nums'] as any,
                },
              ]}
              numberOfLines={1}
            >
              {`Ends in ${formatCountdownSentence(liveMsToEnd)}`}
            </Text>
            {liveMsToEnd < 60 * 60 * 1000 && (
              <View style={[styles.countdownBarUrgencyDot, { backgroundColor: colors.textInverse }]} />
            )}
          </View>
        )}
        {isUpcoming && liveMsToStart > 0 && (
          <View
            style={[styles.countdownBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Starts in: ${formatCountdownSentence(liveMsToStart)}`}
          >
            <Ionicons name="time-outline" size={16} color={colors.brand} />
            <Text
              style={[styles.countdownBarText, { color: colors.textPrimary, fontVariant: ['tabular-nums'] as any }]}
              numberOfLines={1}
            >
              Starts in {formatCountdownSentence(liveMsToStart)}
            </Text>
          </View>
        )}

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
                <Text
                  style={[
                    styles.terminalResultTitleWon,
                    { color: isPaymentConfirmed || isSettled ? colors.success : colors.warning },
                  ]}
                >
                  {isPaymentConfirmed || isSettled ? 'You won' : 'Payment required'}
                </Text>
                <Text style={[styles.terminalResultValue, { color: colors.textPrimary }]}>
                  {terminalAmountText}
                </Text>
                <Text style={[styles.terminalResultNote, { color: colors.textSecondary }]}>
                  {winnerSubtitle}
                </Text>
              </>
            )}
            {viewerState === 'lost' && (
              <>
                <Text style={[styles.terminalResultTitleLost, { color: colors.textPrimary }]}>Auction ended</Text>
                <Text style={[styles.terminalResultNote, { color: colors.textSecondary }]}>
                  You didn't win this time
                </Text>
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
            {viewerState === 'seller' && hasValidWinner && (
              <>
                <Text
                  style={[
                    styles.terminalResultTitleSold,
                    { color: isSettled ? colors.success : isPaymentConfirmed ? colors.brand : colors.warning },
                  ]}
                >
                  {sellerSaleTitle}
                </Text>
                <Text style={[styles.terminalResultValue, { color: colors.textPrimary }]}>
                  {terminalAmountText}
                </Text>
                <Text style={[styles.terminalResultNote, { color: colors.textSecondary }]}>
                  {sellerSubtitle}
                </Text>
              </>
            )}
            {viewerState === 'seller' && !hasValidWinner && (
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
            onPress={() => openProfile(navigation, auction.seller.id, currentUser?.id)}
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
                      if (!currentUser?.id) {
                        show('Sign in to follow this seller.', 'error');
                        return;
                      }
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
          accessibilityLabel={auction.isWatched ? 'Remove from watchlist' : (effectiveState === 'upcoming' ? 'Get notified when this goes live' : 'Add to watchlist')}
          accessibilityState={{ selected: auction.isWatched }}
        >
          <Ionicons
            name={auction.isWatched ? 'eye' : 'eye-outline'}
            size={20}
            color={auction.isWatched ? colors.brand : colors.textPrimary}
          />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>
            {auction.isWatched ? 'Remove from watchlist' : (effectiveState === 'upcoming' ? 'Get notified when live' : 'Add to watchlist')}
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
            countdownText: isLive && liveMsToEnd > 0
              ? `Ends in ${formatCountdownSentence(liveMsToEnd)}`
              : isUpcoming && liveMsToStart > 0
                ? `Starts in ${formatCountdownSentence(liveMsToStart)}`
                : countdown.text,
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
            <View style={styles.bidList}>
              {bidActivity.map((bid, index) => {
                const row = formatBidActivityRow(bid, index, formatFromFiat, serverNowRef.current);
                return (
                  <View
                    key={bid.id}
                    style={[styles.bidRow, { borderBottomColor: colors.border }, row.isTopBid && { backgroundColor: `${colors.success}08` }]}
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
    </Reanimated.View>
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

// ── Countdown sentence formatter ──
// Produces a compact "12m 08s" / "3h 15m" / "2d 5h" string for the
// primary state sentence and dock subtitle. Uses tabular-friendly
// zero-padded seconds to prevent per-second layout shift.
function formatCountdownSentence(ms: number): string {
  if (ms <= 0) return 'Ended';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

// Viewer-state treatment and title colour maps were dead code from the
// pre-reconstruction implementation. The shared CommerceDetailTransactionSurface
// and inline viewer-state rendering now own this logic.

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
