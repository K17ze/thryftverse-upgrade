/**
 * sellerAuctionModel — the seller-side auction grammar. Port of
 * frontend/src/utils/sellerAuctionState.ts +
 * frontend/src/components/auction/sellerAuctionCentreViewModels.ts.
 *
 * The web auction contract models three lifecycles (upcoming/live/ended)
 * rather than mobile's richer effective states, so mobile's six buckets
 * collapse to four: pending and cancelled cannot occur on this surface —
 * an ended auction with bids is 'sold', without bids 'unsold'.
 */

import type { AuctionViewModel } from '@/lib/contracts/auction';
import { countdownUrgency, formatDuration } from '@/lib/data/fixtures-auctions';

export type SellerAuctionBucket = 'scheduled' | 'live' | 'sold' | 'unsold';

export function sellerAuctionBucket(auction: AuctionViewModel): SellerAuctionBucket {
  if (auction.lifecycle === 'upcoming') return 'scheduled';
  if (auction.lifecycle === 'live') return 'live';
  return auction.bidCount > 0 ? 'sold' : 'unsold';
}

// ── Stats — mobile computeStats: the summary header reads these ──

export interface SellerAuctionStats {
  total: number;
  scheduled: number;
  live: number;
  sold: number;
  unsold: number;
  totalBids: number;
  highestBid: number;
}

export function computeSellerStats(auctions: AuctionViewModel[]): SellerAuctionStats {
  const stats: SellerAuctionStats = {
    total: auctions.length,
    scheduled: 0,
    live: 0,
    sold: 0,
    unsold: 0,
    totalBids: 0,
    highestBid: 0,
  };
  for (const auction of auctions) {
    stats[sellerAuctionBucket(auction)] += 1;
    stats.totalBids += auction.bidCount;
    if (auction.currentBid > stats.highestBid) stats.highestBid = auction.currentBid;
  }
  return stats;
}

// ── Tab rail — mobile buildSellerTabs order, minus the unreachable buckets ──

export function buildSellerTabs(
  stats: SellerAuctionStats,
): { value: SellerAuctionBucket; label: string; count: number }[] {
  return [
    { value: 'scheduled', label: 'Scheduled', count: stats.scheduled },
    { value: 'live', label: 'Live', count: stats.live },
    { value: 'sold', label: 'Sold', count: stats.sold },
    { value: 'unsold', label: 'Unsold', count: stats.unsold },
  ];
}

// ── Row presentation — port of mobile resolveStatePresentation ──

export type SellerRowTone = 'danger' | 'success' | 'primary' | 'secondary' | 'muted';

export interface SellerRowPresentation {
  stateLabel: 'Ending' | 'Live' | 'Scheduled' | 'Sold' | 'Unsold';
  stateTone: SellerRowTone;
  /** Leading operational line — the most important fact for this state. */
  leadingLabel: string;
  leadingTone: SellerRowTone;
  /** One truthful next action — the row deep-links to /auctions/[id]. */
  actionLabel: string;
  showLiveDot: boolean;
}

export function resolveSellerRowPresentation(
  auction: AuctionViewModel,
): SellerRowPresentation {
  const bucket = sellerAuctionBucket(auction);
  if (bucket === 'live') {
    const final = countdownUrgency(auction) === 'final';
    return {
      stateLabel: final ? 'Ending' : 'Live',
      stateTone: final ? 'danger' : 'primary',
      leadingLabel: `${formatDuration(auction.msToEnd)} left`,
      leadingTone: final ? 'danger' : 'secondary',
      actionLabel: 'View bids',
      showLiveDot: true,
    };
  }
  if (bucket === 'scheduled') {
    return {
      stateLabel: 'Scheduled',
      stateTone: 'secondary',
      leadingLabel: `Starts in ${formatDuration(auction.msToStart)}`,
      leadingTone: 'secondary',
      actionLabel: 'View schedule',
      showLiveDot: false,
    };
  }
  if (bucket === 'sold') {
    return {
      stateLabel: 'Sold',
      stateTone: 'success',
      leadingLabel: `Sold · ${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'}`,
      leadingTone: 'secondary',
      actionLabel: 'View sale',
      showLiveDot: false,
    };
  }
  return {
    stateLabel: 'Unsold',
    stateTone: 'muted',
    leadingLabel: 'No bids received',
    leadingTone: 'muted',
    actionLabel: 'Review result',
    showLiveDot: false,
  };
}

// ── Price — mobile resolvePriceLabel collapsed to a quiet prefix ──

export function sellerPrice(auction: AuctionViewModel): { prefix: string; amount: number } {
  const amount = auction.bidCount > 0 ? auction.currentBid : auction.startingBid;
  if (auction.lifecycle === 'ended') {
    return { prefix: auction.bidCount > 0 ? 'Final ' : '', amount };
  }
  if (auction.lifecycle === 'live' && auction.bidCount > 0) {
    return { prefix: 'Current ', amount };
  }
  return { prefix: 'Starts ', amount };
}

// ── Per-tab empty copy — mobile SellerAuctionEmptyState ──

export const SELLER_EMPTY: Record<
  SellerAuctionBucket,
  { title: string; message: string; cta?: string }
> = {
  scheduled: {
    title: 'No auctions scheduled',
    message: 'Create an auction when you are ready to sell.',
    cta: 'Create auction',
  },
  live: {
    title: 'Nothing live right now',
    message: 'Scheduled auctions will appear here when they begin.',
  },
  sold: {
    title: 'No completed sales yet',
    message: 'Auctions that closed with a winning bid settle here.',
  },
  unsold: {
    title: 'No unsold auctions',
    message: 'Auctions that closed without a sale appear here.',
  },
};
