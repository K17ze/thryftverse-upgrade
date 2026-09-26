'use client';

/**
 * ClosetListingsSection — the filterable listings body shared by the public
 * closet (/u/[username]) and the owner closet (/profile). Owns filter + sort
 * state and renders, in order: search + sort + filters toolbar, the brand
 * chip rail, the active-filter chips, then the ClosetGrid — with a scoped
 * empty state when filters eliminate everything.
 *
 * Facets are derived from the items handed in (the For sale / Sold segment
 * or the full owner closet), so counts and options are always truthful.
 * Mount with a `key` when the result set changes context (e.g. segment
 * switch) to reset the filters.
 */

import { useMemo, useState } from 'react';
import type { Listing } from '@/lib/contracts/domain';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { ClosetGrid, ClosetGridSkeleton } from '@/components/profile/ClosetGrid';
import { EditableClosetTile } from './EditableClosetTile';
import { ClosetBrandRail } from './ClosetBrandRail';
import { ClosetFilterSheet } from './ClosetFilterSheet';
import { ClosetSortControl } from './ClosetSortControl';
import {
  applyClosetFilters,
  categoryLabel,
  countActiveClosetFilters,
  countClosetFacetFilters,
  EMPTY_CLOSET_FILTERS,
  extractClosetFacets,
  facetHasChoice,
  sortClosetListings,
  type ClosetFilters,
  type ClosetSortKey,
} from './closetFilters';

interface ClosetListingsSectionProps {
  items: Listing[];
  isLoading?: boolean;
  /** Empty state when the closet itself (not the filtered result) is empty. */
  emptyIcon?: AppIconName;
  emptyTitle?: string;
  emptySubtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Owner mode — tiles carry a quiet Edit affordance → /sell?edit=<id>. */
  editable?: boolean;
  /** Stick the search/sort/filter toolbar under the profile tab rail so
   *  controls survive scrolling a deep closet. */
  stickyToolbar?: boolean;
}

/** Applied-filter pill — subtle brand fill + trailing remove affordance. */
function RemovableChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel?: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={removeLabel ?? `Remove ${label} filter`}
      className="pressable inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-brand-border bg-brand-subtle px-3 text-caption font-medium text-text-primary"
    >
      {label}
      <Icon name="close" size={13} />
    </button>
  );
}

export function ClosetListingsSection({
  items,
  isLoading,
  emptyIcon = 'bag',
  emptyTitle = 'Nothing here yet',
  emptySubtitle,
  actionLabel,
  onAction,
  editable = false,
  stickyToolbar = false,
}: ClosetListingsSectionProps) {
  const [filters, setFilters] = useState<ClosetFilters>(EMPTY_CLOSET_FILTERS);
  const [sort, setSort] = useState<ClosetSortKey>('newest');
  const [sheetOpen, setSheetOpen] = useState(false);

  const facets = useMemo(() => extractClosetFacets(items), [items]);
  const filtered = useMemo(
    () => sortClosetListings(applyClosetFilters(items, filters), sort),
    [items, filters, sort],
  );

  const facetCount = countClosetFacetFilters(filters);
  const activeCount = countActiveClosetFilters(filters);
  const showFiltersButton =
    facetHasChoice(facets.brands) ||
    facetHasChoice(facets.sizes) ||
    facetHasChoice(facets.conditions) ||
    facetHasChoice(facets.categories);

  const set = (patch: Partial<ClosetFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));
  const clearAll = () => setFilters(EMPTY_CLOSET_FILTERS);
  const removeSize = (size: string) =>
    setFilters((f) => ({ ...f, sizes: f.sizes.filter((s) => s !== size) }));
  const removeCondition = (c: (typeof filters.conditions)[number]) =>
    setFilters((f) => ({
      ...f,
      conditions: f.conditions.filter((x) => x !== c),
    }));

  if (isLoading) return <ClosetGridSkeleton />;

  // Empty closet — the page's copy owns this state, no chrome around it.
  if (items.length === 0) {
    return (
      <ClosetGrid
        items={items}
        emptyIcon={emptyIcon}
        emptyTitle={emptyTitle}
        emptySubtitle={emptySubtitle}
        actionLabel={actionLabel}
        onAction={onAction}
      />
    );
  }

  const query = filters.query.trim();

  return (
    <div>
      {/* Toolbar — search first (mobile ClosetToolbar), then sort + filters.
          Sticky variant pins beneath the tab rail: 64px header + 50px rail. */}
      <div
        className={`flex items-center gap-1.5 px-4 pb-2.5 sm:px-6 ${
          stickyToolbar ? 'sticky top-[114px] z-elevated bg-background pt-2.5' : ''
        }`}
      >
        <div className="relative min-w-0 flex-1">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="Search this closet"
            aria-label="Search this closet"
            autoComplete="off"
            className="h-9 w-full rounded-md bg-surface-alt pl-9 pr-8 text-body text-input-text placeholder:text-text-muted"
          />
          {filters.query.length > 0 ? (
            <button
              type="button"
              onClick={() => set({ query: '' })}
              aria-label="Clear search"
              className="pressable absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-text-primary"
            >
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </div>
        <ClosetSortControl value={sort} onChange={setSort} />
        {showFiltersButton ? (
          <Button
            variant="secondary"
            size="sm"
            icon="filter"
            onClick={() => setSheetOpen(true)}
          >
            Filters{facetCount > 0 ? ` · ${facetCount}` : ''}
          </Button>
        ) : null}
      </div>

      {facets.brands.length > 1 ? (
        <ClosetBrandRail
          brands={facets.brands}
          active={filters.brand}
          onSelect={(brand) => set({ brand })}
        />
      ) : null}

      {activeCount > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 sm:px-6">
          {query ? (
            <RemovableChip
              label={`“${query}”`}
              removeLabel="Remove search filter"
              onRemove={() => set({ query: '' })}
            />
          ) : null}
          {filters.brand ? (
            <RemovableChip
              label={filters.brand}
              removeLabel={`Remove brand filter ${filters.brand}`}
              onRemove={() => set({ brand: null })}
            />
          ) : null}
          {filters.sizes.map((s) => (
            <RemovableChip
              key={s}
              label={`Size ${s}`}
              removeLabel={`Remove size filter ${s}`}
              onRemove={() => removeSize(s)}
            />
          ))}
          {filters.conditions.map((c) => (
            <RemovableChip
              key={c}
              label={c}
              removeLabel={`Remove condition filter ${c}`}
              onRemove={() => removeCondition(c)}
            />
          ))}
          {filters.category ? (
            <RemovableChip
              label={categoryLabel(filters.category)}
              removeLabel={`Remove category filter ${categoryLabel(filters.category)}`}
              onRemove={() => set({ category: null })}
            />
          ) : null}
          <button
            type="button"
            onClick={clearAll}
            className="pressable ml-1 text-caption font-medium text-text-secondary hover:text-text-primary"
          >
            Clear all
          </button>
          <span className="tnum ml-auto text-meta text-text-muted">
            {filtered.length} of {items.length}
          </span>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon="filter"
          title="No items match"
          subtitle="Nothing in this closet fits those filters — try removing one."
          actionLabel="Clear filters"
          onAction={clearAll}
          compact
        />
      ) : editable ? (
        <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
          {filtered.map((item, i) => (
            <EditableClosetTile key={item.id} item={item} priority={i < 4} />
          ))}
        </div>
      ) : (
        <ClosetGrid items={filtered} />
      )}

      <ClosetFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onChange={setFilters}
        facets={facets}
        resultCount={filtered.length}
      />
    </div>
  );
}
