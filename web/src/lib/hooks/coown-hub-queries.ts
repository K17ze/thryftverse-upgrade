'use client';

/**
 * Co-Own hub queries — the hub's own read path, distinct from
 * coown-queries.ts (single-page reads shared by the detail/portfolio
 * surfaces). Here the hub consumes the full GET /co-own/assets contract:
 * the debounced `search` term rides the wire (server-side ILIKE on
 * title + issuer jurisdiction) and the base64-offset `cursor` paginates
 * through `useInfiniteQuery`. The server-backed watchlist
 * (/co-own/watchlist) sits beside it — one query feeds the Watchlist
 * tab's payloads and the persisted store's hydration.
 */

import { useEffect } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as coownService from '@/lib/api/services/coown';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { CO_OWN_ASSETS } from '@/lib/data/fixtures-coown';
import { useSession } from '@/lib/session/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import {
  applyServerCoOwnWatchlist,
  armCoOwnWatchlistHydration,
  useCoOwnWatchlist,
} from '@/lib/store/coownWatchlist';

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/** The hub's page size — the endpoint caps `limit` at 200. */
const HUB_MARKETS_PAGE_LIMIT = 60;

/** The hub's sort-control vocabulary. */
export type CoOwnMarketsSort = 'volume' | 'newest' | 'movers' | 'price_desc' | 'price_asc';

/** Web sort key → GET /co-own/assets `sort` wire value. 'movers' has no
 *  server ordering — the live sort control omits it, so this only ever
 *  maps the four wire-backed keys in practice. */
const WIRE_SORT: Record<
  CoOwnMarketsSort,
  'volume' | 'price_asc' | 'price_desc' | 'newest'
> = {
  volume: 'volume',
  newest: 'newest',
  movers: 'volume',
  price_desc: 'price_desc',
  price_asc: 'price_asc',
};

interface CoOwnMarketsPage {
  items: CoOwnAsset[];
  nextCursor: string | null;
}

/**
 * The hub's paged market read — keyed `['coown','markets',{search,tab,
 * sort}]` so every refinement caches under its own entry and the tab is
 * ready for a server-side lifecycle split. Live mode pushes `search` +
 * `sort` + `cursor` to GET /co-own/assets, so a sort change re-pages the
 * whole board in the new order rather than re-sorting loaded rows;
 * fixture mode serves the authored CO_OWN_ASSETS page and reports no
 * cursor (the caller keeps the local match and the local sort).
 * `select` flattens pages with boundary dedupe by asset id — the offset
 * cursor can re-emit a row when the weighted order drifts between page
 * fetches.
 */
export function useCoOwnMarkets(
  options: {
    search?: string;
    tab?: string;
    sort?: CoOwnMarketsSort;
    enabled?: boolean;
  } = {},
) {
  const search = (options.search ?? '').trim();
  const tab = options.tab ?? 'all';
  const sort = WIRE_SORT[options.sort ?? 'volume'];
  return useInfiniteQuery({
    queryKey: ['coown', 'markets', { search, tab, sort }],
    enabled: options.enabled ?? true,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<CoOwnMarketsPage> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnAssets(
          {
            search: search || undefined,
            cursor: pageParam,
            limit: HUB_MARKETS_PAGE_LIMIT,
            sort,
          },
          signal,
        );
      }
      await tick();
      return { items: CO_OWN_ASSETS, nextCursor: null };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // A keystroke pause re-keys the query — keep the last result visible
    // until the new page lands instead of flashing the empty state.
    placeholderData: keepPreviousData,
    select: (d): CoOwnAsset[] => {
      const seen = new Set<string>();
      const items: CoOwnAsset[] = [];
      for (const page of d.pages) {
        for (const asset of page.items) {
          if (seen.has(asset.id)) continue;
          seen.add(asset.id);
          items.push(asset);
        }
      }
      return items;
    },
  });
}

export const coOwnWatchlistQueryKey = (userId: string | undefined) =>
  ['coown', 'watchlist', userId ?? 'guest'] as const;

/**
 * The account's server watchlist — GET /co-own/watchlist rows carry the
 * identical asset payload /co-own/assets emits (same mapper). Live +
 * signed-in only: guests and fixture mode stay on the local store, so
 * the query stays disabled rather than 401ing. `enabled` lets a surface
 * defer its own refetch until the tab is visible; enabling later
 * re-reads because the data is always stale (staleTime: 0 — stars
 * written elsewhere must reconcile on activation).
 */
export function useCoOwnWatchlistAssets(options: { enabled?: boolean } = {}) {
  const { user } = useSession();
  return useQuery({
    queryKey: coOwnWatchlistQueryKey(user?.id),
    enabled: (options.enabled ?? true) && DATA_MODE === 'live' && !!user,
    queryFn: ({ signal }): Promise<CoOwnAsset[]> =>
      coownService.fetchCoOwnWatchlist({ limit: 200 }, signal),
    staleTime: 0,
  });
}

/** Stale-error cutoff — a failure written where no sync hook was mounted
 *  (e.g. the asset-detail star) is consumed quietly rather than toasting
 *  long after the fact. */
const SYNC_ERROR_TOAST_WINDOW_MS = 15_000;

/**
 * Watchlist ⟷ server lifecycle — mount once on surfaces that render the
 * star. Hydrates the persisted store from GET /co-own/watchlist once per
 * resolved account (the query above owns the fetch; arm/apply keeps
 * mid-flight toggles and drops reads that land after an identity
 * change), then toasts a failed write after its rollback. Guests and
 * fixture mode never reach the API — every branch no-ops.
 */
export function useCoOwnWatchlistSync() {
  const { user } = useSession();
  const { show } = useToast();
  const userId = user?.id ?? null;
  // The hydration read — the same cache entry the Watchlist tab renders.
  const watchlist = useCoOwnWatchlistAssets();
  const syncError = useCoOwnWatchlist((s) => s.syncError);
  const clearSyncError = useCoOwnWatchlist((s) => s.clearSyncError);

  // Arm before the read lands — the baseline snapshot is what splits
  // stars toggled while the fetch is in flight.
  useEffect(() => {
    if (userId) armCoOwnWatchlistHydration(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId || watchlist.data === undefined) return;
    applyServerCoOwnWatchlist(
      userId,
      watchlist.data.map((a) => a.id),
    );
  }, [userId, watchlist.data]);

  useEffect(() => {
    if (!syncError) return;
    clearSyncError();
    if (Date.now() - syncError.at <= SYNC_ERROR_TOAST_WINDOW_MS) {
      show(syncError.message, 'error');
    }
  }, [syncError, show, clearSyncError]);
}
