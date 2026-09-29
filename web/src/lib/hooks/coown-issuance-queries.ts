/**
 * Co-Own issuance hooks — live-only surface (issuance is a real write;
 * fixture mode renders the notice in the view instead). Preflight +
 * inventory reads plus the create mutation for /co-own/create.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { useMyListings } from '@/lib/hooks/queries';
import * as issuance from '@/lib/api/services/coownIssuance';
import type { Listing } from '@/lib/contracts/domain';

/** Advisory issuer-verification read — the same profile row
 *  POST /co-own/assets enforces against. Disabled for guests and in
 *  fixture mode; errors propagate so the view can offer a retry rather
 *  than silently downgrading to a denial. */
export function useIssuerVerification(userId: string | undefined) {
  return useQuery({
    queryKey: ['coown', 'issuer-verification', userId ?? ''],
    enabled: DATA_MODE === 'live' && !!userId,
    queryFn: ({ signal }): Promise<issuance.IssuerVerification | null> =>
      issuance.fetchIssuerVerification(userId as string, signal),
    // Advisory only — the write re-checks; don't serve a tier long past
    // the moment the user may have completed verification elsewhere.
    staleTime: 60_000,
  });
}

export interface IssuableListingsResult {
  /** Listings the issuance contract accepts — the server re-checks
   *  ownership + status='active' transactionally on submit; this filter
   *  is the honest client-side mirror (sold/paused/draft rows excluded). */
  items: Listing[];
  /** All inventory rows loaded — distinguishes "nothing listed" from
   *  "nothing eligible" for the empty state. */
  inventoryCount: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** The issuer's own co-ownable listings — reuses the sell flow's
 *  inventory read (useMyListings → GET /users/:id/listings). */
export function useIssuableListings(opts?: { enabled?: boolean }): IssuableListingsResult {
  const query = useMyListings({ enabled: opts?.enabled });
  const inventory = query.data ?? [];
  return {
    items: inventory.filter((l) => l.status === 'active' && !l.isSold),
    inventoryCount: inventory.length,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

/** POST /co-own/assets — one shot per call (no query retries: the route
 *  has no idempotency key; the caller supplies the stable client `id`).
 *  On success the assets catalogue, the issuer's portfolio and the
 *  source listing's reads are all stale — issuance pauses the listing
 *  and mints a holding in the same transaction. */
export function useCreateCoOwnAsset() {
  const qc = useQueryClient();
  return useMutation({
    retry: 0,
    mutationFn: (input: issuance.CreateCoOwnAssetInput) =>
      issuance.createCoOwnAsset(input),
    onSuccess: (asset) => {
      void qc.invalidateQueries({ queryKey: ['coown', 'assets'] });
      void qc.invalidateQueries({ queryKey: ['coown', 'positions'] });
      void qc.invalidateQueries({ queryKey: ['my-listings'] });
      if (asset.listingId) {
        void qc.invalidateQueries({ queryKey: ['listing', asset.listingId] });
        void qc.invalidateQueries({ queryKey: ['coown', 'asset-by-listing', asset.listingId] });
      }
    },
  });
}
