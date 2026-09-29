'use client';

/**
 * /seller-hub/auctions — the seller's auction management surface. Port of
 * mobile SellerAuctionCentreScreen: the summary header (live count leads,
 * scheduled/sold/unsold beside it, bid context below), a counted tab rail,
 * and operational rows that deep-link into /auctions/[id]. Flat canvas,
 * hairlines, tnum — the hub grammar.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import {
  SellerAuctionRow,
  SellerAuctionSkeleton,
  SellerAuctionSummary,
  SELLER_EMPTY,
  buildSellerTabs,
  computeSellerStats,
  sellerAuctionBucket,
  type SellerAuctionBucket,
} from '@/components/auctions/seller';
import { useSellerAuctionBoard } from '@/lib/hooks/auction-queries';
import { useFulfilmentCounts } from '@/lib/hooks/seller-queries';
import { sortAuctions } from '@/lib/data/fixtures-auctions';

export default function SellerAuctionsPage() {
  const router = useRouter();
  const counts = useFulfilmentCounts();
  const { auctions, isLoading, isError, refetch } = useSellerAuctionBoard();
  const [tab, setTab] = useState<SellerAuctionBucket>('scheduled');

  const stats = useMemo(() => computeSellerStats(auctions), [auctions]);
  const tabs = useMemo(() => buildSellerTabs(stats), [stats]);
  const visible = useMemo(
    () => sortAuctions(auctions.filter((a) => sellerAuctionBucket(a) === tab)),
    [auctions, tab],
  );
  const empty = SELLER_EMPTY[tab];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <header className="flex items-end justify-between gap-3">
        <h1 className="text-screen-title text-text-primary">Auctions</h1>
        <Link
          href="/auctions/create"
          className="pressable inline-flex h-10 items-center gap-1.5 rounded-md bg-brand px-4 text-body-emphasis font-semibold text-text-inverse hover:bg-brand-pressed"
        >
          <Icon name="plus" size={16} />
          Create
        </Link>
      </header>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {isLoading ? (
        <div className="mt-8">
          <SellerAuctionSkeleton />
        </div>
      ) : isError ? (
        <EmptyState
          icon="alert"
          title="Couldn't load your auctions"
          subtitle="We couldn't reach the auction board. Try again in a moment."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      ) : (
        <>
          {stats.total > 0 ? <SellerAuctionSummary stats={stats} /> : null}

          <Tabs
            className="-mx-4 mt-7 sm:-mx-6"
            railClassName="px-1 sm:px-3"
            tabs={tabs.map((t) => ({
              key: t.value,
              label: t.label,
              count: t.count,
            }))}
            active={tab}
            onChange={setTab}
            ariaLabel="Auction sections"
          />

          <section className="mt-4" aria-label={`${tab} auctions`}>
            {visible.length === 0 ? (
              <EmptyState
                compact
                icon="auction"
                title={empty.title}
                subtitle={empty.message}
                actionLabel={empty.cta}
                onAction={empty.cta ? () => router.push('/auctions/create') : undefined}
              />
            ) : (
              <ul className="divide-y divide-border-subtle border-y border-border-subtle">
                {visible.map((auction) => (
                  <SellerAuctionRow key={auction.id} auction={auction} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
