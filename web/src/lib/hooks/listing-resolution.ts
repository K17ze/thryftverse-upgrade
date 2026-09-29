'use client';

/**
 * Listing-id resolution — the one live/fixture split for id lists.
 *
 * Persisted id lists (wishlist, saved, bag, boards, outfits, offers) hold
 * bare listing ids. Fixture mode resolves them against the authored
 * catalogue (`listingById`); live mode asks GET /listings/:id per id —
 * the same read the PDP's `useListing` makes, batch-settled so one dead
 * id never displaces its neighbours. A live id that fails to resolve
 * (deleted listing, request failure) is dropped and counted — never
 * swapped for a fixture row, so a live surface can't render catalogue
 * ghosts as if they were the member's real items.
 *
 * Pattern source: `useBagListings` / `useRecentlyViewedListings` — same
 * position-preserving settle, shared here so every id-list consumer
 * (board collages, outfit tray/cards, offer rows, order enrichment) uses
 * one grammar. Callers should pass a stable array (useMemo) — the query
 * keys on the joined ids, so an unstable identity only costs a re-join,
 * not a refetch.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { fetchListingById } from '@/lib/api/services/listings';
import { fetchSellerSummary } from '@/lib/api/services/users';
import { listingById } from '@/lib/data/fixtures';
import type { Listing } from '@/lib/contracts/domain';

export interface ResolvedIdListings {
  /** Resolved listings in input order, misses dropped. */
  items: Listing[];
  /** id → listing for O(1) lookups at merge sites. */
  byId: Map<string, Listing>;
  /** Live only — ids the server could not resolve (deleted or failed). */
  unresolvedCount: number;
  /** Live fetches in flight; always false in fixture mode. */
  isLoading: boolean;
}

export function useListingIds(ids: readonly string[]): ResolvedIdListings {
  // Stable key — callers often pass inline arrays; keying on the joined
  // ids keeps the query cache hit across re-renders.
  const idsKey = useMemo(() => ids.join('\n'), [ids]);
  const uniqueIds = useMemo(
    () => (idsKey ? [...new Set(idsKey.split('\n'))] : []),
    [idsKey],
  );

  const liveQuery = useQuery({
    queryKey: ['listing-ids', idsKey],
    enabled: DATA_MODE === 'live' && uniqueIds.length > 0,
    // Position-preserving settle — a failed id lands null and is dropped
    // at read time, never displacing its neighbours.
    queryFn: async ({ signal }): Promise<(Listing | null)[]> => {
      const results = await Promise.allSettled(
        uniqueIds.map((id) => fetchListingById(id, signal)),
      );
      return results.map((r) => (r.status === 'fulfilled' ? r.value : null));
    },
  });

  return useMemo(() => {
    if (DATA_MODE === 'live') {
      const byId = new Map<string, Listing>();
      for (const row of liveQuery.data ?? []) {
        if (row) byId.set(row.id, row);
      }
      const items: Listing[] = [];
      for (const id of uniqueIds) {
        const listing = byId.get(id);
        if (listing) items.push(listing);
      }
      return {
        items,
        byId,
        unresolvedCount: Math.max(0, uniqueIds.length - byId.size),
        isLoading: liveQuery.isLoading,
      };
    }
    const byId = new Map<string, Listing>();
    for (const id of uniqueIds) {
      const listing = listingById(id);
      if (listing) byId.set(id, listing);
    }
    return {
      items: [...byId.values()],
      byId,
      unresolvedCount: 0,
      isLoading: false,
    };
  }, [uniqueIds, liveQuery.data, liveQuery.isLoading]);
}

/**
 * Live seller summary by id — the counterparty identity rails render
 * (username, avatar, rating). Fixture mode stays disabled; callers fall
 * back to the catalogue's `userById`. Null data = the seller is gone or
 * the read failed — callers render the honest placeholder, never a
 * catalogue ghost.
 */
export function useSellerSummary(sellerId: string | null | undefined) {
  return useQuery({
    queryKey: ['seller-summary', sellerId],
    enabled: DATA_MODE === 'live' && !!sellerId,
    queryFn: ({ signal }) => fetchSellerSummary(sellerId as string, signal),
    staleTime: 60_000,
  });
}
