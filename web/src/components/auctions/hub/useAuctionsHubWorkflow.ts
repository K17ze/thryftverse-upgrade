import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useAuctionBoard,
  useAuctionFacets,
  useAuctionHome,
  useMyBids,
  useWatchedAuctionBoard,
} from '@/lib/hooks/auction-queries';
import { useAuctionWatchlist } from '@/components/auctions/auctionWatchlist';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { DATA_MODE } from '@/lib/api/client';
import { listingById } from '@/lib/data/fixtures';
import { toViewModel, type MyBidRow } from '@/lib/data/fixtures-auctions';
import type { AuctionViewModel, MyBidStatus } from '@/lib/contracts/auction';
import type { AttentionKind } from '@/components/auctions';
import {
  type AuctionScope,
  ATTENTION_REASON_KIND,
} from './AuctionsHubPrimitives';

export function useAuctionsHubWorkflow() {
  const router = useRouter();
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();
  const [scope, setScope] = useState<AuctionScope>('live');
  const [selectedCategories, setSelectedCategories] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const categoriesCsv = useMemo(
    () => (selectedCategories.size ? [...selectedCategories].join(',') : undefined),
    [selectedCategories],
  );

  const { auctions, isLoading, isError, refetch } = useAuctionBoard(
    scope === 'watching' ? 'live' : scope,
    {
      categories: categoriesCsv,
      enabled: scope !== 'watching' || DATA_MODE !== 'live',
    },
  );

  const { watched } = useAuctionWatchlist();
  const { board } = useMyBids(user?.id ?? '');
  const watchedBoard = useWatchedAuctionBoard(watched, { enabled: scope === 'watching' });
  const { facets } = useAuctionFacets({ categories: categoriesCsv });
  const { home, skew: homeSkew } = useAuctionHome();
  const [liveSort, setLiveSort] = useState<'ending' | 'bids'>('ending');

  const boardRowsById = useMemo(() => {
    const map = new Map<string, MyBidRow>();
    for (const rows of Object.values(board)) {
      for (const row of rows) map.set(row.auction.id, row);
    }
    return map;
  }, [board]);

  const viewerStatus = useMemo(() => {
    const map = new Map<string, MyBidStatus>();
    for (const row of boardRowsById.values()) map.set(row.auction.id, row.status);
    return map;
  }, [boardRowsById]);

  const scoped = useMemo(() => {
    if (scope === 'watching') {
      return hydrated ? watchedBoard.auctions : [];
    }
    let rows = auctions.filter((a) => a.lifecycle === scope);
    if (DATA_MODE !== 'live' && selectedCategories.size > 0) {
      rows = rows.filter((a) =>
        selectedCategories.has(listingById(a.listingId)?.category ?? ''),
      );
    }
    if (scope === 'live' && liveSort === 'bids') {
      rows = [...rows].sort(
        (a, b) => b.bidCount - a.bidCount || a.msToEnd - b.msToEnd,
      );
    }
    return rows;
  }, [auctions, scope, watchedBoard.auctions, hydrated, liveSort, selectedCategories]);

  const counts = useMemo(() => {
    if (DATA_MODE === 'live' && facets) {
      return {
        live: facets.statusCounts.live,
        upcoming: facets.statusCounts.upcoming,
        ended: facets.statusCounts.results,
        watching: facets.statusCounts.watching,
      };
    }
    const c = { live: 0, upcoming: 0, ended: 0, watching: 0 };
    for (const a of auctions) {
      if (
        DATA_MODE !== 'live' &&
        selectedCategories.size > 0 &&
        !selectedCategories.has(listingById(a.listingId)?.category ?? '')
      ) {
        continue;
      }
      c[a.lifecycle] += 1;
    }
    c.watching = hydrated ? watched.size : 0;
    return c;
  }, [auctions, watched, hydrated, facets, selectedCategories]);

  const attention = useMemo((): {
    kind: AttentionKind;
    auction: AuctionViewModel;
    myBid?: number;
  } | null => {
    if (isGuest) return null;
    const serverPick = home?.attention;
    if (serverPick?.item && serverPick.reason && ATTENTION_REASON_KIND[serverPick.reason]) {
      const vm = toViewModel(serverPick.item, Date.now() + homeSkew);
      return {
        kind: ATTENTION_REASON_KIND[serverPick.reason],
        auction: vm,
        myBid: boardRowsById.get(vm.id)?.myBid,
      };
    }
    const outbid = [...board.outbid].sort((a, b) => a.auction.msToEnd - b.auction.msToEnd)[0];
    if (outbid) return { kind: 'outbid', auction: outbid.auction, myBid: outbid.myBid };
    const won = board.won[0];
    if (won) return { kind: 'won', auction: won.auction, myBid: won.myBid };
    const leading = board.winning
      .filter((row) => row.auction.lifecycle === 'live' && row.auction.msToEnd < 60 * 60_000)
      .sort((a, b) => a.auction.msToEnd - b.auction.msToEnd)[0];
    if (leading) return { kind: 'leading', auction: leading.auction, myBid: leading.myBid };
    return null;
  }, [board, isGuest, home, homeSkew, boardRowsById]);

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  return {
    router,
    isGuest,
    hydrated,
    scope,
    setScope,
    selectedCategories,
    toggleCategory,
    facets,
    liveSort,
    setLiveSort,
    isLoading,
    isError,
    refetch,
    watchedBoard,
    viewerStatus,
    scoped,
    counts,
    attention,
  };
}
