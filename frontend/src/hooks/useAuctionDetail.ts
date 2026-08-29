import React from 'react';
import { useToast } from '../context/ToastContext';
import { useSignupWall } from '../hooks/useSignupWall';
import { parseApiError } from '../lib/apiClient';
import { requestPushPermissionWithSoftAsk } from '../lib/pushPermission';
import { useRealtimeEvent } from '../platform/realtime';
import {
  useBucketedServerClock,
  type AuctionEffectiveState,
} from '../hooks/useServerClock';
import {
  getAuctionDetail,
  placeAuctionBid,
  buyAuctionNow,
  cancelAuction,
  payAuction,
  acceptHighestBid,
  acceptSecondChance,
  declineSecondChance,
  addToWatchlist,
  removeFromWatchlist,
  listAuctions,
  type AuctionDetail,
  type AuctionBidActivity,
  type AuctionDetailResponse,
  type BuyNowResult,
  type MarketAuction,
} from '../services/marketApi';
import {
  resolveEffectiveState,
  detectLifecycleTransition,
} from '../utils/auctionDetailLogic';
import { createStableId } from '../utils/createStableId';

export interface UseAuctionDetailOptions {
  openBidSheet?: boolean;
  initialBidAmount?: number;
}

/**
 * A confirmation request emitted by the hook for the calling screen to
 * render via `<ConfirmationSheet>`. Hooks cannot render UI, so they expose
 * a request object and the screen binds it to the sheet.
 */
export interface AuctionConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'default' | 'danger';
  onConfirm: () => void | Promise<void>;
}

export interface UseAuctionDetailResult {
  // ── Data ──
  auction: AuctionDetail | null;
  bidActivity: AuctionBidActivity[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  bidActivityError: boolean;
  setBidActivityError: React.Dispatch<React.SetStateAction<boolean>>;
  relatedAuctions: MarketAuction[];
  relatedLoading: boolean;
  lastFetchAt: number | null;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;

  // ── Server clock / timing ──
  serverNowRef: React.MutableRefObject<string | null>;
  secondClock: number;
  minuteClock: number;
  needsResync: boolean;
  resyncFailed: boolean;
  isTransitionRefreshing: boolean;
  effectiveState: AuctionEffectiveState | null;

  // ── Bidding / transaction state ──
  bidSheetVisible: boolean;
  setBidSheetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  buyNowSheetVisible: boolean;
  setBuyNowSheetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isSubmittingBid: boolean;
  isBuyNowLoading: boolean;
  watchToggling: boolean;
  isCancelLoading: boolean;
  isPayLoading: boolean;
  isAcceptHighestBidLoading: boolean;
  isAcceptSecondChanceLoading: boolean;
  isDeclineSecondChanceLoading: boolean;

  // ── Handlers ──
  fetchDetail: () => Promise<AuctionDetailResponse | null>;
  handleRefresh: () => void;
  handleToggleWatch: () => Promise<void>;
  openBidSheet: () => void;
  closeBidSheet: () => void;
  handleSubmitBid: (gbpAmount: number, idempotencyKey: string, maxBidGbp?: number) => Promise<void>;
  openBuyNowSheet: () => void;
  closeBuyNowSheet: () => void;
  handleSubmitBuyNow: (gbpAmount: number, idempotencyKey: string) => Promise<BuyNowResult>;
  handleAcceptHighestBid: () => Promise<void>;
  handlePayNow: () => Promise<void>;
  handleAcceptSecondChance: () => Promise<void>;
  handleDeclineSecondChance: () => Promise<void>;
  handleCancelAuction: () => void;
  cancelAuctionConfirmation: AuctionConfirmationRequest | null;
  dismissCancelAuctionConfirmation: () => void;
  refreshDetailForTransaction: () => Promise<AuctionDetailResponse | null>;
}

export function useAuctionDetail(
  auctionId: string,
  options: UseAuctionDetailOptions = {},
): UseAuctionDetailResult {
  const { show } = useToast();
  const { requireAuth } = useSignupWall();

  const [auction, setAuction] = React.useState<AuctionDetail | null>(null);
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
  const [relatedAuctions, setRelatedAuctions] = React.useState<MarketAuction[]>([]);
  const [relatedLoading, setRelatedLoading] = React.useState(false);
  const [lastFetchAt, setLastFetchAt] = React.useState<number | null>(null);
  const [isCancelLoading, setIsCancelLoading] = React.useState(false);
  const [cancelAuctionConfirmation, setCancelAuctionConfirmation] =
    React.useState<AuctionConfirmationRequest | null>(null);
  const [isPayLoading, setIsPayLoading] = React.useState(false);
  // Stable idempotency keys for payment / second-chance operations.
  // Generated once per logical operation and reused across retries so the
  // backend can deduplicate unknown-outcome requests (AGENTS.md §28).
  const payIdempotencyKeyRef = React.useRef<string | null>(null);
  const secondChanceIdempotencyKeyRef = React.useRef<string | null>(null);
  const [isAcceptSecondChanceLoading, setIsAcceptSecondChanceLoading] = React.useState(false);
  const [isDeclineSecondChanceLoading, setIsDeclineSecondChanceLoading] = React.useState(false);
  const [isAcceptHighestBidLoading, setIsAcceptHighestBidLoading] = React.useState(false);

  const serverNowRef = React.useRef<string | null>(null);
  const { secondClock, minuteClock, resync, needsResync, resyncFailed, markResyncFailed, clearResyncFailed } =
    useBucketedServerClock(serverNowRef.current);

  const prevLifecycleRef = React.useRef<AuctionEffectiveState | null>(null);

  // ── Realtime bid events ──
  // Subscribe to the auction topic so bid events can trigger an
  // immediate resync if the monotonic sequence gaps. This is a
  // client-side safety net on top of the existing polling path.
  const lastAuctionSequenceRef = React.useRef<number | null>(null);
  const bidEvent = useRealtimeEvent<{ auctionSequence?: number }>(
    auctionId ? `auction.${auctionId}` : '',
    'bid.created',
  );

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

  // ── Realtime gap recovery ──
  // Compare the monotonic auction sequence in each incoming bid event
  // with the last known sequence. A gap forces a fresh detail fetch.
  React.useEffect(() => {
    if (!bidEvent?.payload?.auctionSequence) return;
    const seq = bidEvent.payload.auctionSequence;
    const last = lastAuctionSequenceRef.current;
    if (last != null && seq > last + 1) {
      void fetchDetail();
    }
    lastAuctionSequenceRef.current = seq;
  }, [bidEvent, fetchDetail]);

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

  // Authoritative refresh that returns the fetched snapshot for transaction preflight
  const refreshDetailForTransaction = React.useCallback(async (): Promise<AuctionDetailResponse | null> => {
    return fetchDetail();
  }, [fetchDetail]);

  // Auto-open BidSheet when arriving from an outbid notification
  React.useEffect(() => {
    if (options.openBidSheet && auction && !loading && !bidSheetVisible) {
      // Only auto-open if the auction is still live (bidding is possible)
      const effectiveState = auction.lifecycle;
      if (effectiveState === 'live') {
        setBidSheetVisible(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.openBidSheet, auction, loading]);

  // Keep the last known monotonic sequence in sync with the canonical
  // detail so realtime gap detection has a stable baseline.
  React.useEffect(() => {
    if (auction?.auctionSequence != null) {
      lastAuctionSequenceRef.current = auction.auctionSequence;
    }
  }, [auction?.auctionSequence]);

  // ── Real-time polling for live auctions ──────────────────────────
  // During a live auction, poll the backend every 10s so competing bids,
  // outbid status, and bid activity update without manual refresh.
  // Upcoming auctions poll every 45s (price changes are unlikely but
  // the auction may transition to live). Terminal auctions stop polling.
  // The isFetchingRef guard inside fetchDetail prevents overlapping calls.
  const isLive = effectiveState === 'live';
  const isUpcoming = effectiveState === 'upcoming';
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

  // Compound haptic feedback for viewer-state transitions. Fires once on
  const handleRefresh = () => {
    setRefreshing(true);
    void fetchDetail();
  };

  const handleToggleWatch = async () => {
    if (!auction || watchToggling) return;
    if (!requireAuth('save_item')) return;
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

  const openBidSheet = () => {
    if (!auction) return;
    if (!requireAuth('place_bid')) return;
    setBidSheetVisible(true);
  };

  const closeBidSheet = () => {
    setBidSheetVisible(false);
  };

  // PASS 6: Sheet owns transaction feedback. Parent only calls API and returns typed result.
  // No duplicate toast — sheet handles inline error/success presentation.
  const handleSubmitBid = async (gbpAmount: number, idempotencyKey: string, maxBidGbp?: number): Promise<void> => {
    if (!auction || isSubmittingBid) return;
    setIsSubmittingBid(true);

    try {
      await placeAuctionBid(auction.id, { amountGbp: gbpAmount, idempotencyKey, maxBidGbp });
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
    if (!requireAuth('purchase')) return;
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

  // ── Post-end lifecycle action handlers ──
  // Each handler guards against double-submit, calls the dedicated API,
  // then refreshes detail so the UI reflects the authoritative backend
  // state. Toasts are minimal and truthful — no verbose explanations.

  const handleAcceptHighestBid = async () => {
    if (!auction || isAcceptHighestBidLoading) return;
    if (!requireAuth('create_listing')) return;
    setIsAcceptHighestBidLoading(true);
    try {
      await acceptHighestBid(auction.id);
      await fetchDetail();
      show('Highest bid accepted', 'success');
    } catch (err) {
      const parsed = parseApiError(err, 'Failed to accept highest bid');
      show(parsed.message, 'error');
    } finally {
      setIsAcceptHighestBidLoading(false);
    }
  };

  const handlePayNow = async () => {
    if (!auction || isPayLoading) return;
    if (!requireAuth('purchase')) return;
    setIsPayLoading(true);
    try {
      if (!payIdempotencyKeyRef.current) {
        payIdempotencyKeyRef.current = createStableId('pay');
      }
      const idempotencyKey = payIdempotencyKeyRef.current;
      await payAuction(auction.id, { idempotencyKey });
      await fetchDetail();
      show('Payment initiated', 'success');
      payIdempotencyKeyRef.current = null;
    } catch (err) {
      const parsed = parseApiError(err, 'Payment failed');
      show(parsed.message, 'error');
    } finally {
      setIsPayLoading(false);
    }
  };

  const handleAcceptSecondChance = async () => {
    if (!auction || isAcceptSecondChanceLoading) return;
    if (!requireAuth('purchase')) return;
    setIsAcceptSecondChanceLoading(true);
    try {
      if (!secondChanceIdempotencyKeyRef.current) {
        secondChanceIdempotencyKeyRef.current = createStableId('sc-accept');
      }
      const idempotencyKey = secondChanceIdempotencyKeyRef.current;
      await acceptSecondChance(auction.id, idempotencyKey);
      await fetchDetail();
      show('Second chance accepted', 'success');
      secondChanceIdempotencyKeyRef.current = null;
    } catch (err) {
      const parsed = parseApiError(err, 'Failed to accept second chance');
      show(parsed.message, 'error');
    } finally {
      setIsAcceptSecondChanceLoading(false);
    }
  };

  const handleDeclineSecondChance = async () => {
    if (!auction || isDeclineSecondChanceLoading) return;
    setIsDeclineSecondChanceLoading(true);
    try {
      await declineSecondChance(auction.id);
      await fetchDetail();
      show('Second chance declined', 'info');
    } catch (err) {
      const parsed = parseApiError(err, 'Failed to decline second chance');
      show(parsed.message, 'error');
    } finally {
      setIsDeclineSecondChanceLoading(false);
    }
  };

  const performCancelAuction = async () => {
    if (!auction || isCancelLoading) return;
    setIsCancelLoading(true);
    try {
      await cancelAuction(auction.id);
      await fetchDetail();
      show('Auction cancelled', 'info');
    } catch (err) {
      const parsed = parseApiError(err, 'Failed to cancel auction');
      show(parsed.message, 'error');
    } finally {
      setIsCancelLoading(false);
    }
  };

  const handleCancelAuction = () => {
    if (!auction || isCancelLoading) return;
    setCancelAuctionConfirmation({
      title: 'Cancel auction',
      message:
        'This will cancel the auction and notify all bidders. This cannot be undone.',
      confirmLabel: 'Cancel auction',
      cancelLabel: 'Keep auction',
      variant: 'danger',
      onConfirm: performCancelAuction,
    });
  };

  const dismissCancelAuctionConfirmation = React.useCallback(() => {
    setCancelAuctionConfirmation(null);
  }, []);

  return {
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
  };
}
