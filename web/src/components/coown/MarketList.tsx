'use client';

import { useMemo } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import type {
  AssetLifecycleState,
  CandlePoint,
  CoOwnAsset,
} from '@/lib/contracts/coown';
import { usePriceHistoryMap } from '@/lib/hooks/coown-queries';
import { useLoadMoreSentinel } from '@/lib/hooks/useLoadMoreSentinel';
import { MARKET_GRID, MarketRow } from './MarketRow';

/** States worth a lifecycle tag when the caller doesn't narrow the set —
 *  everything except a plain trading row. */
const NON_TRADING_TAG_STATES: readonly AssetLifecycleState[] = [
  'initialOffering',
  'tradingPaused',
  'exitUnderway',
];

/**
 * Polymarket-style market list — flat rows over hairlines, column rail
 * on md+. The pagination tail mirrors the home feed: an
 * IntersectionObserver sentinel auto-loads while the server has a
 * nextCursor, a visible "Load more" button is the manual fallback, and
 * a failed append pauses auto-loading behind an inline retry (the
 * sentinel would otherwise re-fire on every intersection while it sits
 * in view).
 */
export function MarketList({
  assets,
  watched,
  onToggleWatch,
  lifecycleTagStates = NON_TRADING_TAG_STATES,
  hasMore = false,
  isLoadingMore = false,
  loadMoreError = false,
  onLoadMore,
}: {
  assets: CoOwnAsset[];
  watched: ReadonlySet<string>;
  onToggleWatch: (assetId: string) => void;
  /** Lifecycle states worth a row tag — narrowed by the caller to the
   *  states the current tab doesn't already assert. */
  lifecycleTagStates?: readonly AssetLifecycleState[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMoreError?: boolean;
  onLoadMore?: () => void;
}) {
  const sentinelRef = useLoadMoreSentinel(
    hasMore && !isLoadingMore && !loadMoreError,
    onLoadMore,
  );

  // One batched read covers every visible row's 7d series — a per-row
  // hook would fan out to a request per row as the list pages.
  const assetIds = useMemo(() => assets.map((a) => a.id), [assets]);
  const history = usePriceHistoryMap(assetIds, '1W');
  const candlesById = useMemo(() => {
    const map = new Map<string, CandlePoint[]>();
    for (const h of history) map.set(h.assetId, h.candles);
    return map;
  }, [history]);

  if (assets.length === 0) {
    return (
      <EmptyState
        compact
        icon="search"
        title="Nothing in this category yet"
        subtitle="Check another segment or check back soon."
      />
    );
  }

  return (
    <section aria-label="Co-Own markets">
      <div className={`${MARKET_GRID} gap-4 border-b border-border-subtle px-1 pb-2`}>
        <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Market</span>
        <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Price</span>
        <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">7d</span>
        <span className="hidden text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted lg:block">
          Holders
        </span>
        <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">24h vol</span>
        <span className="hidden text-micro font-semibold uppercase tracking-[0.08em] text-text-muted lg:block">
          Allocated
        </span>
        <span className="sr-only">Watch</span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {assets.map((asset) => (
          <MarketRow
            key={asset.id}
            asset={asset}
            watched={watched.has(asset.id)}
            onToggleWatch={onToggleWatch}
            candles={candlesById.get(asset.id)}
            lifecycleTagStates={lifecycleTagStates}
          />
        ))}
      </ul>

      {/* Tail: sentinel + button while pages remain, inline retry on a
          failed append. Absent entirely when the server has no
          nextCursor (and always in fixture mode). */}
      {hasMore ? (
        <>
          <div ref={sentinelRef} className="h-px" aria-hidden />
          <div className="flex flex-col items-center gap-1 px-4 py-5">
            {loadMoreError ? (
              <>
                <p className="text-meta text-text-muted">Couldn&rsquo;t load more markets</p>
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="pressable -my-1 min-h-11 rounded-full px-4 text-body font-semibold text-brand"
                >
                  Try again
                </button>
              </>
            ) : isLoadingMore ? (
              <>
                <Icon name="refresh" size={18} className="animate-spin text-text-muted" />
                <p className="sr-only" role="status">
                  Loading more markets
                </p>
              </>
            ) : (
              <button
                type="button"
                onClick={onLoadMore}
                className="pressable min-h-11 rounded-full px-4 text-body font-semibold text-brand"
              >
                Load more markets
              </button>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
