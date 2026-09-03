import { fetchJson } from '../lib/apiClient';
import {
  mapBackendListingToListing,
  mapBackendListings,
  friendlyBackendError,
} from './listingMapper';
import type { DisplayReadyListing } from './listingMapper';
import type { SupportedCurrencyCode } from '../constants/currencies';

export interface ListingSeller {
  id: string;
  username: string | null;
  avatar: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  location?: string | null;
  verified?: boolean | null;
}

export interface ListingEngagementSummaryApi {
  listingId: string;
  likes: number;
  views?: number;
  saves?: number;
  wishlistCount: number | null;
  collectionSaveCount: number | null;
  activeOfferCount: number | null;
  questionCount: number;
  answeredQuestionCount: number;
  generatedAt: string;
}

export type { ListingCondition } from '../contracts/taxonomy';
import type { ListingCondition } from '../contracts/taxonomy';

export type ListingLifecycleStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'reserved'
  | 'sold'
  | 'deleted'
  | 'removed'
  | 'unknown';

export interface Listing {
  id: string;
  title: string | null;
  brand: string | null;
  size: string | null;
  condition: ListingCondition | null;
  price: number | null;
  originalPrice?: number;
  priceWithProtection?: number;
  images: string[];
  mediaAspectRatio?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  likes: number;
  views?: number;
  isBumped?: boolean;
  isSold?: boolean;
  sellerId: string | null;
  seller?: ListingSeller | null;
  category: string | null;
  subcategory?: string | null;
  description: string | null;
  createdAt?: string | null;
  status?: ListingLifecycleStatus;
  shippingMethod?: string | null;
  shippingPayer?: string | null;
  engagement?: ListingEngagementSummaryApi | null;
  /** Pinned/featured listing — shown first in the Shop grid when true. */
  featured?: boolean | null;
  sustainabilityGrade?: 'A' | 'B' | 'C' | 'D' | null;
  materialComposition?: string | null;
  weightKg?: number | null;
}

interface ApiListingRow {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceGbp: number;
  imageUrl: string | null;
  images: string[];
  mediaAspectRatio?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  status: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  originalPriceGbp: number | null;
  createdAt: string;
  seller?: ListingSeller | null;
  /** Pinned/featured listing — shown first in the Shop grid when true. */
  featured?: boolean | null;
  sustainabilityGrade?: 'A' | 'B' | 'C' | 'D' | null;
  materialComposition?: string | null;
  weightKg?: number | null;
}

interface ApiListingsResponse {
  items: ApiListingRow[];
  nextCursor?: string;
}

export interface ListingsSyncResult {
  listings: DisplayReadyListing[];
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
      listings: mapBackendListings(rows),
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
  brand?: string | null;
  size?: string | null;
  condition?: string | null;
  category?: string | null;
}

export async function searchListingsFromApi(query: string, limit?: number): Promise<{ items: ListingSearchResult[]; fallback: boolean; retrievalMeta?: { method: string; fallbackReason?: string; embedderConfigured: boolean; searchEngineVersion?: string } }> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { items: [], fallback: false };
  const params = new URLSearchParams();
  params.set('q', trimmed);
  if (limit) params.set('limit', String(Math.min(limit, 100)));
  const payload = await fetchJson<{
    ok: boolean;
    query: string;
    items: ListingSearchResult[];
    fallback?: boolean;
    retrievalMeta?: { method: string; fallbackReason?: string; embedderConfigured: boolean; searchEngineVersion?: string };
  }>(
    `/search/listings?${params.toString()}`
  );
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    fallback: payload.fallback === true,
    retrievalMeta: payload.retrievalMeta,
  };
}

export async function fetchFilteredListings(options?: {
  query?: string;
  category?: string;
  brand?: string;
  size?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'most_liked' | 'ending_soon';
  sustainableOnly?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<ListingsSyncResult> {
  const params = new URLSearchParams();
  if (options?.query) params.set('q', options.query.trim());
  if (options?.category) params.set('category', options.category);
  if (options?.brand) params.set('brand', options.brand);
  if (options?.size) params.set('size', options.size);
  if (options?.condition) params.set('condition', options.condition);
  if (options?.minPrice !== undefined) params.set('minPrice', String(options.minPrice));
  if (options?.maxPrice !== undefined) params.set('maxPrice', String(options.maxPrice));
  if (options?.sort) params.set('sort', options.sort);
  if (options?.sustainableOnly) params.set('sustainableOnly', 'true');
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  const qs = params.toString();

  try {
    const payload = await fetchJson<ApiListingsResponse>(`/listings${qs ? `?${qs}` : ''}`);
    const rows = Array.isArray(payload.items) ? payload.items : [];

    return {
      listings: mapBackendListings(rows),
      source: 'api',
      // A successful empty response is an empty state, not a transport error.
      error: undefined,
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

export interface VisualSearchResult {
  listings: DisplayReadyListing[];
  source: 'api' | 'fallback';
  visualMatching: boolean;
  /** Honest label describing how results were matched. */
  similarityMethod?: string;
  /**
   * Structured retrieval capability metadata from the backend. Discloses
   * the actual method used and any fallback reason. Present on API
   * responses; absent on client-side fallback.
   */
  retrievalMeta?: {
    method: string;
    fallbackReason?: string;
    embedderConfigured: boolean;
    searchEngineVersion?: string;
  };
  note?: string;
  error?: string;
}

/**
 * Visual Search — calls POST /visual-search.
 *
 * When `imageBase64` is supplied, the backend extracts a real colour-and-layout
 * feature vector from the image and ranks candidate listings by visual
 * similarity (`similarityMethod: 'heuristic_color_features'`). This is a
 * deterministic heuristic, NOT an AI/ML model — the `similarityMethod` field
 * lets the UI label results truthfully.
 *
 * Without a usable image the backend falls back to filtered SQL and labels
 * results `similarityMethod: 'filter_only'` with `visualMatching: false`.
 * On any network/server failure the caller is expected to fall back to
 * client-side filtering of cached listings.
 */
export async function visualSearch(params: {
  imageUrl?: string;
  imageBase64?: string;
  query?: string;
  category?: string;
  brand?: string;
  size?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'similarity';
  limit?: number;
  /**
   * Optional `AbortSignal` for request cancellation. When the caller aborts
   * (e.g. component unmount or a newer search supersedes this one), the
   * in-flight request is aborted immediately rather than completing wastefully.
   */
  signal?: AbortSignal;
}): Promise<VisualSearchResult> {
  try {
    const payload = await fetchJson<{
      ok: boolean;
      runtimeAvailable?: boolean;
      visualMatching?: boolean;
      similarityMethod?: string;
      retrievalMeta?: {
        method: string;
        fallbackReason?: string;
        embedderConfigured: boolean;
        searchEngineVersion?: string;
      };
      note?: string;
      items?: ApiListingRow[];
    }>('/visual-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: params.imageUrl,
        imageBase64: params.imageBase64,
        query: params.query,
        category: params.category,
        brand: params.brand,
        size: params.size,
        condition: params.condition,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        sort: params.sort ?? 'similarity',
        limit: params.limit ?? 48,
      }),
    }, params.signal ? { signal: params.signal } : undefined);

    const rows = Array.isArray(payload.items) ? payload.items : [];
    return {
      listings: mapBackendListings(rows),
      source: 'api',
      visualMatching: payload.visualMatching === true,
      similarityMethod: payload.similarityMethod,
      retrievalMeta: payload.retrievalMeta,
      note: payload.note,
      error: rows.length === 0 ? 'No listings match your photo filters yet.' : undefined,
    };
  } catch (error) {
    return {
      listings: [],
      source: 'fallback',
      visualMatching: false,
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
  coverFinalizationId?: string;
  status?: 'draft' | 'active' | 'paused' | 'sold' | 'deleted';
  category?: string;
  brand?: string;
  size?: string;
  condition?: string;
  originalPriceGbp?: number;
  shippingMethod?: string;
  shippingPayer?: string;
  materialComposition?: string;
  weightKg?: number;
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
  /** Server-side last-update timestamp; used for edit conflict detection. */
  updatedAt?: string | null;
  /** M07: When media was frozen (cannot be silently swapped). */
  mediaFrozenAt?: string | null;
  seller?: ListingSeller | null;
  engagement?: ListingEngagementSummaryApi | null;
  /** Pinned/featured listing — shown first in the Shop grid when true. */
  featured?: boolean | null;
}

export interface ListingSoldComparables {
  listingId: string;
  category: string | null;
  brand: string | null;
  currency: SupportedCurrencyCode;
  sampleSize: number;
  minPrice: number | null;
  medianPrice: number | null;
  maxPrice: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  generatedAt: string;
}

export interface ListingPriceEvent {
  previousPrice: number;
  newPrice: number;
  currency: SupportedCurrencyCode;
  changedAt: string;
}

export interface ListingQaSummary {
  listingId: string;
  questionCount: number;
  answeredQuestionCount: number;
  latestAnsweredQuestion: string | null;
  latestAnswer: string | null;
  latestActivityAt: string | null;
}

export interface ListingQuestionApi {
  id: string;
  listingId: string;
  askerId: string;
  askerName?: string;
  text: string;
  createdAt: string;
  answer: {
    text: string;
    responderName: string;
    createdAt: string;
  } | null;
}

export type ListingReportReason =
  | 'spam'
  | 'inappropriate'
  | 'counterfeit'
  | 'unresponsive'
  | 'harassment'
  | 'off_platform'
  | 'hate_speech'
  | 'prohibited'
  | 'scam'
  | 'misinformation'
  | 'privacy'
  | 'impersonation'
  | 'minor_safety'
  | 'other';

export interface ListingCommerceServerContext {
  itemPrice: number;
  buyerProtectionFee: number;
  estimatedTotal: number;
  currency: SupportedCurrencyCode;
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
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': body.id,
    },
    body: JSON.stringify(body),
  });
}

export async function fetchListingByIdFromApi(listingId: string): Promise<ListingSingleResponse> {
  return fetchJson<ListingSingleResponse>(`/listings/${encodeURIComponent(listingId)}`);
}

export async function fetchListingSoldComparables(listingId: string): Promise<ListingSoldComparables> {
  const payload = await fetchJson<{ ok: boolean; comparables: ListingSoldComparables }>(
    `/listings/${encodeURIComponent(listingId)}/sold-comparables`
  );
  return payload.comparables;
}

export async function fetchListingPriceHistory(listingId: string): Promise<ListingPriceEvent[]> {
  const payload = await fetchJson<{ ok: boolean; items: ListingPriceEvent[] }>(
    `/listings/${encodeURIComponent(listingId)}/price-history`
  );
  return payload.items;
}

export async function fetchListingQaSummary(listingId: string): Promise<ListingQaSummary> {
  const payload = await fetchJson<{ ok: boolean; summary: ListingQaSummary }>(
    `/listings/${encodeURIComponent(listingId)}/qa-summary`
  );
  return payload.summary;
}

export async function fetchListingQuestions(listingId: string): Promise<ListingQuestionApi[]> {
  const payload = await fetchJson<{ ok: boolean; items: ListingQuestionApi[] }>(
    `/listings/${encodeURIComponent(listingId)}/questions`
  );
  return payload.items;
}

export async function askListingQuestion(listingId: string, text: string): Promise<ListingQuestionApi> {
  const payload = await fetchJson<{ ok: boolean; question: ListingQuestionApi }>(
    `/listings/${encodeURIComponent(listingId)}/questions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }
  );
  return payload.question;
}

export async function answerListingQuestion(
  listingId: string,
  questionId: string,
  text: string
): Promise<ListingQuestionApi['answer']> {
  const payload = await fetchJson<{ ok: boolean; answer: NonNullable<ListingQuestionApi['answer']> }>(
    `/listings/${encodeURIComponent(listingId)}/questions/${encodeURIComponent(questionId)}/answer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }
  );
  return payload.answer;
}

export async function reportListing(
  listingId: string,
  reason: ListingReportReason,
  details?: string,
  evidenceUris?: string[]
): Promise<{ reportId: string }> {
  return fetchJson<{ ok: boolean; reportId: string }>(
    `/listings/${encodeURIComponent(listingId)}/report`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, details, evidence_uris: evidenceUris }),
    }
  );
}

/**
 * Record a listing view — feeds the `interactions` table so seller
 * analytics (views, conversion rate, top performers) have real data.
 * Fire-and-forget at call sites; the server handles idempotency.
 */
export async function trackListingView(
  listingId: string,
  options?: { qualified?: boolean; idempotencyKey?: string }
): Promise<{ ok: boolean; recorded: boolean }> {
  return fetchJson<{ ok: boolean; recorded: boolean }>(
    `/listings/${encodeURIComponent(listingId)}/view`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qualified: options?.qualified ?? false,
        idempotencyKey: options?.idempotencyKey,
      }),
    }
  );
}

/**
 * Record a listing interaction (like/save/share) — feeds the
 * `interactions` table for seller analytics engagement metrics.
 */
export async function trackListingInteraction(
  listingId: string,
  action: 'like' | 'save' | 'share',
  options?: { idempotencyKey?: string }
): Promise<{ ok: boolean; recorded: boolean }> {
  return fetchJson<{ ok: boolean; recorded: boolean }>(
    `/listings/${encodeURIComponent(listingId)}/interact`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        idempotencyKey: options?.idempotencyKey,
      }),
    }
  );
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

export async function createListingImageOnApi(body: {
  id: string;
  listingId: string;
  imageUrl: string;
  sortOrder: number;
  mediaWidth?: number;
  mediaHeight?: number;
  mediaType?: 'image' | 'video';
  finalizationId: string;
  posterUrl?: string | null;
  blurhash?: string | null;
  focalX?: number | null;
  focalY?: number | null;
}): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>('/listing-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchRelatedListings(listingId: string): Promise<{ ok: boolean; items?: DisplayReadyListing[]; error?: string }> {
  try {
    const payload = await fetchJson<{ ok: boolean; items: ApiListingRow[] }>(`/listings/${listingId}/related`);
    if (!payload.ok) return { ok: false, error: 'Related listings request failed' };
    return {
      ok: true,
      items: mapBackendListings(payload.items),
    };
  } catch (error) {
    return { ok: false, error: friendlyBackendError(error) };
  }
}
