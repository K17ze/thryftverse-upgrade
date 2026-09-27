/**
 * Web commerce service — mirrors frontend/src/services/commerceApi.ts and
 * listingOffersApi.ts. Orders, order actions, offers, wallet snapshot,
 * saved addresses and payment methods.
 */

import { ApiRequestError, fetchJson, getAuthSession } from '../http';
import {
  mapCommerceUserOrder,
  mapToBaseOrder,
  type CommerceUserOrderApi,
} from '../mappers';
import type {
  CommerceOrder,
  DispatchExtension,
  Order,
  ReturnCase,
  ReturnRemedy,
} from '@/lib/contracts/domain';

/** Live-API offer row — the wire shape from /users/me/offers +
 *  /listings/:id/offers (mirrors mobile listingOffersApi.ListingOffer). */
export interface ListingOffer {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  offerPriceGbp: number;
  originalPriceGbp?: number;
  counterRound: number;
  status: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'cancelled';
  offeredByUserId: string;
  orderId?: string | null;
  /** DM thread the negotiation is bound to (listing_offers.conversation_id). */
  conversationId?: string | null;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
}

/** Live wallet snapshot from /wallets/:id/snapshot. */
export interface WalletAccount {
  userId: string;
  balanceGbp: number;
  availableGbp: number;
  pendingGbp: number;
  currentPendingWithdrawalGbp: number;
  cumulativeWithdrawnGbp: number;
  currency: string;
}

interface OrderListResponse {
  ok: boolean;
  items: CommerceUserOrderApi[];
  nextCursor: string | null;
  needsActionCount?: number;
}

export interface OrderPage {
  items: CommerceOrder[];
  baseOrders: Order[];
  /** Raw wire rows — fulfilment/list projections need fields the mapped
   *  contracts drop (listingTitle, listingImageUrl, buyerUsername). */
  raw: CommerceUserOrderApi[];
  nextCursor: string | null;
  needsActionCount: number;
}

/** Resolve the authed user id for self-scoped `/users/:id/*` routes. The id
 *  lands on the persisted session at login/signup/`fetchMe`. */
async function selfUserId(): Promise<string> {
  const session = await getAuthSession();
  if (!session?.userId) throw new Error('No authenticated user');
  return session.userId;
}

export async function fetchOrders(
  params: {
    role?: 'buyer' | 'seller' | 'all';
    status?: string;
    classification?: string;
    query?: string;
    year?: number;
    cursor?: string;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<OrderPage> {
  const userId = await selfUserId();
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  if (!usp.has('limit')) usp.set('limit', '20');
  const qs = usp.toString() ? `?${usp.toString()}` : '';
  const payload = await fetchJson<OrderListResponse>(
    `/users/${encodeURIComponent(userId)}/orders${qs}`,
    undefined,
    { signal },
  );
  const items = payload.items ?? [];
  return {
    items: items.map(mapCommerceUserOrder),
    baseOrders: items.map(mapToBaseOrder),
    raw: items,
    nextCursor: payload.nextCursor ?? null,
    needsActionCount: payload.needsActionCount ?? 0,
  };
}

export async function fetchOrderById(
  id: string,
  signal?: AbortSignal,
): Promise<CommerceOrder | null> {
  const payload = await fetchJson<{ ok: boolean; order?: CommerceUserOrderApi }>(
    `/orders/${encodeURIComponent(id)}`,
    undefined,
    { signal },
  );
  if (!payload.ok || !payload.order) return null;
  return mapCommerceUserOrder(payload.order);
}

/** POST /orders — mirrors mobile createOrder. The server derives charges
 *  from the locked listing price; the client sends the ids it owns. */
export async function createOrder(input: {
  listingId: string;
  buyerId: string;
  idempotencyKey: string;
  addressId?: number;
  paymentMethodId?: number;
  shippingQuoteId?: string;
  /** 'oneze_internal' pays the order from the buyer's 1ZE wallet instead of
   *  a card — the intent settles synchronously against the pocket. */
  paymentGatewayId?: string;
  /** Buyer-requested item verification — a request flag on the order, no
   *  fee (the backend exposes no verification price). */
  verificationRequested?: boolean;
}): Promise<{ orderId: string }> {
  const res = await fetchJson<{
    ok: boolean;
    orderId?: string;
    order?: { id?: string };
    id?: string;
  }>('/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const orderId = res.orderId ?? res.order?.id ?? res.id;
  if (!orderId) throw new Error('Order not created');
  return { orderId };
}

// ── Shipping quotes (commerceApi.ts getShippingQuote) ────────────────────────
//
// POST /shipping/quote returns persisted quotes whose quoteIds the order
// route accepts. The delivery selector only offers what this endpoint
// returns — never a client-authored price.

export interface ShippingQuoteItem {
  quoteId: string | null;
  quoteHash: string | null;
  expiresAt: string | null;
  carrierId: string;
  label: string;
  priceFromGbp: number;
  etaMinDays: number;
  etaMaxDays: number;
  tracking: boolean;
  live: boolean;
  source: 'live' | 'fallback';
}

export interface ShippingQuoteResponse {
  ok: boolean;
  source: 'live' | 'fallback' | 'unavailable';
  recommendedQuote: ShippingQuoteItem | null;
  quotes: ShippingQuoteItem[];
}

export async function fetchShippingQuote(input: {
  buyerId: string;
  listingId?: string;
  sellerId?: string;
  addressId?: number;
  destinationPostcode?: string;
  declaredValueGbp?: number;
}): Promise<ShippingQuoteResponse> {
  return fetchJson<ShippingQuoteResponse>('/shipping/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

// ── Payment intents (commerceApi.ts parity) ─────────────────────────────────
// Order creation alone never means paid — the order sits in 'created' until
// a payment intent settles. The web has no card-confirmation rail (Stripe
// PaymentSheet is the native surface), so callers must read the real intent
// status: 'succeeded' is the only success; anything else stays pending and
// is surfaced honestly, never as a completed payment.

export interface CommercePaymentIntent {
  id: string;
  status: string;
  clientSecret?: string | null;
  nextActionUrl?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

/** POST /payments/intents — idempotent per order; the server may return an
 *  existing bound intent, so the status is the truth, not the shape. */
export async function createCommercePaymentIntent(input: {
  orderId: string;
  idempotencyKey: string;
  /** Payment gateway — 'oneze_internal' settles the intent synchronously
   *  from the buyer's 1ZE pocket (mirrors mobile createOnezeCheckoutIntent);
   *  absent means the default card gateway. */
  gatewayId?: string;
}): Promise<CommercePaymentIntent> {
  const payload = await fetchJson<{ ok: boolean; intent: CommercePaymentIntent }>(
    '/payments/intents',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'commerce',
        orderId: input.orderId,
        idempotencyKey: input.idempotencyKey,
        ...(input.gatewayId ? { gatewayId: input.gatewayId } : {}),
      }),
    },
  );
  return payload.intent;
}

/** GET /payments/intents/:id — settlement polling / recovery read. */
export async function getPaymentIntentStatus(
  intentId: string,
): Promise<CommercePaymentIntent> {
  const payload = await fetchJson<{ ok: boolean; intent: CommercePaymentIntent }>(
    `/payments/intents/${encodeURIComponent(intentId)}`,
  );
  return payload.intent;
}

async function postOrderAction(orderId: string, action: string, body?: unknown): Promise<void> {
  await fetchJson(`/orders/${encodeURIComponent(orderId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function cancelOrder(orderId: string) {
  return postOrderAction(orderId, 'cancel');
}
export function shipOrder(orderId: string, input: { trackingNumber?: string; shippingProvider?: string }) {
  return postOrderAction(orderId, 'ship', input);
}
export function confirmDelivery(orderId: string) {
  return postOrderAction(orderId, 'deliver');
}
export function reviewOrder(orderId: string, input: { rating: number; text?: string }) {
  return postOrderAction(orderId, 'review', input);
}

// ── Offers (listingOffersApi.ts) ─────────────────────────────────────────────

interface OfferRow {
  id: string;
  listingId: string;
  buyerId?: string;
  sellerId?: string;
  offerPriceGbp?: number;
  amountGbp?: number;
  originalPriceGbp?: number;
  counterRound?: number;
  status: string;
  offeredByUserId?: string;
  orderId?: string | null;
  conversationId?: string | null;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string | null;
}

function mapOffer(r: OfferRow): ListingOffer {
  return {
    id: r.id,
    listingId: r.listingId,
    buyerId: r.buyerId ?? '',
    sellerId: r.sellerId ?? '',
    offerPriceGbp: r.offerPriceGbp ?? r.amountGbp ?? 0,
    originalPriceGbp: r.originalPriceGbp,
    counterRound: r.counterRound ?? 0,
    status: r.status as ListingOffer['status'],
    offeredByUserId: r.offeredByUserId ?? r.buyerId ?? '',
    orderId: r.orderId ?? null,
    conversationId: r.conversationId ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    expiresAt: r.expiresAt ?? undefined,
  };
}

/** Both directions — `/users/me/offers` returns every offer the viewer is a
 *  party to; the surface splits received/sent by sellerId. */
export async function fetchOffers(
  signal?: AbortSignal,
): Promise<ListingOffer[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: OfferRow[]; offers?: OfferRow[] }>(
    '/users/me/offers',
    undefined,
    { signal },
  );
  return (payload.items ?? payload.offers ?? []).map(mapOffer);
}

/**
 * Offer idempotency key — a retried submit must report the prior fan-out,
 * not mint a duplicate offer (mirrors mobile listingOffersApi).
 */
function offerIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `offer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CounterOfferResult {
  /** The new counter-offer row — the parent moves to 'countered'. */
  offer: ListingOffer | null;
}

interface OfferActionResponse {
  ok?: boolean;
  error?: string;
}

export async function respondToOffer(
  offerId: string,
  action: 'accept' | 'decline' | 'counter' | 'cancel',
  input?: {
    counterPriceGbp?: number;
    conversationId?: string;
    expiryHours?: number;
    idempotencyKey?: string;
  },
): Promise<void> {
  if (action === 'counter') {
    // POST /offers/:id/counter — the counter is a new offer row whose
    // contract mirrors createListingOfferOnApi (offerPriceGbp, not
    // counterPriceGbp).
    const payload = await fetchJson<OfferActionResponse>(
      `/offers/${encodeURIComponent(offerId)}/counter`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerPriceGbp: input?.counterPriceGbp,
          expiryHours: input?.expiryHours ?? 48,
          conversationId: input?.conversationId,
          idempotencyKey: input?.idempotencyKey ?? offerIdempotencyKey(),
        }),
      },
    );
    // A 200 {ok:false} envelope is a soft failure — reject so the caller's
    // optimistic row reverts instead of showing a change that never landed.
    if (payload.ok === false) {
      throw new ApiRequestError(payload.error ?? 'Could not send the counter', undefined, payload);
    }
    return;
  }
  const payload = await fetchJson<OfferActionResponse>(
    `/offers/${encodeURIComponent(offerId)}/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
  );
  if (payload.ok === false) {
    throw new ApiRequestError(payload.error ?? 'Could not update the offer', undefined, payload);
  }
}

/** POST /listings/:id/offers — mirrors mobile createListingOfferOnApi:
 *  the server needs the original price, expiry and an idempotency key. */
export async function makeOffer(
  listingId: string,
  offerPriceGbp: number,
  input: {
    originalPriceGbp?: number;
    expiryHours?: number;
    conversationId?: string;
    idempotencyKey?: string;
  } = {},
): Promise<ListingOffer> {
  const payload = await fetchJson<{ ok: boolean; offer?: OfferRow }>(
    `/listings/${encodeURIComponent(listingId)}/offers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId,
        offerPriceGbp,
        expiryHours: input.expiryHours ?? 48,
        conversationId: input.conversationId,
        idempotencyKey: input.idempotencyKey ?? offerIdempotencyKey(),
        metadata:
          input.originalPriceGbp !== undefined
            ? { originalPriceGbp: input.originalPriceGbp }
            : {},
      }),
    },
  );
  if (!payload.ok || !payload.offer) throw new Error('Offer not created');
  return mapOffer(payload.offer);
}

// ── Offer to likers (listingOffersApi.ts — seller-authored fan-out) ──────────
//
// POST /listings/:id/offers-to-likers creates one pending offer per
// wishlist liker, authored by the seller. The batch is idempotent on
// `idempotencyKey` — a retried submit reports the prior fan-out instead
// of double-sending. The caller owns the key's lifetime: keep it across
// retries of the same sheet session, mint a new one per send.

export interface SendOfferToLikersInput {
  listingId: string;
  /** Target price in GBP — canonical; discountPercent is informational. */
  offerPriceGbp: number;
  discountPercent?: number;
  expiryHours?: number;
  includeFreeShipping?: boolean;
  message?: string;
  maxRecipients?: number;
  idempotencyKey: string;
}

export interface OfferToLikersResult {
  batchKey: string;
  /** Total wishlist likers on the listing (excluding the seller). */
  likerCount: number;
  /** Offers actually created in this batch. */
  created: number;
  /** Likers not offered — already negotiating, or beyond the batch cap. */
  skipped: number;
  idempotent: boolean;
}

export async function sendOfferToLikers(
  input: SendOfferToLikersInput,
): Promise<OfferToLikersResult> {
  const payload = await fetchJson<{ ok: boolean; error?: string } & Partial<OfferToLikersResult>>(
    `/listings/${encodeURIComponent(input.listingId)}/offers-to-likers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offerPriceGbp: input.offerPriceGbp,
        discountPercent: input.discountPercent,
        expiryHours: input.expiryHours ?? 48,
        includeFreeShipping: input.includeFreeShipping ?? false,
        message: input.message,
        maxRecipients: input.maxRecipients,
        idempotencyKey: input.idempotencyKey,
      }),
    },
  );
  if (!payload.ok) {
    throw new ApiRequestError(payload.error ?? 'Failed to send offers to likers', undefined, payload);
  }
  return {
    batchKey: payload.batchKey ?? input.idempotencyKey,
    likerCount: payload.likerCount ?? 0,
    created: payload.created ?? 0,
    skipped: payload.skipped ?? 0,
    idempotent: payload.idempotent ?? false,
  };
}

// ── Dispatch extensions (commerceApi.ts) ─────────────────────────────────────

interface DispatchExtensionResultApi {
  id: string;
  orderId: string;
  days: number;
  proposedShipBy: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

/** Buyer accepts or declines a pending dispatch extension — mirrors mobile
 *  respondDispatchExtension. Acceptance returns the effective shipByDate. */
export async function respondDispatchExtension(
  orderId: string,
  accept: boolean,
  extensionId?: string,
): Promise<{ extension: DispatchExtensionResultApi; shipByDate: string | null }> {
  const payload = await fetchJson<{
    ok: boolean;
    extension: DispatchExtensionResultApi;
    shipByDate: string | null;
  }>(`/orders/${encodeURIComponent(orderId)}/dispatch-extension/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(extensionId ? { accept, extensionId } : { accept }),
  });
  return { extension: payload.extension, shipByDate: payload.shipByDate ?? null };
}

// ── Return cases (returnsApi.ts — mirrors backend routes/returns.ts) ─────────

interface ReturnCaseApi {
  id: string;
  orderId: string;
  status: string;
  reason?: string;
  description?: string | null;
  /** Buyer-attached evidence URLs — mirrors returnsApi.ReturnCase. */
  evidenceMediaUrls?: string[];
  requestedAmountGbp?: number | null;
  proposedRemedy?: ReturnRemedy | null;
  remedyAmountGbp?: number | null;
  inspectionNotes?: string | null;
  resolutionNotes?: string | null;
  returnCarrier?: string | null;
  returnTrackingNumber?: string | null;
  returnLabelUrl?: string | null;
  stepInEligibleAt?: string | null;
  appealedAt?: string | null;
  createdAt: string;
}

const RETURN_REASON_LABELS: Record<string, string> = {
  not_as_described: 'Item not as described',
  damaged: 'Arrived damaged',
  wrong_item: 'Wrong item sent',
  authenticity: 'Authenticity concern',
  missing_contents: 'Missing contents',
  changed_mind: 'Other reason',
};

/** Wire return case → domain — reason carries both the category and a
 *  human label so cards never render a raw enum. */
function mapReturnCase(r: ReturnCaseApi): ReturnCase {
  const reason = r.reason ?? 'changed_mind';
  return {
    id: r.id,
    orderId: r.orderId,
    status: r.status as ReturnCase['status'],
    reasonCategory: reason,
    reasonLabel:
      RETURN_REASON_LABELS[reason] ??
      reason.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    evidenceMediaUrls: r.evidenceMediaUrls ?? [],
    requestedAmountGbp: r.requestedAmountGbp ?? null,
    proposedRemedy: r.proposedRemedy ?? null,
    remedyAmountGbp: r.remedyAmountGbp ?? null,
    remedyNotes: r.resolutionNotes ?? r.inspectionNotes ?? null,
    returnCarrier: r.returnCarrier ?? null,
    returnTrackingNumber: r.returnTrackingNumber ?? null,
    returnLabelUrl: r.returnLabelUrl ?? null,
    stepInEligibleAt: r.stepInEligibleAt ?? null,
    appealedAt: r.appealedAt ?? null,
    createdAt: r.createdAt,
  };
}

/** Buyer initiates a return — POST /orders/:id/return-request. */
export async function requestReturn(
  orderId: string,
  input: {
    reason: string;
    description?: string;
    /** Uploaded evidence photo URLs — server accepts them on this route. */
    evidenceMediaUrls?: string[];
    requestedAmountGbp?: number;
  },
): Promise<{ returnCaseId: string; status: string }> {
  const payload = await fetchJson<{ ok: boolean; returnCaseId: string; status: string }>(
    `/orders/${encodeURIComponent(orderId)}/return-request`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return { returnCaseId: payload.returnCaseId, status: payload.status };
}

/** Active return case for an order — null when none exists (404). */
export async function fetchOrderReturnCase(
  orderId: string,
  signal?: AbortSignal,
): Promise<ReturnCase | null> {
  try {
    const payload = await fetchJson<{ ok: boolean; returnCase?: ReturnCaseApi }>(
      `/orders/${encodeURIComponent(orderId)}/return-case`,
      undefined,
      { signal },
    );
    return payload.returnCase ? mapReturnCase(payload.returnCase) : null;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
}

/** Buyer asks the platform to step in — POST /return-cases/:id/step-in. */
export async function requestReturnStepIn(returnCaseId: string, reason?: string): Promise<void> {
  await fetchJson(`/return-cases/${encodeURIComponent(returnCaseId)}/step-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

/** Seller decision on a pending return request. */
export async function respondToReturnCase(
  returnCaseId: string,
  input: { decision: 'approved' | 'rejected'; reason: string },
): Promise<void> {
  await fetchJson(`/return-cases/${encodeURIComponent(returnCaseId)}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Seller provides return shipping — carrier + tracking (+ hosted label). */
export async function provideReturnShipment(
  returnCaseId: string,
  input: { carrier: string; trackingNumber: string; labelUrl?: string },
): Promise<void> {
  await fetchJson(`/return-cases/${encodeURIComponent(returnCaseId)}/reverse-shipment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Seller confirms the returned item arrived. */
export async function confirmReturnReceipt(returnCaseId: string): Promise<void> {
  await fetchJson(`/return-cases/${encodeURIComponent(returnCaseId)}/receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

/** Seller records the inspection outcome. */
export async function recordReturnInspection(
  returnCaseId: string,
  input: { notes: string; condition: string },
): Promise<void> {
  await fetchJson(`/return-cases/${encodeURIComponent(returnCaseId)}/inspection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Seller proposes a remedy — amountGbp only for partial_refund. */
export async function proposeReturnRemedy(
  returnCaseId: string,
  input: { remedy: ReturnRemedy; amountGbp?: number; notes?: string },
): Promise<void> {
  await fetchJson(`/return-cases/${encodeURIComponent(returnCaseId)}/remedy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Buyer accepts the proposed remedy. */
export async function acceptReturnRemedy(returnCaseId: string): Promise<void> {
  await fetchJson(`/return-cases/${encodeURIComponent(returnCaseId)}/remedy/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

/** Buyer rejects the proposed remedy — escalates to platform review. */
export async function rejectReturnRemedy(returnCaseId: string, reason: string): Promise<void> {
  await fetchJson(`/return-cases/${encodeURIComponent(returnCaseId)}/remedy/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

/** Buyer appeals a rejected return — escalates to platform review. */
export async function appealReturnCase(returnCaseId: string, reason: string): Promise<void> {
  await fetchJson(`/return-cases/${encodeURIComponent(returnCaseId)}/appeal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

// ── Shipping labels (commerceApi.ts) ─────────────────────────────────────────

/**
 * POST /orders/:id/shipping-label — seller-authenticated, idempotent.
 * The backend contract returns `shipping_label_url` (snake_case) — accept
 * every alias and never fabricate a URL client-side.
 */
export async function generateShippingLabel(orderId: string): Promise<{
  trackingNumber: string | null;
  shippingLabelUrl: string | null;
}> {
  const payload = await fetchJson<{
    ok: boolean;
    trackingNumber?: string | null;
    tracking_number?: string | null;
    shipping_label_url?: string | null;
    shippingLabelUrl?: string | null;
    labelUrl?: string | null;
  }>(`/orders/${encodeURIComponent(orderId)}/shipping-label`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return {
    trackingNumber: payload.trackingNumber ?? payload.tracking_number ?? null,
    shippingLabelUrl:
      payload.shipping_label_url ?? payload.shippingLabelUrl ?? payload.labelUrl ?? null,
  };
}

export type { DispatchExtension };

// ── Wallet (walletsApi.ts snapshot shape) ────────────────────────────────────

interface WalletSnapshotApi {
  ok?: boolean;
  snapshot?: {
    userId?: string;
    balanceGbp?: number;
    availableGbp?: number;
    pendingGbp?: number;
    currency?: string;
    updatedAt?: string;
  };
  payoutSummary?: {
    currentPendingWithdrawalGbp?: number;
    cumulativeWithdrawnGbp?: number;
  };
}

export async function fetchWalletSnapshot(
  userId: string,
  signal?: AbortSignal,
): Promise<WalletAccount | null> {
  const payload = await fetchJson<WalletSnapshotApi>(
    `/wallets/${encodeURIComponent(userId)}/snapshot`,
    undefined,
    { signal },
  );
  const s = payload.snapshot;
  if (!s) return null;
  return {
    userId: s.userId ?? userId,
    balanceGbp: s.balanceGbp ?? 0,
    availableGbp: s.availableGbp ?? 0,
    pendingGbp: s.pendingGbp ?? 0,
    currentPendingWithdrawalGbp: payload.payoutSummary?.currentPendingWithdrawalGbp ?? 0,
    cumulativeWithdrawnGbp: payload.payoutSummary?.cumulativeWithdrawnGbp ?? 0,
    currency: s.currency ?? 'GBP',
  };
}
