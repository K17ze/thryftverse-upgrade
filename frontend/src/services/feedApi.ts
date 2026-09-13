import type { Listing, ListingSeller } from '../domain';
import { fetchJson } from '../lib/apiClient';
import { mapBackendListings, friendlyBackendError } from './listingMapper';

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

type HomeFeedUnitType = 'listing' | 'poster' | 'look';

interface HomeFeedUnit {
  id: string;
  type: HomeFeedUnitType;
  rank: number;
  data: FeedListingRow | FeedPosterRow | FeedLookRow;
}

interface HomeFeedResponse {
  items: HomeFeedUnit[];
  nextCursor?: string | null;
}

export interface HomeFeedResult {
  listings: Listing[];
  posterIds: string[];
  lookIds: string[];
  source: 'api';
  error?: string;
  nextCursor?: string | null;
}

export async function fetchHomeFeed(
  cursor?: string | null,
  limit?: number,
): Promise<HomeFeedResult> {
  try {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(Math.min(Math.max(limit, 1), 100)));
    const qs = params.toString();

    const payload = await fetchJson<HomeFeedResponse>(`/feed/home${qs ? `?${qs}` : ''}`);
    const units = Array.isArray(payload.items) ? payload.items : [];

    const listingRows: FeedListingRow[] = [];
    const posterIds: string[] = [];
    const lookIds: string[] = [];

    for (const unit of units) {
      if (unit.type === 'listing') {
        listingRows.push(unit.data as FeedListingRow);
      } else if (unit.type === 'poster') {
        posterIds.push((unit.data as FeedPosterRow).id);
      } else if (unit.type === 'look') {
        lookIds.push((unit.data as FeedLookRow).id);
      }
    }

    const listings = mapBackendListings(listingRows);

    return {
      listings,
      posterIds,
      lookIds,
      source: 'api',
      nextCursor: payload.nextCursor ?? null,
      error: listings.length === 0 && !cursor ? 'Feed returned zero listings.' : undefined,
    };
  } catch (error) {
    return {
      listings: [],
      posterIds: [],
      lookIds: [],
      source: 'api',
      nextCursor: null,
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
    /** Asking price in GBP major units — `null` when the search index row
     *  does not carry a price. Adapters must preserve null rather than
     *  fabricating £0. */
    priceGbp: number | null;
    imageUrl: string | null;
    rank: number;
    createdAt: string;
    seller?: ListingSeller | null;
    brand?: string | null;
    size?: string | null;
    condition?: string | null;
    category?: string | null;
    /** Native media pixel width, when the backend exposes it. Used to derive
     *  the tile aspect ratio instead of forcing a square crop. */
    mediaWidth?: number;
    /** Native media pixel height, when the backend exposes it. */
    mediaHeight?: number;
    /** Pre-computed cover aspect ratio (width / height), when the backend
     *  exposes it. Takes precedence over mediaWidth/mediaHeight. */
    aspectRatio?: number;
  }>;
  fallback?: boolean;
  error?: string;
}

export type SearchAutocompleteSuggestionType = 'query' | 'item' | 'brand' | 'category';

export interface SearchAutocompleteSuggestion {
  text: string;
  type: SearchAutocompleteSuggestionType;
  score: number;
}

export interface SearchAutocompleteResult {
  suggestions: SearchAutocompleteSuggestion[];
  fromCache?: boolean;
  responseTimeMs?: number;
  error?: string;
}

/**
 * Production autocomplete backed by the search index.
 *
 * Keep this separate from full listing search: typeahead is a small,
 * latency-sensitive contract and must never depend on whichever feed rows
 * happen to be resident on the device.
 */
export async function fetchSearchAutocomplete(
  query: string,
  limit: number = 6,
): Promise<SearchAutocompleteResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { suggestions: [] };

  const params = new URLSearchParams();
  params.set('q', trimmed);
  params.set('limit', String(Math.min(Math.max(limit, 1), 20)));

  try {
    const payload = await fetchJson<{
      ok: boolean;
      query: string;
      // The backend has two /search/autocomplete handlers. The
      // SearchAdapter-backed route (search.ts, registered last) returns
      // `string[]`; the postgres-backed route (searchExtended.ts) returns
      // `Array<{ text, type, score }>`. Normalise both shapes here so the
      // frontend is robust to whichever handler is active at runtime.
      suggestions: Array<string | {
        text: string;
        type?: SearchAutocompleteSuggestionType;
        score?: number;
      }>;
      fromCache?: boolean;
      responseTimeMs?: number;
    }>(`/search/autocomplete?${params.toString()}`);

    return {
      suggestions: (payload.suggestions ?? [])
        .map((suggestion) => {
          if (typeof suggestion === 'string') {
            return { text: suggestion.trim(), type: 'query' as const, score: 0 };
          }
          return {
            text: suggestion.text.trim(),
            type: suggestion.type ?? 'query',
            score: Number.isFinite(suggestion.score) ? Number(suggestion.score) : 0,
          };
        })
        .filter((suggestion) => suggestion.text.length > 0),
      fromCache: payload.fromCache,
      responseTimeMs: payload.responseTimeMs,
    };
  } catch (error) {
    return {
      suggestions: [],
      error: friendlyBackendError(error),
    };
  }
}

/** Backend sort contract for GET /search/listings. */
export type ListingSearchSort = 'relevance' | 'recent' | 'price_asc' | 'price_desc' | 'most_liked';

/** Filters accepted by GET /search/listings. All optional; omitted keys are
 *  not serialized into the request. */
export interface ListingSearchFilters {
  category?: string;
  condition?: string;
  /** Single size (legacy contract). Prefer `sizes` for multi-select. */
  size?: string;
  /** Multi-select filters — serialized as comma-separated lists. */
  brands?: string[];
  sizes?: string[];
  priceMin?: number;
  priceMax?: number;
  sustainableOnly?: boolean;
  sort?: ListingSearchSort;
  page?: number;
}

export async function searchListingsFromApi(
  query: string,
  limitOrFilters?: number | (ListingSearchFilters & { limit?: number }),
): Promise<SearchApiResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { items: [] };

  const options: ListingSearchFilters & { limit?: number } =
    typeof limitOrFilters === 'number' ? { limit: limitOrFilters } : (limitOrFilters ?? {});

  const params = new URLSearchParams();
  params.set('q', trimmed);
  if (options.limit) params.set('limit', String(Math.min(options.limit, 100)));
  if (options.category) params.set('category', options.category);
  if (options.condition) params.set('condition', options.condition);
  if (options.size) params.set('size', options.size);
  if (options.brands && options.brands.length > 0) params.set('brands', options.brands.join(','));
  if (options.sizes && options.sizes.length > 0) params.set('sizes', options.sizes.join(','));
  if (options.priceMin != null) params.set('priceMin', String(options.priceMin));
  if (options.priceMax != null) params.set('priceMax', String(options.priceMax));
  if (options.sustainableOnly) params.set('sustainableOnly', 'true');
  if (options.sort && options.sort !== 'relevance') params.set('sort', options.sort);
  if (options.page && options.page > 1) params.set('page', String(options.page));

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

export interface TrendingSearchItem {
  query: string;
  frequency: number;
}

/**
 * Real trending searches from the backend query-frequency tracker.
 * Returns an empty list when there is no real trend data — callers must
 * not fabricate trends in that case (AGENTS.md §11).
 */
export async function fetchTrendingSearches(
  limit: number = 6,
): Promise<{ items: TrendingSearchItem[]; error?: string }> {
  try {
    const payload = await fetchJson<{ ok: boolean; items: TrendingSearchItem[] }>(
      `/search/trending?limit=${Math.min(Math.max(limit, 1), 20)}`
    );
    return { items: (payload.items ?? []).filter((i) => typeof i.query === 'string' && i.query.length > 0) };
  } catch (error) {
    return { items: [], error: friendlyBackendError(error) };
  }
}
