'use client';

/**
 * TrendingQueries — the query-shortcut block under the Explore search
 * field (Vinted browse grammar): what members are actually looking for,
 * one chip per term, each running a real filtered search.
 *
 * Fixture mode reads the authored TRENDING_SEARCHES + catalogue-derived
 * POPULAR_BRANDS; live mode reads GET /search/trending and ranks brands
 * by presence across the real trending feed — an empty tracker simply
 * renders fewer chips, never seeded noise.
 */

import { useRouter } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { DATA_MODE } from '@/lib/api/client';
import {
  rankBrands,
  useTrendingListings,
  useTrendingSearches,
} from '@/lib/hooks/search-queries';
import {
  POPULAR_BRANDS,
  TRENDING_SEARCHES,
} from '@/components/search/taxonomy';

const LIVE = DATA_MODE === 'live';

export function TrendingQueries() {
  const router = useRouter();
  const trending = useTrendingListings();
  const searches = useTrendingSearches();

  const terms = LIVE ? searches.terms : TRENDING_SEARCHES;
  const brands = LIVE ? rankBrands(trending.listings) : POPULAR_BRANDS;
  if (terms.length === 0 && brands.length === 0) return null;

  const run = (term: string) =>
    router.push(`/search?q=${encodeURIComponent(term)}`);

  return (
    <div className="mt-4 flex flex-col gap-3">
      {terms.length > 0 ? (
        <div>
          <h2 className="text-label text-text-muted">Trending</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {terms.map((term) => (
              <Chip key={term} icon="trending" onClick={() => run(term)}>
                {term}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      {brands.length > 0 ? (
        <div>
          <h2 className="text-label text-text-muted">Popular brands</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {brands.map((brand) => (
              <Chip key={brand} onClick={() => run(brand)}>
                {brand}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
