/**
 * Auction fixtures — mirrors frontend/src/data/tradeHub.ts behaviour.
 * Timestamps are authored as offsets from a module-scope NOW constant (the
 * mobile WINDOW pattern), so lifecycle/countdowns are computed from real
 * timestamps and the server render agrees with the client's first paint.
 */

import type {
  AuctionBid,
  AuctionLifecycle,
  AuctionMarketItem,
  AuctionViewModel,
  CountdownUrgency,
  CreateAuctionInput,
  MyBidStatus,
} from '@/lib/contracts/auction';
import { AUCTION_WINDOW_MS, BID_INCREMENT_RATE } from '@/lib/contracts/auction';
import { listingById } from '@/lib/data/fixtures';

// Module-scope clock — every timestamp below is an offset from this instant.
const NOW_MS = Date.now();

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const toIso = (offsetMs: number) => new Date(NOW_MS + offsetMs).toISOString();

// ============================================================================
// AUCTIONS
// ============================================================================

export const AUCTIONS: AuctionMarketItem[] = [
  {
    id: 'a1',
    listingId: 'l1',
    sellerId: 'u1',
    title: 'Yves Saint Laurent Wool Sweater',
    image: 'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?auto=format&fit=crop&w=900&q=80',
    startsAt: toIso(-90 * MIN),
    endsAt: toIso(-90 * MIN + AUCTION_WINDOW_MS),
    startingBid: 120,
    currentBid: 196,
    bidCount: 9,
    buyNowPrice: 240,
  },
  {
    id: 'a2',
    listingId: 'l5',
    sellerId: 'u5',
    title: 'Vintage Levi\'s 501 Jeans',
    image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=80',
    startsAt: toIso(-3 * HOUR),
    endsAt: toIso(-3 * HOUR + AUCTION_WINDOW_MS),
    startingBid: 95,
    currentBid: 174,
    bidCount: 6,
  },
  {
    id: 'a3',
    listingId: 'l8',
    sellerId: 'u1',
    title: 'Quilted Leather Shoulder Bag',
    image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80',
    startsAt: toIso(40 * MIN),
    endsAt: toIso(40 * MIN + AUCTION_WINDOW_MS),
    startingBid: 300,
    currentBid: 300,
    bidCount: 0,
    buyNowPrice: 385,
  },
  {
    id: 'a4',
    listingId: 'l10',
    sellerId: 'u3',
    title: 'Chronograph Watch 40mm',
    image: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=900&q=80',
    startsAt: toIso(2.5 * HOUR),
    endsAt: toIso(2.5 * HOUR + AUCTION_WINDOW_MS),
    startingBid: 70,
    currentBid: 70,
    bidCount: 0,
  },
  {
    id: 'a5',
    listingId: 'l3',
    sellerId: 'u2',
    title: 'Polo Ralph Lauren Harrington Jacket',
    image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=80',
    startsAt: toIso(-10 * HOUR),
    endsAt: toIso(-10 * HOUR + AUCTION_WINDOW_MS),
    startingBid: 45,
    currentBid: 79,
    bidCount: 5,
  },
  {
    id: 'a6',
    listingId: 'l9',
    sellerId: 'u6',
    title: 'Oversized Wool Coat',
    image: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?auto=format&fit=crop&w=900&q=80',
    startsAt: toIso(-10 * HOUR),
    endsAt: toIso(-10 * HOUR + AUCTION_WINDOW_MS),
    startingBid: 150,
    currentBid: 340,
    bidCount: 5,
    buyNowPrice: 420,
  },
  // ── The seller's own board (sellerId 'me') — one of each outcome so the
  // /seller-hub/auctions management surface is demonstrable: a live window
  // closing in ~35 minutes, a scheduled rerun, a settled sale, and the
  // earlier unsold attempt at the same listing.
  {
    id: 'sa1',
    listingId: 'ml1',
    sellerId: 'me',
    title: 'Oversized Denim Shirt',
    image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80',
    startsAt: toIso(-325 * MIN),
    endsAt: toIso(-325 * MIN + AUCTION_WINDOW_MS),
    startingBid: 18,
    currentBid: 42,
    bidCount: 7,
  },
  {
    id: 'sa2',
    listingId: 'ml2',
    sellerId: 'me',
    title: 'Pleated Trousers',
    image: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=80',
    startsAt: toIso(2.5 * HOUR),
    endsAt: toIso(2.5 * HOUR + AUCTION_WINDOW_MS),
    startingBid: 24,
    currentBid: 24,
    bidCount: 0,
  },
  {
    id: 'sa3',
    listingId: 'ml3',
    sellerId: 'me',
    title: 'Graphic Print Tee',
    image: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=900&q=80',
    startsAt: toIso(-30 * HOUR),
    endsAt: toIso(-30 * HOUR + AUCTION_WINDOW_MS),
    startingBid: 14,
    currentBid: 34,
    bidCount: 8,
  },
  {
    // The first run of ml2 — closed with no bids; sa2 is the rerun.
    id: 'sa4',
    listingId: 'ml2',
    sellerId: 'me',
    title: 'Pleated Trousers',
    image: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=80',
    startsAt: toIso(-4 * 24 * HOUR),
    endsAt: toIso(-4 * 24 * HOUR + AUCTION_WINDOW_MS),
    startingBid: 24,
    currentBid: 24,
    bidCount: 0,
  },
];

// ============================================================================
// BID HISTORY — authored ascending per auction
// ============================================================================

function bid(
  id: string,
  auctionId: string,
  bidderId: string,
  amount: number,
  minutesAgo: number,
): AuctionBid {
  return {
    id,
    auctionId,
    bidderId,
    amount,
    createdAt: toIso(-minutesAgo * MIN),
    bidderName: 'member',
    bidderAvatar: null,
  };
}

export const AUCTION_BIDS: AuctionBid[] = [
  // a1 — live, viewer outbid (top bid u3 at £196)
  bid('b1-1', 'a1', 'u2', 120, 86),
  bid('b1-2', 'a1', 'u6', 128, 78),
  bid('b1-3', 'a1', 'u5', 140, 71),
  bid('b1-4', 'a1', 'u2', 152, 63),
  bid('b1-5', 'a1', 'u6', 165, 55),
  bid('b1-6', 'a1', 'me', 180, 44),
  bid('b1-7', 'a1', 'u3', 188, 30),
  bid('b1-8', 'a1', 'u5', 192, 18),
  bid('b1-9', 'a1', 'u3', 196, 7),
  // a2 — live, viewer winning (top bid mine at £174)
  bid('b2-1', 'a2', 'u6', 95, 170),
  bid('b2-2', 'a2', 'u2', 110, 150),
  bid('b2-3', 'a2', 'u3', 125, 130),
  bid('b2-4', 'a2', 'u5', 148, 100),
  bid('b2-5', 'a2', 'u3', 162, 75),
  bid('b2-6', 'a2', 'me', 174, 50),
  // a5 — ended, viewer won at £79
  bid('b5-1', 'a5', 'u2', 45, 575),
  bid('b5-2', 'a5', 'u6', 52, 540),
  bid('b5-3', 'a5', 'u3', 60, 480),
  bid('b5-5', 'a5', 'u5', 71, 420),
  bid('b5-6', 'a5', 'me', 79, 350),
  // a6 — ended, viewer lost (top bid u5 at £340)
  bid('b6-1', 'a6', 'u2', 180, 585),
  bid('b6-2', 'a6', 'me', 210, 550),
  bid('b6-3', 'a6', 'u5', 260, 490),
  bid('b6-5', 'a6', 'me', 310, 440),
  bid('b6-6', 'a6', 'u5', 340, 385),
  // sa1 — live (opened ~5h25m ago), ladder to £42
  bid('sa1-1', 'sa1', 'u3', 18, 300),
  bid('sa1-2', 'sa1', 'u5', 22, 240),
  bid('sa1-3', 'sa1', 'u2', 26, 190),
  bid('sa1-4', 'sa1', 'u6', 30, 150),
  bid('sa1-5', 'sa1', 'u3', 34, 100),
  bid('sa1-6', 'sa1', 'u5', 38, 60),
  bid('sa1-7', 'sa1', 'u2', 42, 25),
  // sa3 — ended ~24h ago, u4 took the tee at £34 (matches order ord-1021)
  bid('sa3-1', 'sa3', 'u2', 14, 1780),
  bid('sa3-2', 'sa3', 'u6', 16, 1740),
  bid('sa3-3', 'sa3', 'u3', 20, 1700),
  bid('sa3-4', 'sa3', 'u5', 23, 1660),
  bid('sa3-5', 'sa3', 'u2', 26, 1620),
  bid('sa3-6', 'sa3', 'u3', 28, 1580),
  bid('sa3-7', 'sa3', 'u4', 31, 1540),
  bid('sa3-8', 'sa3', 'u4', 34, 1460),
];

// ============================================================================
// LIFECYCLE + FORMATTING — pure helpers shared by hub, detail and my-bids
// ============================================================================

export function toViewModel(
  auction: AuctionMarketItem,
  now: number,
  extendedEndMs?: number,
): AuctionViewModel {
  const startsAtMs = new Date(auction.startsAt).getTime();
  const originalEndMs = new Date(auction.endsAt).getTime();
  // Anti-sniping: the extended end wins when a late bid pushed it out.
  const effectiveEndMs = extendedEndMs ?? originalEndMs;
  const msToStart = startsAtMs - now;
  const msToEnd = effectiveEndMs - now;

  let lifecycle: AuctionLifecycle = 'upcoming';
  if (msToStart <= 0 && msToEnd > 0) lifecycle = 'live';
  else if (msToEnd <= 0) lifecycle = 'ended';

  const windowMs = Math.max(MIN, effectiveEndMs - startsAtMs);
  const elapsedMs = Math.min(windowMs, Math.max(0, now - startsAtMs));
  const progress = Math.min(1, Math.max(0, elapsedMs / windowMs));

  return { ...auction, lifecycle, msToStart, msToEnd, progress };
}

/** Live first (ending soonest), then upcoming (starting soonest), then ended. */
export function sortAuctions(auctions: AuctionViewModel[]): AuctionViewModel[] {
  const rank: Record<AuctionLifecycle, number> = { live: 0, upcoming: 1, ended: 2 };
  return [...auctions].sort((a, b) => {
    if (rank[a.lifecycle] !== rank[b.lifecycle]) {
      return rank[a.lifecycle] - rank[b.lifecycle];
    }
    if (a.lifecycle === 'live') return a.msToEnd - b.msToEnd;
    if (a.lifecycle === 'upcoming') return a.msToStart - b.msToStart;
    return b.currentBid - a.currentBid;
  });
}

/** Next valid bid: the opening bid before activity, then +5% rounded up. */
export function minNextBid(auction: AuctionMarketItem): number {
  if (auction.bidCount === 0) return auction.startingBid;
  return Math.ceil(auction.currentBid * (1 + BID_INCREMENT_RATE));
}

/** "2h 14m" / "40m" / "45s" — card countdown granularity. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

export function countdownLabel(vm: AuctionViewModel): string {
  if (vm.lifecycle === 'ended') return 'Ended';
  if (vm.lifecycle === 'upcoming') return `Starts in ${formatDuration(vm.msToStart)}`;
  return `Ends in ${formatDuration(vm.msToEnd)}`;
}

/** Urgency tone — under an hour warms up, final five minutes go loud. */
export function countdownUrgency(vm: AuctionViewModel): CountdownUrgency {
  if (vm.lifecycle === 'ended') return 'ended';
  const ms = vm.lifecycle === 'live' ? vm.msToEnd : vm.msToStart;
  if (ms < 5 * MIN) return 'final';
  if (ms < HOUR) return 'soon';
  return 'normal';
}

/** Ticking clock for the detail surface — "2:14:09" / "44:09". */
export function formatClock(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

// ============================================================================
// MY BIDS — derived from bid history for the viewer, never stored
// ============================================================================

export interface MyBidRow {
  auction: AuctionViewModel;
  myBid: number;
  status: MyBidStatus;
  placedAt: string;
}

export function myBidRows(
  auctions: AuctionViewModel[],
  bids: AuctionBid[],
  viewerId: string,
): MyBidRow[] {
  const byId = new Map(auctions.map((a) => [a.id, a]));
  const mine = new Map<string, { amount: number; placedAt: string }>();
  for (const row of bids) {
    if (row.bidderId !== viewerId) continue;
    const existing = mine.get(row.auctionId);
    if (!existing || new Date(row.createdAt) > new Date(existing.placedAt)) {
      mine.set(row.auctionId, { amount: row.amount, placedAt: row.createdAt });
    }
  }

  const rows: MyBidRow[] = [];
  for (const [auctionId, entry] of mine) {
    const auction = byId.get(auctionId);
    if (!auction) continue;
    const leading = entry.amount >= auction.currentBid;
    const status: MyBidStatus =
      auction.lifecycle === 'ended'
        ? leading
          ? 'won'
          : 'lost'
        : leading
          ? 'winning'
          : 'outbid';
    rows.push({ auction, myBid: entry.amount, status, placedAt: entry.placedAt });
  }
  return rows;
}

// ============================================================================
// CREATE — simulated auction creation (fixture mode)
// ============================================================================

export function buildAuction(input: CreateAuctionInput): AuctionMarketItem | null {
  const listing = listingById(input.listingId);
  if (!listing) return null;
  const now = Date.now();
  return {
    id: `ua-${now.toString(36)}`,
    listingId: input.listingId,
    sellerId: 'me',
    title: listing.title,
    image: listing.images[0] ?? '',
    startsAt: new Date(now).toISOString(),
    endsAt: new Date(now + input.durationHours * HOUR).toISOString(),
    startingBid: input.startingBid,
    currentBid: input.startingBid,
    bidCount: 0,
    ...(input.buyNowPrice != null ? { buyNowPrice: input.buyNowPrice } : {}),
  };
}
