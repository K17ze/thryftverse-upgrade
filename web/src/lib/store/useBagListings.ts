'use client';

/**
 * Bag listing resolution — bag entries are bare listing ids persisted in
 * the local store. Fixture mode resolves them against the authored
 * catalogue (listingById); live mode asks GET /listings/:id per id — the
 * same read the PDP's useListing makes, batch-fetched so a multi-item bag
 * renders real listings.
 *
 * A live id that fails to resolve (deleted listing, request failure) is
 * dropped and counted so the surface can say so — never swapped for a
 * fixture row. Sold listings resolve but stay out of the purchasable set,
 * matching the fixture path's sold-out handling.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { fetchListingById } from '@/lib/api/services/listings';
import { listingById } from '@/lib/data/fixtures';
import type { Listing } from '@/lib/contracts/domain';

export interface ResolvedBagListings {
  /** Resolved, unsold listings in bag order. */
  items: Listing[];
  /** Entries that resolved to a sold listing — excluded, reported. */
  soldOutCount: number;
  /** Live only — ids the server could not resolve (deleted or failed
   *  fetch). The rows are dropped honestly, not replaced with fixtures. */
  unresolvedCount: number;
  /** Live fetches in flight; always false in fixture mode. */
  isLoading: boolean;
}

export function useBagListings(entries: { listingId: string }[]): ResolvedBagListings {
  // Stable key — the zustand bag array gets a new identity on every store
  // write; the query must key on the ids themselves.
  const idsKey = useMemo(() => entries.map((e) => e.listingId).join('\n'), [entries]);
  const ids = useMemo(() => (idsKey ? idsKey.split('\n') : []), [idsKey]);

  const liveQuery = useQuery({
    queryKey: ['bag-listings', idsKey],
    enabled: DATA_MODE === 'live' && ids.length > 0,
    // Position-preserving settle — a failed id never displaces its
    // neighbours; it lands null and is dropped at read time.
    queryFn: async (): Promise<(Listing | null)[]> => {
      const results = await Promise.allSettled(ids.map((id) => fetchListingById(id)));
      return results.map((r) => (r.status === 'fulfilled' ? r.value : null));
    },
  });

  return useMemo(() => {
    if (DATA_MODE === 'live') {
      const rows = liveQuery.data ?? [];
      const resolvedCount = rows.filter((l) => l !== null).length;
      return {
        items: rows.filter((l): l is Listing => l !== null && !l.isSold),
        soldOutCount: rows.filter((l) => l?.isSold === true).length,
        unresolvedCount: Math.max(0, ids.length - resolvedCount),
        isLoading: liveQuery.isLoading,
      };
    }
    const resolved = ids.map((id) => listingById(id));
    return {
      items: resolved.filter((l): l is Listing => !!l && !l.isSold),
      soldOutCount: resolved.filter((l) => l?.isSold === true).length,
      unresolvedCount: 0,
      isLoading: false,
    };
  }, [ids, liveQuery.data, liveQuery.isLoading]);
}
