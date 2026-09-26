/**
 * Web auctions service — mirrors frontend/src/services/marketApi.ts
 * (MarketAuction, AuctionBidActivity, watchlist).
 */

import { fetchJson, parseApiError } from '../http';
import {
  mapAuctionBidActivity,
  mapMarketAuctionToItem,
  type AuctionBidActivityApi,
  type MarketAuctionApi,
} from '../mappers';
import type { AuctionBid, AuctionMarketItem } from '@/lib/contracts/auction';

interface AuctionListResponse {
  ok?: boolean;
  items?: MarketAuctionApi[];
  auctions?: MarketAuctionApi[];
  nextCursor?: string | null;
}

function toQuery(params: Record<string, string | number | undefined | null>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export async function fetchAuctionBoard(
  params: { sort?: string; category?: string; cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ items: AuctionMarketItem[]; nextCursor: string | null }> {
  const payload = await fetchJson<AuctionListResponse>(`/auctions${toQuery(params)}`, undefined, {
    signal,
  });
  return {
    items: (payload.items ?? payload.auctions ?? []).map(mapMarketAuctionToItem),
    nextCursor: payload.nextCursor ?? null,
  };
}

export async function fetchAuctionHome(
  signal?: AbortSignal,
): Promise<{ featured: AuctionMarketItem[]; endingSoon: AuctionMarketItem[] }> {
  const payload = await fetchJson<{
    ok?: boolean;
    featured?: MarketAuctionApi[];
    endingSoon?: MarketAuctionApi[];
  }>('/auctions/home', undefined, { signal });
  return {
    featured: (payload.featured ?? []).map(mapMarketAuctionToItem),
    endingSoon: (payload.endingSoon ?? []).map(mapMarketAuctionToItem),
  };
}

export async function fetchAuctionDetail(
  id: string,
  signal?: AbortSignal,
): Promise<AuctionMarketItem | null> {
  const payload = await fetchJson<{ ok: boolean; auction?: MarketAuctionApi }>(
    `/auctions/${encodeURIComponent(id)}`,
    undefined,
    { signal },
  );
  if (!payload.ok || !payload.auction) return null;
  return mapMarketAuctionToItem(payload.auction);
}

export async function fetchAuctionByListing(
  listingId: string,
  signal?: AbortSignal,
): Promise<AuctionMarketItem | null> {
  const payload = await fetchJson<{ ok: boolean; auction?: MarketAuctionApi | null }>(
    `/auctions/by-listing/${encodeURIComponent(listingId)}`,
    undefined,
    { signal },
  );
  if (!payload.ok || !payload.auction) return null;
  return mapMarketAuctionToItem(payload.auction);
}

export async function fetchAuctionBids(
  auctionId: string,
  signal?: AbortSignal,
): Promise<AuctionBid[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: AuctionBidActivityApi[]; bids?: AuctionBidActivityApi[] }>(
    `/auctions/${encodeURIComponent(auctionId)}/bids`,
    undefined,
    { signal },
  );
  return (payload.items ?? payload.bids ?? []).map((b) => mapAuctionBidActivity(b, auctionId));
}

export class BidError extends Error {
  minimumNextBidGbp?: number;
  buyNowPriceGbp?: number;
}

export async function placeAuctionBid(auctionId: string, amountGbp: number): Promise<void> {
  try {
    await fetchJson(`/auctions/${encodeURIComponent(auctionId)}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountGbp }),
    });
  } catch (e) {
    const parsed = parseApiError(e);
    const err = new BidError(parsed.message || 'Bid failed');
    if (parsed.structuredDetails?.minimumNextBidGbp) {
      err.minimumNextBidGbp = parsed.structuredDetails.minimumNextBidGbp;
    }
    if (parsed.structuredDetails?.buyNowPriceGbp) {
      err.buyNowPriceGbp = parsed.structuredDetails.buyNowPriceGbp;
    }
    throw err;
  }
}

export async function buyAuctionNow(auctionId: string): Promise<void> {
  await fetchJson(`/auctions/${encodeURIComponent(auctionId)}/buy-now`, {
    method: 'POST',
  });
}

export async function setAuctionWatched(auctionId: string, watched: boolean): Promise<void> {
  await fetchJson(`/auctions/${encodeURIComponent(auctionId)}/watch`, {
    method: watched ? 'POST' : 'DELETE',
  });
}

export interface CreateAuctionServiceInput {
  listingId: string;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  buyNowPriceGbp?: number;
  reservePriceGbp?: number;
  minIncrementGbp?: number;
}

export async function createAuction(input: CreateAuctionServiceInput): Promise<AuctionMarketItem> {
  const payload = await fetchJson<{ ok: true; auction: MarketAuctionApi }>('/auctions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return mapMarketAuctionToItem(payload.auction);
}

export async function fetchAuctionWatchlist(signal?: AbortSignal): Promise<AuctionMarketItem[]> {
  const payload = await fetchJson<AuctionListResponse>('/auctions/watchlist', undefined, { signal });
  return (payload.items ?? payload.auctions ?? []).map(mapMarketAuctionToItem);
}

// ── My bids — GET /users/me/auction-bids (MyAuctionBid in marketApi) ─────────

export interface MyAuctionBidApi {
  id: number;
  auctionId: string;
  amountGbp: number;
  createdAt: string;
  bidState: 'active' | 'leading' | 'outbid' | 'won' | 'lost';
  auction: {
    id: string;
    title: string;
    imageUrl: string | null;
    currentBidGbp: number;
    bidCount: number;
    lifecycle: string;
    winnerBidderId: string | null;
    sellerId: string;
    sellerUsername: string;
    endsAt: string;
    startsAt?: string;
  };
}

export async function fetchMyAuctionBids(
  status?: 'active' | 'leading' | 'outbid' | 'won' | 'lost' | 'all',
  signal?: AbortSignal,
): Promise<MyAuctionBidApi[]> {
  const qs = status && status !== 'all' ? `?status=${status}` : '';
  const payload = await fetchJson<{ ok: boolean; items: MyAuctionBidApi[] }>(
    `/users/me/auction-bids${qs}`,
    undefined,
    { signal },
  );
  return payload.items ?? [];
}
