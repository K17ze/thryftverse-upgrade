import { fetchJson } from '../lib/apiClient';

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
  type: 'card' | 'bank_account';
  label: string;
  details: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
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
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  buyer: { id: string; username: string; avatar: string | null } | null;
  seller: { id: string; username: string; avatar: string | null } | null;
}

export interface ShippingQuoteItem {
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

interface CreatePaymentMethodResponse {
  ok: true;
  item: CommercePaymentMethod;
}

interface CreateOrderResponse {
  ok: true;
  order: CommerceOrder;
}

interface GetOrderResponse {
  ok: true;
  order: CommerceOrder;
}

interface ShippingQuoteResponse {
  ok: true;
  source: 'live' | 'fallback';
  originPostcode: string;
  destinationPostcode: string;
  recommendedQuote: ShippingQuoteItem | null;
  quotes: ShippingQuoteItem[];
}

interface PayOrderResponse {
  ok: true;
  id: string;
  status: string;
  updatedAt: string;
}

export interface PaymentIntentStatusResponse {
  intentId: string;
  gatewayId: string;
  status: string;
  clientSecret: string | null;
  nextActionUrl: string | null;
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
    | 'returned';
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

export interface CreatePaymentMethodInput {
  type: 'card' | 'bank_account';
  label: string;
  details?: string;
  isDefault?: boolean;
}

export interface CreateOrderInput {
  buyerId: string;
  listingId: string;
  addressId?: number;
  paymentMethodId?: number;
  platformChargeGbp?: number;
  buyerProtectionFeeGbp?: number;
  postageFeeGbp?: number;
  shippingCarrierId?: string;
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
  const payload = await fetchJson<ListPaymentMethodsResponse>(
    `/users/${encodeURIComponent(userId)}/payment-methods`
  );
  return payload.items;
}

export async function createUserPaymentMethod(
  userId: string,
  input: CreatePaymentMethodInput
): Promise<CommercePaymentMethod> {
  const payload = await fetchJson<CreatePaymentMethodResponse>(
    `/users/${encodeURIComponent(userId)}/payment-methods`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  return payload.item;
}

export async function updateUserPaymentMethod(
  userId: string,
  paymentMethodId: number,
  input: Partial<CreatePaymentMethodInput>
): Promise<CommercePaymentMethod> {
  const payload = await fetchJson<CreatePaymentMethodResponse>(
    `/users/${encodeURIComponent(userId)}/payment-methods/${paymentMethodId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  return payload.item;
}

export async function deleteUserPaymentMethod(userId: string, paymentMethodId: number): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/users/${encodeURIComponent(userId)}/payment-methods/${paymentMethodId}`,
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
  input: { orderId: string }
): Promise<PaymentIntentStatusResponse> {
  const payload = await fetchJson<{ ok: true; intent: PaymentIntentStatusResponse }>(
    '/payments/intents',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'commerce',
        orderId: input.orderId,
      }),
    }
  );

  return payload.intent;
}

export async function getPaymentIntentStatus(intentId: string): Promise<PaymentIntentStatusResponse> {
  const payload = await fetchJson<{ ok: true; intent: PaymentIntentStatusResponse }>(
    `/payments/intents/${encodeURIComponent(intentId)}`
  );

  return payload.intent;
}

export async function payOrder(orderId: string): Promise<PayOrderResponse> {
  return fetchJson<PayOrderResponse>(`/orders/${encodeURIComponent(orderId)}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
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

export async function deliverOrder(orderId: string) {
  return fetchJson<{ ok: true; orderId: string; status: string }>(`/orders/${encodeURIComponent(orderId)}/deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function refundOrder(orderId: string, reason?: string) {
  return fetchJson<{ ok: true; orderId: string; status: string; refunded: boolean; reason: string | null }>(
    `/orders/${encodeURIComponent(orderId)}/refund`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }
  );
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