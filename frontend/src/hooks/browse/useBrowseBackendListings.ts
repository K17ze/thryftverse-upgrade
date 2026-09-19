import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { Listing } from '../../domain';
import { useStore } from '../../store/useStore';
import { fetchFilteredListings } from '../../services/listingsApi';
import { friendlyBackendError } from '../../services/listingMapper';
import { getSubcategoryToken } from '../../utils/subcategoryToken';

interface UseBrowseBackendListingsOptions {
  categoryId: string;
  subcategoryId?: string;
  title?: string;
  searchQuery?: string;
  /**
   * The owning surface's browse-filter context key. Both effects are gated
   * on this being the store's active context so a backgrounded or
   * just-pushed screen never reads/writes another surface's filter bucket.
   */
  contextKey: string;
  /**
   * Shared with the pull-to-refresh timer — the fetch effect's cleanup
   * clears any pending refresh-end timeout, exactly as the original
   * inline effect did.
   */
  refreshTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

const SORT_MAP: Record<string, 'newest' | 'price_asc' | 'price_desc' | 'most_liked' | 'ending_soon'> = {
  Newest: 'newest',
  'Price: Low to High': 'price_asc',
  'Price: High to Low': 'price_desc',
  'Most liked': 'most_liked',
  'Ending soon': 'ending_soon' };

/**
 * Keeps browseFilters.query in sync with the route's search context, then
 * fetches backend-filtered listings whenever any backend-capable filter is
 * active. Extracted verbatim from BrowseScreen — both effects retain their
 * original order (query-sync first, fetch second).
 *
 * Pagination: the response `nextCursor` is retained so the grid can load
 * subsequent pages with the same filter set. Any filter/category change
 * re-issues a first-page request and resets the cursor.
 */
export function useBrowseBackendListings({
  categoryId,
  subcategoryId,
  title,
  searchQuery,
  contextKey,
  refreshTimerRef }: UseBrowseBackendListingsOptions) {
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);
  const isActiveContext = useStore((state) => state.browseContextKey === contextKey);

  const [backendListings, setBackendListings] = useState<Listing[] | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendNextCursor, setBackendNextCursor] = useState<string | null>(null);
  const [backendLoadingMore, setBackendLoadingMore] = useState(false);

  // The active request params for pagination — mirrors the fetch effect's
  // serialization so a next-page request reuses the identical filter set.
  const requestParamsRef = useRef<Parameters<typeof fetchFilteredListings>[0] | null>(null);

  useEffect(() => {
    if (!isActiveContext) return;
    if (categoryId === 'search' && searchQuery && browseFilters.query !== searchQuery) {
      updateBrowseFilters({ query: searchQuery });
      return;
    }

    if (categoryId !== 'search' && browseFilters.query) {
      updateBrowseFilters({ query: '' });
    }
  }, [categoryId, searchQuery, browseFilters.query, updateBrowseFilters, isActiveContext]);

  useEffect(() => {
    if (!isActiveContext) return;
    const hasBackendFilters =
      browseFilters.query.trim().length > 0 ||
      browseFilters.brands.length > 0 ||
      browseFilters.sizes.length > 0 ||
      browseFilters.condition !== 'Any' ||
      browseFilters.sort !== 'Recommended' ||
      (categoryId && categoryId !== 'search' && categoryId !== 'all');

    if (!hasBackendFilters) {
      setBackendListings(null);
      setBackendNextCursor(null);
      requestParamsRef.current = null;
      return;
    }

    // GET /listings accepts a CSV `brands` param (ILIKE ANY match). Sizes
    // still only support a single value — for multi-select sizes the client
    // predicate in useBrowseListings narrows the returned page.
    const subcategoryToken =
      categoryId !== 'search' && categoryId !== 'all'
        ? getSubcategoryToken(categoryId, subcategoryId, title)
        : '';
    const requestParams: Parameters<typeof fetchFilteredListings>[0] = {
      query: browseFilters.query.trim() || undefined,
      category: categoryId !== 'search' && categoryId !== 'all' ? categoryId : undefined,
      subcategory: subcategoryToken || undefined,
      brands: browseFilters.brands.length > 0 ? browseFilters.brands : undefined,
      size: browseFilters.sizes.length === 1 ? browseFilters.sizes[0] : undefined,
      condition: browseFilters.condition !== 'Any' ? browseFilters.condition : undefined,
      minPrice: browseFilters.priceMin ?? undefined,
      maxPrice: browseFilters.priceMax ?? undefined,
      sort: SORT_MAP[browseFilters.sort] || 'newest' };
    requestParamsRef.current = requestParams;

    let cancelled = false;
    setBackendLoading(true);
    setBackendError(null);

    fetchFilteredListings(requestParams)
      .then((result) => {
        if (cancelled) return;
        setBackendListings(result.listings);
        setBackendNextCursor(result.nextCursor ?? null);
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
  }, [browseFilters, categoryId, subcategoryId, title, isActiveContext]);

  // Next-page fetch — reuses the serialized params of the in-flight filter
  // set and appends deduped rows. A page-level failure keeps the loaded
  // items and leaves the cursor unchanged so the next end-reached retries
  // the same page.
  const loadMoreBackendListings = useCallback(() => {
    const params = requestParamsRef.current;
    if (!params || !backendNextCursor || backendLoading || backendLoadingMore) return;

    setBackendLoadingMore(true);
    fetchFilteredListings({ ...params, cursor: backendNextCursor })
      .then((result) => {
        setBackendListings((prev) => {
          const existing = new Set((prev ?? []).map((l) => l.id));
          const appended = result.listings.filter((l) => !existing.has(l.id));
          return [...(prev ?? []), ...appended];
        });
        setBackendNextCursor(result.nextCursor ?? null);
      })
      .catch(() => undefined)
      .finally(() => setBackendLoadingMore(false));
  }, [backendNextCursor, backendLoading, backendLoadingMore]);

  return {
    backendListings,
    backendLoading,
    backendError,
    backendNextCursor,
    backendHasMore: backendListings !== null && Boolean(backendNextCursor),
    backendLoadingMore,
    loadMoreBackendListings };
}
