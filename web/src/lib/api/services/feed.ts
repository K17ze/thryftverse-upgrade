/**
 * Web feed service — mirrors frontend/src/services/feedApi.ts.
 * `/feed/home`, `/feed/following`, `/feed/trending` return
 * `{ items, nextCursor }` where units can be listing | poster | look rows.
 */

import { fetchJson } from '../http';
import {
  mapBackendListingToListing,
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

function mapFeedRow(row: FeedRow): FeedUnit | null {
  const kind = row.kind ?? row.type ?? row.entityType ?? 'listing';
  if (kind === 'listing') {
    const listing = row.listing
      ? mapBackendListingToListing(row.listing)
      : mapBackendListingToListing(row as unknown as BackendListingRow);
    return listing ? { kind: 'listing', listing } : null;
  }
  if (kind === 'poster' && row.poster) return { kind: 'poster', poster: row.poster };
  if (kind === 'look' && row.look) return { kind: 'look', look: row.look };
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
