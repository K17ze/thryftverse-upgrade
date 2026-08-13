import {
  resolveAuctionTiming,
  formatCountdown,
  type AuctionEffectiveState,
} from '../hooks/useServerClock';
import { formatFinalMinutesCountdown, type AuctionViewerState } from './auctionHomeLogic';
import type { AuctionFulfilmentSummary } from '../services/marketApi';

// ── Detail-level auction input (richer than AuctionHomeItem) ──

export interface AuctionDetailInput {
  id: string;
  listingId: string;
  sellerId: string;
  title: string;
  imageUrl: string | null;
  brand: string | null;
  category: string | null;
  conditionLabel: string | null;
  description: string | null;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  currentBidGbp: number;
  minimumNextBidGbp: number;
  buyNowPriceGbp: number | null;
  reservePriceGbp: number | null;
  bidCount: number;
  viewerState: AuctionViewerState;
  isWatched: boolean;
  cancelledAt: string | null;
  settledAt: string | null;
  winnerBidderId: string | null;
  lifecycle: string;
  terminalReason: string | null;
  /**
   * Backend-backed terminal fulfilment summary (spec 02_AUCTION §8).
   * Carries authoritative payment/fulfilment status so the resolver can
   * distinguish "ended + winner + unpaid" from "ended + paid + unsettled"
   * without fabricating a `Settled` state. Null when the auction is not
   * terminal or fulfilment data is not yet available.
   */
  fulfilment?: AuctionFulfilmentSummary | null;
}

// ── CTA action types ──

export type PrimaryAction =
  | { type: 'placeBid'; label: string }
  | { type: 'increaseBid'; label: string }
  | { type: 'bidAgain'; label: string }
  | { type: 'watchAuction'; label: string }
  | { type: 'viewResult'; label: string }
  | { type: 'viewSimilar'; label: string }
  | { type: 'viewPerformance'; label: string }
  | { type: 'viewOutcome'; label: string }
  | { type: 'none'; label: string };

export type SecondaryAction =
  | { type: 'buyNow'; label: string; priceGbp: number }
  | { type: 'watchingToggle'; label: string }
  | { type: 'share'; label: string }
  | { type: 'none'; label: string };

export type ForbiddenAction =
  | 'placeBid'
  | 'buyNow'
  | 'edit'
  | 'cancel'
  | 'relist'
  | 'none';

// ── State-action resolver: maps (effectiveState, viewerState) → actions ──

export interface StateActionConfig {
  primary: PrimaryAction;
  secondary: SecondaryAction;
  forbidden: ForbiddenAction[];
  viewerMessage: string | null;
  viewerTreatment: 'calm' | 'warning' | 'restrained' | 'result' | 'subdued' | 'seller' | 'none';
}

// ── Unified AuctionPresentationState view model (audit 08 P0) ──
// A single canonical type that maps (effectiveState × viewerState) to the
// complete UI presentation: state label, color key, viewer message, primary
// and secondary CTAs, dock treatment, urgency level, and accessibility hint.
// This consolidates resolveStateAction + resolveViewerContextMessage +
// resolveViewerStatePresentation into one view model so the detail screen,
// home cards, and seller centre all derive from the same source of truth.

export type AuctionPresentationLabel =
  | 'Scheduled'
  | 'Live'
  | 'Ending'
  | 'Won'
  | 'Lost'
  | 'No sale'
  | 'Cancelled'
  | 'Settled'
  | 'Awaiting payment'
  | 'Settlement pending'
  | 'Watching'
  | 'Leading'
  | 'Outbid'
  | 'Your auction';

export type AuctionPresentationColorKey =
  | 'brand'
  | 'success'
  | 'danger'
  | 'warning'
  | 'textPrimary'
  | 'textSecondary'
  | 'textMuted';

export type AuctionUrgencyLevel = 'none' | 'restrained' | 'elevated' | 'final';

export interface AuctionPresentationState {
  /** Human-readable lifecycle label (e.g. "Live", "Ending", "Won") */
  stateLabel: AuctionPresentationLabel;
  /** Semantic color key for the state label and dock accent */
  colorKey: AuctionPresentationColorKey;
  /** Viewer-specific context message (null when not applicable) */
  viewerMessage: string | null;
  /** Treatment style for the viewer context banner */
  viewerTreatment: 'calm' | 'warning' | 'restrained' | 'result' | 'subdued' | 'seller' | 'none';
  /** Primary CTA derived from state */
  primaryAction: PrimaryAction;
  /** Secondary CTA derived from state */
  secondaryAction: SecondaryAction;
  /** Forbidden actions for this state */
  forbidden: ForbiddenAction[];
  /** Urgency level for motion/color restraint (audit: "semantic urgency, not more drama") */
  urgency: AuctionUrgencyLevel;
  /** Whether bid controls should be visible */
  showBidControls: boolean;
  /** Whether a live indicator dot should pulse */
  showLiveIndicator: boolean;
  /** Accessibility hint summarising the state for screen readers */
  accessibilityHint: string;
}

/**
 * Resolve the complete presentation state for an auction.
 * This is the canonical view model — the detail screen, home cards, and
 * seller centre should all derive their UI from this single function.
 */

// ── Terminal sale-state helpers (audit P0.5) ──
// `ended` (auction closed) is not the same as `settled` (authoritative
// backend settlement). These helpers derive the truthful sale state from
// the backend-backed fulfilment contract so the resolver never labels an
// ended auction as `Settled` before settlement is actually proven.

/** A valid winner exists when the backend recorded a winner and bids. */
function hasValidWinner(auction: AuctionDetailInput): boolean {
  return auction.winnerBidderId != null && auction.bidCount > 0;
}

/** Payment has been confirmed by the backend fulfilment contract. */
function isPaymentConfirmed(auction: AuctionDetailInput): boolean {
  return auction.fulfilment?.paymentStatus === 'paid';
}

export function resolveAuctionPresentationState(
  effectiveState: AuctionEffectiveState,
  viewerState: AuctionViewerState,
  auction: AuctionDetailInput,
  countdownStage: 'upcoming' | 'plenty' | 'moderate' | 'urgent' | 'final' | 'ended' = 'plenty',
): AuctionPresentationState {
  const actionConfig = resolveStateAction(effectiveState, viewerState, auction);
  const isFinalMinutes = countdownStage === 'final';
  const isSeller = viewerState === 'seller';

  // ── Cancelled ──
  if (effectiveState === 'cancelled') {
    return {
      stateLabel: 'Cancelled',
      colorKey: 'textMuted',
      viewerMessage: actionConfig.viewerMessage,
      viewerTreatment: 'subdued',
      primaryAction: actionConfig.primary,
      secondaryAction: actionConfig.secondary,
      forbidden: actionConfig.forbidden,
      urgency: 'none',
      showBidControls: false,
      showLiveIndicator: false,
      accessibilityHint: 'Auction cancelled. No bidding available.',
    };
  }

  // ── Settled ──
  if (effectiveState === 'settled') {
    if (viewerState === 'won') {
      return {
        stateLabel: 'Settled',
        colorKey: 'success',
        viewerMessage: 'You won this auction',
        viewerTreatment: 'result',
        primaryAction: actionConfig.primary,
        secondaryAction: actionConfig.secondary,
        forbidden: actionConfig.forbidden,
        urgency: 'none',
        showBidControls: false,
        showLiveIndicator: false,
        accessibilityHint: 'You won this auction. Tap to view result and complete payment.',
      };
    }
    if (isSeller) {
      return {
        stateLabel: 'Settled',
        colorKey: 'brand',
        viewerMessage: 'This is your auction',
        viewerTreatment: 'seller',
        primaryAction: actionConfig.primary,
        secondaryAction: actionConfig.secondary,
        forbidden: actionConfig.forbidden,
        urgency: 'none',
        showBidControls: false,
        showLiveIndicator: false,
        accessibilityHint: 'Your auction has settled. Tap to view outcome.',
      };
    }
    return {
      stateLabel: 'Settled',
      colorKey: 'textMuted',
      viewerMessage: null,
      viewerTreatment: 'subdued',
      primaryAction: actionConfig.primary,
      secondaryAction: actionConfig.secondary,
      forbidden: actionConfig.forbidden,
      urgency: 'none',
      showBidControls: false,
      showLiveIndicator: false,
      accessibilityHint: 'Auction settled.',
    };
  }

  // ── Ended ──
  // Auction closed but NOT authoritatively settled. Split the sale state
  // using the backend-backed fulfilment contract so `Settled` is reserved
  // for the authoritative `settled` effectiveState (audit P0.5):
  //   ended + winner + unpaid   -> Won / Awaiting payment
  //   ended + paid + unsettled  -> Settlement pending
  //   ended + no valid winner   -> No sale
  if (effectiveState === 'ended') {
    const hasWinner = hasValidWinner(auction);
    const paid = isPaymentConfirmed(auction);

    if (viewerState === 'won') {
      return {
        stateLabel: 'Won',
        colorKey: 'success',
        viewerMessage: paid
          ? 'Payment confirmed · settlement pending'
          : 'You won this auction · awaiting payment',
        viewerTreatment: 'result',
        primaryAction: actionConfig.primary,
        secondaryAction: actionConfig.secondary,
        forbidden: actionConfig.forbidden,
        urgency: 'none',
        showBidControls: false,
        showLiveIndicator: false,
        accessibilityHint: paid
          ? 'Payment confirmed. Settlement pending. Tap to view result.'
          : 'You won this auction. Tap to view result and complete payment.',
      };
    }
    if (viewerState === 'lost') {
      return {
        stateLabel: 'Lost',
        colorKey: 'textMuted',
        viewerMessage: 'You did not win this auction',
        viewerTreatment: 'subdued',
        primaryAction: actionConfig.primary,
        secondaryAction: actionConfig.secondary,
        forbidden: actionConfig.forbidden,
        urgency: 'none',
        showBidControls: false,
        showLiveIndicator: false,
        accessibilityHint: 'You did not win. Tap to view similar items.',
      };
    }
    if (isSeller) {
      if (!hasWinner) {
        return {
          stateLabel: 'No sale',
          colorKey: 'textMuted',
          viewerMessage: 'No bids were received',
          viewerTreatment: 'seller',
          primaryAction: actionConfig.primary,
          secondaryAction: actionConfig.secondary,
          forbidden: actionConfig.forbidden,
          urgency: 'none',
          showBidControls: false,
          showLiveIndicator: false,
          accessibilityHint: 'No bids received. Tap to review.',
        };
      }
      return {
        stateLabel: paid ? 'Settlement pending' : 'Awaiting payment',
        colorKey: paid ? 'brand' : 'warning',
        viewerMessage: paid
          ? 'Payment confirmed · settlement pending'
          : 'Your auction has ended · awaiting buyer payment',
        viewerTreatment: 'seller',
        primaryAction: actionConfig.primary,
        secondaryAction: actionConfig.secondary,
        forbidden: actionConfig.forbidden,
        urgency: 'none',
        showBidControls: false,
        showLiveIndicator: false,
        accessibilityHint: paid
          ? 'Payment confirmed. Settlement pending. Tap to view outcome.'
          : 'Your auction sold. Awaiting buyer payment. Tap to view outcome.',
      };
    }
    // watching or not_participating
    if (!hasWinner) {
      return {
        stateLabel: 'No sale',
        colorKey: 'textMuted',
        viewerMessage: 'Auction ended · no bids',
        viewerTreatment: 'subdued',
        primaryAction: actionConfig.primary,
        secondaryAction: actionConfig.secondary,
        forbidden: actionConfig.forbidden,
        urgency: 'none',
        showBidControls: false,
        showLiveIndicator: false,
        accessibilityHint: 'Auction ended with no bids.',
      };
    }
    return {
      stateLabel: paid ? 'Settlement pending' : 'Awaiting payment',
      colorKey: 'textSecondary',
      viewerMessage: paid
        ? 'Payment confirmed · settlement pending'
        : `Sold with ${auction.bidCount} bid${auction.bidCount === 1 ? '' : 's'} · awaiting payment`,
      viewerTreatment: 'subdued',
      primaryAction: actionConfig.primary,
      secondaryAction: actionConfig.secondary,
      forbidden: actionConfig.forbidden,
      urgency: 'none',
      showBidControls: false,
      showLiveIndicator: false,
      accessibilityHint: paid
        ? 'Auction sold. Payment confirmed, settlement pending.'
        : 'Auction sold. Awaiting buyer payment.',
    };
  }

  // ── Upcoming ──
  if (effectiveState === 'upcoming') {
    if (isSeller) {
      return {
        stateLabel: 'Scheduled',
        colorKey: 'textSecondary',
        viewerMessage: 'This is your auction',
        viewerTreatment: 'seller',
        primaryAction: actionConfig.primary,
        secondaryAction: actionConfig.secondary,
        forbidden: actionConfig.forbidden,
        urgency: 'none',
        showBidControls: false,
        showLiveIndicator: false,
        accessibilityHint: 'Your auction is scheduled. Tap to view details.',
      };
    }
    return {
      stateLabel: 'Scheduled',
      colorKey: 'textSecondary',
      viewerMessage: auction.isWatched ? 'Watching — we’ll notify you when it goes live' : null,
      viewerTreatment: auction.isWatched ? 'restrained' : 'none',
      primaryAction: actionConfig.primary,
      secondaryAction: actionConfig.secondary,
      forbidden: actionConfig.forbidden,
      urgency: 'none',
      showBidControls: false,
      showLiveIndicator: false,
      accessibilityHint: auction.isWatched ? 'Watching. You will be notified when this auction goes live. Tap to manage.' : 'Tap to get notified when this auction goes live.',
    };
  }

  // ── Live ──
  const urgency: AuctionUrgencyLevel = isFinalMinutes ? 'final' : countdownStage === 'moderate' ? 'elevated' : 'restrained';

  if (isSeller) {
    return {
      stateLabel: isFinalMinutes ? 'Ending' : 'Live',
      colorKey: isFinalMinutes ? 'danger' : 'brand',
      viewerMessage: 'This is your auction',
      viewerTreatment: 'seller',
      primaryAction: actionConfig.primary,
      secondaryAction: actionConfig.secondary,
      forbidden: actionConfig.forbidden,
      urgency,
      showBidControls: false,
      showLiveIndicator: true,
      accessibilityHint: `Your auction is ${isFinalMinutes ? 'ending soon' : 'live'}. Tap to view performance.`,
    };
  }

  if (viewerState === 'leading') {
    return {
      stateLabel: 'Leading',
      colorKey: 'success',
      viewerMessage: 'You are currently the highest bidder',
      viewerTreatment: 'calm',
      primaryAction: actionConfig.primary,
      secondaryAction: actionConfig.secondary,
      forbidden: actionConfig.forbidden,
      urgency,
      showBidControls: true,
      showLiveIndicator: true,
      accessibilityHint: `You are leading. ${isFinalMinutes ? 'Auction ending soon.' : ''} Tap to increase your bid.`,
    };
  }

  if (viewerState === 'outbid') {
    return {
      stateLabel: 'Outbid',
      colorKey: 'danger',
      viewerMessage: 'You have been outbid',
      viewerTreatment: 'warning',
      primaryAction: actionConfig.primary,
      secondaryAction: actionConfig.secondary,
      forbidden: actionConfig.forbidden,
      urgency,
      showBidControls: true,
      showLiveIndicator: true,
      accessibilityHint: `You have been outbid. ${isFinalMinutes ? 'Auction ending soon.' : ''} Tap to bid again.`,
    };
  }

  // live — watching or not_participating
  return {
    stateLabel: isFinalMinutes ? 'Ending' : 'Live',
    colorKey: isFinalMinutes ? 'danger' : 'textPrimary',
    viewerMessage: viewerState === 'watching' ? 'You are watching this auction' : null,
    viewerTreatment: viewerState === 'watching' ? 'restrained' : 'none',
    primaryAction: actionConfig.primary,
    secondaryAction: actionConfig.secondary,
    forbidden: actionConfig.forbidden,
    urgency,
    showBidControls: true,
    showLiveIndicator: true,
    accessibilityHint: `Auction ${isFinalMinutes ? 'ending soon' : 'live'}. Tap to place a bid.`,
  };
}

export function resolveStateAction(
  effectiveState: AuctionEffectiveState,
  viewerState: AuctionViewerState,
  auction: AuctionDetailInput,
): StateActionConfig {
  // Terminal states — no bidding controls
  if (effectiveState === 'cancelled') {
    return {
      primary: { type: 'none', label: '' },
      secondary: { type: 'none', label: '' },
      forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
      viewerMessage: 'This auction has been cancelled',
      viewerTreatment: 'subdued',
    };
  }

  if (effectiveState === 'settled') {
    if (viewerState === 'won') {
      return {
        primary: { type: 'viewResult', label: 'View result' },
        secondary: { type: 'none', label: '' },
        forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
        viewerMessage: 'You won this auction',
        viewerTreatment: 'result',
      };
    }
    if (viewerState === 'seller') {
      return {
        primary: { type: 'viewOutcome', label: 'View outcome' },
        secondary: { type: 'none', label: '' },
        forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
        viewerMessage: 'This is your auction',
        viewerTreatment: 'seller',
      };
    }
    return {
      primary: { type: 'none', label: '' },
      secondary: { type: 'none', label: '' },
      forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
      viewerMessage: null,
      viewerTreatment: 'subdued',
    };
  }

  if (effectiveState === 'ended') {
    const hasWinner = hasValidWinner(auction);
    const paid = isPaymentConfirmed(auction);
    if (viewerState === 'won') {
      return {
        primary: { type: 'viewResult', label: 'View result' },
        secondary: { type: 'none', label: '' },
        forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
        viewerMessage: paid
          ? 'Payment confirmed · settlement pending'
          : 'You won this auction · awaiting payment',
        viewerTreatment: 'result',
      };
    }
    if (viewerState === 'lost') {
      return {
        primary: { type: 'viewSimilar', label: 'View similar items' },
        secondary: { type: 'none', label: '' },
        forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
        viewerMessage: 'You did not win this auction',
        viewerTreatment: 'subdued',
      };
    }
    if (viewerState === 'seller') {
      return {
        primary: { type: 'viewOutcome', label: 'View outcome' },
        secondary: { type: 'none', label: '' },
        forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
        viewerMessage: !hasWinner
          ? 'No bids were received'
          : paid
            ? 'Payment confirmed · settlement pending'
            : 'Your auction has ended · awaiting buyer payment',
        viewerTreatment: 'seller',
      };
    }
    // ended — watching or not_participating
    const endedMessage = !hasWinner
      ? 'Auction ended · no bids'
      : paid
        ? 'Payment confirmed · settlement pending'
        : `Sold with ${auction.bidCount} bid${auction.bidCount === 1 ? '' : 's'} · awaiting payment`;
    if (viewerState === 'watching') {
      return {
        primary: { type: 'viewSimilar', label: 'View similar items' },
        secondary: { type: 'none', label: '' },
        forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
        viewerMessage: endedMessage,
        viewerTreatment: 'subdued',
      };
    }
    // not_participating
    return {
      primary: { type: 'viewSimilar', label: 'View similar items' },
      secondary: { type: 'none', label: '' },
      forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
      viewerMessage: endedMessage,
      viewerTreatment: 'subdued',
    };
  }

  // Upcoming — no bidding yet
  if (effectiveState === 'upcoming') {
    if (viewerState === 'seller') {
      return {
        primary: { type: 'viewPerformance', label: 'View auction' },
        secondary: { type: 'share', label: 'Share' },
        forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
        viewerMessage: 'This is your auction',
        viewerTreatment: 'seller',
      };
    }
    return {
      primary: { type: 'watchAuction', label: auction.isWatched ? 'Watching' : 'Notify me' },
      secondary: { type: 'share', label: 'Share' },
      forbidden: ['placeBid', 'buyNow'],
      viewerMessage: auction.isWatched ? 'You are watching — we’ll notify you when it goes live' : null,
      viewerTreatment: auction.isWatched ? 'restrained' : 'none',
    };
  }

  // Live — bidding active
  if (viewerState === 'seller') {
    return {
      primary: { type: 'viewPerformance', label: 'View performance' },
      secondary: { type: 'share', label: 'Share' },
      forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
      viewerMessage: 'This is your auction',
      viewerTreatment: 'seller',
    };
  }

  const buyNow = auction.buyNowPriceGbp !== null && auction.buyNowPriceGbp > 0
    ? { type: 'buyNow' as const, label: 'Buy Now', priceGbp: auction.buyNowPriceGbp }
    : { type: 'none' as const, label: '' };

  if (viewerState === 'leading') {
    return {
      primary: { type: 'increaseBid', label: 'Increase bid' },
      secondary: buyNow,
      forbidden: ['edit', 'cancel', 'relist'],
      viewerMessage: 'You are currently the highest bidder',
      viewerTreatment: 'calm',
    };
  }

  if (viewerState === 'outbid') {
    return {
      primary: { type: 'bidAgain', label: 'Bid again' },
      secondary: buyNow,
      forbidden: ['edit', 'cancel', 'relist'],
      viewerMessage: 'You have been outbid',
      viewerTreatment: 'warning',
    };
  }

  // live — not_participating or watching
  return {
    primary: { type: 'placeBid', label: 'Place bid' },
    secondary: buyNow,
    forbidden: ['edit', 'cancel', 'relist'],
    viewerMessage: viewerState === 'watching' ? 'You are watching this auction' : null,
    viewerTreatment: viewerState === 'watching' ? 'restrained' : 'none',
  };
}

// ── Buy Now availability ──

export function isBuyNowAvailable(auction: AuctionDetailInput, effectiveState: AuctionEffectiveState): boolean {
  if (effectiveState !== 'live') return false;
  if (auction.viewerState === 'seller') return false;
  return auction.buyNowPriceGbp !== null && auction.buyNowPriceGbp > 0;
}

// ── Reserve price status ──

export type ReserveStatus = 'none' | 'not-met' | 'met';

export function resolveReserveStatus(auction: { reservePriceGbp: number | null; currentBidGbp: number; bidCount: number }): ReserveStatus {
  if (auction.reservePriceGbp === null || auction.reservePriceGbp <= 0) return 'none';
  if (auction.bidCount === 0) return 'not-met';
  return auction.currentBidGbp >= auction.reservePriceGbp ? 'met' : 'not-met';
}

// ── Seller cannot bid ──

export function isSellerBlocked(viewerState: AuctionViewerState): boolean {
  return viewerState === 'seller';
}

// ── Action removal for terminal states ──

export function areBidControlsRemoved(effectiveState: AuctionEffectiveState): boolean {
  return effectiveState === 'ended' || effectiveState === 'cancelled' || effectiveState === 'settled';
}

// ── Price label for detail screen ──

export type DetailPriceLabel = 'Starting bid' | 'Current bid' | 'Final bid' | 'No bids' | 'Buy Now';

export function resolveDetailPriceLabel(
  auction: AuctionDetailInput,
  effectiveState: AuctionEffectiveState,
): DetailPriceLabel {
  if (effectiveState === 'cancelled' || effectiveState === 'settled' || effectiveState === 'ended') {
    return auction.bidCount > 0 ? 'Final bid' : 'No bids';
  }
  if (effectiveState === 'upcoming') {
    return 'Starting bid';
  }
  return auction.bidCount > 0 ? 'Current bid' : 'Starting bid';
}

// ── Detail price amount ──

export function resolveDetailPriceAmount(auction: AuctionDetailInput): number {
  return auction.bidCount > 0 ? auction.currentBidGbp : auction.startingBidGbp;
}

// ── Countdown display with urgency-based precision ──

export type CountdownStage = 'upcoming' | 'plenty' | 'moderate' | 'urgent' | 'final' | 'ended';

export function resolveDetailCountdown(
  timing: { effectiveState: AuctionEffectiveState; msToStart: number; msToEnd: number },
  secondClockMs: number,
  minuteClockMs: number,
): { text: string; isFinalMinutes: boolean; stage: CountdownStage } {
  if (timing.effectiveState === 'cancelled') return { text: 'Cancelled', isFinalMinutes: false, stage: 'ended' };
  if (timing.effectiveState === 'settled') return { text: 'Settled', isFinalMinutes: false, stage: 'ended' };
  if (timing.effectiveState === 'ended') return { text: 'Ended', isFinalMinutes: false, stage: 'ended' };
  if (timing.effectiveState === 'upcoming') {
    return { text: `Starts in ${formatCountdown(timing.msToStart)}`, isFinalMinutes: false, stage: 'upcoming' };
  }
  // live
  const isFinalMinutes = timing.msToEnd <= 5 * 60 * 1000;
  if (isFinalMinutes) {
    return { text: formatFinalMinutesCountdown(timing.msToEnd), isFinalMinutes: true, stage: 'final' };
  }
  // moderate: under 1 hour
  if (timing.msToEnd <= 60 * 60 * 1000) {
    return { text: formatCountdown(timing.msToEnd), isFinalMinutes: false, stage: 'moderate' };
  }
  return { text: formatCountdown(timing.msToEnd), isFinalMinutes: false, stage: 'plenty' };
}

// ── Lifecycle transition detection ──

export function detectLifecycleTransition(
  prevState: AuctionEffectiveState,
  nextState: AuctionEffectiveState,
): boolean {
  return prevState !== nextState;
}

// ── Viewer-specific context message ──

export interface ViewerContextMessage {
  title: string;
  subtitle: string | null;
  treatment: 'calm' | 'warning' | 'restrained' | 'result' | 'subdued' | 'seller' | 'none';
}

export function resolveViewerContextMessage(
  effectiveState: AuctionEffectiveState,
  viewerState: AuctionViewerState,
  auction: AuctionDetailInput,
  formatFromFiat: (amount: number, currency?: any, opts?: any) => string,
): ViewerContextMessage | null {
  if (viewerState === 'not_participating') return null;

  if (viewerState === 'seller') {
    return {
      title: 'This is your auction',
      subtitle: effectiveState === 'live'
        ? `${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'} so far`
        : null,
      treatment: 'seller',
    };
  }

  if (viewerState === 'watching' && effectiveState === 'upcoming') {
    return {
      title: 'Watching — we’ll notify you when it goes live',
      subtitle: null,
      treatment: 'restrained',
    };
  }

  if (viewerState === 'watching' && effectiveState === 'live') {
    return {
      title: 'You are watching this auction',
      subtitle: null,
      treatment: 'restrained',
    };
  }

  if (viewerState === 'leading') {
    return {
      title: 'You are currently the highest bidder',
      subtitle: null,
      treatment: 'calm',
    };
  }

  if (viewerState === 'outbid') {
    return {
      title: 'You have been outbid',
      subtitle: `Minimum next bid: ${formatFromFiat(auction.minimumNextBidGbp, 'GBP')}`,
      treatment: 'warning',
    };
  }

  if (viewerState === 'won') {
    return {
      title: 'You won this auction',
      subtitle: null,
      treatment: 'result',
    };
  }

  if (viewerState === 'lost') {
    return {
      title: 'You did not win this auction',
      subtitle: null,
      treatment: 'subdued',
    };
  }

  if (viewerState === 'watching' && (effectiveState === 'ended' || effectiveState === 'settled')) {
    return {
      title: 'This auction has ended',
      subtitle: null,
      treatment: 'subdued',
    };
  }

  return null;
}

// ── Accessibility label builder ──

export function buildDetailAccessibilityLabel(
  auction: AuctionDetailInput,
  timing: { effectiveState: AuctionEffectiveState; msToStart: number; msToEnd: number },
  priceLabel: DetailPriceLabel,
  priceText: string,
  countdownText: string,
  viewerState: AuctionViewerState,
): string {
  const bidText = auction.bidCount > 0 ? `, ${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'}` : '';
  const viewerText = viewerState !== 'not_participating' ? `, ${viewerState}` : '';
  return `${auction.title}, ${priceLabel} ${priceText}, ${countdownText}${bidText}${viewerText}`;
}

// ── Bid activity display helper ──

export interface BidActivityDisplayRow {
  id: number;
  amountText: string;
  bidderLabel: string;
  isViewer: boolean;
  isTopBid: boolean;
  relativeTime: string | null;
}

function formatRelativeTime(createdAt: string, serverNow: string | null): string | null {
  const created = new Date(createdAt).getTime();
  if (isNaN(created)) return null;
  const now = serverNow ? new Date(serverNow).getTime() : Date.now();
  const diffMs = now - created;
  if (diffMs < 0) return null;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return null;
}

function anonymizeBidder(username: string, isViewer: boolean): string {
  if (isViewer) return 'You';
  if (!username) return 'Anonymous';
  // Show first 2 chars + "•••" to preserve privacy while giving a sense of identity
  if (username.length <= 2) return `${username[0]}•••`;
  return `${username.slice(0, 2)}•••`;
}

export function formatBidActivityRow(
  bid: {
    id: number;
    bidderUsername: string;
    amountGbp: number;
    createdAt: string;
    isViewer: boolean;
  },
  index: number,
  formatFromFiat: (amount: number, currency?: any, opts?: any) => string,
  serverNow?: string | null,
): BidActivityDisplayRow {
  return {
    id: bid.id,
    amountText: formatFromFiat(bid.amountGbp, 'GBP'),
    bidderLabel: anonymizeBidder(bid.bidderUsername, bid.isViewer),
    isViewer: bid.isViewer,
    isTopBid: index === 0,
    relativeTime: formatRelativeTime(bid.createdAt, serverNow ?? null),
  };
}
