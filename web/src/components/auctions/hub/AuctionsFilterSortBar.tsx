import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { AuctionScope } from './AuctionsHubPrimitives';
import type { useAuctionFacets } from '@/lib/hooks/auction-queries';

export function AuctionsFilterSortBar({
  scope,
  facets,
  selectedCategories,
  onToggleCategory,
  isLoading,
  isError,
  scopedLength,
  liveSort,
  onSelectLiveSort,
}: {
  scope: AuctionScope;
  facets?: ReturnType<typeof useAuctionFacets>['facets'];
  selectedCategories: ReadonlySet<string>;
  onToggleCategory: (categoryId: string) => void;
  isLoading: boolean;
  isError: boolean;
  scopedLength: number;
  liveSort: 'ending' | 'bids';
  onSelectLiveSort: (sort: 'ending' | 'bids') => void;
}) {
  return (
    <>
      {/* Category filter — facet-driven, so every chip is a real
          constraint with its live count. Hidden when the inventory has
          ≤1 category or no facets (a facet failure narrows nothing). */}
      {scope !== 'watching' && (facets?.categories.length ?? 0) > 1 ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter by category"
        >
          {facets!.categories.map((category) => {
            const active = selectedCategories.has(category.id);
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleCategory(category.id)}
                className={`pressable inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold ${
                  active
                    ? 'bg-brand-subtle text-text-primary'
                    : 'bg-surface-alt text-text-secondary hover:text-text-primary'
                }`}
              >
                {category.label.charAt(0).toUpperCase() + category.label.slice(1)}
                <span className="tnum font-normal text-text-muted">{category.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Live-scope ordering — ending soonest is the default; the board
          can flip to the contested lots. Same quiet toggle grammar as
          the my-bids ending-soonest chip. */}
      {scope === 'live' && !isLoading && !isError && scopedLength > 1 ? (
        <div
          className="mt-4 flex items-center gap-2"
          role="group"
          aria-label="Sort live auctions"
        >
          {(
            [
              { key: 'ending' as const, label: 'Ending soon', icon: 'clock' as const },
              { key: 'bids' as const, label: 'Most bids', icon: 'fire' as const },
            ]
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={liveSort === option.key}
              onClick={() => onSelectLiveSort(option.key)}
              className={`pressable inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold ${
                liveSort === option.key
                  ? 'bg-brand-subtle text-text-primary'
                  : 'bg-surface-alt text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon name={option.icon} size={14} />
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
