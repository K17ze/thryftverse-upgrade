import { fetchJson } from '../lib/apiClient';

// ── Storefront contract types ─────────────────────────────────────────
// Mirrors the backend routes/storefronts.ts response shapes exactly.

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

export interface StorefrontResponse {
  id: string | null;
  sellerId: string;
  status: StorefrontStatus;
  revision: number;
  announcement: string | null;
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
  coverAssetId?: string | null;
  logoAssetId?: string | null;
  sections?: StorefrontSectionInput[];
}

// ── API functions ─────────────────────────────────────────────────────

/** Get the owner's own storefront (any status). */
export async function fetchMyStorefront(): Promise<StorefrontResponse> {
  const response = await fetchJson<{ ok: true; storefront: StorefrontResponse }>(
    '/storefronts/me',
    { method: 'GET' }
  );
  return response.storefront;
}

/** Get a seller's public storefront (published only). */
export async function fetchPublicStorefront(
  sellerId: string
): Promise<{ storefront: StorefrontResponse; featuredListings: StorefrontFeaturedListing[] }> {
  const response = await fetchJson<{
    ok: true;
    storefront: StorefrontResponse;
    featuredListings: StorefrontFeaturedListing[];
  }>(`/storefronts/${encodeURIComponent(sellerId)}`, { method: 'GET' });
  return { storefront: response.storefront, featuredListings: response.featuredListings };
}

/** Update the draft storefront (owner only). Pass If-Match for optimistic locking. */
export async function updateMyStorefront(
  input: StorefrontUpdateInput,
  options?: { ifMatchRevision?: number }
): Promise<StorefrontResponse> {
  const headers: Record<string, string> = {};
  if (options?.ifMatchRevision !== undefined) {
    headers['If-Match'] = String(options.ifMatchRevision);
  }
  const response = await fetchJson<{ ok: true; storefront: StorefrontResponse }>(
    '/storefronts/me',
    { method: 'PUT', body: JSON.stringify(input), headers }
  );
  return response.storefront;
}

/** Publish the draft storefront. Requires If-Match for optimistic locking. */
export async function publishMyStorefront(
  ifMatchRevision: number
): Promise<StorefrontResponse> {
  const response = await fetchJson<{ ok: true; storefront: StorefrontResponse }>(
    '/storefronts/me/publish',
    { method: 'POST', headers: { 'If-Match': String(ifMatchRevision) } }
  );
  return response.storefront;
}

/** Pause a published storefront. */
export async function pauseMyStorefront(): Promise<StorefrontResponse> {
  const response = await fetchJson<{ ok: true; storefront: StorefrontResponse }>(
    '/storefronts/me/pause',
    { method: 'POST' }
  );
  return response.storefront;
}

/** Rollback a published storefront to draft. */
export async function rollbackMyStorefront(
  toRevision?: number
): Promise<StorefrontResponse> {
  const body = toRevision !== undefined ? JSON.stringify({ toRevision }) : JSON.stringify({});
  const response = await fetchJson<{ ok: true; storefront: StorefrontResponse }>(
    '/storefronts/me/rollback',
    { method: 'POST', body }
  );
  return response.storefront;
}

/** Set pinned/featured listing ranks (owner only). Validates ownership. */
export async function setFeaturedListings(
  listingIds: string[]
): Promise<{ featuredListingIds: string[] }> {
  const response = await fetchJson<{ ok: true; featuredListingIds: string[] }>(
    '/storefronts/me/featured-listings',
    { method: 'PUT', body: JSON.stringify({ listingIds }) }
  );
  return { featuredListingIds: response.featuredListingIds };
}
