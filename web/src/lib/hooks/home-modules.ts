'use client';

/**
 * Home module-band queries — live-mode reads for the rails interleaved
 * through HomeFeed. Every hook is disabled in fixture mode; the rails
 * keep the authored dataset there. In live mode an empty or failed
 * response resolves to [] / null and the rail hides — home modules are
 * editorial density, not critical path, so absence beats fabrication.
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { fetchLooks } from '@/lib/api/services/social';
import { fetchTrendingFeed } from '@/lib/api/services/feed';
import { fetchMoodboards } from '@/lib/api/services/social';
import { fetchListingById } from '@/lib/api/services/listings';
import { fetchSellerSummary, fetchUserProfile, type SellerSummary } from '@/lib/api/services/users';
import type { Listing, User } from '@/lib/contracts/domain';
import { listingById } from '@/lib/data/fixtures';
import { useSessionIdentity } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useRecentlyViewed } from '@/lib/store/recentlyViewed';

const LIVE = DATA_MODE === 'live';

/**
 * Resolve arbitrary listing ids against the active data source — the
 * shared resolver behind recently-viewed, bag bundles and saved rails.
 * Fixture mode resolves ids synchronously from the bundled catalogue;
 * live mode fetches each id through GET /listings/:id — ids that 404 or
 * fail drop out rather than rendering a dead card.
 *
 * NOTE (N+1): the wire has NO bulk by-ids contract — GET /listings takes
 * query/facets/cursor but no `ids` param, and lib/api/client.ts (agent
 * W-owned, read-only here) exposes no batch accessor. Until a bulk
 * endpoint exists the per-id settle stays, but each resolved row is
 * seeded into its canonical `['listing', id]` cache entry — the PDP's
 * `useListing` then mounts warm instead of re-fetching a listing this
 * rail just resolved. Ids are deduped so a repeated id costs one fetch.
 */
export function useResolvedListings(ids: readonly string[]) {
  const hydrated = useHydrated();
  const qc = useQueryClient();
  const key = ids.join('|');
  const wanted = useMemo(
    () => (hydrated ? [...new Set(key.split('|').filter(Boolean))] : []),
    [hydrated, key],
  );

  const query = useQuery({
    queryKey: ['resolve-listings', wanted],
    queryFn: async ({ signal }) => {
      const resolved = await Promise.all(
        wanted.map((id) => fetchListingById(id, signal).catch(() => null)),
      );
      return resolved.filter((l): l is Listing => l !== null);
    },
    enabled: LIVE && wanted.length > 0,
    staleTime: 60_000,
  });

  // Seed the canonical per-listing cache entries so a tap through to the
  // PDP renders the already-resolved listing instead of a cold fetch.
  // Stale-stamped (updatedAt 0) and never clobbers an existing row — the
  // PDP's own fetch still revalidates on mount and a fresher detail read
  // always wins over module data.
  useEffect(() => {
    for (const listing of query.data ?? []) {
      const key = ['listing', listing.id] as const;
      if (qc.getQueryData(key) !== undefined) continue;
      qc.setQueryData(key, listing, { updatedAt: 0 });
    }
  }, [qc, query.data]);

  const items: Listing[] = LIVE
    ? (query.data ?? [])
    : wanted
        .map(listingById)
        .filter((l): l is Listing => l != null);
  return { items, isLoading: LIVE && query.isLoading };
}

/**
 * Resolve user ids against the active data source — the member-side
 * counterpart of `useResolvedListings` (blocked/restricted member rows).
 * Live ids fetch through GET /users/:id/profile; misses drop.
 */
export function useResolvedUsers(ids: readonly string[]) {
  const hydrated = useHydrated();
  const key = ids.join('|');
  const wanted = useMemo(
    () => (hydrated ? key.split('|').filter(Boolean) : []),
    [hydrated, key],
  );

  const query = useQuery({
    queryKey: ['resolve-users', wanted],
    queryFn: async ({ signal }) => {
      const resolved = await Promise.all(
        wanted.map((id) => fetchUserProfile(id, signal).catch(() => null)),
      );
      return resolved.filter((u): u is User => u !== null);
    },
    enabled: LIVE && wanted.length > 0,
    staleTime: 60_000,
  });

  return { items: query.data ?? [], isLoading: LIVE && query.isLoading };
}

/**
 * Recently-viewed listings resolved against the active data source.
 * Capped at 12 — the persisted trail can hold more, the rail never
 * needs more.
 */
export function useRecentlyViewedListings(excludeId?: string) {
  const ids = useRecentlyViewed((s) => s.listingIds);
  const wanted = ids
    .filter((id) => id !== excludeId)
    .slice(0, 12);
  return useResolvedListings(wanted);
}

/** /looks — public published looks for the "Looks to shop" band. */
export function useLooksRail(limit = 12) {
  const query = useQuery({
    queryKey: ['home', 'looks-rail', limit],
    queryFn: ({ signal }) => fetchLooks({ limit }, signal),
    enabled: LIVE,
    staleTime: 5 * 60_000,
  });
  return { ...query, looks: query.data ?? [] };
}

/** /moodboards — public boards for the "Member edits" band. */
export function useMemberEdits(limit = 12) {
  const query = useQuery({
    queryKey: ['home', 'member-edits', limit],
    queryFn: ({ signal }) => fetchMoodboards(signal),
    enabled: LIVE,
    staleTime: 5 * 60_000,
  });
  const boards = (query.data ?? [])
    // Public boards only, and only ones with real imagery — an empty
    // collage card is placeholder chrome, so the board stays out.
    .filter(
      (b) =>
        b.isPublic !== false &&
        ((b.thumbs?.length ?? 0) > 0 || Boolean(b.coverUri)),
    )
    .slice(0, limit);
  return { ...query, boards };
}

/**
 * Featured sellers — the backend has no "featured sellers" endpoint, so
 * the rail derives candidates from the real trending feed (the sellers
 * who actually dominate it) and enriches them through GET /sellers/:id —
 * real ratings, real listing counts. Cards for sellers the enrich call
 * can't resolve are dropped, not rendered with fabricated stats.
 */
export function useFeaturedSellers(limit = 6) {
  const { user } = useSessionIdentity();
  const myId = LIVE ? (user?.id ?? null) : null;
  return useQuery({
    queryKey: ['home', 'featured-sellers', myId, limit],
    queryFn: async ({ signal }) => {
      const feed = await fetchTrendingFeed(signal, { limit: 40 });
      const sellerIds: string[] = [];
      for (const u of feed.units) {
        const id = u.kind === 'listing' ? u.listing?.sellerId : undefined;
        if (!id || id === myId || sellerIds.includes(id)) continue;
        sellerIds.push(id);
        if (sellerIds.length >= limit) break;
      }
      const resolved = await Promise.all(
        sellerIds.map((id) => fetchSellerSummary(id, signal).catch(() => null)),
      );
      return resolved.filter((s): s is SellerSummary => s !== null);
    },
    enabled: LIVE,
    staleTime: 5 * 60_000,
  });
}
