'use client';

/**
 * Search-landing queries — live-mode data for the empty-query /search
 * surface. Trending pieces come from GET /feed/trending (backend-ranked),
 * trending queries from GET /search/trending (real query-frequency
 * tracker). Category covers and popular brands are derived by the
 * component from those same real listings — nothing is fabricated in
 * live mode.
 *
 * Fixture mode is the caller's concern: hooks are disabled and the
 * component falls back to the authored dataset.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchTrendingFeed } from '@/lib/api/services/feed';
import { fetchTrendingSearches } from '@/lib/api/services/listings';
import { DATA_MODE } from '@/lib/api/client';
import type { Listing } from '@/lib/contracts/domain';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';

const LIVE = DATA_MODE === 'live';

/** Real trending listings (backend-ranked) → discovery summaries. */
export function useTrendingListings(limit = 24) {
  const query = useQuery({
    queryKey: ['feed', 'trending', 'search-landing', limit],
    queryFn: ({ signal }) => fetchTrendingFeed(signal, { limit }),
    enabled: LIVE,
    staleTime: 60_000,
  });
  const listings = query.data?.listings ?? [];
  return { ...query, listings, items: listings.map(mapListingToDiscoverySummary) };
}

/** Real trending search queries — empty when the tracker has no data. */
export function useTrendingSearches(limit = 6) {
  const query = useQuery({
    queryKey: ['search', 'trending', limit],
    queryFn: ({ signal }) => fetchTrendingSearches(limit, signal),
    enabled: LIVE,
    staleTime: 60_000,
  });
  return { ...query, terms: query.data ?? [] };
}

/** Brands ranked by presence among real listings — no min-count gate;
 *  whatever the live catalogue actually surfaces is the honest answer. */
export function rankBrands(listings: Listing[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const l of listings) {
    if (!l.brand) continue;
    counts.set(l.brand, (counts.get(l.brand) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([brand]) => brand);
}

/** First real listing image per category id — a category with no live
 *  inventory simply has no cover and the caller hides it. */
export function coversByCategory(listings: Listing[]): Map<string, string> {
  const covers = new Map<string, string>();
  for (const l of listings) {
    const key = l.category.toLowerCase();
    if (!covers.has(key) && l.images?.[0]) {
      covers.set(key, l.images[0]);
    }
  }
  return covers;
}
