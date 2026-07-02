import { Listing, ListingSeller } from '../data/mockData';
import { fetchJson } from '../lib/apiClient';
import { mapBackendListingToListing, friendlyBackendError } from './listingMapper';

export { ListingSeller };

interface ApiListingRow {
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
  seller?: ListingSeller | null;
}

interface ApiListingsResponse {
  items: ApiListingRow[];
  nextCursor?: string;
}

export interface ListingsSyncResult {
  listings: Listing[];
  source: 'api' | 'mock';
  error?: string;
  nextCursor?: string;
}

export async function fetchListingsFromApi(cursor?: string): Promise<ListingsSyncResult> {
  try {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const payload = await fetchJson<ApiListingsResponse>(`/listings${qs}`);
    const rows = Array.isArray(payload.items) ? payload.items : [];

    return {
      listings: rows.map((row) => mapBackendListingToListing(row)),
      source: 'api',
      error: rows.length === 0 ? 'API returned zero listings.' : undefined,
      nextCursor: payload.nextCursor,
    };
  } catch (error) {
    return {
      listings: [],
      source: 'api',
      error: friendlyBackendError(error),
    };
  }
}

export interface ListingSearchResult {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceGbp: number;
  imageUrl: string | null;
  rank: number;
  createdAt: string;
  seller: ListingSeller | null;
}

export async function searchListingsFromApi(query: string, limit?: number): Promise<{ items: ListingSearchResult[]; fallback: boolean }> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { items: [], fallback: false };
  const params = new URLSearchParams();
  params.set('q', trimmed);
  if (limit) params.set('limit', String(Math.min(limit, 100)));
  const payload = await fetchJson<{ ok: boolean; query: string; items: ListingSearchResult[]; fallback?: boolean }>(
    `/search/listings?${params.toString()}`
  );
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    fallback: payload.fallback === true,
  };
}

export async function fetchFilteredListings(options?: {
  category?: string;
  brand?: string;
  size?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc';
  limit?: number;
  cursor?: string;
}): Promise<ListingsSyncResult> {
  const params = new URLSearchParams();
  if (options?.category) params.set('category', options.category);
  if (options?.brand) params.set('brand', options.brand);
  if (options?.size) params.set('size', options.size);
  if (options?.condition) params.set('condition', options.condition);
  if (options?.minPrice !== undefined) params.set('minPrice', String(options.minPrice));
  if (options?.maxPrice !== undefined) params.set('maxPrice', String(options.maxPrice));
  if (options?.sort) params.set('sort', options.sort);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  const qs = params.toString();

  try {
    const payload = await fetchJson<ApiListingsResponse>(`/listings${qs ? `?${qs}` : ''}`);
    const rows = Array.isArray(payload.items) ? payload.items : [];

    return {
      listings: rows.map((row) => mapBackendListingToListing(row)),
      source: 'api',
      error: rows.length === 0 ? 'No listings match your filters.' : undefined,
      nextCursor: payload.nextCursor,
    };
  } catch (error) {
    return {
      listings: [],
      source: 'api',
      error: friendlyBackendError(error),
    };
  }
}

/* ── Real backend CRUD ─────────────────────────────────────────────── */

export interface ListingCreateBody {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceGbp: number;
  imageUrl?: string;
  status?: 'draft' | 'active' | 'paused' | 'sold' | 'deleted';
  category?: string;
  brand?: string;
  size?: string;
  condition?: string;
  originalPriceGbp?: number;
  shippingMethod?: string;
  shippingPayer?: string;
}

export interface ListingApiItem {
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
  shippingMethod: string | null;
  shippingPayer: string | null;
  createdAt: string;
  seller?: ListingSeller | null;
}

export interface ListingCommerceServerContext {
  itemPrice: number;
  buyerProtectionFee: number;
  estimatedTotal: number;
  currency: string;
  shippingMethod: string | null;
  shippingPayer: string | null;
  protectionPolicy: {
    available: boolean;
    label: string;
    summary: string;
  } | null;
  returnPolicy: {
    accepted: boolean;
    windowDays?: number;
    conditions?: string;
  } | null;
  authenticity: {
    status: 'not_offered' | 'eligible' | 'verified';
    label?: string;
  } | null;
}

export interface ListingSingleResponse {
  ok: boolean;
  listing?: ListingApiItem;
  commerce?: ListingCommerceServerContext;
  error?: string;
}

export interface ListingsResponse {
  items: ListingApiItem[];
  nextCursor?: string | null;
}

export async function createListingOnApi(body: ListingCreateBody): Promise<{ ok: boolean; listingId: string }> {
  return fetchJson<{ ok: boolean; listingId: string }>('/listings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchListingByIdFromApi(listingId: string): Promise<ListingSingleResponse> {
  return fetchJson<ListingSingleResponse>(`/listings/${listingId}`);
}

export async function patchListingOnApi(
  listingId: string,
  patch: Partial<Omit<ListingCreateBody, 'id' | 'sellerId'>>
): Promise<{ ok: boolean; listingId: string }> {
  return fetchJson<{ ok: boolean; listingId: string }>(`/listings/${listingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function deleteListingOnApi(listingId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/listings/${listingId}`, { method: 'DELETE' });
}

export async function fetchUserListingsFromApi(
  userId: string,
  options?: { status?: string; limit?: number; cursor?: string }
): Promise<ListingsResponse> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  const qs = params.toString();
  return fetchJson<ListingsResponse>(`/users/${encodeURIComponent(userId)}/listings${qs ? `?${qs}` : ''}`);
}

export async function createListingImageOnApi(body: { id: string; listingId: string; imageUrl: string; sortOrder: number }): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>('/listing-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchRelatedListings(listingId: string): Promise<{ ok: boolean; items?: Listing[]; error?: string }> {
  try {
    const payload = await fetchJson<{ ok: boolean; items: ApiListingRow[] }>(`/listings/${listingId}/related`);
    if (!payload.ok) return { ok: false, error: 'Related listings request failed' };
    return {
      ok: true,
      items: payload.items.map((row) => mapBackendListingToListing(row)),
    };
  } catch (error) {
    return { ok: false, error: friendlyBackendError(error) };
  }
}