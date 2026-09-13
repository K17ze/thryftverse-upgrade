import { useCallback, useEffect, useMemo, useState } from 'react';

import { useHaptic } from '../useHaptic';
import { useStore } from '../../store/useStore';
import { searchListingsFromApi, type ListingSearchSort } from '../../services/feedApi';
import { searchUsers, type UserSearchResult } from '../../services/profileApi';
import { buildListingFeedUnit, type DiscoveryFeedUnit } from '../../contracts/discoveryFeedUnit';
import { AspectRatio } from '../../theme/designTokens';

// ── Search debounce ──
const SEARCH_DEBOUNCE_MS = 180;

/** Filter-sheet sort labels → GET /search/listings sort enum.
 *  'Ending soon' is auction-context only and is never offered by the sheet
 *  in search context; every other label maps to a real backend sort. */
const SEARCH_SORT_MAP: Record<string, ListingSearchSort> = {
  Recommended: 'relevance',
  Newest: 'recent',
  'Price: Low to High': 'price_asc',
  'Price: High to Low': 'price_desc',
  'Most liked': 'most_liked',
};

export type DiscoverySearchScope = 'items' | 'people';

/**
 * Owns the UnifiedDiscovery search surface: the query, the Items/People
 * scope, the shared browseFilters → backend search-params serialization,
 * the debounced item/people requests, and the retry counter that re-issues
 * the item search after an error.
 */
export function useDiscoverySearch(initialQuery?: string) {
  const haptic = useHaptic();

  // ── Search state ──
  const [query, setQuery] = useState(initialQuery ?? '');
  const [, setIsSearchFocused] = useState(false);
  const [searchRetryCount, setSearchRetryCount] = useState(0);
  const normalizedQuery = query.trim().toLowerCase();

  // ── Search filters — the shared browseFilters contract is the single
  //  source of truth the Filter sheet edits. Search requests serialize the
  //  backend-supported subset (brands, sizes, condition, price bounds,
  //  sustainability, sort); the query text itself stays local to this
  //  screen so the sheet's `query` field never overwrites it.
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);

  const searchFilters = useMemo(() => ({
    limit: 50,
    brands: browseFilters.brands.length > 0 ? browseFilters.brands : undefined,
    sizes: browseFilters.sizes.length > 0 ? browseFilters.sizes : undefined,
    condition: browseFilters.condition !== 'Any' ? browseFilters.condition : undefined,
    priceMin: browseFilters.priceMin ?? undefined,
    priceMax: browseFilters.priceMax ?? undefined,
    sustainableOnly: browseFilters.sustainableOnly || undefined,
    sort: SEARCH_SORT_MAP[browseFilters.sort] ?? 'relevance',
  }), [browseFilters]);

  const activeSearchFilterCount =
    browseFilters.brands.length +
    browseFilters.sizes.length +
    (browseFilters.condition !== 'Any' ? 1 : 0) +
    (browseFilters.sustainableOnly ? 1 : 0) +
    (browseFilters.priceMin != null || browseFilters.priceMax != null ? 1 : 0) +
    (browseFilters.sort !== 'Recommended' ? 1 : 0);

  const clearSearchFilters = useCallback(() => {
    updateBrowseFilters({
      sort: 'Recommended',
      brands: [],
      sizes: [],
      condition: 'Any',
      sustainableOnly: false,
      priceMin: null,
      priceMax: null,
    });
  }, [updateBrowseFilters]);

  // ── Search results state ──
  const [searchResults, setSearchResults] = useState<DiscoveryFeedUnit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [peopleResults, setPeopleResults] = useState<UserSearchResult[]>([]);
  const [isSearchingPeople, setIsSearchingPeople] = useState(false);
  const [searchScope, setSearchScope] = useState<DiscoverySearchScope>('items');

  // ── Search debounce ──
  useEffect(() => {
    if (!normalizedQuery || normalizedQuery.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setPeopleResults([]);
      setIsSearching(false);
      setIsSearchingPeople(false);
      return;
    }

    // Scope is user-controlled — this effect must never override an explicit
    // Items/People selection. When the People scope is active, the
    // people-search effect below owns the query; item results stay cached so
    // toggling back to Items is instant.
    if (searchScope !== 'items') {
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const timer = setTimeout(() => {
      searchListingsFromApi(normalizedQuery, searchFilters)
        .then((result) => {
          if (cancelled) return;
          if (result.error) {
            setSearchResults([]);
            setSearchError('Search is temporarily unavailable. Try again.');
          } else {
            setSearchError(null);
            // Map search results to feed units directly — each result becomes
            // a ListingFeedUnit with its real media URI.
            setSearchResults(result.items.map((item) => buildListingFeedUnit(
              {
                id: item.id,
                title: item.title || 'Untitled',
                brand: item.brand ?? null,
                size: item.size ?? null,
                condition: null,
                // Truthful commerce facts: a missing/invalid price stays null
                // (the tile omits the price line) rather than a fabricated £0.
                price: typeof item.priceGbp === 'number' && Number.isFinite(item.priceGbp)
                  ? item.priceGbp
                  : null,
                images: item.imageUrl ? [item.imageUrl] : [],
                // The search API returns no engagement counts — null means
                // "unknown", not a factual "0 likes".
                likes: null,
                sellerId: item.sellerId,
                category: item.category ?? '',
                createdAt: item.createdAt },
              item.imageUrl ?? '',
              // The Search API does not currently return media dimensions or
              // an aspect ratio. Most fashion marketplace imagery is portrait,
              // so 4:5 (marketplace standard) is the correct fallback rather
              // than 1:1 square, which would crop portrait items awkwardly.
              // When the API later exposes aspectRatio or mediaWidth/
              // mediaHeight, those real values are preferred here.
              item.aspectRatio ??
                (item.mediaWidth && item.mediaHeight
                  ? item.mediaWidth / item.mediaHeight
                  : AspectRatio.marketplace),
            )));
          }
        })
        .finally(() => { if (!cancelled) setIsSearching(false); });
    }, SEARCH_DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer); };
    // `searchFilters` is memoized — a filter edit re-issues the request and
    // the `cancelled` flag protects against stale responses overwriting
    // newer results.
  }, [normalizedQuery, searchScope, searchRetryCount, searchFilters]);

  // ── People search ──
  useEffect(() => {
    if (!normalizedQuery || normalizedQuery.length < 2 || searchScope !== 'people') {
      setPeopleResults([]);
      setIsSearchingPeople(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsSearchingPeople(true);
      searchUsers(normalizedQuery, 20)
        .then((results) => { if (!cancelled) setPeopleResults(results); })
        .catch(() => { if (!cancelled) setPeopleResults([]); })
        .finally(() => { if (!cancelled) setIsSearchingPeople(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [normalizedQuery, searchScope]);

  const handleSubmitSearch = useCallback(() => {
    if (normalizedQuery.length >= 2) {
      haptic.light();
    }
  }, [normalizedQuery, haptic]);

  const retrySearch = useCallback(() => {
    setSearchError(null);
    setSearchRetryCount((c) => c + 1);
  }, []);

  const isSearchingMode = normalizedQuery.length >= 2;

  return {
    query,
    setQuery,
    setIsSearchFocused,
    isSearchingMode,
    searchScope,
    setSearchScope,
    // Search results are already feed units (built in the effect)
    searchResults,
    isSearching,
    searchError,
    retrySearch,
    peopleResults,
    isSearchingPeople,
    activeSearchFilterCount,
    clearSearchFilters,
    handleSubmitSearch,
  };
}
