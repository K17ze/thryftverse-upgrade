'use client';

import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { DATA_MODE } from '@/lib/api/client';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import type { User } from '@/lib/contracts/domain';
import { MarketList } from '../MarketList';
import {
  INFORMATIVE_TAG_STATES,
  type HubView,
} from './hubTypes';

function WatchlistRowsSkeleton() {
  return (
    <ul className="divide-y divide-border-subtle" aria-busy="true" aria-label="Loading watchlist">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 px-1 py-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4" style={{ maxWidth: `${52 - (i % 3) * 9}%` }} />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="hidden h-6 w-20 sm:block" />
          <Skeleton className="hidden h-4 w-12 md:block" />
          <Skeleton className="h-4 w-14" />
        </li>
      ))}
    </ul>
  );
}

interface HubMarketBoardProps {
  view: HubView;
  user: User | null;
  query: string;
  onClearQuery: () => void;
  onSwitchView: (v: HubView) => void;
  inScope: CoOwnAsset[];
  marketRows: CoOwnAsset[];
  watchedRows: CoOwnAsset[];
  watched: Set<string>;
  onToggleWatch: (assetId: string) => void;
  isMarketsError: boolean;
  onRetryMarkets: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  onFetchNextPage: () => void;
  isWatchlistPending: boolean;
  isWatchlistError: boolean;
  onRetryWatchlist: () => void;
}

export function HubMarketBoard({
  view,
  user,
  query,
  onClearQuery,
  onSwitchView,
  inScope,
  marketRows,
  watchedRows,
  watched,
  onToggleWatch,
  isMarketsError,
  onRetryMarkets,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  onFetchNextPage,
  isWatchlistPending,
  isWatchlistError,
  onRetryWatchlist,
}: HubMarketBoardProps) {
  if (view !== 'watchlist') {
    if (isMarketsError && marketRows.length === 0) {
      return (
        <EmptyState
          icon="warning"
          title="Couldn't load markets"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={onRetryMarkets}
        />
      );
    }

    if (inScope.length > 0) {
      return (
        <MarketList
          assets={inScope}
          watched={watched}
          onToggleWatch={onToggleWatch}
          lifecycleTagStates={INFORMATIVE_TAG_STATES[view]}
          hasMore={DATA_MODE === 'live' && hasNextPage === true}
          isLoadingMore={isFetchingNextPage}
          loadMoreError={isFetchNextPageError}
          onLoadMore={onFetchNextPage}
        />
      );
    }

    return (
      <EmptyState
        icon={query ? 'search' : 'trending'}
        title={query ? 'No matches' : view === 'offerings' ? 'No open offerings' : 'Nothing trading yet'}
        subtitle={
          query
            ? `No ${view === 'offerings' ? 'offerings' : 'markets'} match “${query.trim()}”.`
            : view === 'offerings'
              ? 'Every drop is fully allocated right now — the secondary board carries the action.'
              : 'Open offerings allocate first; the secondary board wakes when they fill.'
        }
        actionLabel={query ? 'Clear search' : view === 'offerings' ? 'See trading markets' : undefined}
        onAction={query ? onClearQuery : view === 'offerings' ? () => onSwitchView('trading') : undefined}
      />
    );
  }

  // Watchlist View
  if (DATA_MODE === 'live' && user) {
    if (isWatchlistPending) {
      return <WatchlistRowsSkeleton />;
    }
    if (isWatchlistError) {
      return (
        <EmptyState
          icon="warning"
          title="Couldn't load your watchlist"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={onRetryWatchlist}
        />
      );
    }
  }

  if (watchedRows.length > 0) {
    return (
      <MarketList
        assets={watchedRows}
        watched={watched}
        onToggleWatch={onToggleWatch}
        lifecycleTagStates={INFORMATIVE_TAG_STATES.watchlist}
      />
    );
  }

  return (
    <EmptyState
      icon="star"
      title="Nothing watched yet"
      subtitle="Star a market and it waits for you here — prices, 24h moves and the week's trend at a glance."
      actionLabel="Browse markets"
      onAction={() => onSwitchView('trading')}
    />
  );
}
