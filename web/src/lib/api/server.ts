/**
 * Server-side entity resolution for public detail routes.
 *
 * The page shells call these before rendering their client view so a
 * missing entity ends at notFound() (404 + not-found.tsx) instead of the
 * old soft-404 (HTTP 200 + EmptyState). generateMetadata on the same
 * route reads the same resolver — React `cache()` dedupes the pair per
 * request, so live mode makes one backend call, not two.
 *
 * Every resolver answers a tri-state:
 *  - 'resolved'     → the entity exists; render the client view.
 *  - 'missing'      → definitive miss; the page calls notFound().
 *  - 'unresolvable' → the server can't know — entities whose truth lives
 *    client-side only (session-created listings/auctions/boards/outfits
 *    held in module stores or persisted state) or behind auth the server
 *    doesn't carry. The client view renders and upgrades its own
 *    definitive miss to notFound().
 *
 * Live reads reuse the same services the client hooks call; the http
 * transport is SSR-safe (absolute env base URL, storage access guarded).
 * A 404 is a verdict; 401/403, timeouts and 5xx mean "the client must
 * decide" — never a fabricated gravestone.
 */

import { cache } from 'react';
import { DATA_MODE } from './client';
import { ApiRequestError } from './http';
import * as listingsService from './services/listings';
import * as usersService from './services/users';
import * as auctionsService from './services/auctions';
import * as socialService from './services/social';
import * as galleriaService from './services/galleria';
import * as coownService from './services/coown';
import {
  CATEGORIES,
  MOODBOARDS,
  POSTERS,
  STORY_RAIL,
  USERS,
  listingById,
  userById,
} from '@/lib/data/fixtures';
import { AUCTIONS } from '@/lib/data/fixtures-auctions';
import { lookById, publicMoodboardById } from '@/lib/data/fixtures-content';
import {
  GALLERIA_EDITORIALS,
  GALLERIA_FEATURED_COLLECTIONS,
} from '@/lib/data/fixtures-media';
import { archiveStoryById } from '@/lib/data/fixtures-posters';
import { curatedById, type CuratedCollection } from '@/lib/data/fixtures-collections';
import { syndicateById } from '@/lib/data/fixtures-syndicate';
import { coOwnAssetById } from '@/lib/data/fixtures-coown';

export type RouteResolution<T> =
  | { status: 'resolved'; value: T }
  | { status: 'missing' }
  | { status: 'unresolvable' };

export function resolved<T>(value: T): RouteResolution<T> {
  return { status: 'resolved', value };
}

export function missing<T = never>(): RouteResolution<T> {
  return { status: 'missing' };
}

export function unresolvable<T = never>(): RouteResolution<T> {
  return { status: 'unresolvable' };
}

/**
 * Wrap a public live fetch. A thrown 404 and a null payload are both
 * definitive misses (services normalise `{ ok: false }` to null);
 * auth walls and transient failures stay 'unresolvable' so the client's
 * authenticated/session-aware resolution keeps the final say.
 */
async function fromLive<T>(run: () => Promise<T | null>): Promise<RouteResolution<T>> {
  try {
    const value = await run();
    return value == null ? missing() : resolved(value);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return missing();
    }
    return unresolvable();
  }
}

export const resolveListingForRoute = cache(async (id: string) => {
  if (DATA_MODE === 'live') {
    return fromLive(() => listingsService.fetchListingById(id));
  }
  const listing = listingById(id);
  // Sell flow publishes push into MY_LISTINGS client-side — a fixture
  // miss here isn't a verdict the server can give.
  return listing ? resolved(listing) : unresolvable();
});

export const resolveMemberForRoute = cache(async (username: string) => {
  if (DATA_MODE === 'live') {
    return fromLive(() => usersService.fetchUserByUsername(username));
  }
  const user = USERS.find((u) => u.username === username);
  return user ? resolved(user) : missing();
});

export const resolveUserForRoute = cache(async (id: string) => {
  if (DATA_MODE === 'live') {
    return fromLive(() => usersService.fetchUserProfile(id));
  }
  const user = userById(id);
  return user ? resolved(user) : missing();
});

export const resolveAuctionForRoute = cache(async (id: string) => {
  if (DATA_MODE === 'live') {
    return fromLive(() => auctionsService.fetchAuctionDetail(id));
  }
  const auction = AUCTIONS.find((a) => a.id === id);
  // Session-created auctions live in the client runtime store — a seeded
  // miss is not a verdict.
  return auction ? resolved(auction) : unresolvable();
});

export const resolveLookForRoute = cache(async (id: string) => {
  if (DATA_MODE === 'live') {
    return fromLive(() => socialService.fetchLook(id));
  }
  const look = lookById(id);
  return look ? resolved(look) : missing();
});

export const resolveMoodboardForRoute = cache(async (id: string) => {
  if (DATA_MODE === 'live') {
    // fetchMoodboard folds 404 to null — a null return IS the verdict.
    return fromLive(() => socialService.fetchMoodboard(id));
  }
  const board = MOODBOARDS.find((b) => b.id === id) ?? publicMoodboardById(id);
  // Boards the member created this session persist in boardPrefs —
  // invisible to the server, so a fixture miss stays undecided.
  return board ? resolved(board) : unresolvable();
});

export const resolvePosterForRoute = cache(async (id: string) => {
  if (DATA_MODE === 'live') {
    // fetchPosterStory folds 404 to null — the verdict.
    return fromLive(() => socialService.fetchPosterStory(id));
  }
  const hit =
    POSTERS.find((p) => p.id === id) ??
    archiveStoryById(id) ??
    STORY_RAIL.find((s) => s.id === id);
  return hit ? resolved(hit) : missing();
});

export const resolveGalleriaCollectionForRoute = cache(async (id: string) => {
  if (DATA_MODE === 'live') {
    return fromLive(() => galleriaService.fetchGalleriaCollection(id));
  }
  const collection = GALLERIA_FEATURED_COLLECTIONS.find((c) => c.id === id);
  return collection ? resolved(collection) : missing();
});

export const resolveGalleriaEditorialForRoute = cache(async (id: string) => {
  if (DATA_MODE === 'live') {
    return fromLive(() => galleriaService.fetchGalleriaEditorial(id));
  }
  const editorial = GALLERIA_EDITORIALS.find((e) => e.id === id);
  return editorial ? resolved(editorial) : missing();
});

export const resolveExploreCollectionForRoute = cache(async (id: string) => {
  if (DATA_MODE === 'live') {
    // Curated edits are member-gated — the server carries no session, so
    // the live verdict belongs to the client (it renders the members
    // wall for guests, not-found for resolved misses).
    return unresolvable<CuratedCollection>();
  }
  const collection = curatedById(id);
  return collection ? resolved(collection) : missing();
});

export const resolvePoolForRoute = cache(async (id: string) => {
  // Live pools don't exist as a backend surface — the page renders the
  // PoolLiveNotice branch and resolution never runs.
  const pool = syndicateById(id);
  // Session-created pools live in the syndicates query store.
  return pool ? resolved(pool) : unresolvable();
});

export const resolveCoOwnAssetForRoute = cache(async (id: string) => {
  if (DATA_MODE === 'live') {
    return fromLive(() => coownService.fetchCoOwnAsset(id));
  }
  const asset = coOwnAssetById(id);
  return asset ? resolved(asset) : missing();
});

export function resolveCategoryForRoute(slug: string) {
  // The taxonomy is a static catalogue in both modes — a slug miss is
  // always definitive.
  const category = CATEGORIES.find((c) => c.slug === slug);
  return category ? resolved(category) : missing();
}
