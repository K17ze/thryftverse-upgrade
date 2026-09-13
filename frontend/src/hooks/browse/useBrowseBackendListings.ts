import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { Listing } from '../../domain';
import { useStore } from '../../store/useStore';
import { fetchFilteredListings } from '../../services/listingsApi';
import { friendlyBackendError } from '../../services/listingMapper';

interface UseBrowseBackendListingsOptions {
  categoryId: string;
  searchQuery?: string;
  /**
   * Shared with the pull-to-refresh timer — the fetch effect's cleanup
   * clears any pending refresh-end timeout, exactly as the original
   * inline effect did.
   */
  refreshTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

/**
 * Keeps browseFilters.query in sync with the route's search context, then
 * fetches backend-filtered listings whenever any backend-capable filter is
 * active. Extracted verbatim from BrowseScreen — both effects retain their
 * original order (query-sync first, fetch second).
 */
export function useBrowseBackendListings({
  categoryId,
  searchQuery,
  refreshTimerRef }: UseBrowseBackendListingsOptions) {
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);

  const [backendListings, setBackendListings] = useState<Listing[] | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    if (categoryId === 'search' && searchQuery && browseFilters.query !== searchQuery) {
      updateBrowseFilters({ query: searchQuery });
      return;
    }

    if (categoryId !== 'search' && browseFilters.query) {
      updateBrowseFilters({ query: '' });
    }
  }, [categoryId, searchQuery, browseFilters.query, updateBrowseFilters]);

  useEffect(() => {
    const sortMap: Record<string, 'newest' | 'price_asc' | 'price_desc' | 'most_liked' | 'ending_soon'> = {
      Newest: 'newest',
      'Price: Low to High': 'price_asc',
      'Price: High to Low': 'price_desc',
      'Most liked': 'most_liked',
      'Ending soon': 'ending_soon' };

    const hasBackendFilters =
      browseFilters.query.trim().length > 0 ||
      browseFilters.brands.length > 0 ||
      browseFilters.sizes.length > 0 ||
      browseFilters.condition !== 'Any' ||
      browseFilters.sort !== 'Recommended' ||
      browseFilters.sustainableOnly ||
      (categoryId && categoryId !== 'search' && categoryId !== 'all');

    if (!hasBackendFilters) {
      setBackendListings(null);
      return;
    }

    let cancelled = false;
    setBackendLoading(true);
    setBackendError(null);

    fetchFilteredListings({
      query: browseFilters.query.trim() || undefined,
      category: categoryId !== 'search' && categoryId !== 'all' ? categoryId : undefined,
      brand: browseFilters.brands[0],
      size: browseFilters.sizes[0],
      condition: browseFilters.condition !== 'Any' ? browseFilters.condition : undefined,
      minPrice: browseFilters.priceMin ?? undefined,
      maxPrice: browseFilters.priceMax ?? undefined,
      sort: sortMap[browseFilters.sort] || 'newest',
      sustainableOnly: browseFilters.sustainableOnly })
      .then((result) => {
        if (cancelled) return;
        setBackendListings(result.listings);
        setBackendError(result.error ?? null);
      })
      .catch((error) => {
        if (!cancelled) setBackendError(friendlyBackendError(error));
      })
      .finally(() => {
        if (!cancelled) setBackendLoading(false);
      });

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [browseFilters, categoryId]);

  return { backendListings, backendLoading, backendError };
}
