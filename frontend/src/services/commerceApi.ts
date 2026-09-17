import { fetchJson } from '../lib/apiClient';
import type { DispatchExtension, FulfilmentSnapshot } from '../components/orders/orderCapabilities';

export interface CommerceAddress {
  id: number;
  userId: string;
  name: string;
  // Address lines
  streetAddress: string;      // Primary street address (mapped from backend `street`)
  apartment?: string;         // Apartment, suite, unit, floor (not stored by backend)
  // Location hierarchy
  city: string;               // City / Town / Village
  region?: string;            // State (US), Province (CA), County (UK), etc. (not stored by backend)
  postalCode: string;         // ZIP/Postcode/PIN (mapped from backend `postcode`)
  countryCode: string;        // ISO 3166-1 alpha-2 (not stored by backend)
  country: string;            // Display name (not stored by backend)
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// Backend address row shape (what the API actually returns)
interface BackendAddressRow {
  id: number;
  userId: string;
  name: string;
  street: string;
  city: string;
  postcode: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// Map backend response to frontend CommerceAddress
function mapBackendAddress(row: BackendAddressRow): CommerceAddress {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    streetAddress: row.street,
    apartment: undefined,
    city: row.city,
    region: undefined,
    postalCode: row.postcode,
    countryCode: '',
    country: '',
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface CommercePaymentMethod {
  id: number;
  userId: string;
  provider: 'stripe';
  providerCustomerId: string;
  providerPaymentMethodId: string;
  type: 'card' | 'apple_pay' | 'google_pay' | 'bank_account';
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  label: string;
  details: string;
  isDefault: boolean;
  status: 'active';
  redisplayConsent: string;
  walletType?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StripeSetupSheetConfiguration {
  provider: 'stripe';
  setupIntentId: string;
  setupIntentClientSecret: string;
  customerId: string;
  customerSessionClientSecret: string;
  publishableKey: string;
  merchantDisplayName: string;
  returnUrl: string;
}

export interface StripeOrderSheetConfiguration {
  provider: 'stripe';
  orderId: string;
  paymentIntentClientSecret: string;
  customerId: string;
  customerSessionClientSecret: string;
  publishableKey: string;
  merchantDisplayName: string;
  merchantCountryCode: string;
  currency: string;
  returnUrl: string;
  applePayEnabled: boolean;
  googlePayEnabled: boolean;
}

export interface CommerceOrder {
  id: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  listingTitle: string;
  listingImageUrl: string | null;
  subtotalGbp: number;
  buyerProtectionFeeGbp: number;
  platformChargeGbp: number;
  postageFeeGbp: number;
  totalGbp: number;
  status: string;
  addressId: number | null;
  paymentMethodId: number | null;
  shippingCarrierId: string | null;
  shippingProvider: string | null;
  trackingNumber: string | null;
  shippingLabelUrl: string | null;
  shippingQuoteGbp: number | null;
  /**
   * Buyer-requested item verification add-on captured at checkout.
   * Optional for backward compatibility with orders that predate the
   * orders.verification_requested column.
   */
  verificationRequested?: boolean;
  shippedAt: string | null;
  deliveredAt: string | null;
  /** ISO timestamp the buyer paid; anchors the dispatch SLA clock. */
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
  buyer: { id: string; username: string; avatar: string | null } | null;
  seller: { id: string; username: string; avatar: string | null } | null;
  /**
   * Immutable snapshot of the buyer-selected shipping service, captured at
   * checkout. When present, the seller's guided dispatch flow shows the exact
   * service the buyer paid for and suppresses the generic carrier picker.
   * Backend-provided; optional for backward compatibility with older orders.
   */
  fulfilmentSnapshot?: FulfilmentSnapshot | null;
  /**
   * Server-derived ship-by deadline (ISO 8601). The seller must dispatch by
   * this date or risk cancellation / SLA penalties. Server-computed: the
   * latest accepted dispatch extension wins, otherwise paid_at +
   * dispatch_sla_days.
   */
  shipByDate?: string | null;
  /**
   * Server-derived inspection window deadline (ISO 8601). Null until the
   * order is delivered; the client renders it but never invents one.
   */
  inspectionDeadlineAt?: string | null;
  /**
   * Server-computed escrow money projection: the scheduled auto-release and
   * the actual release timestamp (null until released).
   */
  moneyProjection?: {
    estimatedReleaseAt: string | null;
    releasedAt: string | null;
  } | null;
  /**
   * Latest pending dispatch extension awaiting buyer response, or null.
   * Accepted/declined extensions are folded into `shipByDate` server-side.
   */
  dispatchExtension?: DispatchExtension | null;
  /**
   * Recorded seller SLA defect flag (migration 284). Present when the
   * platform's auto-feedback sweep detected the order past its effective
   * ship-by while still awaiting dispatch. This is a platform flag, not a
   * review — surfaces render it as a breach notice, never as feedback
   * authored by the buyer.
   */
  slaBreach?: {
    breachType: 'dispatch_sla';
    shipBy: string;
    detectedAt: string;
  } | null;
  /**
   * Server-derived open-resolution flag (open protection/return/support
   * ticket or open return case). Same predicate as the list endpoint —
   * the detail screen should prefer this over a separately-fetched ticket
   * store that may lag the order payload.
   */
  hasOpenResolution?: boolean;
}

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
  metadata: Record<string, unknown>;
}

export interface ServiceabilityCarrier {
  id: string;
  label: string;
  priceFromGbp: number;
  etaMinDays: number;
  etaMaxDays: number;
  tracking: boolean;
  liveConfigured: boolean;
}

export interface ShippingServiceabilityResponse {
  ok: true;
  capabilities: {
    countryCluster: string;
    countryCode: string;
    effectiveCountryCode: string;
    policyVersion: string;
  };
  serviceability: {
    fromPostcode: string | null;
    toPostcode: string | null;
    serviceable: boolean;
  };
  carriers: ServiceabilityCarrier[];
}

interface ListAddressesResponse {
  ok: true;
  items: BackendAddressRow[];
}

interface CreateAddressResponse {
  ok: true;
  item: BackendAddressRow;
}

interface ListPaymentMethodsResponse {
  ok: true;
  items: CommercePaymentMethod[];
}

interface CreateOrderResponse {
  ok: true;
  order: CommerceOrder;
}

interface GetOrderResponse {
  ok: true;
  order: CommerceOrder;
}

export interface ShippingQuoteResponse {
  ok: true;
  source: 'live' | 'fallback' | 'unavailable';
  originPostcode: string;
  destinationPostcode: string;
  recommendedQuote: ShippingQuoteItem | null;
  quotes: ShippingQuoteItem[];
}

export interface PaymentIntentStatusResponse {
  /** Server intent id — the backend serializer emits `id` (payment_intents.id). */
  id: string;
  gatewayId: string;
  channel?: string;
  orderId?: string | null;
  status: string;
  clientSecret: string | null;
  nextActionUrl: string | null;
  providerStatus?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

/**
 * Result of POST /payments/intents.
 *
 * `idempotent: true` means the server returned an EXISTING intent — either
 * an idempotency-key replay or the intent already bound to the order
 * (order-payment-binding rule: one intent per order). Callers must read
 * `intent.status`/`intent.gatewayId` rather than assuming a usable
 * `clientSecret`: a bound intent can be in-flight, terminal, or on a
 * different gateway (e.g. a failed oneze_internal intent replayed to a
 * card-payment request).
 */
export interface CreatePaymentIntentResult {
  intent: PaymentIntentStatusResponse;
  idempotent: boolean;
}

export interface CommerceUserOrder {
  id: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  listingTitle: string | null;
  listingImageUrl: string | null;
  status: string;
  subtotalGbp: number;
  postageFeeGbp: number;
  totalGbp: number;
  trackingNumber: string | null;
  shippingProvider: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  buyerUsername: string | null;
  sellerUsername: string | null;
  /** Server-derived ship-by deadline (ISO 8601). Optional for older orders. */
  shipByDate?: string | null;
  /** Immutable purchased-service snapshot (optional for older orders). */
  fulfilmentSnapshot?: FulfilmentSnapshot | null;
  /** Whether a buyer-authored review exists for this order (server-derived). */
  hasReview?: boolean;
  /** Server-derived: an open protection claim / return / support ticket
   *  is attached to this order. Drives the dispute badge in list rows. */
  hasOpenResolution?: boolean;
}

export interface OrderParcelEvent {
  id: number;
  provider: string;
  eventType:
    | 'picked_up'
    | 'in_transit'
    | 'out_for_delivery'
    | 'delivered'
    | 'collection_confirmed'
    | 'delivery_failed'
    | 'returned'
    // Seller-asserted drop-off for integrated-label orders — NOT carrier
    // evidence. Written by POST /orders/:id/fulfilment/handoff-assertion.
    | 'handoff_asserted';
  providerEventId: string | null;
  trackingId: string | null;
  occurredAt: string | null;
  receivedAt: string;
  payload: Record<string, unknown>;
}

interface ListOrdersResponse {
  ok: true;
  items: CommerceUserOrder[];
  nextCursor: string | null;
  /** Server-truthful count of orders needing this user's action —
   *  a page-scoped count would under-report past page 1. */
  needsActionCount?: number;
}

export interface ListUserOrdersParams {
  role?: 'buyer' | 'seller' | 'all';
  status?: string;
  classification?: 'needs_action' | 'active' | 'completed' | 'cancelled';
  query?: string;
  year?: number;
  cursor?: string;
  limit?: number;
}

export interface ListUserOrdersResult {
  items: CommerceUserOrder[];
  nextCursor: string | null;
  needsActionCount: number | null;
}

interface ListOrderParcelEventsResponse {
  ok: true;
  source: 'orders_with_parcel_events' | 'orders_status_only';
  order: {
    id: string;
    status: string;
    trackingNumber: string | null;
    shippingProvider: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  };
  items: OrderParcelEvent[];
}

export interface CreateAddressInput {
  name: string;
  streetAddress: string;
  apartment?: string;
  city: string;
  region?: string;
  postalCode: string;
  countryCode: string;
  country: string;
  isDefault?: boolean;
}

export interface CreateOrderInput {
  buyerId: string;
  listingId: string;
  idempotencyKey: string;
  shippingQuoteId: string;
  addressId?: number;
  paymentMethodId?: number;
  /** When 'oneze_internal', the order will be paid via the buyer's 1ZE wallet */
  paymentGatewayId?: string;
  platformChargeGbp?: number;
  buyerProtectionFeeGbp?: number;
  postageFeeGbp?: number;
  shippingCarrierId?: string;
  /** Wallet balance to debit (GBP) — when > 0, the order uses split-tender */
  walletDebitGbp?: number;
  /**
   * Item verification add-on — the buyer asks Thryft to run the listing
   * through the authentication pipeline. No fee is charged; persisted as
   * orders.verification_requested.
   */
  verificationRequested?: boolean;
}

export interface ShippingQuoteInput {
  buyerId: string;
  listingId?: string;
  sellerId?: string;
  addressId?: number;
  originPostcode?: string;
  destinationPostcode?: string;
  preferredCarrierId?: string;
  parcelWeightKg?: number;
  declaredValueGbp?: number;
}

export interface ShippingServiceabilityInput {
  buyerId?: string;
  countryCode?: string;
  residencyCountryCode?: string | null;
}

export async function listUserAddresses(userId: string): Promise<CommerceAddress[]> {
  const payload = await fetchJson<ListAddressesResponse>(`/users/${encodeURIComponent(userId)}/addresses`);
  return payload.items.map(mapBackendAddress);
}

export async function createUserAddress(
  userId: string,
  input: CreateAddressInput
): Promise<CommerceAddress> {
  // Map frontend field names to backend field names
  const backendInput = {
    name: input.name,
    street: input.streetAddress,
    city: input.city,
    postcode: input.postalCode,
    isDefault: input.isDefault ?? false,
  };
  const payload = await fetchJson<CreateAddressResponse>(
    `/users/${encodeURIComponent(userId)}/addresses`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendInput),
    }
  );

  return mapBackendAddress(payload.item);
}

export async function deleteUserAddress(userId: string, addressId: number): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/users/${encodeURIComponent(userId)}/addresses/${addressId}`,
    { method: 'DELETE' }
  );
}

export async function listUserPaymentMethods(userId: string): Promise<CommercePaymentMethod[]> {
  void userId;
  const payload = await fetchJson<ListPaymentMethodsResponse>(
    '/v2/payments/methods'
  );
  return payload.items;
}

export async function createStripeSetupSheet(
  idempotencyKey: string
): Promise<StripeSetupSheetConfiguration> {
  return fetchJson<StripeSetupSheetConfiguration & { ok: true }>(
    '/v2/payments/setup-intents',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey }),
    }
  );
}

export async function createStripeOrderSheet(
  orderId: string
): Promise<StripeOrderSheetConfiguration> {
  return fetchJson<StripeOrderSheetConfiguration & { ok: true }>(
    `/v2/payments/orders/${encodeURIComponent(orderId)}/sheet`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
}

// NOTE: POST /users/:userId/payment-methods was removed — the backend
// permanently returns 410 TOKENISED_PAYMENT_METHOD_REQUIRED. New payment
// methods are tokenised via createStripeSetupSheet (POST
// /v2/payments/setup-intents) + provider-hosted collection.

export async function setDefaultUserPaymentMethod(providerPaymentMethodId: string): Promise<CommercePaymentMethod[]> {
  const payload = await fetchJson<ListPaymentMethodsResponse>(
    `/v2/payments/methods/${encodeURIComponent(providerPaymentMethodId)}/default`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
  return payload.items;
}

export async function deleteUserPaymentMethod(
  userId: string,
  providerPaymentMethodId: string
): Promise<void> {
  void userId;
  await fetchJson<{ ok: true }>(
    `/v2/payments/methods/${encodeURIComponent(providerPaymentMethodId)}`,
    { method: 'DELETE' }
  );
}
export async function createOrder(input: CreateOrderInput): Promise<CommerceOrder> {
  const payload = await fetchJson<CreateOrderResponse>('/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  return payload.order;
}

export async function completeOrderCheckout(
  orderId: string,
  input: {
    addressId: number;
    paymentMethodId?: number;
    shippingQuoteId: string;
    shippingCarrierId: string;
    /** Item verification add-on flag; omitted preserves the stored value. */
    verificationRequested?: boolean;
  }
): Promise<{
  orderId: string;
  checkout: {
    subtotalGbp: number;
    platformChargeGbp: number;
    postageFeeGbp: number;
    totalGbp: number;
    quoteVersion: string;
    quoteHash: string;
    verificationRequested?: boolean;
  };
}> {
  const payload = await fetchJson<{
    ok: true;
    orderId: string;
    checkout: {
      subtotalGbp: number;
      platformChargeGbp: number;
      postageFeeGbp: number;
      totalGbp: number;
      quoteVersion: string;
      quoteHash: string;
      verificationRequested?: boolean;
    };
  }>(`/orders/${encodeURIComponent(orderId)}/checkout`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return {
    orderId: payload.orderId,
    checkout: payload.checkout,
  };
}

export async function getOrder(orderId: string): Promise<CommerceOrder> {
  const payload = await fetchJson<GetOrderResponse>(`/orders/${encodeURIComponent(orderId)}`);
  return payload.order;
}

export async function getOrderParcelEvents(orderId: string): Promise<OrderParcelEvent[]> {
  const payload = await fetchJson<ListOrderParcelEventsResponse>(
    `/orders/${encodeURIComponent(orderId)}/parcel/events`
  );
  return payload.items;
}

// ── Order authentication (verification pipeline) ──────────────────────────

/**
 * Pipeline statuses emitted by the backend authentication pipeline
 * (backend/api/src/lib/authenticationPipeline.ts), plus two endpoint-level
 * states: 'not_requested' (order never asked for verification) and
 * 'request_pending' (the durable orders.verification_requested flag is set
 * but the Redis pipeline record is absent — post-commit create failure or
 * 90-day TTL expiry).
 */
export type OrderAuthenticationStatus =
  | 'not_requested'
  | 'request_pending'
  | 'pending_ai_triage'
  | 'ai_triage_complete'
  | 'pending_expert_review'
  | 'expert_review_complete'
  | 'pending_lab_analysis'
  | 'lab_analysis_complete'
  | 'authenticated'
  | 'counterfeit'
  | 'inconclusive'
  | 'cancelled';

export interface OrderAuthentication {
  requested: boolean;
  status: OrderAuthenticationStatus;
  request: {
    id: string;
    listingId: string;
    tier: 1 | 2 | 3 | 4;
    status: OrderAuthenticationStatus;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    aiTriage: {
      confidenceScore: number;
      recommendation: 'pass' | 'review' | 'fail';
      /** Always true — AI triage is a preliminary assessment, not a guarantee. */
      isPreliminary: true;
      triagedAt: string;
    } | null;
    expertReview: { verdict: string; completedAt: string | null } | null;
    labReport: { result: string; submittedAt: string } | null;
    badge: {
      type: 'AI_VERIFIED' | 'EXPERT_VERIFIED' | 'LAB_CERTIFIED';
      certificateId: string;
      authenticator: string;
      method: string;
      confidenceLevel: number;
      issuedAt: string;
      expiresAt: string | null;
    } | null;
  } | null;
  storage?: {
    /** Pipeline state is Redis-backed with a 90-day TTL — not archival. */
    persistence: 'ephemeral';
    recordExpiresAt: string | null;
  };
}

export async function getOrderAuthentication(
  orderId: string
): Promise<OrderAuthentication> {
  const payload = await fetchJson<{ ok: true; authentication: OrderAuthentication }>(
    `/orders/${encodeURIComponent(orderId)}/authentication`
  );
  return payload.authentication;
}

export async function getShippingQuote(input: ShippingQuoteInput): Promise<ShippingQuoteResponse> {
  return fetchJson<ShippingQuoteResponse>('/shipping/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function checkShippingServiceability(
  input: ShippingServiceabilityInput
): Promise<ShippingServiceabilityResponse> {
  return fetchJson<ShippingServiceabilityResponse>('/shipping/serviceability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function createCommercePaymentIntent(
  input: { orderId: string; idempotencyKey: string }
): Promise<CreatePaymentIntentResult> {
  const payload = await fetchJson<{
    ok: true;
    idempotent?: boolean;
    intent: PaymentIntentStatusResponse;
  }>(
    '/payments/intents',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'commerce',
        orderId: input.orderId,
        idempotencyKey: input.idempotencyKey,
      }),
    }
  );

  return { intent: payload.intent, idempotent: payload.idempotent === true };
}

export interface OnezeCheckoutIntentResult extends CreatePaymentIntentResult {
  /** Server-computed required debit in 1ZE wallet units (1 1ZE = 1000 units). */
  requiredOnezeUnits?: number | null;
  /** Buyer's 1ZE wallet balance echoed back by the server. */
  onezeBalance?: number | null;
}

/**
 * Create a 1ZE wallet checkout payment intent.
 *
 * This posts to /payments/intents with gatewayId: 'oneze_internal', which
 * triggers the internal 1ZE payment flow — the buyer's 1ZE wallet is debited
 * atomically at the at-par rate (1 1ZE ≈ 1 GBP) and the GBP amount is credited
 * to escrow. No Stripe PaymentSheet is needed.
 *
 * Contract: the POST settles synchronously — `intent.status` is 'succeeded'
 * on success; an insufficient wallet rejects with WALLET_INSUFFICIENT_BALANCE
 * carrying requiredOnezeUnits/onezeBalance. Older builds may still return a
 * non-terminal status — callers must treat the response status as the truth
 * and poll GET /payments/intents/:id only as a recovery fallback.
 */
export async function createOnezeCheckoutIntent(
  orderId: string
): Promise<OnezeCheckoutIntentResult> {
  const payload = await fetchJson<{
    ok: true;
    idempotent?: boolean;
    intent: PaymentIntentStatusResponse;
    requiredOnezeUnits?: number | null;
    onezeBalance?: number | null;
  }>(
    '/payments/intents',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'commerce',
        orderId,
        gatewayId: 'oneze_internal',
        idempotencyKey: `oneze_payment_${orderId}`,
      }),
    }
  );

  return {
    intent: payload.intent,
    idempotent: payload.idempotent === true,
    requiredOnezeUnits: payload.requiredOnezeUnits ?? null,
    onezeBalance: payload.onezeBalance ?? null,
  };
}

export async function getPaymentIntentStatus(intentId: string): Promise<PaymentIntentStatusResponse> {
  const payload = await fetchJson<{ ok: true; intent: PaymentIntentStatusResponse }>(
    `/payments/intents/${encodeURIComponent(intentId)}`
  );

  return payload.intent;
}

export interface ShippingLabelResult {
  /** Server-generated label URL — null when the carrier produced tracking
   *  without a hosted label artifact. */
  shippingLabelUrl: string | null;
  trackingNumber: string | null;
}

/**
 * POST /orders/:id/shipping-label — seller-authenticated, idempotent.
 * The backend contract returns `shipping_label_url` (snake_case); the
 * mapping tolerates camelCase variants so a serializer change cannot
 * silently drop the label.
 */
export async function generateShippingLabel(
  orderId: string,
  carrier?: string
): Promise<ShippingLabelResult> {
  const payload = await fetchJson<{
    ok?: boolean;
    shipping_label_url?: string | null;
    shippingLabelUrl?: string | null;
    labelUrl?: string | null;
    tracking_number?: string | null;
    trackingNumber?: string | null;
  }>(`/orders/${encodeURIComponent(orderId)}/shipping-label`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(carrier ? { carrier } : {}),
  });

  return {
    shippingLabelUrl:
      payload.shipping_label_url ?? payload.shippingLabelUrl ?? payload.labelUrl ?? null,
    trackingNumber: payload.tracking_number ?? payload.trackingNumber ?? null,
  };
}

export async function listUserOrders(
  userId: string,
  params: ListUserOrdersParams = {}
): Promise<ListUserOrdersResult> {
  const searchParams = new URLSearchParams();
  if (params.role) searchParams.set('role', params.role);
  if (params.status) searchParams.set('status', params.status);
  if (params.classification) searchParams.set('classification', params.classification);
  if (params.query) searchParams.set('query', params.query);
  if (params.year) searchParams.set('year', String(params.year));
  if (params.cursor) searchParams.set('cursor', params.cursor);
  searchParams.set('limit', String(params.limit ?? 20));

  const payload = await fetchJson<ListOrdersResponse>(
    `/users/${encodeURIComponent(userId)}/orders?${searchParams.toString()}`
  );
  return {
    items: payload.items,
    nextCursor: payload.nextCursor ?? null,
    needsActionCount: payload.needsActionCount ?? null,
  };
}

export async function cancelOrder(orderId: string) {
  return fetchJson<{ ok: true; orderId: string; status: string }>(`/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function shipOrder(orderId: string, input?: { trackingNumber?: string; shippingProvider?: string }) {
  return fetchJson<{ ok: true; orderId: string; status: string; trackingNumber: string; shippingProvider: string }>(
    `/orders/${encodeURIComponent(orderId)}/ship`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    }
  );
}

/**
 * Integrated shipping handoff assertion.
 *
 * For integrated shipping, the seller's drop-off assertion MUST NOT mutate
 * the canonical order status to 'shipped'. The carrier's first scan is the
 * authoritative event that advances the order to in-transit.
 *
 * This endpoint records the seller's handoff claim (timestamp, label/tracking
 * context) but does NOT change `orders.status`. It is a non-state-advancing
 * event overlay used for reconciliation when carrier scans are delayed.
 *
 * Per P0-1: "Integrated seller handoff does not set shipped."
 */
export async function assertHandoff(
  orderId: string,
  context?: { trackingNumber?: string; shippingProvider?: string; labelUrl?: string }
) {
  return fetchJson<{
    ok: true;
    orderId: string;
    handoffClaimedAt: string;
    /** Canonical order status — unchanged by this call. */
    status: string;
  }>(
    `/orders/${encodeURIComponent(orderId)}/fulfilment/handoff-assertion`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context ?? {}),
    }
  );
}

export async function deliverOrder(orderId: string) {
  return fetchJson<{ ok: true; orderId: string; status: string }>(`/orders/${encodeURIComponent(orderId)}/deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ─── Dispatch extensions ─── */

export interface DispatchExtensionResult {
  id: string;
  orderId: string;
  days: number;
  proposedShipBy: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

/**
 * Seller proposes a dispatch extension (1–30 days). Buyer-only approval —
 * the new ship-by date takes effect only if the buyer accepts. The backend
 * rejects with 409 when an extension is already pending or the order is not
 * in 'paid' status.
 */
export async function proposeDispatchExtension(
  orderId: string,
  days: number,
  note?: string
): Promise<DispatchExtensionResult> {
  const payload = await fetchJson<{ ok: true; extension: DispatchExtensionResult }>(
    `/orders/${encodeURIComponent(orderId)}/dispatch-extension`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note ? { days, note } : { days }),
    }
  );
  return payload.extension;
}

/**
 * Buyer accepts or declines a pending dispatch extension. On acceptance the
 * response carries the new effective `shipByDate`.
 */
export async function respondDispatchExtension(
  orderId: string,
  accept: boolean,
  extensionId?: string
): Promise<{ extension: DispatchExtensionResult; shipByDate: string | null }> {
  const payload = await fetchJson<{
    ok: true;
    extension: DispatchExtensionResult;
    shipByDate: string | null;
  }>(
    `/orders/${encodeURIComponent(orderId)}/dispatch-extension/respond`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extensionId ? { accept, extensionId } : { accept }),
    }
  );
  return { extension: payload.extension, shipByDate: payload.shipByDate };
}

export interface UserTransaction {
  id: string;
  type: string;
  lineType: string;
  amount: number;
  currency: string;
  direction: string;
  sourceId: string;
  status: string;
  createdAt: string;
  description: string | null;
}

export async function listUserTransactions(userId: string, limit = 50, offset = 0) {
  return fetchJson<{ ok: true; total: number; items: UserTransaction[] }>(
    `/users/${encodeURIComponent(userId)}/transactions?limit=${limit}&offset=${offset}`
  );
}

/* ─── Buyer Protection ─── */

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
  feeGbpMinor: number;
  status: 'covered' | 'not_covered';
  coverageAmountGbpMinor: number;
  eligibleUntil: string;
  claims: BuyerProtectionClaim[];
}

export async function fetchBuyerProtection(orderId: string): Promise<BuyerProtectionInfo> {
  const payload = await fetchJson<{ ok: true; protection: BuyerProtectionInfo }>(
    `/orders/${encodeURIComponent(orderId)}/protection`
  );
  return payload.protection;
}

export async function createBuyerProtectionClaim(
  orderId: string,
  input: { reason: string; description: string; evidenceUrls?: string[] }
): Promise<{ ticketId: string; status: string; createdAt: string }> {
  const payload = await fetchJson<{ ok: true; claim: { ticketId: string; status: string; createdAt: string } }>(
    `/orders/${encodeURIComponent(orderId)}/protection/claim`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  return payload.claim;
}

/* ─── Seller Analytics ─── */

/**
 * Analytics period — either a preset ('7d' | '30d' | '90d') or a custom
 * date range with inclusive ISO date strings (YYYY-MM-DD).
 */
export type AnalyticsPeriod =
  | '7d'
  | '30d'
  | '90d'
  | { startDate: string; endDate: string };

/**
 * Builds the query-string fragment for an analytics period parameter.
 * Presets emit `period=7d`; custom ranges emit `startDate=…&endDate=…`.
 */
function analyticsPeriodQuery(period: AnalyticsPeriod): string {
  if (typeof period === 'string') {
    return `period=${period}`;
  }
  return `startDate=${encodeURIComponent(period.startDate)}&endDate=${encodeURIComponent(period.endDate)}`;
}

export interface SellerAnalyticsComparison {
  revenueGbpMinor: number;
  netSalesGbpMinor: number | null;
  itemsSold: number;
  totalViews: number;
  totalLikes: number;
  totalSaves: number;
  complete: boolean;
}

export interface SellerAnalyticsTrendPoint {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  value: number;
}

export interface SellerAnalyticsTrend {
  /** The daily series metric. Currently always 'revenue' (gross). Per-day
   *  refund/fee subtraction is not yet implemented in the backend. */
  metric: 'revenue';
  current: SellerAnalyticsTrendPoint[];
  previous: SellerAnalyticsTrendPoint[];
}

export interface SellerAnalyticsFunnel {
  /** null when the impressions source is unavailable — never fabricate 0. */
  impressions: number | null;
  views: number;
  saves: number;
  offers: number;
  purchases: number;
}

export interface SellerAnalytics {
  totalListings: number;
  activeListings: number;
  totalViews: number;
  totalLikes: number;
  totalSaves: number;
  itemsSold: number;
  revenueGbpMinor: number;
  /** Refunds in the period (GBP minor). Null when ledger tables are absent. */
  refundsGbpMinor: number | null;
  /** Platform fees in the period (GBP minor). Null when ledger tables are absent. */
  feesGbpMinor: number | null;
  /** Net sales = revenue − refunds − fees (GBP minor). Null when ledger is absent. */
  netSalesGbpMinor: number | null;
  /** Data completeness — 'complete' when ledger is available, 'partial' otherwise. */
  completeness: 'complete' | 'partial';
  avgRating: number | null;
  reviewCount: number;
  responseRate: number | null;
  shipWithinDays: number | null;
  totalSales: number | null;
  positiveRatingPct: number | null;
  /** Average Order Value in GBP minor units */
  aovGbpMinor?: number | null;
  /** Percentage of orders from repeat buyers (>= 2 completed orders) */
  repeatBuyerPct?: number | null;
  /** Previous equal-period comparison — always complete (entirely in the past). */
  comparison: SellerAnalyticsComparison;
  /** Daily trend series for current + previous period. */
  trend: SellerAnalyticsTrend;
  /** Conversion funnel: impressions → views → saves → offers → purchases. */
  funnel: SellerAnalyticsFunnel;
}

export async function fetchSellerAnalytics(
  sellerId: string,
  period: AnalyticsPeriod = '30d'
): Promise<SellerAnalytics> {
  const qs = analyticsPeriodQuery(period);
  const payload = await fetchJson<{ ok: true; analytics: SellerAnalytics }>(
    `/sellers/${encodeURIComponent(sellerId)}/analytics?${qs}`
  );
  return payload.analytics;
}

export interface TopPerformerListing {
  id: string;
  title: string;
  priceGbpMinor: number;
  viewsCount: number;
  likesCount: number;
  savedCount: number;
  status: string;
  createdAt: string;
  engagementScore: number;
}

export async function fetchTopPerformers(
  sellerId: string,
  limit: number = 10,
  period: AnalyticsPeriod = '30d'
): Promise<TopPerformerListing[]> {
  const qs = analyticsPeriodQuery(period);
  const payload = await fetchJson<{ ok: true; items: TopPerformerListing[] }>(
    `/sellers/${encodeURIComponent(sellerId)}/analytics/top-performers?limit=${limit}&${qs}`
  );
  return payload.items;
}

export interface NeedsAttentionListing {
  listingId: string;
  title: string;
  coverImageUrl: string | null;
  status: string;
  priceGbp: number;
  category: string | null;
  brand: string | null;
  createdAt: string;
  views: number;
  likes: number;
  offerCount: number;
  reason: string;
  priority: 'high' | 'medium';
}

export async function fetchNeedsAttention(
  sellerId: string,
  limit: number = 5,
  period: AnalyticsPeriod = '30d'
): Promise<NeedsAttentionListing[]> {
  const qs = analyticsPeriodQuery(period);
  const payload = await fetchJson<{ ok: true; items: NeedsAttentionListing[] }>(
    `/sellers/${encodeURIComponent(sellerId)}/analytics/attention?limit=${limit}&${qs}`
  );
  return payload.items;
}

/* ─── Daily Breakdown — real per-day engagement ─── */

export interface DailyBreakdownPoint {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  views: number;
  likes: number;
  saves: number;
  sales: number;
}

export async function fetchDailyBreakdown(
  sellerId: string,
  period: AnalyticsPeriod = '30d'
): Promise<DailyBreakdownPoint[]> {
  const qs = analyticsPeriodQuery(period);
  const payload = await fetchJson<{ ok: true; days: DailyBreakdownPoint[] }>(
    `/sellers/${encodeURIComponent(sellerId)}/analytics/daily?${qs}`
  );
  return payload.days;
}

/* ─── Listing Analytics — product-specific metrics, funnel, comparables & price history ─── */

export interface ListingAnalyticsComparables {
  sampleSize: number;
  minPrice: number | null;
  medianPrice: number | null;
  maxPrice: number | null;
}

export interface ListingPriceHistoryEvent {
  previousPrice: number;
  newPrice: number;
  changedAt: string;
}

export interface ListingAnalyticsData {
  listing: {
    id: string;
    title: string;
    priceGbpMinor: number;
    status: string;
    imageUrl: string | null;
    category: string | null;
    brand: string | null;
    condition: string | null;
    createdAt: string;
    soldAt: string | null;
  };
  views: number;
  saves: number;
  offers: number;
  likes: number;
  purchases: number;
  conversionRate: number | null;
  saveRate: number | null;
  intentSignal: 'high_intent_price_friction' | 'low_affinity_photo_needed' | 'healthy_velocity' | 'stale_reach' | null;
  timeOnMarketDays: number;
  priceHistory: ListingPriceHistoryEvent[];
  comparables: ListingAnalyticsComparables | null;
  period: string;
}

export async function fetchListingAnalytics(
  sellerId: string,
  listingId: string,
  period: AnalyticsPeriod = '30d'
): Promise<ListingAnalyticsData> {
  const qs = analyticsPeriodQuery(period);
  const payload = await fetchJson<{ ok: true; analytics: ListingAnalyticsData }>(
    `/sellers/${encodeURIComponent(sellerId)}/analytics/listing/${encodeURIComponent(listingId)}?${qs}`
  );
  return payload.analytics;
}

export interface PriceAdjustResult {
  ok: boolean;
  listingId: string;
  previousPriceGbp: number;
  newPriceGbp: number;
  changedAt: string;
}

export async function adjustListingPrice(
  sellerId: string,
  listingId: string,
  newPriceGbp: number
): Promise<PriceAdjustResult> {
  return await fetchJson<PriceAdjustResult>(
    `/sellers/${encodeURIComponent(sellerId)}/listings/${encodeURIComponent(listingId)}/price-adjust`,
    {
      method: 'POST',
      body: JSON.stringify({ newPriceGbp }),
    }
  );
}
