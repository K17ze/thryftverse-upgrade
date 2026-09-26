'use client';

/**
 * BrowseClient — /browse body: category rail + full-catalogue
 * RefinedResults (refinement rail on desktop, sheet on mobile). Sort
 * persists in the URL; the category chips stay a local scope.
 */

import { useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { RefinedResults } from './RefinedResults';
import { useSortParam } from './useSortParam';
import { CATEGORIES } from '@/lib/data/fixtures';
import { useListings } from '@/lib/hooks/queries';

export function BrowseClient() {
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useSortParam();
  const { data, isLoading } = useListings(category ?? undefined);

  return (
    <div className="mx-auto max-w-[1600px]">
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
        sort={sort}
        onSortChange={setSort}
        heading={(n) =>
          n === null ? null : (
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
