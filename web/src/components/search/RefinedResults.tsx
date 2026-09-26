'use client';

/**
 * RefinedResults — the results engine for search, category and browse.
 * eBay grammar on desktop (lg+): a sticky refinement rail on the left
 * (real facet counts, collapsible groups) beside the results column;
 * mobile keeps the sticky count/sort/filter toolbar + filter sheet.
 *
 * Sort arrives controlled (persisted in the URL by the page via
 * useSortParam) so a sorted result set survives share and back.
 * Facets stay in component state; active ones render as removable
 * chips with a quiet "Clear all". Full state coverage: skeleton,
 * filtered-empty, empty, populated.
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
} from '@/components/filters/filterTypes';
import { FilterSheet } from '@/components/filters/FilterSheet';
import { useResultColumns } from '@/components/filters/useResultColumns';
import { RefinementRail } from './RefinementRail';
import { SortDropdown } from './SortDropdown';

interface ResultsChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface RefinedResultsProps {
  listings: Listing[];
  isLoading: boolean;
  /** Rendered in the toolbar; receives the filtered count (null while loading). */
  heading: (count: number | null) => React.ReactNode;
  /** Hide the category facet where the surface is already category-scoped. */
  hideCategoryFilter?: boolean;
  /** Seed filters — replays a saved-search URL. */
  initialFilters?: ListingFilters;
  /** Controlled sort — the page persists it in the URL. */
  sort: SortKey;
  onSortChange: (next: SortKey) => void;
  /** Quiet line under the toolbar — e.g. a "did you mean" correction. */
  notice?: React.ReactNode;
  onSaveSearch?: (filters: ListingFilters) => void;
  /** Empty state when the unfiltered set is empty. */
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

export function RefinedResults({
  listings,
  isLoading,
  heading,
  hideCategoryFilter,
  initialFilters,
  sort,
  onSortChange,
  notice,
  onSaveSearch,
  emptyTitle = 'Nothing here yet',
  emptySubtitle = 'Check back soon — new items arrive daily.',
  emptyActionLabel,
  onEmptyAction,
}: RefinedResultsProps) {
  const columns = useResultColumns();
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
   * price collapses to a single chip. Removing reflows the grid
   * immediately, matching the sheet's live apply.
   */
  const chips = useMemo<ResultsChip[]>(() => {
    const set = (next: Partial<ListingFilters>) =>
      setFilters({ ...filters, ...next });
    const out: ResultsChip[] = filters.conditions.map((c) => ({
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
      out.push({
        key: 'price',
        label,
        onRemove: () => set({ priceMin: null, priceMax: null }),
      });
    }
    if (filters.category) {
      out.push({
        key: 'category',
        label:
          CATEGORIES.find((c) => c.slug === filters.category)?.name ??
          filters.category,
        onRemove: () => set({ category: null }),
      });
    }
    if (filters.size.trim()) {
      out.push({
        key: 'size',
        label: `Size ${filters.size.trim()}`,
        onRemove: () => set({ size: '' }),
      });
    }
    if (filters.brand.trim()) {
      out.push({
        key: 'brand',
        label: filters.brand.trim(),
        onRemove: () => set({ brand: '' }),
      });
    }
    return out;
  }, [filters]);

  const rail = (
    <RefinementRail
      listings={listings}
      filters={filters}
      onChange={setFilters}
      hideCategory={hideCategoryFilter}
      activeCount={activeCount}
      onClearAll={() => setFilters(EMPTY_FILTERS)}
    />
  );

  return (
    <div className="lg:grid lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-7">
      {/* Refinement rail — desktop only; sticky under the 64px header. */}
      <aside className="hidden lg:block lg:pl-6" aria-label="Refinements">
        <div className="no-scrollbar sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto pb-8 pr-1">
          {rail}
        </div>
      </aside>

      <div className="min-w-0">
        {/* Sticky results toolbar — count left, sort + filters right.
            Under the 64px header (+42px department rail below lg). */}
        <div className="sticky top-[106px] z-elevated border-b border-border-subtle bg-background/95 backdrop-blur-sm lg:top-16">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pb-2.5 pt-2 sm:px-6">
            <div className="min-w-0 flex-1">
              {heading(isLoading ? null : filtered.length)}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <SortDropdown value={sort} onChange={onSortChange} />
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

          {chips.length > 0 ? (
            <div
              className="no-scrollbar -mt-0.5 flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 sm:px-6"
              role="list"
              aria-label="Active filters"
            >
              {chips.map((chip) => (
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
      </div>

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onChange={setFilters}
        resultCount={filtered.length}
        hideCategory={hideCategoryFilter}
        onSaveSearch={onSaveSearch ? () => onSaveSearch(filters) : undefined}
      />
    </div>
  );
}
