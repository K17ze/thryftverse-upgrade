import {
  resolveAuctionTiming,
  formatCountdown,
  type AuctionEffectiveState,
} from '../hooks/useServerClock';
import { formatFinalMinutesCountdown, type AuctionViewerState } from './auctionHomeLogic';

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
  bidCount: number;
  viewerState: AuctionViewerState;
  isWatched: boolean;
  cancelledAt: string | null;
  settledAt: string | null;
  winnerBidderId: string | null;
  lifecycle: string;
  terminalReason: string | null;
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
    if (viewerState === 'won') {
      return {
        primary: { type: 'viewResult', label: 'View result' },
        secondary: { type: 'none', label: '' },
        forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
        viewerMessage: 'You won this auction',
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
        viewerMessage: auction.bidCount > 0 ? 'Your auction has ended' : 'No bids were received',
        viewerTreatment: 'seller',
      };
    }
    // ended — watching or not_participating
    return {
      primary: { type: 'none', label: '' },
      secondary: { type: 'none', label: '' },
      forbidden: ['placeBid', 'buyNow', 'edit', 'cancel', 'relist'],
      viewerMessage: null,
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
      primary: { type: 'watchAuction', label: auction.isWatched ? 'Watching' : 'Watch auction' },
      secondary: { type: 'share', label: 'Share' },
      forbidden: ['placeBid', 'buyNow'],
      viewerMessage: auction.isWatched ? 'You are watching this auction' : null,
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

export function resolveDetailCountdown(
  timing: { effectiveState: AuctionEffectiveState; msToStart: number; msToEnd: number },
  secondClockMs: number,
  minuteClockMs: number,
): { text: string; isFinalMinutes: boolean } {
  if (timing.effectiveState === 'cancelled') return { text: 'Cancelled', isFinalMinutes: false };
  if (timing.effectiveState === 'settled') return { text: 'Settled', isFinalMinutes: false };
  if (timing.effectiveState === 'ended') return { text: 'Ended', isFinalMinutes: false };
  if (timing.effectiveState === 'upcoming') {
    return { text: `Starts in ${formatCountdown(timing.msToStart)}`, isFinalMinutes: false };
  }
  // live
  const isFinalMinutes = timing.msToEnd <= 5 * 60 * 1000;
  if (isFinalMinutes) {
    return { text: formatFinalMinutesCountdown(timing.msToEnd), isFinalMinutes: true };
  }
  return { text: formatCountdown(timing.msToEnd), isFinalMinutes: false };
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
      title: 'You are watching this auction',
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
): BidActivityDisplayRow {
  return {
    id: bid.id,
    amountText: formatFromFiat(bid.amountGbp, 'GBP'),
    bidderLabel: bid.isViewer ? 'You' : 'Bidder',
    isViewer: bid.isViewer,
    isTopBid: index === 0,
    relativeTime: null,
  };
}
