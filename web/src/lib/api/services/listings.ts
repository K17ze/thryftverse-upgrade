/**
 * Web listings service — mirrors frontend/src/services/listingsApi.ts.
 * All rows flow through `mapBackendListingToListing`; rows failing the
 * display floor are filtered (same as mobile `mapBackendListings`).
 */

import { fetchJson, getAuthSession } from '../http';
import {
  mapBackendListingToListing,
  mapBackendListings,
  mapInventoryListings,
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
  /** Catalogue-wide match count when the backend reports it — absent
   *  (null) means the surface falls back to the loaded count. */
  total?: number | null;
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

interface ListingsQueryParams {
  q?: string;
  category?: string;
  /** Multi-select facets — CSV on the wire (backend `ANY` semantics). */
  categories?: string[];
  subcategory?: string;
  brand?: string;
  brands?: string[];
  size?: string;
  sizes?: string[];
  condition?: string;
  conditions?: string[];
  includeSold?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sustainableOnly?: boolean;
  sort?: string;
  cursor?: string;
  limit?: number;
  sellerId?: string;
}

/** GET /listings — the browse contract: cursor pagination, slug-tolerant
 *  category, CSV facets, richer rows. Handles queryless browse AND short
 *  queries (q min 1) that /search/listings would reject. */
export async function fetchListings(
  params: ListingsQueryParams = {},
  signal?: AbortSignal,
): Promise<ListingPage> {
  const { categories, brands, sizes, conditions, includeSold, sustainableOnly, ...rest } = params;
  const payload = await fetchJson<ListResponse & { total?: number | null }>(
    `/listings${toQuery({
      ...rest,
      categories: categories?.length ? categories.join(',') : undefined,
      brands: brands?.length ? brands.join(',') : undefined,
      sizes: sizes?.length ? sizes.join(',') : undefined,
      conditions: conditions?.length ? conditions.join(',') : undefined,
      includeSold: includeSold || undefined,
      sustainableOnly: sustainableOnly || undefined,
    })}`,
    undefined,
    { signal },
  );
  return {
    items: mapBackendListings(extractRows(payload)),
    nextCursor: payload.nextCursor ?? null,
    total: typeof payload.total === 'number' ? payload.total : null,
  };
}

/** GET /search/listings — the text-search contract (q min 2, ranked).
 *  Page-based on the wire; the `cursor` param IS the page number as a
 *  string, so `useInfiniteQuery` and the sentinel stay untouched. A full
 *  page implies another page — the same hasMore rule native applies. */
export async function searchListings(
  params: {
    q?: string;
    category?: string;
    categories?: string[];
    conditions?: string[];
    brands?: string[];
    sizes?: string[];
    priceMin?: number;
    priceMax?: number;
    includeSold?: boolean;
    sustainableOnly?: boolean;
    sort?: string;
    cursor?: string;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<ListingPage> {
  const page = params.cursor ? Math.max(1, Number.parseInt(params.cursor, 10) || 1) : 1;
  const limit = params.limit ?? 24;
  const payload = await fetchJson<ListResponse & { total?: number | null }>(
    `/search/listings${toQuery({
      q: params.q,
      category: params.category,
      categories: params.categories?.length ? params.categories.join(',') : undefined,
      conditions: params.conditions?.length ? params.conditions.join(',') : undefined,
      brands: params.brands?.length ? params.brands.join(',') : undefined,
      sizes: params.sizes?.length ? params.sizes.join(',') : undefined,
      priceMin: params.priceMin,
      priceMax: params.priceMax,
      includeSold: params.includeSold || undefined,
      sustainableOnly: params.sustainableOnly || undefined,
      sort: params.sort,
      page,
      limit,
    })}`,
    undefined,
    { signal },
  );
  const items = mapBackendListings(extractRows(payload));
  return {
    items,
    nextCursor: items.length >= limit ? String(page + 1) : null,
    total: typeof payload.total === 'number' ? payload.total : null,
  };
}

/** GET /search/trending — real trending queries from the backend's
 *  query-frequency tracker (searchExtended.ts). Mirrors mobile
 *  feedApi.fetchTrendingSearches — returns [] when there is no real
 *  trend data; callers must not fabricate trends in that case. */
export async function fetchTrendingSearches(
  limit = 6,
  signal?: AbortSignal,
): Promise<string[]> {
  const payload = await fetchJson<{ ok: boolean; items?: { query?: string }[] }>(
    `/search/trending?limit=${Math.min(Math.max(limit, 1), 20)}`,
    undefined,
    { signal },
  );
  return (payload.items ?? [])
    .map((i) => i.query)
    .filter((q): q is string => typeof q === 'string' && q.length > 0);
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
  /** Real authentication pipeline state — the detail route resolves it
   *  from the auth-request projection; absent claim = no claim. */
  authenticity?: {
    status?: 'not_offered' | 'eligible' | 'in_progress' | 'verified' | null;
    label?: string | null;
  } | null;
  /** The platform policy the PDP discloses — server-authored copy. */
  protectionPolicy?: {
    available?: boolean | null;
    label?: string | null;
    summary?: string | null;
  } | null;
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

  // Authenticity + protection policy — the backend's claims, verbatim.
  const authStatus = c.authenticity?.status;
  if (
    merged.authenticity == null &&
    (authStatus === 'not_offered' ||
      authStatus === 'eligible' ||
      authStatus === 'in_progress' ||
      authStatus === 'verified')
  ) {
    merged.authenticity = {
      status: authStatus,
      label:
        typeof c.authenticity?.label === 'string' && c.authenticity.label
          ? c.authenticity.label
          : undefined,
    };
  }
  if (merged.protectionPolicy == null && c.protectionPolicy?.available === true) {
    merged.protectionPolicy = {
      available: true,
      label: c.protectionPolicy.label ?? null,
      summary: c.protectionPolicy.summary ?? null,
    };
  }
  return merged;
}

/**
 * POST /listings/:id/view — qualified detail view → the interactions
 * table feeding seller analytics (mobile useItemDetailData fires the
 * same write on item resolve). Fire-and-forget at call sites; the
 * server is idempotent and skips self-views/non-public listings.
 */
export async function trackListingView(
  listingId: string,
  options?: { qualified?: boolean; idempotencyKey?: string },
): Promise<void> {
  try {
    await fetchJson(`/listings/${encodeURIComponent(listingId)}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qualified: options?.qualified ?? true }),
    });
  } catch {
    // Analytics must never break the viewing flow.
  }
}

/**
 * POST /listings/:id/interact — the engagement write native fires from the
 * PDP (mobile trackListingInteraction). `action` is the public vocabulary —
 * the backend stores 'like' as 'wishlist', which is what seller analytics
 * count. Auth-required server-side; call sites fire it only on real member
 * intent, so a guest's local toggle never burns a guaranteed 401. Errors
 * are swallowed — engagement telemetry must never break the action it rode
 * in on.
 */
export async function trackListingInteraction(
  listingId: string,
  action: 'like' | 'save' | 'share',
  options?: { idempotencyKey?: string },
): Promise<void> {
  try {
    await fetchJson(`/listings/${encodeURIComponent(listingId)}/interact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        idempotencyKey: options?.idempotencyKey,
      }),
    });
  } catch {
    // Best-effort analytics write — the backend reports recorded:false on
    // its own failure paths too; the UI never blocks on it.
  }
}

/** GET /listings/:id/qa-summary — the aggregate Q&A summary native reads
 *  for the PDP "View all questions" affordance (questionCount,
 *  answeredQuestionCount, latest answered exchange). Counts cover only
 *  publicly-visible rows — quarantined/held content never leaks (§332). */
export interface ListingQaSummary {
  listingId: string;
  questionCount: number;
  answeredQuestionCount: number;
  latestAnsweredQuestion: string | null;
  latestAnswer: string | null;
  latestActivityAt: string | null;
}

export async function fetchListingQaSummary(
  listingId: string,
  signal?: AbortSignal,
): Promise<ListingQaSummary | null> {
  const payload = await fetchJson<{ ok?: boolean; summary?: ListingQaSummary }>(
    `/listings/${encodeURIComponent(listingId)}/qa-summary`,
    undefined,
    { signal },
  );
  return payload.ok && payload.summary ? payload.summary : null;
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

/** The seller's own inventory — GET /users/:id/listings (mobile
 *  fetchUserListingsFromApi). No status filter: the owner reads drafts,
 *  paused and sold rows, not just the public 'active' set. */
export async function fetchMyListings(
  params: { cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ListingPage> {
  const session = await getAuthSession();
  if (!session?.userId) throw new Error('No authenticated user');
  const payload = await fetchJson<ListResponse>(
    `/users/${encodeURIComponent(session.userId)}/listings${toQuery({ limit: 200, ...params })}`,
    undefined,
    { signal },
  );
  return {
    items: mapInventoryListings(extractRows(payload)),
    nextCursor: payload.nextCursor ?? null,
  };
}

/**
 * POST /listings — the backend schema (index.ts) requires `id`, `sellerId`,
 * `title`, `description`, `priceGbp` and accepts the field set below. The
 * client mints `id` once per publish attempt (a stable UUID) so a retried
 * create is a byte-identical idempotent replay — the backend upserts by id
 * instead of producing a duplicate listing.
 *
 * `images` is NOT a schema field: media attaches through POST
 * /listing-images after the row exists (see {@link attachListingImage}).
 * The cover rides as `imageUrl` + `coverFinalizationId` — a cover URL the
 * backend can't match to a verified upload finalization is refused (422).
 */
export interface CreateListingInput {
  /** Client-minted stable id — reused verbatim across retries. */
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceGbp: number;
  /** Cover media's verified public URL. */
  imageUrl?: string;
  /** Finalization id proving the cover upload — required with imageUrl. */
  coverFinalizationId?: string;
  status?: 'draft' | 'active' | 'paused' | 'sold' | 'deleted';
  category?: string;
  subcategory?: string;
  brand?: string;
  size?: string;
  condition?: string;
  originalPriceGbp?: number;
  shippingMethod?: string;
  shippingPayer?: string;
}

export interface CreateListingResult {
  /** The listing id — echoed back from the client-supplied id. */
  listingId: string;
  /** Truthful landing status — 'risk_pending' when the publish gate held
   *  the listing for review rather than activating it. */
  status?: string;
}

export async function createListing(input: CreateListingInput): Promise<CreateListingResult> {
  const payload = await fetchJson<{
    ok: boolean;
    listingId?: string;
    status?: string;
    error?: string;
  }>('/listings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!payload.ok || !payload.listingId) {
    throw new Error(payload.error ?? 'Listing created but no id returned');
  }
  return { listingId: payload.listingId, status: payload.status };
}

/**
 * PATCH /listings/:id — the listingPatchSchema field whitelist
 * (backend/api/src/lib/listingPatch.ts) plus `status` transitions and the
 * `expectedUpdatedAt` optimistic-concurrency token: the `updatedAt` the
 * editor read. The write is refused with 409 LISTING_STALE when the row
 * moved since — pass the value from fetchListingById whenever editing a
 * loaded listing. `attachmentOrder`/`coverMediaId`/`removedAttachmentIds`
 * are NOT in the schema — cover changes carry via imageUrl +
 * coverFinalizationId, and media add/remove goes through /listing-images.
 */
export interface ListingPatchInput {
  title?: string;
  description?: string;
  priceGbp?: number;
  imageUrl?: string;
  coverFinalizationId?: string;
  status?: string;
  category?: string;
  brand?: string;
  size?: string;
  condition?: string;
  originalPriceGbp?: number;
  shippingMethod?: string;
  shippingPayer?: string;
  expectedUpdatedAt?: string;
}

export interface PatchListingResult {
  listingId: string;
  status?: string;
  /** The row's new updatedAt — the next save's expectedUpdatedAt. */
  updatedAt?: string;
}

export async function patchListing(
  id: string,
  patch: ListingPatchInput,
): Promise<PatchListingResult> {
  const payload = await fetchJson<{
    ok: boolean;
    listingId?: string;
    status?: string;
    updatedAt?: string;
    error?: string;
  }>(`/listings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return {
    listingId: payload.listingId ?? id,
    status: payload.status,
    updatedAt: payload.updatedAt,
  };
}

/**
 * POST /listing-images — attach one verified upload to a listing row.
 * The backend re-checks the finalization (ownership, finalized status and
 * that `imageUrl` matches the upload's public/canonical URL), so callers
 * must send the same publicUrl the finalize receipt returned.
 * Idempotent on `id` — mint a deterministic id per (listing, slot) so a
 * publish retry re-drives the same upsert instead of duplicating rows.
 */
export interface ListingImageAttachInput {
  /** Attachment row id — stable per (listingId, position) for retries. */
  id: string;
  listingId: string;
  imageUrl: string;
  sortOrder: number;
  mediaType?: 'image' | 'video';
  finalizationId: string;
  /** Post-orientation pixel dims — the backend prefers its own
   *  pipeline-measured values when present. */
  mediaWidth?: number;
  mediaHeight?: number;
  /** Poster still for video media — a client-rendered frame upload. */
  posterUrl?: string | null;
  blurhash?: string | null;
  focalX?: number | null;
  focalY?: number | null;
}

export async function attachListingImage(
  body: ListingImageAttachInput,
): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>('/listing-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** DELETE /listings/:id — mobile deleteListingOnApi. Owner-scoped; the
 *  canonical lifecycle allows it from active/paused/draft and rejects
 *  from terminal states, so callers get a truthful error, not a fake ok. */
export async function deleteListing(id: string): Promise<void> {
  await fetchJson<{ ok: boolean }>(`/listings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
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

// ── Report listing (listingsApi.ts reportListing) ──────────────────────────
// POST /listings/:listingId/report — the consumer-report write bridged into
// the safety case graph via recordConsumerReport (routes/listings.ts).
// Shared 14-value reason enum; `details` is capped at 500 chars server-side;
// `idempotencyKey` resolves a retried submit to the original report row.

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

export async function reportListing(
  listingId: string,
  input: {
    reason: ListingReportReason;
    details?: string;
    idempotencyKey?: string;
  },
): Promise<{ reportId: string; noticeId?: string }> {
  const payload = await fetchJson<{
    ok: boolean;
    reportId?: string;
    noticeId?: string;
  }>(`/listings/${encodeURIComponent(listingId)}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: input.reason,
      details: input.details?.trim() ? input.details.trim() : undefined,
      idempotencyKey: input.idempotencyKey,
    }),
  });
  if (!payload.ok || !payload.reportId) {
    throw new Error('Report was not submitted');
  }
  return { reportId: payload.reportId, noticeId: payload.noticeId };
}
