/**
 * Web listings service — mirrors frontend/src/services/listingsApi.ts.
 * All rows flow through `mapBackendListingToListing`; rows failing the
 * display floor are filtered (same as mobile `mapBackendListings`).
 */

import { fetchJson } from '../http';
import {
  mapBackendListingToListing,
  mapBackendListings,
  normalizeReturnPolicy,
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

/** The commerce block on GET /listings/:id — same payload the mobile PDP
 *  reads via listingDetailContract.ts. Every field stays optional; absent
 *  facts stay absent on the mapped Listing. */
interface ListingCommerceWire {
  itemPrice?: number | null;
  buyerProtectionFee?: number | null;
  estimatedTotal?: number | null;
  shippingPrice?: number | null;
  shippingMethod?: string | null;
  shippingPayer?: string | null;
  estimatedDeliveryStart?: string | null;
  estimatedDeliveryEnd?: string | null;
  returnPolicy?: unknown;
  dispatchSlaDays?: number | null;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/** Merge the commerce block onto the mapped listing — fills only fields the
 *  row didn't already carry (row truth wins), and never invents missing
 *  delivery/returns facts. */
function mergeListingCommerce(listing: Listing, commerce: unknown): Listing {
  if (!commerce || typeof commerce !== 'object') return listing;
  const c = commerce as ListingCommerceWire;
  const merged: Listing = { ...listing };

  if (merged.shippingPrice == null) {
    merged.shippingPrice = finiteNumber(c.shippingPrice);
  }
  if (!merged.shippingMethod && typeof c.shippingMethod === 'string' && c.shippingMethod) {
    merged.shippingMethod = c.shippingMethod;
  }
  if (!merged.shippingPayer && typeof c.shippingPayer === 'string' && c.shippingPayer) {
    merged.shippingPayer = c.shippingPayer;
  }
  if (!merged.estimatedDeliveryStart) {
    merged.estimatedDeliveryStart = isoDate(c.estimatedDeliveryStart);
  }
  if (!merged.estimatedDeliveryEnd) {
    merged.estimatedDeliveryEnd = isoDate(c.estimatedDeliveryEnd);
  }
  if (!merged.returnPolicy) {
    merged.returnPolicy = normalizeReturnPolicy(c.returnPolicy);
  }
  if (merged.dispatchSlaDays == null) {
    merged.dispatchSlaDays = finiteNumber(c.dispatchSlaDays);
  }

  // Full price incl. Buyer Protection — the price row's secondary figure.
  // Only the verifiable sum (item + fee) is used; an estimatedTotal that may
  // fold postage in would silently overstate it.
  const item = finiteNumber(c.itemPrice);
  const fee = finiteNumber(c.buyerProtectionFee);
  if (merged.priceWithProtection == null && item !== null && fee !== null) {
    merged.priceWithProtection = Math.round((item + fee) * 100) / 100;
  }
  return merged;
}

export async function fetchListingById(
  id: string,
  signal?: AbortSignal,
): Promise<Listing | null> {
  const payload = await fetchJson<{
    ok: boolean;
    listing?: BackendListingRow | null;
    commerce?: ListingCommerceWire | null;
    error?: string;
  }>(`/listings/${encodeURIComponent(id)}`, undefined, { signal });
  if (!payload.ok || !payload.listing) return null;
  const listing = mapBackendListingToListing(payload.listing);
  return listing ? mergeListingCommerce(listing, payload.commerce) : null;
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

/**
 * PATCH /listings/:id — the same field vocabulary create accepts plus
 * `status` ('active' | 'sold' | 'paused' | 'deleted'), mirroring the mobile
 * patchListingOnApi path used for mark-sold/relist and single edits.
 */
export async function patchListing(
  id: string,
  patch: Partial<CreateListingInput> & { status?: string },
): Promise<void> {
  await fetchJson<{ ok: boolean }>(`/listings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

// ── Q&A (listing questions) ──────────────────────────────────────────────────

interface QuestionAnswerRow {
  text?: string;
  responderName?: string | null;
  createdAt?: string;
  moderationState?: string | null;
}

interface QuestionRow {
  id: string | number;
  listingId?: string;
  /** Live wire name (GET /listings/:id/questions). */
  text?: string;
  /** Legacy aliases some rows may carry. */
  question?: string;
  body?: string;
  askerName?: string | null;
  askerUsername?: string;
  askerId?: string;
  createdAt?: string;
  /** 'quarantined' marks an author-visible held row (migration 332). */
  moderationState?: string | null;
  answer?: QuestionAnswerRow | string | null;
  answerBody?: string | null;
  answeredAt?: string | null;
  answererId?: string | null;
  answerModerationState?: string | null;
}

/** Wire 'visible'/'quarantined' → contract 'published'/'pending_review'. */
function toModerationState(value: unknown): 'published' | 'pending_review' | null {
  if (value === 'quarantined' || value === 'pending_review') return 'pending_review';
  if (value === 'visible' || value === 'published') return 'published';
  return null;
}

function mapQuestionRow(r: QuestionRow, listingId: string): ListingQuestion {
  const answerObj = r.answer && typeof r.answer === 'object' ? r.answer : null;
  const answerText =
    typeof r.answer === 'string' && r.answer
      ? r.answer
      : answerObj?.text ?? r.answerBody ?? null;
  return {
    id: String(r.id),
    listingId: r.listingId ?? listingId,
    askerId: r.askerId,
    askerName: r.askerName ?? r.askerUsername ?? 'Member',
    text: r.text ?? r.question ?? r.body ?? '',
    createdAt: r.createdAt,
    moderationState: toModerationState(r.moderationState),
    answer: answerText
      ? {
          text: answerText,
          responderName: answerObj?.responderName ?? '',
          createdAt: answerObj?.createdAt ?? r.answeredAt ?? undefined,
          moderationState: toModerationState(
            answerObj?.moderationState ?? r.answerModerationState,
          ),
        }
      : null,
  };
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
  return rows.map((r) => mapQuestionRow(r, listingId));
}

/**
 * POST /listings/:id/questions — persists a buyer question. The returned row
 * may be moderation-held ('pending_review'): it is persisted and visible to
 * its author, and filtered from public reads until review (backend §332).
 */
export async function postListingQuestion(
  listingId: string,
  text: string,
): Promise<ListingQuestion> {
  const payload = await fetchJson<{ ok: boolean; question?: QuestionRow }>(
    `/listings/${encodeURIComponent(listingId)}/questions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    },
  );
  if (!payload.question) throw new Error('Question was not created');
  return mapQuestionRow(payload.question, listingId);
}

/**
 * POST /listings/:listingId/questions/:questionId/answer — seller-only write.
 * Returns the answer payload; the question row itself is unchanged.
 */
export async function answerListingQuestion(
  listingId: string,
  questionId: string,
  text: string,
): Promise<NonNullable<ListingQuestion['answer']>> {
  const payload = await fetchJson<{ ok: boolean; answer?: QuestionAnswerRow }>(
    `/listings/${encodeURIComponent(listingId)}/questions/${encodeURIComponent(questionId)}/answer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    },
  );
  if (!payload.answer?.text) throw new Error('Answer was not recorded');
  return {
    text: payload.answer.text,
    responderName: payload.answer.responderName ?? '',
    createdAt: payload.answer.createdAt,
    moderationState: toModerationState(payload.answer.moderationState),
  };
}
