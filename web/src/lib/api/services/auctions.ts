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
import type {
  AuctionBid,
  AuctionMarketItem,
  AuctionTerminalReason,
} from '@/lib/contracts/auction';

/**
 * The detail/board payloads carry the post-end fields the shared
 * MarketAuctionApi projection doesn't declare (terminalReason,
 * paymentDeadlineAt, secondChanceOfferedTo) — mirrors MarketAuction in
 * frontend/src/services/marketApi.ts.
 */
interface MarketAuctionDetailApi extends MarketAuctionApi {
  terminalReason?: string | null;
  paymentDeadlineAt?: string | null;
  secondChanceOfferedTo?: string | null;
  cancelledAt?: string | null;
  settledAt?: string | null;
  paidAt?: string | null;
  /** Sweep-written post-end state ('awaiting_payment', 'reserve_not_met',
   *  'payment_expired', 'second_chance_offered') — richer than the
   *  timestamp-derived `lifecycle`, which stays 'ended' through them. */
  status?: string;
  /** Server-computed viewer max bid — the detail read carries it so the
   *  client stops re-deriving it from a 50-bid window. */
  viewerHighestBid?: number | null;
  /** Monotonic per-auction event sequence — realtime gap detection. */
  auctionSequence?: number | null;
  /** Anti-sniping extension count applied so far. */
  extensionCount?: number;
}

const TERMINAL_REASONS: ReadonlySet<string> = new Set([
  'cancelled',
  'seller_cancelled',
  'settled',
  'buy_now',
  'scheduled_end',
  'reserve_not_met',
  'payment_expired',
  'second_chance',
  'seller_accepted_below_reserve',
]);

/** Layered mapper — the shared projection plus the post-end fields the
 *  board and detail surfaces need for honest outcome grammar. */
function mapAuction(a: MarketAuctionDetailApi): AuctionMarketItem {
  return {
    ...mapMarketAuctionToItem(a),
    reservePrice: typeof a.reservePriceGbp === 'number' ? a.reservePriceGbp : undefined,
    minimumNextBid:
      typeof a.minimumNextBidGbp === 'number' ? a.minimumNextBidGbp : undefined,
    // `status` is the sweep-written post-end vocabulary (awaiting_payment
    // /reserve_not_met/payment_expired/second_chance_offered) — prefer it
    // over `lifecycle`, which stays 'ended' through the settlement states
    // and would hide the pay-CTA preconditions.
    serverLifecycle:
      (typeof a.status === 'string' && a.status) ||
      (typeof a.lifecycle === 'string' ? a.lifecycle : undefined),
    terminalReason:
      a.terminalReason != null && TERMINAL_REASONS.has(a.terminalReason)
        ? (a.terminalReason as AuctionTerminalReason)
        : null,
    paymentDeadlineAt: a.paymentDeadlineAt ?? null,
    secondChanceOfferedTo: a.secondChanceOfferedTo ?? null,
    winnerBidderId: a.winnerBidderId ?? null,
    paidAt: a.paidAt ?? null,
    viewerHighestBid: typeof a.viewerHighestBid === 'number' ? a.viewerHighestBid : null,
  };
}

interface AuctionListResponse {
  ok?: boolean;
  items?: MarketAuctionDetailApi[];
  auctions?: MarketAuctionDetailApi[];
  nextCursor?: string | null;
  /** Server clock at response time — stamped onto each mapped item. */
  serverNow?: string;
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

/** Stamp the response-level serverNow onto each mapped item so a single
 *  field carries the server clock wherever the row travels. */
function stampServerNow(
  items: AuctionMarketItem[],
  serverNow: string | undefined,
): AuctionMarketItem[] {
  if (!serverNow) return items;
  for (const item of items) item.serverNow = serverNow;
  return items;
}

export async function fetchAuctionBoard(
  params: {
    /** Backend lifecycle filter — 'live' | 'scheduled' | 'ended' | 'all'
     *  (default 'all' server-side). */
    status?: string;
    sort?: string;
    category?: string;
    /** CSV multi-select form of `category` (filter-sheet grammar). */
    categories?: string;
    /** Free-text title/brand search. */
    query?: string;
    /** 'me' narrows to the caller's own auctions (authed only). */
    seller?: 'me';
    /** Authed-only server-side watchlist filter — replaces the old
     *  client intersection against board page 1. */
    watchedOnly?: boolean;
    priceMin?: number;
    priceMax?: number;
    cursor?: string;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<{ items: AuctionMarketItem[]; nextCursor: string | null }> {
  const payload = await fetchJson<AuctionListResponse>(`/auctions${toQuery(params)}`, undefined, {
    signal,
  });
  return {
    items: stampServerNow(
      (payload.items ?? payload.auctions ?? []).map(mapAuction),
      payload.serverNow,
    ),
    nextCursor: payload.nextCursor ?? null,
  };
}

export async function fetchAuctionHome(
  signal?: AbortSignal,
): Promise<{ featured: AuctionMarketItem[]; endingSoon: AuctionMarketItem[] }> {
  const payload = await fetchJson<{
    ok?: boolean;
    featured?: MarketAuctionDetailApi[];
    endingSoon?: MarketAuctionDetailApi[];
  }>('/auctions/home', undefined, { signal });
  return {
    featured: (payload.featured ?? []).map(mapAuction),
    endingSoon: (payload.endingSoon ?? []).map(mapAuction),
  };
}

/** The detail serve's companion payload — its own bid ledger (which,
 *  unlike the standalone /bids route on this deployment, carries bidder
 *  usernames) and the server clock. */
export interface AuctionDetailBundle {
  auction: AuctionMarketItem;
  /** Detail-echoed ledger, mapped — null when the serve carries no
   *  bidActivity and the /bids read stays the fallback. */
  bids: AuctionBid[] | null;
}

export async function fetchAuctionDetailBundle(
  id: string,
  signal?: AbortSignal,
): Promise<AuctionDetailBundle | null> {
  const payload = await fetchJson<{
    ok: boolean;
    auction?: MarketAuctionDetailApi;
    bidActivity?: AuctionBidActivityApi[];
    serverNow?: string;
  }>(
    `/auctions/${encodeURIComponent(id)}`,
    undefined,
    { signal },
  );
  if (!payload.ok || !payload.auction) return null;
  const auction = mapAuction(payload.auction);
  if (payload.serverNow) auction.serverNow = payload.serverNow;
  const bids = Array.isArray(payload.bidActivity)
    ? payload.bidActivity.map((b) => mapAuctionBidActivity(b, auction.id))
    : null;
  return { auction, bids };
}

export async function fetchAuctionDetail(
  id: string,
  signal?: AbortSignal,
): Promise<AuctionMarketItem | null> {
  const bundle = await fetchAuctionDetailBundle(id, signal);
  return bundle ? bundle.auction : null;
}

export async function fetchAuctionByListing(
  listingId: string,
  signal?: AbortSignal,
): Promise<AuctionMarketItem | null> {
  const payload = await fetchJson<{ ok: boolean; auction?: MarketAuctionDetailApi | null }>(
    `/auctions/by-listing/${encodeURIComponent(listingId)}`,
    undefined,
    { signal },
  );
  if (!payload.ok || !payload.auction) return null;
  return mapAuction(payload.auction);
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
  /** The response was lost and reconciliation could not prove whether the
   *  write committed — the viewer must check My Bids rather than blindly
   *  retry. */
  outcomeUnknown?: boolean;
}

/** Fresh key for one user-initiated money attempt. Stable for the life of
 *  the attempt — every retry of the same attempt reuses it so the backend
 *  dedupe (auction_bids.idempotency_key / auction_transaction_idempotency)
 *  replays the original response instead of double-committing. */
function newAttemptKey(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `${prefix}-${rand}`;
}

export function newBidAttemptKey(): string {
  return newAttemptKey('web-bid');
}

/** Fresh key for one winner-pay attempt — same stability rule as bids:
 *  the backend replays the stored attempt for a same-key retry, so the
 *  caller must mint once per user-initiated payment and hold it across
 *  retries instead of minting per click. */
export function newAuctionPayAttemptKey(): string {
  return newAttemptKey('web-auction-pay');
}

/** Fresh key for one second-chance accept attempt. */
export function newSecondChanceAttemptKey(auctionId: string): string {
  return newAttemptKey(`web-sc-${auctionId}`);
}

/** Stable key for a buy-now attempt — minted per click-through and
 *  reused across retries of the same attempt. */
export function newBuyNowAttemptKey(): string {
  return newAttemptKey('web-buy-now');
}

/** Stable key for one auction-create form session — minted when the
 *  seller first commits the form and held across retries so a lost
 *  response replays the created auction instead of double-listing it. */
export function newAuctionCreateAttemptKey(): string {
  return newAttemptKey('web-auction-create');
}

/**
 * Bid payload — POST /auctions/:auctionId/bids.
 *
 * The live route schema (backend/api/src/index.ts:37587) is
 * `additionalProperties: false` over `{ amountGbp, idempotencyKey }` —
 * there is no server-side proxy ceiling (the auction_bids insert never
 * writes is_proxy/max_bid_gbp), so `maxBidGbp` is deliberately absent:
 * sending it would fail validation, and pretending the server holds a
 * ceiling would fabricate capability.
 */
export interface PlaceAuctionBidInput {
  amountGbp: number;
  idempotencyKey: string;
}

/** One lookup poll — GET /users/me/auction-bids/lookup-by-key/:key
 *  (backend/api/src/routes/auctions.ts:572). 200 → the bid committed;
 *  404 → nothing committed for this key; anything else → keep polling. */
export type BidLookupResult =
  | { status: 'acknowledged' }
  | { status: 'safe_to_retry' }
  | { status: 'processing' };

export async function lookupAuctionBidByIdempotencyKey(
  idempotencyKey: string,
): Promise<BidLookupResult> {
  try {
    await fetchJson<{ ok: true; status: 'acknowledged'; bid: unknown }>(
      `/users/me/auction-bids/lookup-by-key/${encodeURIComponent(idempotencyKey)}`,
      undefined,
      // Never let GET-dedup fold a poll into a stale in-flight response.
      { skipDedup: true },
    );
    return { status: 'acknowledged' };
  } catch (e) {
    const parsed = parseApiError(e);
    if (parsed.status === 404) return { status: 'safe_to_retry' };
    return { status: 'processing' };
  }
}

// Unknown-outcome reconciliation — the web port of mobile's
// useUnknownOutcomeReconciliation (frontend/src/hooks): when a bid POST's
// response is lost, poll the lookup endpoint before claiming failure.
const LOOKUP_MAX_ATTEMPTS = 8;
const LOOKUP_BASE_DELAY_MS = 1_500;
const LOOKUP_MAX_DELAY_MS = 10_000;

const waitMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 'acknowledged' → committed; 'safe_to_retry' → provably not committed;
 *  'unresolved' → the lookup stayed transiently broken through the poll
 *  budget. */
async function reconcileBidOutcome(
  idempotencyKey: string,
): Promise<'acknowledged' | 'safe_to_retry' | 'unresolved'> {
  let delayMs = LOOKUP_BASE_DELAY_MS;
  for (let attempt = 0; attempt < LOOKUP_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await waitMs(delayMs);
      delayMs = Math.min(delayMs * 2, LOOKUP_MAX_DELAY_MS);
    }
    const result = await lookupAuctionBidByIdempotencyKey(idempotencyKey);
    if (result.status === 'acknowledged') return 'acknowledged';
    if (result.status === 'safe_to_retry') return 'safe_to_retry';
  }
  return 'unresolved';
}

function toBidError(parsed: ReturnType<typeof parseApiError>, fallback: string): BidError {
  const err = new BidError(parsed.message || fallback);
  if (parsed.structuredDetails?.minimumNextBidGbp) {
    err.minimumNextBidGbp = parsed.structuredDetails.minimumNextBidGbp;
  }
  if (parsed.structuredDetails?.buyNowPriceGbp) {
    err.buyNowPriceGbp = parsed.structuredDetails.buyNowPriceGbp;
  }
  return err;
}

/** Ambiguous = the response may have been lost after the server committed:
 *  no response at all (network drop / timeout) or a 5xx. Mirrors the
 *  native mapApiErrorToTransactionError isAmbiguous classification —
 *  except OFFLINE_WRITE_NOT_SUBMITTED, the client-side guard that blocked
 *  the write before it left: provably not committed, so a plain failure. */
function isAmbiguousFailure(parsed: ReturnType<typeof parseApiError>): boolean {
  if (parsed.code === 'OFFLINE_WRITE_NOT_SUBMITTED') return false;
  return parsed.isNetworkError || (parsed.status !== undefined && parsed.status >= 500);
}

export async function placeAuctionBid(
  auctionId: string,
  input: PlaceAuctionBidInput,
): Promise<void> {
  try {
    await fetchJson(`/auctions/${encodeURIComponent(auctionId)}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountGbp: input.amountGbp,
        idempotencyKey: input.idempotencyKey,
      }),
    });
    return;
  } catch (e) {
    const parsed = parseApiError(e);
    if (!isAmbiguousFailure(parsed)) throw toBidError(parsed, 'Bid failed');
    // The bid may have committed — reconcile by idempotency key before
    // surfacing anything, so a retry can't double-place it.
    const outcome = await reconcileBidOutcome(input.idempotencyKey);
    if (outcome === 'acknowledged') return;
    const err = toBidError(parsed, 'Bid failed');
    if (outcome === 'unresolved') {
      err.outcomeUnknown = true;
      err.message =
        'We lost the connection while placing your bid — check My Bids before trying again, in case it went through.';
    }
    throw err;
  }
}

// ── Post-end actions — mirror mobile marketApi.ts ──────────────────────

/** Winner (or second-chance recipient) accepts the offer — the backend
 *  deduplicates on the idempotency key. */
export async function acceptSecondChance(
  auctionId: string,
  idempotencyKey: string,
): Promise<AuctionMarketItem> {
  const payload = await fetchJson<{ ok: boolean; auction: MarketAuctionDetailApi }>(
    `/auctions/${encodeURIComponent(auctionId)}/second-chance/accept`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey }),
    },
  );
  return mapAuction(payload.auction);
}

export async function declineSecondChance(auctionId: string): Promise<AuctionMarketItem> {
  const payload = await fetchJson<{ ok: boolean; auction: MarketAuctionDetailApi }>(
    `/auctions/${encodeURIComponent(auctionId)}/second-chance/decline`,
    { method: 'POST' },
  );
  return mapAuction(payload.auction);
}

/** Seller accepts the highest bid below reserve (reserve-not-met flow). */
export async function acceptHighestBid(auctionId: string): Promise<AuctionMarketItem> {
  const payload = await fetchJson<{ ok: boolean; auction: MarketAuctionDetailApi }>(
    `/auctions/${encodeURIComponent(auctionId)}/accept-highest-bid`,
    { method: 'POST' },
  );
  return mapAuction(payload.auction);
}

/**
 * Buy Now payload — POST /auctions/:auctionId/buy-now requires BOTH
 * fields (backend/api/src/index.ts:38101): the key dedupes the purchase
 * (`buy_now:`-scoped claim replays the original response on retry) and
 * the expected price guards drift — the server 409s with
 * BUY_NOW_PRICE_CHANGED + currentBuyNowPriceGbp when it moved.
 */
export interface BuyNowInput {
  idempotencyKey: string;
  expectedPriceGbp: number;
}

/** Backend success payload — buy-now provisions the order server-side
 *  (orders.auction_id partial unique index → exactly one order) and ends
 *  the auction with the caller as winner. `orderId` is the fulfilment
 *  entry point; the order lands unpaid until the pay route settles it. */
export interface BuyNowResult {
  ok: true;
  isBuyNow: true;
  orderId?: string;
  idempotent?: boolean;
}

export async function buyAuctionNow(auctionId: string, input: BuyNowInput): Promise<BuyNowResult> {
  try {
    const payload = await fetchJson<BuyNowResult>(
      `/auctions/${encodeURIComponent(auctionId)}/buy-now`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return payload;
  } catch (e) {
    const parsed = parseApiError(e);
    if (!isAmbiguousFailure(parsed)) throw toBidError(parsed, 'Purchase failed');
    // Same unknown-outcome posture as bidding — a buy-now commit also
    // lands an auction_bids row keyed by the idempotency key, so the
    // shared lookup resolves it.
    const outcome = await reconcileBidOutcome(input.idempotencyKey);
    // Acknowledged = the original commit landed; its response body is
    // gone, so orderId is unknown — callers navigate to /orders.
    if (outcome === 'acknowledged') return { ok: true, isBuyNow: true, idempotent: true };
    const err = toBidError(parsed, 'Purchase failed');
    if (outcome === 'unresolved') {
      err.outcomeUnknown = true;
      err.message =
        'We lost the connection while purchasing — check your orders before trying again, in case it went through.';
    }
    throw err;
  }
}

// ── Winner payment — POST /auctions/:auctionId/payment ─────────────────────
// (backend/api/src/routes/auctions.ts:800; mirrors mobile marketApi.ts
// payAuction + useAuctionDetail.handlePayNow). This is the ONLY winner-pay
// path: the route is winner-restricted, idempotent per (auction, winner),
// and provisions the canonical commerce order + provider intent itself.
// POST /orders can never serve a won auction — the listing stays 'paused'
// for the auction's life and that route hard-409s non-active listings.

/** The payment-intent handle the pay/status routes return. The backend
 *  reveals clientSecret/nextActionUrl only to the intent owner — other
 *  parties get nulls. */
export interface AuctionPaymentIntentHandle {
  id: string;
  status: string;
  gatewayId?: string | null;
  clientSecret?: string | null;
  nextActionUrl?: string | null;
  providerStatus?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

/** Normalised winner-pay outcome. 'unpaid' is only reported by the
 *  payment-status poll — it proves no intent has been minted for the
 *  current winner (the POST response itself only ever reports the other
 *  three). 'pending' is a real in-flight attempt, never a success. */
export interface AuctionPaymentResult {
  paymentStatus: 'pending' | 'paid' | 'failed' | 'unpaid';
  /** The commerce order the capture settles — resolved on 'paid' replays
   *  and by the status poll once the attempt has provisioned it. */
  orderId?: string;
  intent: AuctionPaymentIntentHandle | null;
  /** Server auction lifecycle verbatim ('awaiting_payment', 'settled'…). */
  auctionStatus?: string;
  /** 'requires_reconciliation' when a capture exists but cannot settle —
   *  the auction is NOT paid even though money moved. */
  settlementState?: string;
  settlementReason?: string;
}

export class AuctionPaymentError extends Error {
  /** The response was lost and the status read could not prove whether
   *  the payment committed — the viewer must check their orders rather
   *  than blindly retry. */
  outcomeUnknown?: boolean;
}

interface AuctionPaymentWire {
  ok?: boolean;
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'unpaid';
  orderId?: string;
  intent?: AuctionPaymentIntentHandle | null;
  auction?: { id: string; status?: string; settledAt?: string | null; paidAt?: string | null };
  settlementState?: string;
  settlementReason?: string;
}

function toAuctionPaymentResult(payload: AuctionPaymentWire): AuctionPaymentResult {
  return {
    paymentStatus: payload.paymentStatus ?? 'pending',
    orderId: payload.orderId,
    intent: payload.intent ?? null,
    auctionStatus: payload.auction?.status,
    settlementState: payload.settlementState,
    settlementReason: payload.settlementReason,
  };
}

/** GET /auctions/:auctionId/payment-status — the authoritative winner-pay
 *  read (routes/auctions.ts:1502, winner/seller/admin only). Beyond a
 *  status read it self-heals: a captured intent whose auction settle never
 *  landed is settled inside this route, so it is the ONLY poll a client
 *  should run while a capture is in flight. */
export async function fetchAuctionPaymentStatus(
  auctionId: string,
  signal?: AbortSignal,
): Promise<AuctionPaymentResult> {
  const payload = await fetchJson<AuctionPaymentWire>(
    `/auctions/${encodeURIComponent(auctionId)}/payment-status`,
    undefined,
    // Never let GET-dedup fold a poll into a stale in-flight response.
    { signal, skipDedup: true },
  );
  return toAuctionPaymentResult(payload);
}

export interface PayAuctionInput {
  /** One stable key per user-initiated pay attempt — minted via
   *  newAuctionPayAttemptKey and held across retries of the same attempt.
   *  The backend namespaces it `auction-pay:<auctionId>:<key>` at the
   *  canonical intent route, so the same key always replays this attempt. */
  idempotencyKey: string;
  /** A saved payment method id; omitted lets the server fall back to the
   *  winner's default instrument. */
  paymentMethodId?: number;
}

/** Ambiguous-pay reconciliation: poll the authoritative status read. A
 *  committed attempt (live intent, settle replay, terminal failure)
 *  resolves to its real state; 'unpaid' proves nothing left the ground so
 *  the original error stands; sustained read failure stays unresolved. */
async function reconcileAuctionPayment(
  auctionId: string,
): Promise<AuctionPaymentResult | null> {
  let delayMs = LOOKUP_BASE_DELAY_MS;
  for (let attempt = 0; attempt < LOOKUP_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await waitMs(delayMs);
      delayMs = Math.min(delayMs * 2, LOOKUP_MAX_DELAY_MS);
    }
    try {
      const status = await fetchAuctionPaymentStatus(auctionId);
      if (status.paymentStatus === 'unpaid') return null;
      return status;
    } catch {
      // Transient read failure — keep polling inside the budget.
    }
  }
  return null;
}

export async function payAuction(
  auctionId: string,
  input: PayAuctionInput,
): Promise<AuctionPaymentResult> {
  try {
    const payload = await fetchJson<AuctionPaymentWire>(
      `/auctions/${encodeURIComponent(auctionId)}/payment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: input.idempotencyKey,
          ...(input.paymentMethodId != null ? { paymentMethodId: input.paymentMethodId } : {}),
        }),
      },
    );
    return toAuctionPaymentResult(payload);
  } catch (e) {
    const parsed = parseApiError(e);
    if (!isAmbiguousFailure(parsed)) {
      throw new AuctionPaymentError(parsed.message || 'Payment could not be started');
    }
    // The response may have been lost after the server committed — an
    // in-flight or captured intent for this winner resolves through the
    // authoritative status read, never through a blind retry.
    const recovered = await reconcileAuctionPayment(auctionId);
    if (recovered) return recovered;
    const err = new AuctionPaymentError(
      'We lost the connection while starting the payment — check your orders before trying again, in case it went through.',
    );
    err.outcomeUnknown = true;
    throw err;
  }
}

/** Bounded settlement poll for a 'pending' winner-pay attempt — the web
 *  port of the native waitForPaymentIntentSettlement posture, but hitting
 *  the auction-scoped status route (the only read that also runs the
 *  verified-settle self-heal). Returns the last known result; a still-open
 *  attempt at exhaustion reports 'pending', never upgraded. When the
 *  provider surfaces a fresh next-action URL (3DS/SCA) mid-flight it is
 *  handed to onNextActionUrl — the component owns the window.open. */
export async function waitForAuctionPayment(
  auctionId: string,
  options: {
    maxWaitMs?: number;
    intervalMs?: number;
    shouldContinue?: () => boolean;
    onNextActionUrl?: (url: string) => void;
  } = {},
): Promise<AuctionPaymentResult> {
  const deadline = Date.now() + (options.maxWaitMs ?? 90_000);
  const intervalMs = options.intervalMs ?? 2_000;
  const shouldContinue = options.shouldContinue ?? (() => true);
  let openedUrl: string | null = null;
  let latest: AuctionPaymentResult | null = null;
  while (Date.now() < deadline && shouldContinue()) {
    try {
      latest = await fetchAuctionPaymentStatus(auctionId);
      if (latest.paymentStatus === 'paid' || latest.paymentStatus === 'failed') {
        return latest;
      }
      const url = latest.intent?.nextActionUrl ?? null;
      if (url && url !== openedUrl) {
        openedUrl = url;
        options.onNextActionUrl?.(url);
      }
    } catch {
      // A read failure isn't a payment failure — keep polling.
    }
    await waitMs(intervalMs);
  }
  return latest ?? { paymentStatus: 'pending', intent: null };
}

export async function setAuctionWatched(auctionId: string, watched: boolean): Promise<void> {
  await fetchJson(`/auctions/${encodeURIComponent(auctionId)}/watch`, {
    method: watched ? 'POST' : 'DELETE',
  });
}

/**
 * Seller cancellation — POST /auctions/:auctionId/cancel
 * (backend/api/src/routes/auctions.ts:625). Seller-only: the route 403s
 * non-owners, 409s an already-cancelled auction, a settled run, and any
 * run with a bound winner. Success ends the auction, notifies every
 * bidder, and unpauses the listing.
 */
export interface CancelAuctionResult {
  ok: true;
  auctionId: string;
  cancelledAt?: string;
}

export async function cancelAuction(
  auctionId: string,
  reason?: string,
): Promise<CancelAuctionResult> {
  return fetchJson<CancelAuctionResult>(
    `/auctions/${encodeURIComponent(auctionId)}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
}

/**
 * POST /auctions payload — mirrors the live route's Zod schema
 * (backend/api/src/index.ts:37308). No `reservePriceGbp`: the schema
 * drops it silently, so it must not be part of this contract — reserve
 * pricing is a fixture-runtime concept on web until the route supports it.
 */
export interface CreateAuctionServiceInput {
  listingId: string;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  buyNowPriceGbp?: number;
  minIncrementGbp?: number;
  /** One stable key per create form session (minted via
   *  newAuctionCreateAttemptKey) — the backend dedupes on
   *  (seller, idempotency_key) and replays the created auction. */
  idempotencyKey?: string;
}

export async function createAuction(input: CreateAuctionServiceInput): Promise<AuctionMarketItem> {
  const payload = await fetchJson<{
    ok: true;
    idempotent?: boolean;
    /** A fresh create echoes the full market row; an idempotent replay
     *  answers the reduced shape (sellerId not the seller block, status
     *  not lifecycle, no title/image) — the optional fields normalise it. */
    auction: MarketAuctionDetailApi & {
      seller?: MarketAuctionDetailApi['seller'];
      lifecycle?: string;
      title?: string;
      imageUrl?: string | null;
      sellerId?: string;
      status?: string;
    };
  }>('/auctions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const raw = payload.auction;
  return mapAuction({
    ...raw,
    seller: raw.seller ?? {
      id: raw.sellerId ?? '',
      username: 'unknown',
      displayName: null,
      avatarUrl: null,
    },
    title: raw.title ?? 'Untitled',
    imageUrl: raw.imageUrl ?? null,
    lifecycle: raw.lifecycle ?? raw.status ?? 'upcoming',
  });
}

export async function fetchAuctionWatchlist(signal?: AbortSignal): Promise<AuctionMarketItem[]> {
  const payload = await fetchJson<AuctionListResponse>('/auctions/watchlist', undefined, { signal });
  return (payload.items ?? payload.auctions ?? []).map(mapAuction);
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
