import { Listing } from '../data/mockData';
import { fetchJson } from '../lib/apiClient';
import { ENABLE_RUNTIME_MOCKS } from '../constants/runtimeFlags';

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
}

interface ApiListingsResponse {
  items: ApiListingRow[];
}

export interface ListingsSyncResult {
  listings: Listing[];
  source: 'api' | 'mock';
  error?: string;
}

function deriveBrand(title: string) {
  const normalized = title.trim();
  if (!normalized) return 'Thryftverse';
  const parts = normalized.split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

function getFallbackImage(_id: string) {
  return '';
}

function mapApiListingToApp(row: ApiListingRow, fallback?: Listing): Listing {
  const price = Number(row.priceGbp ?? fallback?.price ?? 0);
  const protectionFee = Number((price * 0.05 + 0.7).toFixed(2));
  const resolvedImages = row.images?.length
    ? row.images
    : row.imageUrl
      ? [row.imageUrl]
      : (fallback?.images ?? []).filter((uri) => typeof uri === 'string' && uri.length > 0).length > 0
        ? fallback!.images
        : [getFallbackImage(row.id)];

  return {
    id: row.id,
    title: row.title || fallback?.title || 'Untitled listing',
    brand: row.brand || fallback?.brand || deriveBrand(row.title),
    size: row.size || fallback?.size || 'One size',
    condition: (row.condition as Listing['condition']) || fallback?.condition || 'Very good',
    price,
    priceWithProtection: Number((price + protectionFee).toFixed(2)),
    images: resolvedImages,
    likes: fallback?.likes ?? 0,
    isBumped: fallback?.isBumped,
    isSold: row.status === 'sold',
    sellerId: row.sellerId || fallback?.sellerId || 'u1',
    category: row.category || fallback?.category || 'women',
    subcategory: fallback?.subcategory || 'Clothing',
    description: row.description || fallback?.description || 'No description provided.',
    createdAt: row.createdAt || fallback?.createdAt,
  };
}

export async function fetchListingsFromApi(): Promise<ListingsSyncResult> {
  try {
    const payload = await fetchJson<ApiListingsResponse>('/listings');
    const rows = Array.isArray(payload.items) ? payload.items : [];

    return {
      listings: rows.map((row) => mapApiListingToApp(row)),
      source: 'api',
      error: rows.length === 0 ? 'API returned zero listings.' : undefined,
    };
  } catch (error) {
    return {
      listings: [],
      source: 'api',
      error: (error as Error).message,
    };
  }
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
  const qs = params.toString();

  try {
    const payload = await fetchJson<ApiListingsResponse>(`/listings${qs ? `?${qs}` : ''}`);
    const rows = Array.isArray(payload.items) ? payload.items : [];

    return {
      listings: rows.map((row) => mapApiListingToApp(row)),
      source: 'api',
      error: rows.length === 0 ? 'No listings match your filters.' : undefined,
    };
  } catch (error) {
    return {
      listings: [],
      source: 'api',
      error: (error as Error).message,
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
}

export interface ListingSingleResponse {
  ok: boolean;
  listing?: ListingApiItem;
  error?: string;
}

export interface ListingsResponse {
  items: ListingApiItem[];
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

export async function fetchUserListingsFromApi(userId: string, options?: { status?: string; limit?: number }): Promise<ListingsResponse> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return fetchJson<ListingsResponse>(`/users/${userId}/listings${qs ? `?${qs}` : ''}`);
}

export async function createListingImageOnApi(body: { id: string; listingId: string; imageUrl: string; sortOrder: number }): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>('/listing-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
