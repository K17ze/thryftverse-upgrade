/**
 * Web commerce service — mirrors frontend/src/services/commerceApi.ts and
 * listingOffersApi.ts. Orders, order actions, offers, wallet snapshot,
 * saved addresses and payment methods.
 */

import { fetchJson, getAuthSession } from '../http';
import {
  mapCommerceUserOrder,
  mapToBaseOrder,
  type CommerceUserOrderApi,
} from '../mappers';
import type { CommerceOrder, Order } from '@/lib/contracts/domain';

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

export async function respondToOffer(
  offerId: string,
  action: 'accept' | 'decline' | 'counter' | 'cancel',
  counterPriceGbp?: number,
): Promise<void> {
  await fetchJson(`/offers/${encodeURIComponent(offerId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: counterPriceGbp !== undefined ? JSON.stringify({ counterPriceGbp }) : undefined,
  });
}

export async function makeOffer(listingId: string, offerPriceGbp: number): Promise<ListingOffer> {
  const payload = await fetchJson<{ ok: boolean; offer?: OfferRow }>(
    `/listings/${encodeURIComponent(listingId)}/offers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerPriceGbp }),
    },
  );
  if (!payload.ok || !payload.offer) throw new Error('Offer not created');
  return mapOffer(payload.offer);
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
