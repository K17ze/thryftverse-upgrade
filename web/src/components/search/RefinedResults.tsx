'use client';

/**
 * RefinedResults — the results engine for search, category and browse.
 * eBay grammar on desktop (lg+): a sticky refinement rail on the left
 * (real facet counts, collapsible groups) beside the results column.
 * Below lg the sheet is the one facet surface — the rail is hidden and
 * the sheet unmounts on desktop so the two never cover the same facets
 * in one viewport.
 *
 * Facets arrive controlled — the page owns them (persisted in the URL via
 * useFacetParams) so a refined view is shareable and back/forward replays
 * it. Sort is controlled the same way. Active facet values render as
 * removable chips with a quiet "Clear all"; populated results end with a
 * related-searches row derived from the result set itself. Full state
 * coverage: skeleton, filtered-empty, empty, populated.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { StateGate } from '@/components/flagship/StateGate';
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
import { useMediaQuery } from '@/components/filters/useMediaQuery';
import { useResultColumns } from '@/components/filters/useResultColumns';
import { useLoadMoreSentinel } from '@/lib/hooks/useLoadMoreSentinel';
import { COLOR_VOCAB } from '@/components/visualsearch/visualSearchTypes';
import { relatedSearches } from './searchMatch';
import { RefinementRail } from './RefinementRail';
import { SortDropdown } from './SortDropdown';
import type { StateCopyDomain } from '@/lib/state-copy';

interface ResultsChip {
  key: string;
  label: string;
  /** Colour chips carry the vocabulary swatch. */
  swatch?: string;
  onRemove: () => void;
}

interface RefinedResultsProps {
  listings: Listing[];
  isLoading: boolean;
  /** Query failure — renders an error state with retry, not "no results". */
  isError?: boolean;
  onRetry?: () => void;
  /** Registry domain for the error/offline state — the host surface names
   *  it ('search' on /search, 'listings' on category/browse). */
  stateDomain?: StateCopyDomain;
  /** Rendered in the toolbar; receives the filtered count (null while loading). */
  heading: (count: number | null) => React.ReactNode;
  /** Hide the category facet where the surface is already category-scoped. */
  hideCategoryFilter?: boolean;
  /** Controlled facets — the page persists them (URL via useFacetParams). */
  filters: ListingFilters;
  onFiltersChange: (next: ListingFilters) => void;
  /** Best-match score per listing id — ranks the default relevance sort. */
  relevanceScores?: ReadonlyMap<string, number>;
  /** Live mode: the backend already filtered, ranked and counted the
   *  full catalogue. Client sorting is skipped (server order is the
   *  order); the facet pass still runs for client-only dimensions
   *  (colours) and stays idempotent for the forwarded ones. */
  serverOrdered?: boolean;
  /** Catalogue-wide match count from the backend — the heading reads it
   *  instead of the loaded-page length when present. */
  totalCount?: number | null;
  /** Infinite scroll — the host wires its query's nextCursor; the
   *  sentinel renders at the grid tail while `hasMore` is true. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  /** The active query — excluded from the related-searches row. */
  query?: string;
  /** Controlled sort — the page persists it in the URL. */
  sort: SortKey;
  onSortChange: (next: SortKey) => void;
  /** Quiet line under the toolbar — e.g. a "did you mean" correction. */
  notice?: React.ReactNode;
  /** Content above the grid inside the results column (e.g. member matches). */
  preamble?: React.ReactNode;
  onSaveSearch?: (filters: ListingFilters) => void;
  /** Empty state when the unfiltered set is empty. */
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

/** Swatch lookup for colour chips — kept off the render path. */
const COLOUR_SWATCHES = new Map(
  COLOR_VOCAB.map((c) => [c.name, `rgb(${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]})`]),
);

export function RefinedResults({
  listings,
  isLoading,
  isError,
  onRetry,
  stateDomain = 'listings',
  heading,
  hideCategoryFilter,
  filters,
  onFiltersChange,
  relevanceScores,
  serverOrdered = false,
  totalCount = null,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  query,
  sort,
  onSortChange,
  notice,
  preamble,
  onSaveSearch,
  emptyTitle = 'Nothing here yet',
  emptySubtitle = 'Check back soon — new items arrive daily.',
  emptyActionLabel,
  onEmptyAction,
}: RefinedResultsProps) {
  const baseColumns = useResultColumns();
  const [dense, setDense] = useState(false);
  const columns = dense ? Math.min(5, baseColumns + 1) : baseColumns;
  const sentinelRef = useLoadMoreSentinel(
    hasMore && !isLoadingMore && !!onLoadMore,
    onLoadMore,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  // One facet surface per viewport — the lg rail owns desktop; the sheet
  // only exists below lg (and auto-dismisses across a resize crossing).
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const filtered = useMemo(() => {
    const narrowed = applyListingFilters(listings, filters);
    // Server-ordered pages keep their rank — a client re-sort would only
    // order the loaded subset and fight pagination.
    return serverOrdered ? narrowed : sortListings(narrowed, sort, relevanceScores);
  }, [listings, filters, sort, relevanceScores, serverOrdered]);
  const activeCount = countActiveFilters(filters);
  // The toolbar count — the backend's catalogue total when it reports
  // one, otherwise the loaded set's length. Exception: colour is a
  // client-only facet (no backend param exists), so over a server-ordered
  // set the honest count is the filtered subset the grid actually shows,
  // not the catalogue total.
  const displayCount =
    serverOrdered && filters.colours.length > 0
      ? filtered.length
      : (totalCount ?? filtered.length);

  const units = useMemo<DiscoveryFeedUnit[]>(
    () =>
      filtered.map((l) => ({
        type: 'listing',
        id: `listing-${l.id}`,
        listing: mapListingToDiscoverySummary(l),
      })),
    [filtered],
  );

  const categoryName = useMemo(
    () => new Map(CATEGORIES.map((c) => [c.slug, c.name])),
    [],
  );

  // "Searches related to" — terms the result set itself surfaces.
  const related = useMemo(
    () => relatedSearches(filtered, query ?? ''),
    [filtered, query],
  );

  /**
   * One removable chip per active facet value — every multi-select
   * dimension fans out, price collapses to a single chip. Removing
   * reflows the grid immediately, matching the sheet's live apply.
   */
  const chips = useMemo<ResultsChip[]>(() => {
    const set = (next: Partial<ListingFilters>) =>
      onFiltersChange({ ...filters, ...next });
    const dropValue = (list: string[], v: string) =>
      list.filter((x) => x.toLowerCase() !== v.toLowerCase());
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
    for (const slug of filters.categories) {
      out.push({
        key: `category:${slug}`,
        label: categoryName.get(slug.toLowerCase()) ?? slug,
        onRemove: () => set({ categories: dropValue(filters.categories, slug) }),
      });
    }
    for (const s of filters.sizes) {
      if (!s.trim()) continue;
      out.push({
        key: `size:${s.toLowerCase()}`,
        label: `Size ${s.trim()}`,
        onRemove: () => set({ sizes: dropValue(filters.sizes, s) }),
      });
    }
    for (const b of filters.brands) {
      if (!b.trim()) continue;
      out.push({
        key: `brand:${b.toLowerCase()}`,
        label: b.trim(),
        onRemove: () => set({ brands: dropValue(filters.brands, b) }),
      });
    }
    for (const c of filters.colours) {
      out.push({
        key: `colour:${c.toLowerCase()}`,
        label: c,
        swatch: COLOUR_SWATCHES.get(c) ?? undefined,
        onRemove: () => set({ colours: dropValue(filters.colours, c) }),
      });
    }
    if (filters.includeSold) {
      out.push({
        key: 'sold',
        label: 'Sold items',
        onRemove: () => set({ includeSold: false }),
      });
    }
    return out;
  }, [filters, onFiltersChange, categoryName]);

  const rail = (
    <RefinementRail
      listings={listings}
      filters={filters}
      onChange={onFiltersChange}
      hideCategory={hideCategoryFilter}
      activeCount={activeCount}
      onClearAll={() => onFiltersChange(EMPTY_FILTERS)}
    />
  );

  return (
    <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[272px_minmax(0,1fr)]">
      {/* Refinement rail — desktop only; sticky under the 64px header. */}
      <aside className="hidden lg:block lg:pl-6" aria-label="Refinements">
        <div className="no-scrollbar sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto pb-8 pr-1">
          {rail}
        </div>
      </aside>

      <div className="min-w-0">
        {/* Sticky results toolbar — count left, sort + filters right.
            Sits directly under the header (56px below md, 64px at md+). */}
        <div className="sticky top-14 z-elevated border-b border-border-subtle bg-background/95 backdrop-blur-sm md:top-16">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pb-2.5 pt-2 sm:px-6">
            <div className="min-w-0 flex-1">
              {heading(isLoading ? null : displayCount)}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <SortDropdown value={sort} onChange={onSortChange} />
              <button
                type="button"
                aria-pressed={dense}
                aria-label={dense ? 'Switch to standard view' : 'Switch to compact view'}
                title={dense ? 'Standard view' : 'Compact view'}
                onClick={() => setDense((d) => !d)}
                className={`pressable hidden h-8 items-center gap-1.5 rounded-md border px-2.5 text-caption font-semibold transition-colors sm:inline-flex ${
                  dense
                    ? 'border-border bg-surface-alt text-text-primary'
                    : 'border-border-subtle bg-surface text-text-secondary hover:text-text-primary'
                }`}
              >
                <Icon name="dashboard" size={14} />
                <span>{dense ? 'Compact' : 'Standard'}</span>
              </button>
              <Button
                variant="secondary"
                size="sm"
                icon="filter"
                onClick={() => setSheetOpen(true)}
                className="lg:hidden"
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
                <div key={chip.key} role="listitem" className="shrink-0">
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={`Remove filter: ${chip.label}`}
                    className="pressable inline-flex h-8 items-center gap-1 rounded-full bg-surface-alt pl-3 pr-2 text-caption font-semibold text-text-primary hover:bg-surface-raised"
                  >
                    {chip.swatch ? (
                      <span
                        aria-hidden
                        className="h-3 w-3 shrink-0 rounded-full border border-border-subtle"
                        style={{ backgroundColor: chip.swatch }}
                      />
                    ) : null}
                    <span className="max-w-44 truncate">{chip.label}</span>
                    <Icon name="close" size={13} className="shrink-0 text-text-muted" />
                  </button>
                </div>
              ))}
              <div role="listitem" className="shrink-0">
                <button
                  type="button"
                  onClick={() => onFiltersChange(EMPTY_FILTERS)}
                  className="pressable h-8 px-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
                >
                  Clear all
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="pt-3">
          {notice ? <div className="px-4 pb-2 sm:px-6">{notice}</div> : null}
          {preamble}
          {/* Registry error/offline via StateGate — offline resolves to
              the domain's offline copy; the empty branches below stay
              bespoke (query/facet context the registry doesn't have). */}
          <StateGate
            domain={stateDomain}
            isLoading={false}
            isError={isError === true && !isLoading}
            onRetry={onRetry}
          >
            {isLoading || units.length > 0 ? (
              <MasonryGrid units={units} columns={columns} isLoading={isLoading} />
            ) : activeCount > 0 ? (
              <EmptyState
                icon="filter"
                title="No matches with these filters"
                subtitle="Try widening the price range or removing a filter."
                actionLabel="Clear filters"
                onAction={() => onFiltersChange(EMPTY_FILTERS)}
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
          </StateGate>

          {/* Load-more sentinel — walks the server's cursor while pages
              remain. A fetching tail reads as a quiet status, not a
              spinner storm. */}
          {hasMore ? (
            <div ref={sentinelRef} className="h-px" aria-hidden />
          ) : null}
          {isLoadingMore ? (
            <p role="status" className="px-4 pt-4 text-center text-caption text-text-muted sm:px-6">
              Loading more…
            </p>
          ) : null}

          {/* Searches related to — trailing row on populated sets, terms
              sourced from the result set itself. */}
          {!isLoading && !isError && units.length > 0 && related.length > 0 ? (
            <nav
              aria-label="Related searches"
              className="px-4 pb-10 pt-9 sm:px-6"
            >
              <h2 className="text-label text-text-muted">
                Related searches
              </h2>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {related.map((term) => (
                  <Link
                    key={term.toLowerCase()}
                    href={`/search?q=${encodeURIComponent(term)}`}
                    className="pressable inline-flex h-9 items-center rounded-full bg-surface-alt px-4 text-body font-medium text-text-primary hover:bg-surface-raised"
                  >
                    {term}
                  </Link>
                ))}
              </div>
            </nav>
          ) : null}
        </div>
      </div>

      {isDesktop ? null : (
        <FilterSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          listings={listings}
          filters={filters}
          onChange={onFiltersChange}
          resultCount={displayCount}
          hideCategory={hideCategoryFilter}
          onSaveSearch={onSaveSearch ? () => onSaveSearch(filters) : undefined}
        />
      )}
    </div>
  );
}
