/**
 * Sellers service — the public seller projection (GET /sellers/:id).
 * Mirrors the mobile useSellerTrust query (frontend/src/platform/product/
 * useListingQueries.ts): the listing payload's seller block doesn't carry
 * availability, so the buyer-side capability gate reads this summary for
 * holidayMode / awayMessage / reachState — the fields the backend resolves
 * effective-away on (a lapsed return date never reaches buyers as
 * still-away).
 */

import { fetchJson } from '../http';

/** Buyer-facing seller availability facts — the subset of the
 *  GET /sellers/:id seller object the purchase gate reads. */
export interface SellerTrustSummary {
  id: string;
  username?: string | null;
  avatar?: string | null;
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
