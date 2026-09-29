/**
 * Web feed service — mirrors frontend/src/services/feedApi.ts.
 * `/feed/home`, `/feed/following`, `/feed/trending` return
 * `{ items, nextCursor }` where units can be listing | poster | look rows.
 */

import { fetchJson } from '../http';
import {
  mapBackendListingToListing,
  mapBackendListings,
  type BackendListingRow,
} from '../mappers';
import type { Listing, Look, Poster } from '@/lib/contracts/domain';

export interface FeedUnit {
  kind: 'listing' | 'poster' | 'look';
  listing?: Listing;
  poster?: Poster;
  look?: Look;
}

interface FeedRow {
  kind?: string;
  type?: string;
  entityType?: string;
  /** The wire envelope: `{id: 'listing:x', type, rank, data}` — `data`
   *  carries the entity payload. Older flat rows put fields at top level;
   *  both unwrap to the same entity. */
  data?: Record<string, unknown> | null;
  listing?: BackendListingRow | null;
  poster?: Poster | null;
  look?: Look | null;
  // flat listing rows — the feed may embed listing fields at top level
  id?: string;
  title?: string | null;
  [key: string]: unknown;
}

interface FeedResponse {
  ok?: boolean;
  items?: FeedRow[];
  nextCursor?: string | null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function mapFeedRow(row: FeedRow): FeedUnit | null {
  const kind = row.kind ?? row.type ?? row.entityType ?? 'listing';
  // The envelope's `data` is the entity — every /feed/home row wraps its
  // payload there. Reading `row.listing`/`row.look` off the envelope
  // returned null for every unit and silently emptied the live feed.
  const data = (row.data ?? row) as Record<string, unknown>;
  if (kind === 'listing') {
    const listing = mapBackendListingToListing(
      (row.listing ?? data) as unknown as BackendListingRow,
    );
    return listing ? { kind: 'listing', listing } : null;
  }
  if (kind === 'poster') {
    const src = (row.poster ?? data) as Record<string, unknown>;
    // `posters` is the frames table — `storyId` is the id the poster
    // viewer route resolves; without it the tile has nowhere to go.
    const storyId = str(src.storyId) ?? str(src.story_id) ?? str(src.id);
    const coverUri = str(src.mediaUrl) ?? str(src.coverUri);
    if (!storyId || !coverUri) return null;
    const poster: Poster = {
      id: storyId,
      authorId: str(src.creatorId) ?? str(src.authorId) ?? '',
      coverUri,
      caption: str(src.caption),
      createdAt: str(src.createdAt) ?? undefined,
      authorUsername: str(src.creatorUsername),
      authorAvatar: str(src.creatorAvatarUrl),
    };
    return { kind: 'poster', poster };
  }
  if (kind === 'look') {
    const src = (row.look ?? data) as Record<string, unknown>;
    const id = str(src.id);
    const coverImageUri = str(src.mediaUrl) ?? str(src.coverImageUri);
    if (!id || !coverImageUri) return null;
    const look: Look = {
      id,
      creatorId: str(src.creatorId) ?? '',
      coverImageUri,
      title: str(src.title),
      itemIds: Array.isArray(src.itemIds) ? (src.itemIds as string[]) : [],
      createdAt: str(src.createdAt) ?? undefined,
      creatorUsername: str(src.creatorUsername),
      creatorAvatar: str(src.creatorAvatarUrl),
    };
    return { kind: 'look', look };
  }
  return null;
}

export interface FeedPage {
  units: FeedUnit[];
  listings: Listing[];
  nextCursor: string | null;
}

async function fetchFeed(path: string, signal?: AbortSignal, params?: { cursor?: string; limit?: number }): Promise<FeedPage> {
  const usp = new URLSearchParams();
  if (params?.cursor) usp.set('cursor', params.cursor);
  if (params?.limit) usp.set('limit', String(params.limit));
  const qs = usp.toString() ? `?${usp.toString()}` : '';
  const payload = await fetchJson<FeedResponse>(`${path}${qs}`, undefined, { signal });
  const units = (payload.items ?? [])
    .map(mapFeedRow)
    .filter((u): u is FeedUnit => u !== null);
  return {
    units,
    listings: units.filter((u): u is FeedUnit & { listing: Listing } => u.kind === 'listing' && !!u.listing).map((u) => u.listing),
    nextCursor: payload.nextCursor ?? null,
  };
}

export function fetchHomeFeed(signal?: AbortSignal, params?: { cursor?: string; limit?: number }) {
  return fetchFeed('/feed/home', signal, params);
}

export function fetchTrendingFeed(signal?: AbortSignal, params?: { cursor?: string; limit?: number }) {
  return fetchFeed('/feed/trending', signal, params);
}

export function fetchFollowingFeed(signal?: AbortSignal, params?: { cursor?: string; limit?: number }) {
  return fetchFeed('/feed/following', signal, params);
}

interface ListingFeedResponse {
  ok?: boolean;
  items?: BackendListingRow[];
  nextCursor?: string | null;
}

/**
 * GET /feed/following/listings — the authoritative Following surface:
 * one query joining user_follows → listings, full listing rows with
 * media + seller context, keyset cursor. Replaces the client-side
 * "filter the for-you units by followed ids" approximation, which could
 * only ever show followed sellers the recommendation serve happened to
 * include. Auth-gated — a 401 propagates to the caller's error state.
 */
export async function fetchFollowingListings(
  signal?: AbortSignal,
  params?: { cursor?: string; limit?: number },
): Promise<{ items: Listing[]; nextCursor: string | null }> {
  const usp = new URLSearchParams();
  if (params?.cursor) usp.set('cursor', params.cursor);
  if (params?.limit) usp.set('limit', String(params.limit));
  const qs = usp.toString() ? `?${usp.toString()}` : '';
  const payload = await fetchJson<ListingFeedResponse>(`/feed/following/listings${qs}`, undefined, { signal });
  return {
    items: mapBackendListings(payload.items ?? []),
    nextCursor: payload.nextCursor ?? null,
  };
}
