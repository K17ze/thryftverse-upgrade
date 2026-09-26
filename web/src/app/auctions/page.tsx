'use client';

/**
 * /auctions — the auction hall. Lifecycle segmented control over a
 * media-first card grid; live auctions lead, countdowns tick, the window
 * progress hairline shows how far each hammer has travelled.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { AuctionCard, AuctionBoardSkeleton } from '@/components/auctions';
import { useAuctionBoard } from '@/lib/hooks/auction-queries';
import type { AuctionLifecycle } from '@/lib/contracts/auction';

const SCOPES: { value: AuctionLifecycle; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ended', label: 'Ended' },
];

const EMPTY: Record<AuctionLifecycle, { title: string; subtitle: string }> = {
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
};

export default function AuctionsPage() {
  const router = useRouter();
  const { auctions, isLoading } = useAuctionBoard();
  const [scope, setScope] = useState<AuctionLifecycle>('live');

  const scoped = useMemo(
    () => auctions.filter((auction) => auction.lifecycle === scope),
    [auctions, scope],
  );

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-screen-title font-bold text-text-primary">Auctions</h1>
          <p className="mt-1 text-body text-text-secondary">
            Six-hour windows · 5% increments · anti-snipe to the last two minutes
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
          options={SCOPES}
          value={scope}
          onChange={setScope}
        />
      </div>

      <section className="mt-6">
        {isLoading ? (
          <AuctionBoardSkeleton />
        ) : scoped.length === 0 ? (
          <EmptyState
            icon="auction"
            title={EMPTY[scope].title}
            subtitle={EMPTY[scope].subtitle}
            actionLabel={scope === 'ended' ? 'Browse live auctions' : 'Create an auction'}
            onAction={() =>
              scope === 'ended' ? setScope('live') : router.push('/auctions/create')
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
            {scoped.map((auction, index) => (
              <AuctionCard key={auction.id} auction={auction} priority={index < 4} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
