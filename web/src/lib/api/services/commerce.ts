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
  OrderTrackingEvent,
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
  try {
    const payload = await fetchJson<{ ok: boolean; order?: CommerceUserOrderApi }>(
      `/orders/${encodeURIComponent(id)}`,
      undefined,
      { signal },
    );
    if (!payload.ok || !payload.order) return null;
    return mapCommerceUserOrder(payload.order);
  } catch (error) {
    // 404 is a verdict, not a failure — the detail surfaces render their
    // not-found state on null; every other error propagates to retry.
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
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

export interface OrderCheckoutConfirmation {
  addressId: number;
  paymentMethodId: number | null;
  shippingCarrierId: string;
  shippingQuoteId: string;
  verificationRequested: boolean;
  subtotalGbp: number;
  platformChargeGbp: number;
  postageFeeGbp: number;
  totalGbp: number;
  quoteVersion: string;
  quoteHash: string;
}

/**
 * PATCH /orders/:orderId/checkout — order-bound checkout re-bind, the web
 * port of native completeOrderCheckout. Re-attaches the buyer's current
 * address, payment method and shipping quote to a 'created' order; the
 * server re-prices every charge line and returns the authoritative
 * breakdown. Re-binding releases a parked payment intent, so it 409s
 * (ORDER_PAYMENT_IN_PROGRESS) while a provider-side attempt is genuinely
 * in flight and 410s (CHECKOUT_RESERVATION_EXPIRED) once the hold lapses.
 */
export async function completeOrderCheckout(
  orderId: string,
  input: {
    addressId: number;
    paymentMethodId?: number;
    shippingQuoteId: string;
    shippingCarrierId: string;
    /** Item verification add-on flag; omitted preserves the stored value. */
    verificationRequested?: boolean;
  },
): Promise<{ orderId: string; checkout: OrderCheckoutConfirmation }> {
  const payload = await fetchJson<{
    ok: true;
    orderId: string;
    checkout: OrderCheckoutConfirmation;
  }>(`/orders/${encodeURIComponent(orderId)}/checkout`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { orderId: payload.orderId, checkout: payload.checkout };
}
export function shipOrder(orderId: string, input: { trackingNumber?: string; shippingProvider?: string }) {
  return postOrderAction(orderId, 'ship', input);
}
export function confirmDelivery(orderId: string) {
  return postOrderAction(orderId, 'deliver');
}
/** POST /orders/:orderId/review — the schema takes `comment`/`photoUrls`
 *  (supportReviews.ts orderReviewBodySchema); photoUrls must be finalized
 *  uploads owned by the requester. Sends the Idempotency-Key header like
 *  native (reviewApi.ts createOrderReview): the stable per-order key lets
 *  a retry after a dropped response return the already-created review
 *  instead of colliding on the unique order_id constraint. */
export function reviewOrder(
  orderId: string,
  input: { rating: number; comment?: string; photoUrls?: string[] },
) {
  return fetchJson(`/orders/${encodeURIComponent(orderId)}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `review_${orderId}`,
    },
    body: JSON.stringify({
      rating: input.rating,
      comment: input.comment,
      photoUrls: input.photoUrls,
    }),
  });
}

/** GET /orders/:orderId/review — the persisted review row incl. the
 *  platform auto-feedback flag (isAuto), media and seller response.
 *  404/no row resolves to null — the composer opens fresh. */
export interface OrderReviewRow {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  photoUrls?: string[];
  sellerResponse?: { text: string; createdAt: string };
  isAuto: boolean;
  autoReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchOrderReview(
  orderId: string,
  signal?: AbortSignal,
): Promise<OrderReviewRow | null> {
  const payload = await fetchJson<{ ok: boolean; review?: OrderReviewRow | null }>(
    `/orders/${encodeURIComponent(orderId)}/review`,
    undefined,
    { signal },
  );
  return payload.ok ? (payload.review ?? null) : null;
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

export interface DispatchExtensionResultApi {
  id: string;
  orderId: string;
  days: number;
  proposedShipBy: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

/**
 * Seller proposes a dispatch extension (1–30 days) — mirrors mobile
 * proposeDispatchExtension. Buyer approval only: the new ship-by takes
 * effect only if the buyer accepts. The backend 409s when an extension is
 * already pending (code EXTENSION_PENDING), when the order isn't 'paid',
 * or when the cumulative accepted-days cap is hit (EXTENSION_LIMIT_EXCEEDED).
 */
export async function proposeDispatchExtension(
  orderId: string,
  days: number,
  note?: string,
): Promise<DispatchExtensionResultApi> {
  const payload = await fetchJson<{ ok: boolean; extension: DispatchExtensionResultApi }>(
    `/orders/${encodeURIComponent(orderId)}/dispatch-extension`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note ? { days, note } : { days }),
    },
  );
  return payload.extension;
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

// ── Parcel events (commerceApi.ts — GET /orders/:orderId/parcel/events) ──────
//
// The carrier's scan trail. The endpoint projects raw order_parcel_events
// rows (provider/eventType/occurredAt/payload); this mapper translates the
// wire vocabulary onto the OrderTrackingEvent the tracking section renders.
// `source: 'orders_status_only'` means the parcel table isn't provisioned —
// an empty trail, never an error.

export interface ParcelEventsResult {
  source: 'orders_with_parcel_events' | 'orders_status_only';
  order: {
    status: string;
    trackingNumber: string | null;
    shippingProvider: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
  events: OrderTrackingEvent[];
}

interface ParcelEventApi {
  id: number;
  provider: string;
  eventType: string;
  providerEventId: string | null;
  trackingId: string | null;
  occurredAt: string | null;
  receivedAt: string;
  payload?: Record<string, unknown> | null;
}

const PARCEL_EVENT_LABEL: Record<string, string> = {
  picked_up: 'Picked up by the carrier',
  collection_confirmed: 'Collection confirmed',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  delivery_failed: 'Delivery failed',
  lost: 'Parcel reported lost',
  damaged: 'Parcel reported damaged',
  returned: 'Returned to sender',
};

const PARCEL_EVENT_TONE: Record<string, OrderTrackingEvent['tone']> = {
  delivery_failed: 'warning',
  lost: 'danger',
  damaged: 'danger',
  returned: 'warning',
};

function humaniseEventType(eventType: string): string {
  return eventType
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function mapParcelEvent(e: ParcelEventApi): OrderTrackingEvent {
  const payload = e.payload ?? null;
  const location =
    payload && typeof payload.location === 'string' ? payload.location : null;
  const detail =
    payload && typeof payload.description === 'string'
      ? payload.description
      : payload && typeof payload.detail === 'string'
        ? payload.detail
        : null;
  return {
    id: String(e.id),
    at: e.occurredAt ?? e.receivedAt,
    label: PARCEL_EVENT_LABEL[e.eventType] ?? humaniseEventType(e.eventType),
    detail,
    location,
    tone: PARCEL_EVENT_TONE[e.eventType] ?? 'normal',
  };
}

/** GET /orders/:orderId/parcel/events — participant-gated carrier scans. */
export async function fetchParcelEvents(
  orderId: string,
  signal?: AbortSignal,
): Promise<ParcelEventsResult> {
  const payload = await fetchJson<{
    ok: boolean;
    source?: ParcelEventsResult['source'];
    order?: ParcelEventsResult['order'];
    items?: ParcelEventApi[];
  }>(`/orders/${encodeURIComponent(orderId)}/parcel/events`, undefined, { signal });
  return {
    source: payload.source ?? 'orders_status_only',
    order: payload.order ?? null,
    events: (payload.items ?? []).map(mapParcelEvent),
  };
}

// ── Buyer protection (commerceApi.ts fetchBuyerProtection/createClaim) ───────
//
// GET /orders/:orderId/protection is buyer-gated; claim amounts travel in
// minor units (pence) on the wire.

export interface BuyerProtectionClaim {
  ticketId: string;
  topicId: string;
  /** Server-rendered human label — display it directly. */
  topicLabel: string;
  status: string;
  createdAt: string;
}

export interface BuyerProtectionInfo {
  orderId: string;
  /** Protection fee the buyer paid, in pence. */
  feeGbpMinor: number;
  status: 'covered' | 'not_covered';
  /** Coverage cap in pence — the server caps at £500. */
  coverageAmountGbpMinor: number;
  eligibleUntil: string;
  claims: BuyerProtectionClaim[];
}

export async function fetchOrderProtection(
  orderId: string,
  signal?: AbortSignal,
): Promise<BuyerProtectionInfo | null> {
  const payload = await fetchJson<{ ok: boolean; protection?: BuyerProtectionInfo }>(
    `/orders/${encodeURIComponent(orderId)}/protection`,
    undefined,
    { signal },
  );
  return payload.ok ? (payload.protection ?? null) : null;
}

/** POST /orders/:orderId/protection/claim — opens a buyer-protection case.
 *  Idempotent server-side per open claim; the replayed ticket returns. */
export async function createProtectionClaim(
  orderId: string,
  input: { reason: string; description: string; evidenceUrls?: string[] },
): Promise<{ ticketId: string; status: string; createdAt: string }> {
  const payload = await fetchJson<{
    ok: boolean;
    claim: { ticketId: string; status: string; createdAt: string };
  }>(`/orders/${encodeURIComponent(orderId)}/protection/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return payload.claim;
}

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

// ── Ledger-backed wallet balances (walletApi.ts getSellerWalletBalances) ─────
//
// GET /users/:id/wallet/balances is the canonical money read: available,
// escrow-pending and rolling-reserve figures are computed server-side from
// ledger_entries — unlike /wallets/:id/snapshot, whose balanceGbp blob is
// client-asserted. A failed read must surface as an error to the caller,
// never collapse to £0.

export interface WalletPendingBalanceItem {
  orderId: string;
  listingTitle: string | null;
  amountGbp: number;
  orderStatus: string;
  deliveredAt: string | null;
  releaseScheduledAt: string | null;
}

export interface WalletLedgerBalances {
  availableGbp: number;
  pendingGbp: number;
  heldInReserveGbp: number;
  pendingBreakdown: WalletPendingBalanceItem[];
}

interface WalletBalancesApi {
  ok?: boolean;
  balances?: {
    availableGbp?: number;
    pendingGbp?: number;
    heldInReserveGbp?: number;
  };
  pendingBreakdown?: Array<{
    orderId?: string;
    listingTitle?: string | null;
    amountGbp?: number;
    orderStatus?: string;
    deliveredAt?: string | null;
    releaseScheduledAt?: string | null;
  }>;
}

/** Ledger-backed seller balances — throws on failure; callers must carry a
 *  balance-error state rather than render £0.00. */
export async function fetchWalletBalances(
  userId: string,
  signal?: AbortSignal,
): Promise<WalletLedgerBalances> {
  const payload = await fetchJson<WalletBalancesApi>(
    `/users/${encodeURIComponent(userId)}/wallet/balances`,
    undefined,
    { signal },
  );
  return {
    availableGbp: payload.balances?.availableGbp ?? 0,
    pendingGbp: payload.balances?.pendingGbp ?? 0,
    heldInReserveGbp: payload.balances?.heldInReserveGbp ?? 0,
    pendingBreakdown: (payload.pendingBreakdown ?? []).map((row) => ({
      orderId: row.orderId ?? '',
      listingTitle: row.listingTitle ?? null,
      amountGbp: row.amountGbp ?? 0,
      orderStatus: row.orderStatus ?? '',
      deliveredAt: row.deliveredAt ?? null,
      releaseScheduledAt: row.releaseScheduledAt ?? null,
    })),
  };
}

export interface WalletPayoutSummary {
  currentPendingWithdrawalGbp: number;
  cumulativeWithdrawnGbp: number;
}

/**
 * Server-computed payout summary (the `withdrawal_pending` ledger account +
 * cumulative withdrawals). It rides on the snapshot endpoint — the
 * client-asserted `snapshot` blob is deliberately ignored here. Returns null
 * on any failure or when no snapshot row exists: an in-flight payout is
 * surfaced only on positive knowledge, never guessed.
 */
export async function fetchWalletPayoutSummary(
  userId: string,
  signal?: AbortSignal,
): Promise<WalletPayoutSummary | null> {
  try {
    const payload = await fetchJson<WalletSnapshotApi>(
      `/wallets/${encodeURIComponent(userId)}/snapshot`,
      undefined,
      { signal },
    );
    const s = payload.payoutSummary;
    if (!s) return null;
    return {
      currentPendingWithdrawalGbp: s.currentPendingWithdrawalGbp ?? 0,
      cumulativeWithdrawnGbp: s.cumulativeWithdrawnGbp ?? 0,
    };
  } catch {
    return null;
  }
}
