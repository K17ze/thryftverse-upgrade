'use client';

/**
 * ResultsSurface — the shared results engine for search, category and
 * browse. Owns sort + facet state, the filter sheet, the results toolbar
 * and the masonry grid with full state coverage (skeleton / empty /
 * filtered-empty / populated).
 *
 * The toolbar is sticky under the app header (64px desktop, +42px for
 * the <lg department rail) so count, sort and filters stay reachable
 * over the scrolling grid. Active facets render as removable chips —
 * the web elevation of mobile's "N filters applied / Clear" row.
 *
 * Mount with a `key` when the result context changes to reset facets.
 */

import { useMemo, useState } from 'react';
import { MasonryGrid } from '@/components/feed/MasonryGrid';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { CATEGORIES } from '@/lib/data/fixtures';
import {
  mapListingToDiscoverySummary,
  type DiscoveryFeedUnit,
  type Listing,
} from '@/lib/contracts/domain';
import {
  applyListingFilters,
  countActiveFilters,
  EMPTY_FILTERS,
  sortListings,
  type ListingFilters,
  type SortKey,
} from './filterTypes';
import { FilterSheet } from './FilterSheet';
import { SortMenu } from './SortMenu';
import { useResultColumns } from './useResultColumns';

interface ResultsSurfaceProps {
  listings: Listing[];
  isLoading: boolean;
  /** Renders above the toolbar; receives the filtered count (null while loading). */
  heading?: (count: number | null) => React.ReactNode;
  /** Category facet is hidden when the surface is already category-scoped. */
  hideCategoryFilter?: boolean;
  /** Seed filters — used to replay a saved-search URL. */
  initialFilters?: ListingFilters;
  /** Quiet line under the toolbar — e.g. a "did you mean" correction. */
  notice?: React.ReactNode;
  onSaveSearch?: (filters: ListingFilters) => void;
  /** Empty state when the unfiltered set is empty. */
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export function ResultsSurface({
  listings,
  isLoading,
  heading,
  hideCategoryFilter,
  initialFilters,
  notice,
  onSaveSearch,
  emptyTitle = 'Nothing here yet',
  emptySubtitle = 'Check back soon — new items arrive daily.',
  emptyActionLabel,
  onEmptyAction,
}: ResultsSurfaceProps) {
  const columns = useResultColumns();
  const [sort, setSort] = useState<SortKey>('relevance');
  const [filters, setFilters] = useState<ListingFilters>(
    initialFilters ?? EMPTY_FILTERS,
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = useMemo(
    () => sortListings(applyListingFilters(listings, filters), sort),
    [listings, filters, sort],
  );
  const activeCount = countActiveFilters(filters);

  const units = useMemo<DiscoveryFeedUnit[]>(
    () =>
      filtered.map((l) => ({
        type: 'listing',
        id: `listing-${l.id}`,
        listing: mapListingToDiscoverySummary(l),
      })),
    [filtered],
  );

  /**
   * One removable chip per active facet value — conditions fan out,
   * price range collapses to a single chip. Removing is honest: the
   * grid reflows immediately, matching live-apply in the sheet.
   */
  const activeChips = useMemo<ActiveChip[]>(() => {
    const set = (next: Partial<ListingFilters>) =>
      setFilters({ ...filters, ...next });
    const chips: ActiveChip[] = filters.conditions.map((c) => ({
      key: `condition:${c}`,
      label: c,
      onRemove: () =>
        set({ conditions: filters.conditions.filter((x) => x !== c) }),
    }));
    if (filters.priceMin != null || filters.priceMax != null) {
      const label =
        filters.priceMin != null && filters.priceMax != null
          ? `£${filters.priceMin}–£${filters.priceMax}`
          : filters.priceMax != null
            ? `Under £${filters.priceMax}`
            : `£${filters.priceMin}+`;
      chips.push({
        key: 'price',
        label,
        onRemove: () => set({ priceMin: null, priceMax: null }),
      });
    }
    if (filters.category) {
      chips.push({
        key: 'category',
        label:
          CATEGORIES.find((c) => c.slug === filters.category)?.name ??
          filters.category,
        onRemove: () => set({ category: null }),
      });
    }
    if (filters.size.trim()) {
      chips.push({
        key: 'size',
        label: `Size ${filters.size.trim()}`,
        onRemove: () => set({ size: '' }),
      });
    }
    if (filters.brand.trim()) {
      chips.push({
        key: 'brand',
        label: filters.brand.trim(),
        onRemove: () => set({ brand: '' }),
      });
    }
    return chips;
  }, [filters]);

  return (
    <div>
      {/* Sticky results toolbar — count left, sort + filter right; sits
          under the 64px header (+42px department rail below lg). Flat
          canvas, translucent bg + hairline — same grammar as the shell. */}
      <div className="sticky top-[106px] z-elevated border-b border-border-subtle bg-background/95 backdrop-blur-sm lg:top-16">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pb-2.5 pt-2 sm:px-6">
          <div className="min-w-0 flex-1">
            {heading?.(isLoading ? null : filtered.length)}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <SortMenu value={sort} onChange={setSort} />
            <Button
              variant="secondary"
              size="sm"
              icon="filter"
              onClick={() => setSheetOpen(true)}
            >
              Filters{activeCount > 0 ? ` · ${activeCount}` : ''}
            </Button>
          </div>
        </div>

        {/* Active facets — scrollable single row, per-facet remove, then
            a quiet reset. Only rendered while filters are applied. */}
        {activeChips.length > 0 ? (
          <div
            className="no-scrollbar -mt-0.5 flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 sm:px-6"
            role="list"
            aria-label="Active filters"
          >
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                role="listitem"
                onClick={chip.onRemove}
                aria-label={`Remove filter: ${chip.label}`}
                className="pressable inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-surface-alt pl-3 pr-2 text-caption font-semibold text-text-primary hover:bg-surface-raised"
              >
                {chip.label}
                <Icon name="close" size={13} className="text-text-muted" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="pressable h-8 shrink-0 px-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </div>

      <div className="pt-3">
        {notice ? <div className="px-4 pb-2 sm:px-6">{notice}</div> : null}
        {isLoading || units.length > 0 ? (
          <MasonryGrid units={units} columns={columns} isLoading={isLoading} />
        ) : activeCount > 0 ? (
          <EmptyState
            icon="filter"
            title="No matches with these filters"
            subtitle="Try widening the price range or removing a filter."
            actionLabel="Clear filters"
            onAction={() => setFilters(EMPTY_FILTERS)}
          />
        ) : (
          <EmptyState
            icon="search"
            title={emptyTitle}
            subtitle={emptySubtitle}
            actionLabel={emptyActionLabel}
            onAction={onEmptyAction}
          />
        )}
      </div>

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onChange={setFilters}
        resultCount={filtered.length}
        hideCategory={hideCategoryFilter}
        onSaveSearch={
          onSaveSearch ? () => onSaveSearch(filters) : undefined
        }
      />
    </div>
  );
}
