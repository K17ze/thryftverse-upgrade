/**
 * Co-Own history hooks — the viewer's settlement ledger and the
 * cross-channel market activity feed. Both backends are auth-scoped:
 * live queries stay disabled without a session user (guests get the
 * sign-in wall upstream), and neither has a fixture dataset — fixture
 * mode resolves an honest empty first page rather than invented rows.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as history from '@/lib/api/services/coownHistory';
import { useSession } from '@/lib/session/SessionProvider';

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

const HISTORY_PAGE_SIZE = 25;

/**
 * The viewer's settlement ledger — every matched trade they cleared,
 * newest first. `nextCursor` is the last row's created_at; Load more
 * passes it back verbatim.
 */
export function useCoOwnSettlements(status?: history.CoOwnSettlementStatus) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  return useInfiniteQuery({
    queryKey: ['coown', 'settlements', userId ?? 'anon', status ?? 'all'],
    // The route is auth-gated — no token means a 401, so guests never fire it.
    enabled: DATA_MODE !== 'live' || !!userId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<history.CoOwnSettlementsPage> => {
      if (DATA_MODE === 'live') {
        if (!userId) return { items: [], nextCursor: null };
        return history.fetchCoOwnSettlements(
          userId,
          { status, cursor: pageParam, limit: HISTORY_PAGE_SIZE },
          signal,
        );
      }
      await tick();
      return { items: [], nextCursor: null };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * The viewer's own market activity across both channels — auction bids
 * and co-own orders, one merged ledger. `channel` is a server-side
 * filter; the cursor is the wire's {cursorTs, cursorId} pair.
 */
export function useMyMarketHistory(
  channel: history.MarketHistoryChannelFilter = 'all',
) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  return useInfiniteQuery({
    queryKey: ['coown', 'market-history', userId ?? 'anon', channel],
    enabled: DATA_MODE !== 'live' || !!userId,
    initialPageParam: undefined as history.MarketHistoryCursor | undefined,
    queryFn: async ({ pageParam, signal }): Promise<history.MarketHistoryPage> => {
      if (DATA_MODE === 'live') {
        if (!userId) return { items: [], pageInfo: { hasMore: false } };
        return history.fetchMyMarketHistory(
          userId,
          { channel, limit: HISTORY_PAGE_SIZE, cursor: pageParam },
          signal,
        );
      }
      await tick();
      return { items: [], pageInfo: { hasMore: false } };
    },
    getNextPageParam: (last) => last.pageInfo.nextCursor,
  });
}
