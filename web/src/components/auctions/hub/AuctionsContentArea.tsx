import React from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AuctionBoardSkeleton,
  AuctionCard,
  AuctionResultRow,
  AuctionScheduleRow,
} from '@/components/auctions';
import { AuctionsLiveScope } from './AuctionsLiveScope';
import {
  type AuctionScope,
  AUCTION_EMPTY_COPY,
} from './AuctionsHubPrimitives';
import type { AuctionViewModel, MyBidStatus } from '@/lib/contracts/auction';
import type { useWatchedAuctionBoard } from '@/lib/hooks/auction-queries';

export function AuctionsContentArea({
  isLoading,
  isError,
  refetch,
  scope,
  isGuest,
  hydrated,
  watchedBoard,
  scoped,
  viewerStatus,
  onNavigateAuth,
  onNavigateCreate,
  onSwitchLiveScope,
}: {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  scope: AuctionScope;
  isGuest: boolean;
  hydrated: boolean;
  watchedBoard: ReturnType<typeof useWatchedAuctionBoard>;
  scoped: AuctionViewModel[];
  viewerStatus: Map<string, MyBidStatus>;
  onNavigateAuth: () => void;
  onNavigateCreate: () => void;
  onSwitchLiveScope: () => void;
}) {
  return (
    <section className="mt-6">
      {isLoading ? (
        <AuctionBoardSkeleton />
      ) : isError ? (
        <EmptyState
          icon="alert"
          title="Couldn't load auctions"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={refetch}
        />
      ) : scope === 'watching' && isGuest ? (
        <EmptyState
          icon="eye"
          title="Sign in to see watched auctions"
          subtitle="Your watchlist lives on your account — sign in to view it."
          actionLabel="Sign in"
          onAction={onNavigateAuth}
        />
      ) : scope === 'watching' && !hydrated ? (
        <AuctionBoardSkeleton count={4} />
      ) : scope === 'watching' && watchedBoard.isLoading ? (
        <AuctionBoardSkeleton count={4} />
      ) : scope === 'watching' && watchedBoard.isError ? (
        <EmptyState
          icon="alert"
          title="Couldn't load auctions"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void watchedBoard.refetch()}
        />
      ) : scoped.length === 0 ? (
        <EmptyState
          icon={scope === 'watching' ? 'eye' : 'auction'}
          title={AUCTION_EMPTY_COPY[scope].title}
          subtitle={AUCTION_EMPTY_COPY[scope].subtitle}
          actionLabel={
            scope === 'ended' || scope === 'watching'
              ? 'Browse live auctions'
              : 'Create an auction'
          }
          onAction={() =>
            scope === 'ended' || scope === 'watching'
              ? onSwitchLiveScope()
              : onNavigateCreate()
          }
        />
      ) : scope === 'live' ? (
        <AuctionsLiveScope auctions={scoped} viewerStatus={viewerStatus} />
      ) : scope === 'watching' ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 xl:grid-cols-5">
          {scoped.map((auction, index) => (
            <AuctionCard
              key={auction.id}
              auction={auction}
              priority={index < 5}
              viewerStatus={viewerStatus.get(auction.id) ?? null}
            />
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
  );
}
