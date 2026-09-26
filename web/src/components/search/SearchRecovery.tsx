'use client';

/**
 * SearchRecovery — the zero-result surface. Recovery, not a dead end:
 * popular searches derived from the fixture catalogue, category
 * suggestions from the real taxonomy (busiest departments, editorial
 * covers, live counts), and a clear-filters escape when facets are
 * active. Flat canvas — caption copy and chips carry it, no icon theatre.
 */

import Link from 'next/link';
import { Chip } from '@/components/ui/Chip';
import { CategoryTile } from './CategoryTile';
import {
  CATEGORY_DIRECTORY_BY_COUNT,
  POPULAR_SEARCHES,
} from './taxonomy';

interface SearchRecoveryProps {
  query: string;
  hasActiveFilters: boolean;
  onSelect: (term: string) => void;
}

export function SearchRecovery({
  query,
  hasActiveFilters,
  onSelect,
}: SearchRecoveryProps) {
  // Busiest departments with stock — every tile resolves to real items.
  const suggestions = CATEGORY_DIRECTORY_BY_COUNT.filter((c) => c.count > 0).slice(0, 3);

  return (
    <div className="px-4 pb-20 pt-14 sm:px-6">
      <h1 className="text-section-title font-semibold text-text-primary">
        No results for “{query}”
      </h1>
      <p className="mt-1.5 text-caption text-text-muted">
        Check the spelling, or try a popular search.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {POPULAR_SEARCHES.map((term) => (
          <Chip key={term} onClick={() => onSelect(term)}>
            {term}
          </Chip>
        ))}
      </div>

      {suggestions.length > 0 ? (
        <div className="mt-9">
          <h2 className="text-label font-semibold uppercase tracking-wide text-text-muted">
            Shop by category
          </h2>
          <div
            className="mt-2.5 grid max-w-2xl grid-cols-3 gap-2"
            role="list"
            aria-label="Category suggestions"
          >
            {suggestions.map((cat) => (
              <CategoryTile
                key={cat.slug}
                slug={cat.slug}
                name={cat.name}
                image={cat.image}
                count={cat.count}
                className="aspect-[4/3] w-full"
                sizes="(max-width: 640px) 33vw, 220px"
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-8 flex items-center gap-5 text-caption font-semibold">
        <Link
          href="/explore"
          className="pressable rounded-md text-text-primary underline underline-offset-4 hover:text-text-secondary"
        >
          Browse all
        </Link>
        {hasActiveFilters ? (
          <Link
            href={`/search?q=${encodeURIComponent(query)}`}
            className="pressable rounded-md text-text-secondary underline underline-offset-4 hover:text-text-primary"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    </div>
  );
}
