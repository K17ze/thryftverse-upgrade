import { Listing, ListingSeller } from '../data/mockData';
import { fetchJson } from '../lib/apiClient';
import { mapBackendListingToListing, friendlyBackendError } from './listingMapper';

interface FeedListingRow {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceGbp: number;
  imageUrl: string | null;
  images: string[];
  status: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  originalPriceGbp: number | null;
  createdAt: string;
}

interface FeedPosterRow {
  id: string;
  creatorId: string;
  mediaUrl: string;
  caption: string;
  createdAt: string;
}

interface FeedLookRow {
  id: string;
  creatorId: string;
  title: string;
  mediaUrl: string;
  createdAt: string;
}

interface HomeFeedResponse {
  listings: FeedListingRow[];
  posters: FeedPosterRow[];
  looks: FeedLookRow[];
}

export interface HomeFeedResult {
  listings: Listing[];
  posterIds: string[];
  lookIds: string[];
  source: 'api';
  error?: string;
}

export async function fetchHomeFeed(): Promise<HomeFeedResult> {
  try {
    const payload = await fetchJson<HomeFeedResponse>('/feed/home');
    const listings = (payload.listings ?? []).map(mapBackendListingToListing);
    const posterIds = (payload.posters ?? []).map((p) => p.id);
    const lookIds = (payload.looks ?? []).map((l) => l.id);

    return {
      listings,
      posterIds,
      lookIds,
      source: 'api',
      error: listings.length === 0 ? 'Feed returned zero listings.' : undefined,
    };
  } catch (error) {
    return {
      listings: [],
      posterIds: [],
      lookIds: [],
      source: 'api',
      error: friendlyBackendError(error),
    };
  }
}

export interface SearchApiResult {
  items: Array<{
    id: string;
    sellerId: string;
    title: string;
    description: string;
    priceGbp: number;
    imageUrl: string | null;
    rank: number;
    createdAt: string;
    seller?: ListingSeller | null;
  }>;
  fallback?: boolean;
  error?: string;
}

export async function searchListingsFromApi(query: string, limit?: number): Promise<SearchApiResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { items: [] };

  const params = new URLSearchParams();
  params.set('q', trimmed);
  if (limit) params.set('limit', String(Math.min(limit, 100)));

  try {
    const payload = await fetchJson<{ ok: boolean; query: string; fallback?: boolean; items: SearchApiResult['items'] }>(
      `/search/listings?${params.toString()}`
    );
    return {
      items: payload.items ?? [],
      fallback: payload.fallback ?? false,
    };
  } catch (error) {
    return {
      items: [],
      error: friendlyBackendError(error),
    };
  }
}
