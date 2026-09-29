'use client';

/**
 * /auctions/my-bids — auction activity for the viewer, eBay/mobile
 * grammar: Active (outbid first — those rows carry the alert), Won, Lost,
 * and Watching (the persisted watchlist set). An ending-soonest sort chip
 * sits on the Active scope; every row lands on its auction.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { MyBidRow, AuctionRowSkeleton, AuctionBoardSkeleton, AuctionCard } from '@/components/auctions';
import { useMyBids, useWatchedAuctionBoard } from '@/lib/hooks/auction-queries';
import { useAuctionWatchlist } from '@/components/auctions/auctionWatchlist';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import type { MyBidRow as MyBidRowModel } from '@/lib/data/fixtures-auctions';

type Tab = 'active' | 'won' | 'lost' | 'watching';

const TABS: { value: Tab; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'watching', label: 'Watching' },
];

const EMPTY_COPY: Record<Tab, { title: string; subtitle: string }> = {
  active: {
    title: 'No active bids',
    subtitle: 'Auctions where your bid is leading — or has been passed — land here.',
  },
  won: {
    title: 'No wins yet',
    subtitle: 'Auctions you win settle here with the final price.',
  },
  lost: {
    title: 'Nothing lost',
    subtitle: "Auctions that closed above your bids appear here.",
  },
  watching: {
    title: 'Not watching anything',
    subtitle: 'Watch an auction from its page and it stays pinned here.',
  },
};

export default function MyBidsPage() {
  const router = useRouter();
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();
  // Guests have no bid ledger — the fixture 'me' rows belong to the
  // signed-in demo identity, never to an anonymous viewer.
  const viewerId = user?.id;
  const { board, isLoading, isError, refetch } = useMyBids(viewerId ?? '');
  const { watched } = useAuctionWatchlist();
  const [tab, setTab] = useState<Tab>('active');
  const [endingSoonest, setEndingSoonest] = useState(false);
  // Watching is a server-side scope (watchedOnly) in live mode — the old
  // localStorage ∩ board-page-1 intersection silently dropped watched
  // lots beyond the first page. Fixture mode keeps the local set.
  const {
    auctions: watchedAuctions,
    isLoading: watchedLoading,
    isError: boardError,
    refetch: refetchBoard,
  } = useWatchedAuctionBoard(watched, { enabled: tab === 'watching' });

  // Active = outbid + winning + unresolved 'active' bids merged. Outbid
  // rows always lead — they are the alerts — then the leads, then the
  // bids whose lead the serve couldn't resolve; each group sorted the
  // same way.
  const activeRows = useMemo<MyBidRowModel[]>(() => {
    const byEnd = (a: MyBidRowModel, b: MyBidRowModel) => a.auction.msToEnd - b.auction.msToEnd;
    const placed = (a: MyBidRowModel, b: MyBidRowModel) =>
      Date.parse(b.placedAt) - Date.parse(a.placedAt);
    const sort = endingSoonest ? byEnd : placed;
    return [
      ...[...board.outbid].sort(sort),
      ...[...board.winning].sort(sort),
      ...[...board.active].sort(sort),
    ];
  }, [board, endingSoonest]);

  const rows = tab === 'active' ? activeRows : tab === 'won' ? board.won : board.lost;
  const watchingRows = useMemo(
    () => (hydrated ? watchedAuctions : []),
    [watchedAuctions, hydrated],
  );

  if (isGuest) {
    return (
      <div className="mx-auto w-full max-w-[820px] px-4 pb-16 pt-6 sm:px-6 lg:max-w-[1280px]">
        <h1 className="text-screen-title text-text-primary">My bids</h1>
        <div className="mt-8">
          <EmptyState
            icon="auction"
            title="Sign in to see your bids"
            subtitle="Your outbids, leads and wins settle here once you have an account."
            actionLabel="Sign in"
            onAction={() => router.push('/auth')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 pb-16 pt-6 sm:px-6 lg:max-w-[1280px]">
      <h1 className="text-screen-title text-text-primary">My bids</h1>
      <Tabs<Tab>
        className="-mx-4 mt-4 sm:-mx-6"
        railClassName="px-1 sm:px-3"
        tabs={TABS.map((t) => ({
          key: t.value,
          label: t.label,
          count:
            t.value === 'active'
              ? activeRows.length
              : t.value === 'won'
                ? board.won.length
                : t.value === 'lost'
                  ? board.lost.length
                  : watchingRows.length,
        }))}
        active={tab}
        onChange={setTab}
        ariaLabel="Bid sections"
      />

      {/* Ending-soonest sort — the active-scope utility toggle (mobile
          parity), honest ordering against the real window. */}
      {tab === 'active' && activeRows.length > 1 ? (
        <div className="mt-4">
          <button
            type="button"
            aria-pressed={endingSoonest}
            onClick={() => setEndingSoonest((v) => !v)}
            className={`pressable inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold ${
              endingSoonest
                ? 'bg-brand-subtle text-text-primary'
                : 'bg-surface-alt text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon name="clock" size={14} />
            Ending soonest
          </button>
        </div>
      ) : null}

      <div className="mt-5">
        {isLoading ? (
          <div className="flex flex-col">
            {Array.from({ length: 3 }).map((_, index) => (
              <AuctionRowSkeleton key={index} />
            ))}
          </div>
        ) : tab === 'watching' ? (
          !hydrated || watchedLoading ? (
            <AuctionBoardSkeleton count={4} />
          ) : boardError ? (
            <EmptyState
              icon="alert"
              title="Couldn't load auctions"
              subtitle="Check your connection and try again."
              actionLabel="Try again"
              onAction={() => void refetchBoard()}
            />
          ) : watchingRows.length === 0 ? (
            <EmptyState
              icon="eye"
              title={EMPTY_COPY.watching.title}
              subtitle={EMPTY_COPY.watching.subtitle}
              actionLabel="Browse auctions"
              onAction={() => router.push('/auctions')}
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {watchingRows.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} />
              ))}
            </div>
          )
        ) : isError ? (
          <EmptyState
            icon="alert"
            title="Couldn't load your bids"
            subtitle="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="auction"
            title={EMPTY_COPY[tab].title}
            subtitle={EMPTY_COPY[tab].subtitle}
            actionLabel="Browse auctions"
            onAction={() => router.push('/auctions')}
          />
        ) : (
          <>
            {/* Column header at lg — mirrors MyBidRow's cell geometry. */}
            <div
              aria-hidden
              className="hidden items-center gap-3 border-b border-border-subtle pb-2 lg:flex"
            >
              <span className="w-16 shrink-0" />
              <span className="min-w-0 flex-1 text-label text-text-muted">
                Auction
              </span>
              <span className="w-32 shrink-0 text-label text-text-muted">
                Status
              </span>
              <span className="w-48 shrink-0 text-label text-text-muted">
                Your bid
              </span>
              <span className="w-44 shrink-0 text-right text-label text-text-muted">
                Closes
              </span>
            </div>
            <ul className="divide-y divide-border-subtle border-y border-border-subtle lg:border-t-0">
              {rows.map((row) => (
                <MyBidRow key={row.auction.id} row={row} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
