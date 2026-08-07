import { fetchJson } from '../lib/apiClient';

/**
 * Server-authoritative listing offers.
 *
 * The frontend previously sent offers as free-text chat messages with
 * client-computed expiry. These calls move the offer lifecycle to the backend
 * so expiry, accept/decline, and counter chains are authoritative across
 * devices.
 */

export type ListingOfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'countered';

export interface ListingOffer {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  offerPriceGbp: number;
  originalPriceGbp: number;
  counterRound: number;
  status: ListingOfferStatus;
  expiresAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  expiredAt: string | null;
  cancelledAt: string | null;
  conversationId: string | null;
  parentOfferId: string | null;
  offeredByUserId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateListingOfferInput {
  listingId: string;
  offerPriceGbp: number;
  expiryHours?: number;
  conversationId?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface AcceptedOfferCheckout {
  orderId: string;
  reservationId: string;
  reservationStatus: 'active' | 'converted' | 'expired' | 'cancelled';
  expiresAt: string | null;
  subtotalGbp?: number;
  platformChargeGbp?: number;
  totalGbp?: number;
}

export interface AcceptListingOfferResult {
  status: 'accepted';
  idempotentReplay: boolean;
  checkout: AcceptedOfferCheckout;
}

export async function createListingOfferOnApi(
  input: CreateListingOfferInput
): Promise<ListingOffer> {
  const payload = await fetchJson<{ ok: true; offer: ListingOffer }>(
    `/listings/${encodeURIComponent(input.listingId)}/offers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId: input.listingId,
        offerPriceGbp: input.offerPriceGbp,
        expiryHours: input.expiryHours ?? 48,
        conversationId: input.conversationId,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      }),
    }
  );
  return payload.offer;
}

export async function counterListingOfferOnApi(
  parentOfferId: string,
  input: {
    offerPriceGbp: number;
    expiryHours?: number;
    conversationId?: string;
    idempotencyKey: string;
  }
): Promise<ListingOffer> {
  const payload = await fetchJson<{ ok: true; offer: ListingOffer }>(
    `/offers/${encodeURIComponent(parentOfferId)}/counter`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offerPriceGbp: input.offerPriceGbp,
        expiryHours: input.expiryHours ?? 48,
        conversationId: input.conversationId,
        idempotencyKey: input.idempotencyKey,
      }),
    }
  );
  return payload.offer;
}

export async function fetchListingOffersFromApi(
  listingId: string,
  options?: { status?: ListingOfferStatus; limit?: number }
): Promise<ListingOffer[]> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  const query = params.toString() ? `?${params.toString()}` : '';
  const payload = await fetchJson<{ ok: true; offers: ListingOffer[] }>(
    `/listings/${encodeURIComponent(listingId)}/offers${query}`
  );
  return payload.offers;
}

export async function fetchMyOffersFromApi(
  options?: { status?: ListingOfferStatus; limit?: number }
): Promise<ListingOffer[]> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  const query = params.toString() ? `?${params.toString()}` : '';
  const payload = await fetchJson<{ ok: true; offers: ListingOffer[] }>(
    `/users/me/offers${query}`
  );
  return payload.offers;
}

export async function acceptListingOfferOnApi(offerId: string): Promise<AcceptListingOfferResult> {
  const payload = await fetchJson<{ ok: true } & AcceptListingOfferResult>(
    `/offers/${encodeURIComponent(offerId)}/accept`,
    { method: 'POST' }
  );
  return {
    status: payload.status,
    idempotentReplay: payload.idempotentReplay,
    checkout: payload.checkout,
  };
}

export async function declineListingOfferOnApi(offerId: string): Promise<{ status: string }> {
  const payload = await fetchJson<{ ok: true; status: string }>(
    `/offers/${encodeURIComponent(offerId)}/decline`,
    { method: 'POST' }
  );
  return { status: payload.status };
}

export async function cancelListingOfferOnApi(offerId: string): Promise<{ status: string }> {
  const payload = await fetchJson<{ ok: true; status: string }>(
    `/offers/${encodeURIComponent(offerId)}/cancel`,
    { method: 'POST' }
  );
  return { status: payload.status };
}
