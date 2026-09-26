/**
 * Web listings service — mirrors frontend/src/services/listingsApi.ts.
 * All rows flow through `mapBackendListingToListing`; rows failing the
 * display floor are filtered (same as mobile `mapBackendListings`).
 */

import { fetchJson } from '../http';
import {
  mapBackendListingToListing,
  mapBackendListings,
  type BackendListingRow,
} from '../mappers';
import type { Listing, ListingQuestion } from '@/lib/contracts/domain';

interface ListResponse {
  ok?: boolean;
  items?: BackendListingRow[];
  listings?: BackendListingRow[];
  nextCursor?: string | null;
}

export interface ListingPage {
  items: Listing[];
  nextCursor: string | null;
}

function toQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function extractRows(payload: ListResponse): BackendListingRow[] {
  return payload.items ?? payload.listings ?? [];
}

export async function fetchListings(
  params: {
    q?: string;
    category?: string;
    brand?: string;
    size?: string;
    minPrice?: number;
    maxPrice?: number;
    condition?: string;
    sort?: string;
    cursor?: string;
    limit?: number;
    sellerId?: string;
  } = {},
  signal?: AbortSignal,
): Promise<ListingPage> {
  const payload = await fetchJson<ListResponse>(`/listings${toQuery(params)}`, undefined, { signal });
  return {
    items: mapBackendListings(extractRows(payload)),
    nextCursor: payload.nextCursor ?? null,
  };
}

export async function searchListings(
  params: {
    q?: string;
    category?: string;
    brand?: string;
    size?: string;
    minPrice?: number;
    maxPrice?: number;
    condition?: string;
    sort?: string;
    cursor?: string;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<ListingPage> {
  const payload = await fetchJson<ListResponse>(`/search/listings${toQuery(params)}`, undefined, {
    signal,
  });
  return {
    items: mapBackendListings(extractRows(payload)),
    nextCursor: payload.nextCursor ?? null,
  };
}

export interface ListingDetailResponse {
  listing: Listing | null;
  commerce?: unknown;
}

export async function fetchListingById(
  id: string,
  signal?: AbortSignal,
): Promise<Listing | null> {
  const payload = await fetchJson<{
    ok: boolean;
    listing?: BackendListingRow | null;
    commerce?: unknown;
    error?: string;
  }>(`/listings/${encodeURIComponent(id)}`, undefined, { signal });
  if (!payload.ok || !payload.listing) return null;
  return mapBackendListingToListing(payload.listing);
}

export async function fetchRelatedListings(
  id: string,
  limit = 12,
  signal?: AbortSignal,
): Promise<Listing[]> {
  const payload = await fetchJson<ListResponse>(
    `/listings/${encodeURIComponent(id)}/related${toQuery({ limit })}`,
    undefined,
    { signal },
  );
  return mapBackendListings(extractRows(payload));
}

export async function fetchSellerListings(
  sellerId: string,
  params: { cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ListingPage> {
  const payload = await fetchJson<ListResponse>(
    `/users/${encodeURIComponent(sellerId)}/listings${toQuery(params)}`,
    undefined,
    { signal },
  );
  return {
    items: mapBackendListings(extractRows(payload)),
    nextCursor: payload.nextCursor ?? null,
  };
}

export async function fetchMyListings(
  params: { cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ListingPage> {
  const payload = await fetchJson<ListResponse>(
    `/listings/mine${toQuery(params)}`,
    undefined,
    { signal },
  );
  return {
    items: mapBackendListings(extractRows(payload)),
    nextCursor: payload.nextCursor ?? null,
  };
}

export interface CreateListingInput {
  title: string;
  description: string;
  priceGbp: number;
  category: string;
  subcategory?: string;
  brand?: string;
  size?: string;
  condition: string;
  images?: string[];
  shippingMethod?: string;
  shippingPayer?: string;
}

export async function createListing(input: CreateListingInput): Promise<string> {
  const payload = await fetchJson<{ ok: boolean; listing?: { id: string }; id?: string }>(
    '/listings',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  const id = payload.listing?.id ?? payload.id;
  if (!id) throw new Error('Listing created but no id returned');
  return id;
}

// ── Q&A (listing questions) ──────────────────────────────────────────────────

interface QuestionRow {
  id: string | number;
  listingId?: string;
  question?: string;
  body?: string;
  askerUsername?: string;
  askerId?: string;
  createdAt?: string;
  answer?: string | null;
  answerBody?: string | null;
  answeredAt?: string | null;
  answererId?: string | null;
}

export async function fetchListingQuestions(
  listingId: string,
  signal?: AbortSignal,
): Promise<ListingQuestion[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: QuestionRow[]; questions?: QuestionRow[] }>(
    `/listings/${encodeURIComponent(listingId)}/questions`,
    undefined,
    { signal },
  );
  const rows = payload.items ?? payload.questions ?? [];
  return rows.map((r) => ({
    id: String(r.id),
    listingId: r.listingId ?? listingId,
    askerId: r.askerId,
    askerName: r.askerUsername ?? 'Member',
    text: r.question ?? r.body ?? '',
    createdAt: r.createdAt,
    answer:
      r.answer || r.answerBody
        ? {
            text: r.answer ?? r.answerBody ?? '',
            responderName: '',
            createdAt: r.answeredAt ?? undefined,
          }
        : null,
  }));
}
