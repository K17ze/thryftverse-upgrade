'use client';

/**
 * TrendingQueries — the query-shortcut block under the Explore search
 * field (Vinted browse grammar): what members are actually looking for.
 * Composition lives in the shared TrendingShortcuts so /search and
 * /explore render one grammar — trend chips, a hairline, then a
 * single-line brand row.
 *
 * Fixture mode reads the authored TRENDING_SEARCHES + catalogue-derived
 * POPULAR_BRANDS; live mode reads GET /search/trending and ranks brands
 * by presence across the real trending feed — an empty tracker simply
 * renders fewer chips, never seeded noise.
 */

import { useRouter } from 'next/navigation';
import { TrendingShortcuts } from '@/components/search/TrendingShortcuts';
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

  const run = (term: string) =>
    router.push(`/search?q=${encodeURIComponent(term)}`);

  return (
    <TrendingShortcuts
      terms={terms}
      brands={brands}
      onSelect={run}
      className="mt-4"
    />
  );
}
