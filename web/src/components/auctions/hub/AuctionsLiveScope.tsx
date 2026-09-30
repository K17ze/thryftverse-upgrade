import React from 'react';
import {
  AuctionCard,
  AuctionRunwayCard,
  AuctionSupportingTile,
} from '@/components/auctions';
import type { AuctionViewModel } from '@/lib/contracts/auction';

/**
 * Live scope composition — mobile's LiveComposition grammar. The
 * ending-soonest auction takes the runway; the next two stack beside it
 * as supporting tiles; the rest continue in the standard card grid.
 */
export function AuctionsLiveScope({ auctions }: { auctions: AuctionViewModel[] }) {
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
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 border-t border-border-subtle pt-6 md:grid-cols-3 xl:grid-cols-5">
          {continuation.map((auction) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
