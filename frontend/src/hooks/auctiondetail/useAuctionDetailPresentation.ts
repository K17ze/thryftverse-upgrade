import React from 'react';
import type {
  AuctionDetail,
  AuctionFulfilmentSummary,
  AuctionViewerState,
} from '../../services/marketApi';
import type { AuctionEffectiveState } from '../useServerClock';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../useFormattedPrice';
import { HapticPatterns } from '../../utils/hapticPatterns';
import { Space, DockConstants } from '../../theme/designTokens';
import {
  resolveStateAction,
  resolveAuctionPresentationState,
  resolveDetailPriceLabel,
  resolveDetailPriceAmount,
  resolveDetailCountdown,
  isBuyNowAvailable,
  buildDetailAccessibilityLabel,
  resolvePaymentDeadlineCountdown,
  type AuctionDetailInput,
  type AuctionMediaItemView,
  type AuctionPresentationState,
  type CountdownStage,
  type DetailPriceLabel,
  type ReserveStatus,
  type StateActionConfig,
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
} from '../../utils/auctionDetailLogic';

export interface UseAuctionDetailPresentationParams {
  auction: AuctionDetail | null;
  effectiveState: AuctionEffectiveState | null;
  secondClock: number;
  minuteClock: number;
  isBuyNowLoading: boolean;
  currentUserId: string | undefined;
  /** Bottom safe-area inset — used to keep the sticky dock clear of content. */
  bottomInset: number;
}

export interface AuctionDetailPresentation {
  detailInput: AuctionDetailInput | null;
  timing: {
    effectiveState: AuctionEffectiveState;
    msToStart: number;
    msToEnd: number;
  } | null;
  stateAction: StateActionConfig | null;
  priceLabel: DetailPriceLabel;
  priceAmount: number;
  priceText: string;
  countdown: { text: string; isFinalMinutes: boolean; stage: CountdownStage };
  presentation: AuctionPresentationState | null;
  accessibilityLabel: string;
  isLive: boolean;
  isUpcoming: boolean;
  isEnded: boolean;
  isCancelled: boolean;
  isSettled: boolean;
  isReserveNotMet: boolean;
  isAwaitingPayment: boolean;
  isPaymentExpired: boolean;
  isSecondChanceOffered: boolean;
  isPostEnd: boolean;
  isTerminal: boolean;
  viewerState: AuctionViewerState;
  isSeller: boolean;
  buyNowAvailable: boolean;
  reserveStatus: ReserveStatus | 'none';
  showBidControls: boolean;
  isSecondChanceRecipient: boolean;
  paymentDeadlineCountdown: { text: string; isExpired: boolean } | null;
  auctionMediaItems: AuctionMediaItemView[];
  auctionFulfilment: AuctionFulfilmentSummary | null;
  terminalAmountText: string;
  isPaymentConfirmed: boolean;
  hasValidWinner: boolean;
  sellerSaleTitle: string;
  winnerSubtitle: string;
  sellerSubtitle: string;
  liveMsToEnd: number;
  liveMsToStart: number;
  countdownColor: string;
  primaryState: { text: string; color: string } | null;
  subordinateStateText: string | null;
  hasDualDock: boolean;
  dockHeight: number;
  scrollBottomPadding: number;
}

/**
 * Derived presentation state for the auction detail surface.
 *
 * Owns every pure derivation that was previously computed inline in
 * AuctionDetailScreen: the canonical detail input, timing, price label /
 * amount / text, countdown, presentation state, accessibility label,
 * lifecycle + viewer flags, second-chance detection, payment deadline
 * countdown, canonical media, terminal fulfilment labels, the primary
 * state sentence, and dock geometry. All logic is copied verbatim from
 * the screen — this is a relocation, not a rewrite.
 */
export function useAuctionDetailPresentation({
  auction,
  effectiveState,
  secondClock,
  minuteClock,
  isBuyNowLoading,
  currentUserId,
  bottomInset,
}: UseAuctionDetailPresentationParams): AuctionDetailPresentation {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();

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
    return formatFromFiat(priceAmount, 'GBP');
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
    if (auction.secondChanceOfferedTo && currentUserId) {
      return auction.secondChanceOfferedTo === currentUserId;
    }
    return (isPaymentExpired || isSecondChanceOffered) &&
      (viewerState === 'outbid' || viewerState === 'lost');
  }, [auction, currentUserId, isPaymentExpired, isSecondChanceOffered, viewerState]);

  // ── Payment deadline countdown ──
  // Uses the same server-clock pattern as the auction end countdown so
  // the deadline ticks down with the same per-second precision.
  const paymentDeadlineCountdown = React.useMemo(() => {
    if (!auction?.paymentDeadlineAt) return null;
    return resolvePaymentDeadlineCountdown(auction.paymentDeadlineAt, secondClock);
  }, [auction?.paymentDeadlineAt, secondClock]);

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
  const scrollBottomPadding = Math.max(bottomInset, Space.md) + dockHeight + Space.md;

  return {
    detailInput,
    timing,
    stateAction,
    priceLabel,
    priceAmount,
    priceText,
    countdown,
    presentation,
    accessibilityLabel,
    isLive,
    isUpcoming,
    isEnded,
    isCancelled,
    isSettled,
    isReserveNotMet,
    isAwaitingPayment,
    isPaymentExpired,
    isSecondChanceOffered,
    isPostEnd,
    isTerminal,
    viewerState,
    isSeller,
    buyNowAvailable,
    reserveStatus,
    showBidControls,
    isSecondChanceRecipient,
    paymentDeadlineCountdown,
    auctionMediaItems,
    auctionFulfilment,
    terminalAmountText,
    isPaymentConfirmed,
    hasValidWinner,
    sellerSaleTitle,
    winnerSubtitle,
    sellerSubtitle,
    liveMsToEnd,
    liveMsToStart,
    countdownColor,
    primaryState,
    subordinateStateText,
    hasDualDock,
    dockHeight,
    scrollBottomPadding,
  };
}
