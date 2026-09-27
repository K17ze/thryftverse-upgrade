'use client';

/**
 * BrowseClient — /browse body: category rail + full-catalogue
 * RefinedResults (refinement rail on desktop, sheet on mobile). Sort and
 * facets persist in the URL (?sort= + facet params), so a refined browse
 * is shareable; the category chips stay a local scope.
 */

import { useMemo, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { RefinedResults } from './RefinedResults';
import { useFacetParams } from './useFacetParams';
import { useSortParam } from './useSortParam';
import { CATEGORIES } from '@/lib/data/fixtures';
import { useListings } from '@/lib/hooks/queries';

export function BrowseClient() {
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useSortParam();
  const [filters, setFilters] = useFacetParams();
  const { data, isLoading, isError, refetch } = useListings(category ?? undefined);

  // When the chip rail scopes the set, a category facet stacked on top
  // would only ever produce empty intersections — strip it (the group is
  // hidden anyway, so no URL param can set it here deliberately).
  const effectiveFilters = useMemo(
    () =>
      category !== null && filters.categories.length > 0
        ? { ...filters, categories: [] }
        : filters,
    [category, filters],
  );

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="px-4 pt-6 sm:px-6">
        <h1 className="text-screen-title font-bold text-text-primary">
          Browse
        </h1>
      </div>

      {/* Category rail — quick scoping, deep facets live in the rail/sheet */}
      <nav
        className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-3 sm:px-6"
        aria-label="Categories"
      >
        <Chip selected={category === null} onClick={() => setCategory(null)}>
          All
        </Chip>
        {CATEGORIES.map((cat) => (
          <Chip
            key={cat.slug}
            selected={category === cat.slug}
            onClick={() => setCategory(cat.slug)}
          >
            {cat.name}
          </Chip>
        ))}
      </nav>

      <RefinedResults
        key={category ?? 'all'}
        listings={data ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        filters={effectiveFilters}
        onFiltersChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        // The chip rail already scopes the set — a category facet derived
        // from it would offer one meaningless option.
        hideCategoryFilter={category !== null}
        heading={(n) =>
          n === null ? (
            <span className="skeleton block h-6 w-32 rounded-md" />
          ) : (
            <p className="text-item-title font-semibold text-text-primary">
              <span className="tnum">{n.toLocaleString('en-GB')}</span>{' '}
              item{n === 1 ? '' : 's'}
              {category
                ? ` in ${
                    CATEGORIES.find((c) => c.slug === category)?.name ??
                    category
                  }`
                : ''}
            </p>
          )
        }
        emptyTitle="Nothing here yet"
        emptySubtitle="Check back soon — new items arrive daily."
      />
    </div>
  );
}
