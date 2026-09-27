'use client';

/**
 * SellerAuctionSummary — port of mobile SellerAuctionSummary. One dominant
 * measure (active auctions, danger tone while any are live), a vertical
 * hairline, then the secondary counts; a quiet context line carries total
 * bids and the highest amount on the board. Flat — no card.
 */

import type { SellerAuctionStats } from './sellerAuctionModel';
import { formatPrice } from '@/lib/utils/format';

export function SellerAuctionSummary({ stats }: { stats: SellerAuctionStats }) {
  const active = stats.live;
  const hasBidContext = stats.totalBids > 0 && stats.highestBid > 0;
  const secondary: { label: string; value: number }[] = [
    { label: 'Scheduled', value: stats.scheduled },
    { label: 'Sold', value: stats.sold },
    { label: 'Unsold', value: stats.unsold },
  ];

  return (
    <section aria-label="Auction totals" className="mt-8">
      <div className="flex items-center gap-5">
        <div>
          <p
            className={`tnum text-display font-bold tracking-tight ${
              active > 0 ? 'text-danger-text' : 'text-text-primary'
            }`}
          >
            {active}
          </p>
          <p
            className={`mt-0.5 text-label font-semibold uppercase tracking-wider ${
              active > 0 ? 'text-danger-text' : 'text-text-muted'
            }`}
          >
            Active auctions
          </p>
        </div>
        <div className="h-16 w-px bg-border-subtle" aria-hidden="true" />
        <div className="flex flex-1 items-center justify-between gap-3">
          {secondary.map((m) => (
            <div key={m.label} className="flex-1 text-center">
              <p className="tnum text-price-list font-semibold text-text-primary">{m.value}</p>
              <p className="mt-0.5 text-meta text-text-muted">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
      {hasBidContext ? (
        <p className="tnum mt-4 border-t border-border-subtle pt-3 text-meta text-text-muted">
          {stats.totalBids} {stats.totalBids === 1 ? 'bid' : 'bids'} · Highest{' '}
          {formatPrice(stats.highestBid)}
        </p>
      ) : null}
    </section>
  );
}
