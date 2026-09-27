'use client';

/**
 * ListingManagementToolbar — the filter rail + sort group for
 * /seller-hub/listings. Same grammar as the sibling surfaces: a
 * SegmentedControl for status, the hub's quiet sort buttons, and a
 * truthful count of what's in view.
 */

import { SegmentedControl } from '@/components/feed/SegmentedControl';
import type {
  ListingSortKey,
  ListingStatus,
  ListingStatusFilter,
} from './listingManagementModel';

const FILTERS: { value: ListingStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'sold', label: 'Sold' },
  { value: 'draft', label: 'Drafts' },
];

const SORTS: { key: ListingSortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'views', label: 'Views' },
  { key: 'likes', label: 'Likes' },
];

export function ListingManagementToolbar({
  filter,
  onFilter,
  sort,
  onSort,
  counts,
  visibleCount,
  totalCount,
}: {
  filter: ListingStatusFilter;
  onFilter: (f: ListingStatusFilter) => void;
  sort: ListingSortKey;
  onSort: (s: ListingSortKey) => void;
  /** Per-status counts for the tab badges — mirrors mobile's tab counts. */
  counts: Record<ListingStatus, number>;
  visibleCount: number;
  totalCount: number;
}) {
  const options = FILTERS.map((f) => ({
    ...f,
    count: f.value === 'all' ? totalCount : counts[f.value as ListingStatus],
  }));
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl options={options} value={filter} onChange={onFilter} />
      <div className="flex items-center gap-1" role="group" aria-label="Sort listings">
        <span className="mr-1 text-meta text-text-muted">
          {visibleCount} of {totalCount}
        </span>
        <span className="text-meta text-text-muted">Sort</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSort(s.key)}
            aria-pressed={sort === s.key}
            className={`pressable rounded px-2 py-1 text-meta font-semibold ${
              sort === s.key
                ? 'bg-surface-alt text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
