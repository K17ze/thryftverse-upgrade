import { Listing, ListingSeller } from '../data/mockData';
import { fetchJson } from '../lib/apiClient';

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

function deriveBrand(title: string) {
  const normalized = title.trim();
  if (!normalized) return 'Thryftverse';
  const parts = normalized.split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

function mapFeedListing(row: FeedListingRow): Listing {
  const price = Number(row.priceGbp ?? 0);
  const resolvedImages = row.images?.length
    ? row.images
    : row.imageUrl
      ? [row.imageUrl]
      : [''];

  return {
    id: row.id,
    title: row.title || 'Untitled listing',
    brand: row.brand || deriveBrand(row.title),
    size: row.size || 'One size',
    condition: (row.condition as Listing['condition']) || 'Very good',
    price,
    images: resolvedImages,
    likes: 0,
    isSold: row.status === 'sold',
    sellerId: row.sellerId || 'u1',
    seller: null,
    category: row.category || 'women',
    subcategory: 'Clothing',
    description: row.description || 'No description provided.',
    createdAt: row.createdAt,
    originalPrice: row.originalPriceGbp != null ? Number(row.originalPriceGbp) : undefined,
  };
}

export async function fetchHomeFeed(): Promise<HomeFeedResult> {
  try {
    const payload = await fetchJson<HomeFeedResponse>('/feed/home');
    const listings = (payload.listings ?? []).map(mapFeedListing);
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
      error: (error as Error).message,
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
      error: (error as Error).message,
    };
  }
}
