/**
 * Sellers service — the public seller projection (GET /sellers/:id).
 * Mirrors the mobile useSellerTrust query (frontend/src/platform/product/
 * useListingQueries.ts): the listing payload's seller block doesn't carry
 * availability, so the buyer-side capability gate reads this summary for
 * holidayMode / awayMessage / reachState — the fields the backend resolves
 * effective-away on (a lapsed return date never reaches buyers as
 * still-away).
 */

import { ApiRequestError, fetchJson } from '../http';

/** Buyer-facing seller facts — GET /sellers/:id's seller object. The
 *  purchase gate reads availability; the PDP trust dossier reads the
 *  response/dispatch/sales evidence the same payload already carries. */
export interface SellerTrustSummary {
  id: string;
  username?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  location?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  /** Lifetime completed orders — native "N sold" proof point. */
  completedSales?: number | null;
  activeListingCount?: number | null;
  /** Response-time evidence — "Usually responds in Xh". */
  responseRate?: number | null;
  responseTimeLabel?: string | null;
  avgResponseHours?: number | null;
  /** Seller-declared dispatch pace — "Dispatches same day"-style copy. */
  dispatchTimeLabel?: string | null;
  memberSince?: string | null;
  /** Seller standards badges (topSeller/fastShipper/responsive/…). */
  badges?: string[];
  /** Tiered verification — richer than the boolean (native grammar). */
  verificationTier?: string | null;
  verified?: boolean;
  /** Effective away state — purchases and offers 409 SELLER_AWAY while
   *  true. Already resolved against holidayModeUntil server-side. */
  holidayMode: boolean;
  /** Seller-authored note shown to buyers while away; null when the
   *  seller isn't effectively away or never wrote one. */
  awayMessage: string | null;
  /** Seller-declared return instant (ISO-8601); present only while the
   *  seller is effectively away and published a real date. */
  holidayModeUntil: string | null;
  /** users.reach_state — 'suspended' suppresses every purchase/offer
   *  affordance (checkout rejects with SELLER_RESTRICTED); 'limited'
   *  sellers remain purchasable. */
  reachState: 'normal' | 'limited' | 'suspended';
  isFollowing?: boolean;
}

/**
 * GET /sellers/:id — public route. Returns null when the payload carries
 * no seller object; a null/failed read must never be treated as "not
 * away" by callers — it just means availability couldn't be refreshed.
 */
export async function fetchSellerTrustSummary(
  sellerId: string,
  signal?: AbortSignal,
): Promise<SellerTrustSummary | null> {
  const res = await fetchJson<{ ok?: boolean; seller?: SellerTrustSummary }>(
    `/sellers/${encodeURIComponent(sellerId)}`,
    undefined,
    { signal },
  );
  return res.seller ?? null;
}

export interface ListingPriceAdjustResult {
  listingId: string;
  /** Null when the wire carries no prior price (first recorded change). */
  previousPriceGbp: number | null;
  newPriceGbp: number;
  /** Server-stamped instant of the price event. */
  changedAt: string;
}

/**
 * POST /sellers/:sellerId/listings/:listingId/price-adjust — the dedicated
 * repricing write (sellers.ts). Deliberately NOT a generic listing patch:
 * the route runs the canonical field-patch path — durable price event,
 * outbox, price-alert evaluation and search sync — which a raw PATCH
 * would skip. SellerId must be the authed user; the route 403s
 * "You can only adjust prices for your own listings" otherwise. Server
 * errors propagate verbatim (invalid payload, unchanged price, listing
 * not repriceable in its current state).
 */
export async function adjustListingPrice(
  sellerId: string,
  listingId: string,
  newPriceGbp: number,
): Promise<ListingPriceAdjustResult> {
  const payload = await fetchJson<{
    ok: boolean;
    listingId?: string;
    previousPriceGbp?: number | null;
    newPriceGbp?: number;
    changedAt?: string;
    error?: string;
  }>(
    `/sellers/${encodeURIComponent(sellerId)}/listings/${encodeURIComponent(listingId)}/price-adjust`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPriceGbp }),
    },
  );
  if (!payload.ok) {
    throw new ApiRequestError(payload.error ?? 'Failed to adjust price', undefined, payload);
  }
  return {
    listingId: payload.listingId ?? listingId,
    previousPriceGbp: payload.previousPriceGbp ?? null,
    newPriceGbp: payload.newPriceGbp ?? newPriceGbp,
    changedAt: payload.changedAt ?? new Date().toISOString(),
  };
}
