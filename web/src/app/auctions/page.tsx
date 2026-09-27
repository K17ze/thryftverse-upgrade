'use client';

/**
 * /auctions — the auction hall. One canonical scope rail matching the
 * mobile hub: Live | Upcoming | Results | Watching. Live gets the
 * editorial composition (runway + supporting tiles + continuation grid),
 * upcoming is a scheduled programme, results a settled ledger, watching
 * the viewer's compact grid. A personal attention strip surfaces the one
 * auction that needs the viewer most (outbid > won > leading into the
 * close). Countdowns tick on the board's shared now-clock.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import {
  AuctionAttentionStrip,
  AuctionBoardSkeleton,
  AuctionCard,
  AuctionResultRow,
  AuctionRunwayCard,
  AuctionScheduleRow,
  AuctionSupportingTile,
  type AttentionKind,
} from '@/components/auctions';
import { useAuctionBoard, useMyBids } from '@/lib/hooks/auction-queries';
import { useAuctionWatchlist } from '@/components/auctions/auctionWatchlist';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import type { AuctionLifecycle, MyBidStatus } from '@/lib/contracts/auction';

type Scope = AuctionLifecycle | 'watching';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ended', label: 'Results' },
  { value: 'watching', label: 'Watching' },
];

const EMPTY: Record<Scope, { title: string; subtitle: string }> = {
  live: {
    title: 'Nothing on the block',
    subtitle: 'Live auctions land here the moment they open.',
  },
  upcoming: {
    title: 'Nothing scheduled',
    subtitle: 'Auctions surface here ahead of their opening bid.',
  },
  ended: {
    title: 'No closed auctions',
    subtitle: 'Closed hammers and their results settle here.',
  },
  watching: {
    title: 'Not watching anything',
    subtitle: 'Watch an auction from its page and it stays pinned here.',
  },
};

export default function AuctionsPage() {
  const router = useRouter();
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();
  const { auctions, isLoading, isError, refetch } = useAuctionBoard();
  const { watched } = useAuctionWatchlist();
  const { board } = useMyBids(user?.id ?? '');
  const [scope, setScope] = useState<Scope>('live');

  const viewerStatus = useMemo(() => {
    const map = new Map<string, MyBidStatus>();
    for (const rows of Object.values(board)) {
      for (const row of rows) map.set(row.auction.id, row.status);
    }
    return map;
  }, [board]);

  const scoped = useMemo(() => {
    if (scope === 'watching') {
      return hydrated ? auctions.filter((a) => watched.has(a.id)) : [];
    }
    return auctions.filter((a) => a.lifecycle === scope);
  }, [auctions, scope, watched, hydrated]);

  const counts = useMemo(() => {
    const c = { live: 0, upcoming: 0, ended: 0, watching: 0 };
    for (const a of auctions) c[a.lifecycle] += 1;
    c.watching = hydrated ? watched.size : 0;
    return c;
  }, [auctions, watched, hydrated]);

  /** The one auction that needs the viewer — outbid first (ending
   *  soonest), then a win awaiting checkout, then a lead under an hour. */
  const attention = useMemo((): { kind: AttentionKind; row: (typeof board.outbid)[number] } | null => {
    if (isGuest) return null;
    const outbid = [...board.outbid].sort((a, b) => a.auction.msToEnd - b.auction.msToEnd)[0];
    if (outbid) return { kind: 'outbid', row: outbid };
    const won = board.won[0];
    if (won) return { kind: 'won', row: won };
    const leading = board.winning
      .filter((row) => row.auction.lifecycle === 'live' && row.auction.msToEnd < 60 * 60_000)
      .sort((a, b) => a.auction.msToEnd - b.auction.msToEnd)[0];
    if (leading) return { kind: 'leading', row: leading };
    return null;
  }, [board, isGuest]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-screen-title font-bold text-text-primary">Auctions</h1>
          <p className="mt-1 text-body text-text-secondary">
            3–24h windows · proxy bidding · anti-snipe in the last two minutes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/auctions/my-bids"
            className="pressable inline-flex h-11 items-center gap-1.5 rounded-md px-4 text-body-emphasis font-medium text-text-primary hover:bg-brand-subtle"
          >
            My bids
          </Link>
          <Link
            href="/auctions/create"
            className="pressable inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-body-emphasis font-semibold text-text-inverse hover:bg-brand-pressed"
          >
            <Icon name="plus" size={18} />
            Create
          </Link>
        </div>
      </header>

      <div className="mt-5">
        <SegmentedControl
          options={SCOPES.map((s) => ({ ...s, count: counts[s.value] }))}
          value={scope}
          onChange={setScope}
        />
      </div>

      {/* Personal strip — the single auction asking for the viewer now */}
      {attention ? (
        <div className="mt-5">
          <AuctionAttentionStrip
            kind={attention.kind}
            auction={attention.row.auction}
            myBid={attention.row.myBid}
          />
        </div>
      ) : null}

      <section className="mt-6">
        {isLoading ? (
          <AuctionBoardSkeleton />
        ) : isError ? (
          <EmptyState
            icon="alert"
            title="Couldn't load auctions"
            subtitle="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void refetch()}
          />
        ) : scope === 'watching' && isGuest ? (
          <EmptyState
            icon="eye"
            title="Sign in to see watched auctions"
            subtitle="Your watchlist lives on your account — sign in to view it."
            actionLabel="Sign in"
            onAction={() => router.push('/auth')}
          />
        ) : scope === 'watching' && !hydrated ? (
          <AuctionBoardSkeleton count={4} />
        ) : scoped.length === 0 ? (
          <EmptyState
            icon={scope === 'watching' ? 'eye' : 'auction'}
            title={EMPTY[scope].title}
            subtitle={EMPTY[scope].subtitle}
            actionLabel={scope === 'ended' || scope === 'watching' ? 'Browse live auctions' : 'Create an auction'}
            onAction={() =>
              scope === 'ended' || scope === 'watching'
                ? setScope('live')
                : router.push('/auctions/create')
            }
          />
        ) : scope === 'live' ? (
          <LiveScope auctions={scoped} />
        ) : scope === 'watching' ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
            {scoped.map((auction, index) => (
              <AuctionCard key={auction.id} auction={auction} priority={index < 4} />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle border-y border-border-subtle">
            {scoped.map((auction) =>
              scope === 'upcoming' ? (
                <AuctionScheduleRow key={auction.id} auction={auction} />
              ) : (
                <AuctionResultRow
                  key={auction.id}
                  auction={auction}
                  viewerStatus={viewerStatus.get(auction.id) ?? null}
                />
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Live scope composition — mobile's LiveComposition grammar. The
 * ending-soonest auction takes the runway; the next two stack beside it
 * as supporting tiles; the rest continue in the standard card grid.
 */
function LiveScope({ auctions }: { auctions: ReturnType<typeof useAuctionBoard>['auctions'] }) {
  const [featured, ...rest] = auctions;

  if (auctions.length === 1) {
    return <AuctionRunwayCard auction={featured} />;
  }

  if (auctions.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:gap-x-4">
        {auctions.map((auction) => (
          <AuctionCard key={auction.id} auction={auction} priority />
        ))}
      </div>
    );
  }

  const supporting = rest.slice(0, 2);
  const continuation = rest.slice(2);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
        <div className="min-w-0 lg:flex-[1.6]">
          <AuctionRunwayCard auction={featured} />
        </div>
        <div className="flex flex-col justify-center gap-5 lg:flex-1">
          {supporting.map((auction) => (
            <AuctionSupportingTile key={auction.id} auction={auction} />
          ))}
        </div>
      </div>
      {continuation.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 border-t border-border-subtle pt-6 md:grid-cols-3 xl:grid-cols-4">
          {continuation.map((auction) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
