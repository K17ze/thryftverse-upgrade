'use client';

/**
 * /auctions/my-bids — auction activity for the viewer. Four states derived
 * from the bid ledger: outbid, winning, won, lost. Rows land on the live
 * auction; each tab carries its own empty state.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { EmptyState } from '@/components/ui/EmptyState';
import { MyBidRow, AuctionRowSkeleton } from '@/components/auctions';
import { useMyBids } from '@/lib/hooks/auction-queries';
import { useSession } from '@/lib/session/SessionProvider';

type Tab = 'outbid' | 'winning' | 'won' | 'lost';

const TABS: { value: Tab; label: string }[] = [
  { value: 'outbid', label: 'Outbid' },
  { value: 'winning', label: 'Winning' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const EMPTY_COPY: Record<Tab, { title: string; subtitle: string }> = {
  outbid: {
    title: 'No outbids',
    subtitle:
      'When someone passes your bid, the auction lands here for a quick second move.',
  },
  winning: {
    title: 'Not leading anywhere',
    subtitle: 'Auctions where your bid is on top will show up here.',
  },
  won: {
    title: 'No wins yet',
    subtitle: 'Auctions you win settle here with the final price.',
  },
  lost: {
    title: 'Nothing lost',
    subtitle: 'Auctions that closed above your bids appear here.',
  },
};

export default function MyBidsPage() {
  const router = useRouter();
  const { user } = useSession();
  const viewerId = user?.id ?? 'me';
  const { board, isLoading } = useMyBids(viewerId);
  const [tab, setTab] = useState<Tab>('outbid');

  const rows = useMemo(() => board[tab], [board, tab]);

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 pb-16 pt-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-screen-title font-bold text-text-primary">My bids</h1>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="flex flex-col">
            {Array.from({ length: 3 }).map((_, index) => (
              <AuctionRowSkeleton key={index} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="auction"
            title={EMPTY_COPY[tab].title}
            subtitle={EMPTY_COPY[tab].subtitle}
            actionLabel="Browse auctions"
            onAction={() => router.push('/auctions')}
          />
        ) : (
          <ul className="divide-y divide-border-subtle border-y border-border-subtle">
            {rows.map((row) => (
              <MyBidRow key={row.auction.id} row={row} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
