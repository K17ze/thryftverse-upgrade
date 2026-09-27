/**
 * Checkout-scoped live service — the /checkout + /bag instrument reads and
 * the order-create call. Mirrors the mobile commerceApi slice
 * (listUserAddresses / createUserAddress / listUserPaymentMethods /
 * createOrder):
 *
 *  - Addresses ride GET/POST /users/:id/addresses — the server-owned rows
 *    carry the numeric ids the order and shipping-quote routes validate.
 *  - Payment methods come from GET /v2/payments/methods — the
 *    Stripe-projected list (each item's numeric `id` is the
 *    user_payment_methods row POST /orders accepts). The legacy
 *    /users/:id/payment-methods write path is disabled server-side
 *    (410 TOKENISED_PAYMENT_METHOD_REQUIRED) — the web has no card
 *    tokenisation rail, so there is no createPaymentMethod here.
 *  - createCheckoutOrder posts the full /orders field set, including
 *    shippingCarrierId — the route rejects a quote bound without its
 *    carrier (SHIPPING_QUOTE_INVALID), so the two always travel together.
 */

import { fetchJson } from '../http';
import type { ShippingQuoteResponse } from './commerce';
import type { Address, PaymentMethod } from '@/lib/contracts/domain';

// ── Addresses (GET/POST /users/:userId/addresses) ────────────────────────────

interface LiveAddressRow {
  id: number;
  userId: string;
  name: string;
  street: string;
  city: string;
  postcode: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

function mapLiveAddress(row: LiveAddressRow): Address {
  return {
    // The picker works in string ids; the numeric wire id round-trips
    // through Number(id) at order/quote time.
    id: String(row.id),
    name: row.name,
    street: row.street,
    city: row.city,
    postcode: row.postcode,
    isDefault: row.isDefault === true,
  };
}

export async function fetchLiveAddresses(
  userId: string,
  signal?: AbortSignal,
): Promise<Address[]> {
  const payload = await fetchJson<{ ok: boolean; items?: LiveAddressRow[] }>(
    `/users/${encodeURIComponent(userId)}/addresses`,
    undefined,
    { signal },
  );
  return (payload.items ?? []).map(mapLiveAddress);
}

export async function createLiveAddress(
  userId: string,
  input: { name: string; street: string; city: string; postcode: string; isDefault?: boolean },
): Promise<Address> {
  const payload = await fetchJson<{ ok: boolean; item?: LiveAddressRow }>(
    `/users/${encodeURIComponent(userId)}/addresses`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        street: input.street,
        city: input.city,
        postcode: input.postcode,
        isDefault: input.isDefault ?? false,
      }),
    },
  );
  if (!payload.item) throw new Error('Address could not be saved');
  return mapLiveAddress(payload.item);
}

// ── Payment methods (GET /v2/payments/methods) ───────────────────────────────

interface LivePaymentMethodRow {
  /** Numeric user_payment_methods id — the value POST /orders accepts as
   *  paymentMethodId. */
  id: number;
  userId: string;
  provider?: string;
  providerPaymentMethodId?: string;
  type?: string;
  brand?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  label?: string;
  details?: string;
  isDefault?: boolean;
  status?: string;
  walletType?: string | null;
}

const KNOWN_CARD_BRANDS = new Set(['visa', 'mastercard', 'amex']);

function mapLivePaymentMethod(row: LivePaymentMethodRow): PaymentMethod {
  const brand = typeof row.brand === 'string' ? row.brand.toLowerCase() : '';
  const expiry =
    Number.isFinite(row.expiryMonth) && Number.isFinite(row.expiryYear)
      ? `${String(row.expiryMonth).padStart(2, '0')}/${String(Number(row.expiryYear) % 100).padStart(2, '0')}`
      : undefined;
  const isBank = row.type === 'bank_account';
  return {
    id: String(row.id),
    type: isBank ? 'bank_account' : 'card',
    last4: row.last4 ?? '',
    brand: KNOWN_CARD_BRANDS.has(brand)
      ? (brand as PaymentMethod['brand'])
      : undefined,
    bankName: isBank ? (row.label ?? 'Bank account') : undefined,
    expiry,
    isDefault: row.isDefault === true,
  };
}

/**
 * Tokenised payment methods — provider truth only. When the provider isn't
 * configured the route answers PAYMENT_PROVIDER_UNAVAILABLE; callers surface
 * that as an honest empty/error state, never a fixture or localStorage row.
 */
export async function fetchLivePaymentMethods(
  signal?: AbortSignal,
): Promise<PaymentMethod[]> {
  const payload = await fetchJson<{
    ok: boolean;
    provider?: string;
    items?: LivePaymentMethodRow[];
  }>('/v2/payments/methods', undefined, { signal });
  return (payload.items ?? []).map(mapLivePaymentMethod);
}

// ── Shipping quotes (POST /shipping/quote) ───────────────────────────────────
// Same endpoint commerceService.fetchShippingQuote calls, with the fuller
// input the checkout needs: preferredCarrierId (the buyer's selection hint —
// the route sorts that carrier's quotes first). Response shape is the
// commerce module's ShippingQuoteResponse — persisted quotes whose quoteIds
// POST /orders accepts.

export async function fetchCheckoutShippingQuote(input: {
  buyerId: string;
  listingId?: string;
  sellerId?: string;
  /** Server address row id — binds the persisted quote to this address. */
  addressId?: number;
  destinationPostcode?: string;
  preferredCarrierId?: string;
  declaredValueGbp?: number;
}): Promise<ShippingQuoteResponse> {
  return fetchJson<ShippingQuoteResponse>('/shipping/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

// ── Order create (POST /orders) ──────────────────────────────────────────────

/**
 * Full-field POST /orders. Differs from commerceService.createOrder by
 * carrying shippingCarrierId: the route validates the persisted quote's
 * carrier against the payload, so shippingQuoteId without shippingCarrierId
 * is a guaranteed SHIPPING_QUOTE_INVALID.
 */
export async function createCheckoutOrder(input: {
  listingId: string;
  buyerId: string;
  idempotencyKey: string;
  /** Server address row id — only ever a number on the wire. */
  addressId?: number;
  /** Tokenised payment-method row id (numeric /v2/payments/methods id). */
  paymentMethodId?: number;
  /** Persisted quote id bound to this listing + address + carrier. */
  shippingQuoteId?: string;
  shippingCarrierId?: string;
  /** 'oneze_internal' pays from the buyer's 1ZE wallet. */
  paymentGatewayId?: string;
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
