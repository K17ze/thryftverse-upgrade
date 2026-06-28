import { resolveAuctionTiming, type AuctionTimingInput } from '../hooks/useServerClock';

export type AuctionViewerState = 'not_participating' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost' | 'seller';

export interface AuctionHomeItem {
  id: string;
  listingId: string;
  sellerId: string;
  sellerUsername: string;
  sellerDisplayName: string | null;
  title: string;
  imageUrl: string;
  brand: string | null;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  currentBidGbp: number;
  minimumNextBidGbp: number;
  bidCount: number;
  buyNowPriceGbp: number | null;
  viewerState: AuctionViewerState;
  isWatched: boolean;
  cancelledAt: string | null;
  settledAt: string | null;
  winnerBidderId: string | null;
}

export function isAttentionItem(item: AuctionHomeItem, nowMs: number): boolean {
  const timing = resolveAuctionTiming(item as AuctionTimingInput, nowMs);
  if (timing.effectiveState === 'cancelled') return false;
  if (timing.effectiveState === 'settled') return false;
  if (timing.effectiveState === 'ended') {
    if (item.viewerState === 'won') return true;
    return false;
  }
  if (timing.effectiveState === 'live' && item.viewerState === 'outbid') return true;
  return false;
}

export function isEndingSoon(item: AuctionHomeItem, nowMs: number): boolean {
  const timing = resolveAuctionTiming(item as AuctionTimingInput, nowMs);
  if (timing.effectiveState !== 'live') return false;
  return timing.msToEnd > 0 && timing.msToEnd <= 60 * 60 * 1000;
}
