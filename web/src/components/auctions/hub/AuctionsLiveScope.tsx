import React from 'react';
import {
  AuctionCard,
  AuctionRunwayCard,
  AuctionSupportingTile,
} from '@/components/auctions';
import type { AuctionViewModel, MyBidStatus } from '@/lib/contracts/auction';

/**
 * Live scope composition — mobile's LiveComposition grammar. The
 * ending-soonest auction takes the runway; the next two stack beside it
 * as supporting tiles; the rest continue in the standard card grid.
 * `viewerStatus` carries the my-bids board's per-auction position so
 * every tile can mark Leading/Outbid when the viewer is in the race.
 */
export function AuctionsLiveScope({
  auctions,
  viewerStatus,
}: {
  auctions: AuctionViewModel[];
  viewerStatus: Map<string, MyBidStatus>;
}) {
  if (auctions.length === 0) return null;
  const [featured, ...rest] = auctions;
  const statusOf = (id: string) => viewerStatus.get(id) ?? null;

  if (auctions.length === 1) {
    return <AuctionRunwayCard auction={featured} viewerStatus={statusOf(featured.id)} />;
  }

  if (auctions.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:gap-x-4">
        {auctions.map((auction) => (
          <AuctionCard
            key={auction.id}
            auction={auction}
            priority
            viewerStatus={statusOf(auction.id)}
          />
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
          <AuctionRunwayCard auction={featured} viewerStatus={statusOf(featured.id)} />
        </div>
        <div className="flex flex-col justify-center gap-5 lg:flex-1">
          {supporting.map((auction) => (
            <AuctionSupportingTile
              key={auction.id}
              auction={auction}
              viewerStatus={statusOf(auction.id)}
            />
          ))}
        </div>
      </div>
      {continuation.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 border-t border-border-subtle pt-6 md:grid-cols-3 xl:grid-cols-5">
          {continuation.map((auction) => (
            <AuctionCard
              key={auction.id}
              auction={auction}
              viewerStatus={statusOf(auction.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
