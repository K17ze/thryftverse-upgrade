import { fetchJson } from '../lib/apiClient';
import { parseServerDate } from '../utils/dateFormat';

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
  /** The order this offer is bound to once accepted — lets the Offers
   * surface deep-link to OrderDetail. */
  orderId: string | null;
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

/**
 * The backend emits Postgres `::text` timestamps ('2026-07-28 12:34:56.789+00')
 * — non-ISO, NaN-producing on Hermes. Normalize to ISO at the boundary so
 * every downstream `Date.parse`/`new Date` is safe. Unparseable values
 * pass through unchanged (renderers already guard with Number.isFinite).
 */
function normalizeOffer(offer: ListingOffer): ListingOffer {
  const iso = (v: string | null) => {
    const d = parseServerDate(v);
    return v == null ? v : (d ? d.toISOString() : v);
  };
  return {
    ...offer,
    expiresAt: iso(offer.expiresAt)!,
    acceptedAt: iso(offer.acceptedAt),
    declinedAt: iso(offer.declinedAt),
    expiredAt: iso(offer.expiredAt),
    cancelledAt: iso(offer.cancelledAt),
    createdAt: iso(offer.createdAt)!,
    updatedAt: iso(offer.updatedAt)!,
  };
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
  return normalizeOffer(payload.offer);
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
  return normalizeOffer(payload.offer);
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
  return payload.offers.map(normalizeOffer);
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
  return payload.offers.map(normalizeOffer);
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

// ── Unknown-outcome reconciliation ──────────────────────────────────
//
// When a POST /listings/:id/offers response is lost (network timeout),
// the client cannot tell whether the offer was created. This lookup
// resolves the ambiguity by querying the backend by idempotency key.
//
// Returns one of three states:
//   - 'acknowledged': the offer exists, body contains the offer
//   - 'processing': the server returned a transient error (retry)
//   - 'safe_to_retry': no offer with this key exists (may resubmit)

import type { LookupResult } from '../hooks/useUnknownOutcomeReconciliation';

export async function lookupOfferByIdempotencyKey(
  idempotencyKey: string,
): Promise<LookupResult<ListingOffer>> {
  try {
    const payload = await fetchJson<{ ok: true; status: 'acknowledged'; offer: ListingOffer }>(
      `/users/me/offers/lookup-by-key/${encodeURIComponent(idempotencyKey)}`,
    );
    return { status: 'acknowledged', value: normalizeOffer(payload.offer) };
  } catch (error: unknown) {
    const status = (error as { status?: number }).status;
    if (status === 404) {
      return { status: 'safe_to_retry' };
    }
    // Network error or 5xx — the server may be transiently unavailable.
    // Treat as 'processing' so the caller polls again rather than retrying.
    return { status: 'processing' };
  }
}

export async function cancelListingOfferOnApi(offerId: string): Promise<{ status: string }> {
  const payload = await fetchJson<{ ok: true; status: string }>(
    `/offers/${encodeURIComponent(offerId)}/cancel`,
    { method: 'POST' }
  );
  return { status: payload.status };
}
