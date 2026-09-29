/**
 * Storefront service — port of the mobile storefrontApi
 * (frontend/src/services/storefrontApi.ts). Owner-scoped reads/writes on
 * /storefronts/me plus the public published projection; the seller-hub
 * editor and the /u/[username] shop rail share this contract.
 *
 * All routes verified against backend/api/src/routes/storefronts.ts.
 */

import { fetchJson } from '../http';

// ── Contract types — mirror the backend response shapes exactly ───────

export type StorefrontStatus = 'draft' | 'published' | 'paused';

export type StorefrontSectionKind =
  | 'featured_listings'
  | 'collection'
  | 'new_arrivals'
  | 'editorial_media'
  | 'creator_work';

export interface StorefrontSectionInput {
  kind: StorefrontSectionKind;
  title: string;
  itemLimit?: number;
  collectionRef?: string;
  mediaAssetRef?: string;
  linkUrl?: string;
  linkLabel?: string;
  sortOrder: number;
}

export interface StorefrontSectionResponse {
  id: string;
  kind: StorefrontSectionKind;
  title: string;
  itemLimit: number | null;
  collectionRef: string | null;
  mediaAssetRef: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  sortOrder: number;
}

export interface StorefrontPolicies {
  shipping: string | null;
  returns: string | null;
  additional: string | null;
}

export interface StorefrontResponse {
  /** Null when the seller has no storefront row yet — GET /storefronts/me
   *  returns a default draft shell instead of 404. */
  id: string | null;
  sellerId: string;
  status: StorefrontStatus;
  revision: number;
  announcement: string | null;
  policies: StorefrontPolicies;
  coverAssetId: string | null;
  logoAssetId: string | null;
  sections: StorefrontSectionResponse[];
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface StorefrontFeaturedListing {
  id: string;
  title: string;
  priceGbpMinor: number;
  imageUrl: string | null;
  status: string;
}

export interface StorefrontUpdateInput {
  announcement?: string | null;
  /** Replaces the whole policies bag — send all keys, null clears a field. */
  policies?: StorefrontPolicies;
  coverAssetId?: string | null;
  logoAssetId?: string | null;
  sections?: StorefrontSectionInput[];
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ── API functions ─────────────────────────────────────────────────────

/** GET /storefronts/me — the owner's own storefront, any status. */
export async function fetchMyStorefront(
  signal?: AbortSignal,
): Promise<StorefrontResponse> {
  const res = await fetchJson<{ ok: true; storefront: StorefrontResponse }>(
    '/storefronts/me',
    undefined,
    { signal },
  );
  return res.storefront;
}

/** GET /storefronts/:sellerId — the published storefront (404s on
 *  draft/paused — owner reads go through fetchMyStorefront). */
export async function fetchPublicStorefront(
  sellerId: string,
  signal?: AbortSignal,
): Promise<{ storefront: StorefrontResponse; featuredListings: StorefrontFeaturedListing[] }> {
  const res = await fetchJson<{
    ok: true;
    storefront: StorefrontResponse;
    featuredListings?: Array<Record<string, unknown>>;
  }>(`/storefronts/${encodeURIComponent(sellerId)}`, undefined, { signal });
  return {
    storefront: res.storefront,
    featuredListings: (res.featuredListings ?? []).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ''),
      priceGbpMinor:
        typeof row.priceGbpMinor === 'number'
          ? row.priceGbpMinor
          : Number(row.priceGbpMinor ?? row.price ?? 0),
      imageUrl: (row.imageUrl ?? row.image_url ?? null) as string | null,
      status: String(row.status ?? 'active'),
    })),
  };
}

/** PUT /storefronts/me — update the draft storefront (owner only).
 *  Pass If-Match for optimistic locking; a stale revision 409s with
 *  STALE_REVISION so the editor can reload rather than clobber. */
export async function updateMyStorefront(
  input: StorefrontUpdateInput,
  options?: { ifMatchRevision?: number },
): Promise<StorefrontResponse> {
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (options?.ifMatchRevision !== undefined) {
    headers['If-Match'] = String(options.ifMatchRevision);
  }
  const res = await fetchJson<{ ok: true; storefront: StorefrontResponse }>(
    '/storefronts/me',
    { method: 'PUT', headers, body: JSON.stringify(input) },
  );
  return res.storefront;
}

/** POST /storefronts/me/publish — publish the draft. Requires If-Match;
 *  the backend rejects an empty storefront (422 EMPTY_STOREFRONT — at
 *  least one section or featured listing is required). */
export async function publishMyStorefront(
  ifMatchRevision: number,
): Promise<StorefrontResponse> {
  const res = await fetchJson<{ ok: true; storefront: StorefrontResponse }>(
    '/storefronts/me/publish',
    { method: 'POST', headers: { 'If-Match': String(ifMatchRevision) } },
  );
  return res.storefront;
}

/** POST /storefronts/me/pause — pause a published storefront (409
 *  NOT_PUBLISHED when it isn't live). */
export async function pauseMyStorefront(): Promise<StorefrontResponse> {
  const res = await fetchJson<{ ok: true; storefront: StorefrontResponse }>(
    '/storefronts/me/pause',
    { method: 'POST' },
  );
  return res.storefront;
}

/** POST /storefronts/me/rollback — take a published storefront back to
 *  draft so it can be re-edited (409 NOT_PUBLISHED otherwise). */
export async function rollbackMyStorefront(
  toRevision?: number,
): Promise<StorefrontResponse> {
  const res = await fetchJson<{ ok: true; storefront: StorefrontResponse }>(
    '/storefronts/me/rollback',
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(toRevision !== undefined ? { toRevision } : {}),
    },
  );
  return res.storefront;
}

/** PUT /storefronts/me/featured-listings — replace the pinned rail order.
 *  Validates ownership; rejects removed listings; caps at 8 (422
 *  TOO_MANY_FEATURED / LISTING_NOT_OWNED / LISTING_REMOVED). */
export async function setFeaturedListings(
  listingIds: string[],
): Promise<{ featuredListingIds: string[] }> {
  const res = await fetchJson<{ ok: true; featuredListingIds: string[] }>(
    '/storefronts/me/featured-listings',
    {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ listingIds }),
    },
  );
  return { featuredListingIds: res.featuredListingIds };
}
