import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useHaptic } from '../useHaptic';
import { useStore } from '../../store/useStore';
import { searchListingsFromApi, type ListingSearchSort } from '../../services/feedApi';
import { searchUsers, type UserSearchResult } from '../../services/profileApi';
import { recordRecentSearch } from '../../services/searchHistory';
import { buildListingFeedUnit, type DiscoveryFeedUnit } from '../../contracts/discoveryFeedUnit';
import { AspectRatio } from '../../theme/designTokens';

// ── Search debounce ──
const SEARCH_DEBOUNCE_MS = 180;
/** Page size for item search — matches the limit sent to /search/listings. */
const SEARCH_PAGE_SIZE = 50;

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
 * the debounced item/people requests, pagination, the retry counters that
 * re-issue a failed search, and the fallback-transparency flag that tells
 * the user when results came from the typo-tolerant path.
 */
export function useDiscoverySearch(initialQuery?: string) {
  const haptic = useHaptic();
  const currentUserId = useStore((state) => state.currentUser?.id);

  // ── Search state ──
  const [query, setQuery] = useState(initialQuery ?? '');
  const [, setIsSearchFocused] = useState(false);
  const [searchRetryCount, setSearchRetryCount] = useState(0);
  const [peopleRetryCount, setPeopleRetryCount] = useState(0);
  const normalizedQuery = query.trim().toLowerCase();

  // ── Search filters — the shared browseFilters contract is the single
  //  source of truth the Filter sheet edits. Search requests serialize the
  //  backend-supported subset (brands, sizes, condition, price bounds,
  //  sustainability, sort); the query text itself stays local to this
  //  screen so the sheet's `query` field never overwrites it.
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);

  // A fresh search surface must not inherit stale facet filters from the
  // Browse tab — reset the shared filter set once on mount. The Filter
  // sheet edits applied during this session are preserved because the
  // screen stays mounted while the sheet is pushed.
  const didResetFiltersRef = useRef(false);
  useEffect(() => {
    if (didResetFiltersRef.current) return;
    didResetFiltersRef.current = true;
    updateBrowseFilters({
      query: '',
      sort: 'Recommended',
      brands: [],
      sizes: [],
      condition: 'Any',
      sustainableOnly: false,
      priceMin: null,
      priceMax: null,
    });
  }, [updateBrowseFilters]);

  const searchFilters = useMemo(() => ({
    limit: SEARCH_PAGE_SIZE,
    brands: browseFilters.brands.length > 0 ? browseFilters.brands : undefined,
    sizes: browseFilters.sizes.length > 0 ? browseFilters.sizes : undefined,
    condition: browseFilters.condition !== 'Any' ? browseFilters.condition : undefined,
    priceMin: browseFilters.priceMin ?? undefined,
    priceMax: browseFilters.priceMax ?? undefined,
    sustainableOnly: browseFilters.sustainableOnly || undefined,
    sort: SEARCH_SORT_MAP[browseFilters.sort] ?? 'relevance',
  }), [browseFilters]);

  // Badge parity with SearchScreen: sort is a presentation preference, not
  // a narrowing filter — it is deliberately NOT counted here.
  const activeSearchFilterCount =
    browseFilters.brands.length +
    browseFilters.sizes.length +
    (browseFilters.condition !== 'Any' ? 1 : 0) +
    (browseFilters.sustainableOnly ? 1 : 0) +
    (browseFilters.priceMin != null || browseFilters.priceMax != null ? 1 : 0);

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
  // Typo-tolerance transparency: true only when the backend reported a
  // retrieval fallback (no exact matches → similar items). Never inferred.
  const [searchUsedFallback, setSearchUsedFallback] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [isSearchingMore, setIsSearchingMore] = useState(false);
  const [peopleResults, setPeopleResults] = useState<UserSearchResult[]>([]);
  const [isSearchingPeople, setIsSearchingPeople] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [searchScope, setSearchScope] = useState<DiscoverySearchScope>('items');

  // ── Search debounce ──
  useEffect(() => {
    if (!normalizedQuery || normalizedQuery.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchUsedFallback(false);
      setSearchPage(1);
      setSearchHasMore(false);
      setPeopleResults([]);
      setPeopleError(null);
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
            setSearchHasMore(false);
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
                images: item.images && item.images.length > 0
                  ? item.images
                  : item.imageUrl ? [item.imageUrl] : [],
                // The search API returns no engagement counts — null means
                // "unknown", not a factual "0 likes".
                likes: null,
                sellerId: item.sellerId,
                category: item.category ?? '',
                // Paid-placement fields pass through verbatim — the summary
                // mapper gates them on promoted===true, so an organic row can
                // never leak a disclosure or tracking id.
                promoted: item.promoted === true ? true : undefined,
                disclosure: item.disclosure ?? null,
                promotionId: item.promotionId ?? null,
                createdAt: item.createdAt },
              item.imageUrl ?? item.images?.[0] ?? '',
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
            setSearchPage(1);
            // Page-based API has no total count — a full page is the only
            // honest signal that another page may exist.
            setSearchHasMore(result.items.length >= SEARCH_PAGE_SIZE);
            setSearchUsedFallback(
              result.fallback === true || Boolean(result.retrievalMeta?.fallbackReason),
            );
          }
        })
        .finally(() => { if (!cancelled) setIsSearching(false); });
    }, SEARCH_DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer); };
    // `searchFilters` is memoized — a filter edit re-issues the request and
    // the `cancelled` flag protects against stale responses overwriting
    // newer results.
  }, [normalizedQuery, searchScope, searchRetryCount, searchFilters]);

  // ── Search pagination — page-based (the contract supports `page`, not a
  //  cursor). Appends deduped units; an error mid-pagination keeps the
  //  loaded pages and surfaces the error for retry. ──
  const loadMoreSearch = useCallback(() => {
    if (
      normalizedQuery.length < 2 ||
      searchScope !== 'items' ||
      isSearching ||
      isSearchingMore ||
      !searchHasMore
    ) {
      return;
    }
    const nextPage = searchPage + 1;
    setIsSearchingMore(true);
    searchListingsFromApi(normalizedQuery, { ...searchFilters, page: nextPage })
      .then((result) => {
        if (result.error) {
          setSearchError('Couldn’t load more results. Try again.');
          return;
        }
        setSearchPage(nextPage);
        setSearchHasMore(result.items.length >= SEARCH_PAGE_SIZE);
        if (result.items.length === 0) return;
        setSearchResults((prev) => {
          const seen = new Set(prev.map((u) => u.id));
          const appended = result.items
            .filter((item) => !seen.has(`listing:${item.id}`))
            .map((item) => buildListingFeedUnit(
              {
                id: item.id,
                title: item.title || 'Untitled',
                brand: item.brand ?? null,
                size: item.size ?? null,
                condition: null,
                price: typeof item.priceGbp === 'number' && Number.isFinite(item.priceGbp)
                  ? item.priceGbp
                  : null,
                images: item.images && item.images.length > 0
                  ? item.images
                  : item.imageUrl ? [item.imageUrl] : [],
                likes: null,
                sellerId: item.sellerId,
                category: item.category ?? '',
                promoted: item.promoted === true ? true : undefined,
                disclosure: item.disclosure ?? null,
                promotionId: item.promotionId ?? null,
                createdAt: item.createdAt },
              item.imageUrl ?? item.images?.[0] ?? '',
              item.aspectRatio ??
                (item.mediaWidth && item.mediaHeight
                  ? item.mediaWidth / item.mediaHeight
                  : AspectRatio.marketplace),
            ));
          return [...prev, ...appended];
        });
      })
      .catch(() => {
        setSearchError('Couldn’t load more results. Try again.');
      })
      .finally(() => setIsSearchingMore(false));
  }, [
    normalizedQuery,
    searchScope,
    isSearching,
    isSearchingMore,
    searchHasMore,
    searchPage,
    searchFilters,
  ]);

  // ── People search ──
  useEffect(() => {
    if (!normalizedQuery || normalizedQuery.length < 2 || searchScope !== 'people') {
      setPeopleResults([]);
      setPeopleError(null);
      setIsSearchingPeople(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsSearchingPeople(true);
      setPeopleError(null);
      searchUsers(normalizedQuery, 20)
        .then((results) => { if (!cancelled) setPeopleResults(results); })
        .catch(() => {
          // A failed people search is an error state, not "No people found" —
          // keep the distinction honest so the user can retry.
          if (!cancelled) {
            setPeopleResults([]);
            setPeopleError('People search is temporarily unavailable. Try again.');
          }
        })
        .finally(() => { if (!cancelled) setIsSearchingPeople(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [normalizedQuery, searchScope, peopleRetryCount]);

  const handleSubmitSearch = useCallback(() => {
    if (normalizedQuery.length >= 2) {
      haptic.light();
      // Persist the submitted query so it appears in recent searches and
      // future autocomplete. Fire-and-forget — never blocks the search.
      recordRecentSearch(normalizedQuery, currentUserId).catch(() => undefined);
    }
  }, [normalizedQuery, haptic, currentUserId]);

  const retrySearch = useCallback(() => {
    setSearchError(null);
    setSearchRetryCount((c) => c + 1);
  }, []);

  const retryPeopleSearch = useCallback(() => {
    setPeopleError(null);
    setPeopleRetryCount((c) => c + 1);
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
    searchUsedFallback,
    searchHasMore,
    isSearchingMore,
    loadMoreSearch,
    peopleResults,
    isSearchingPeople,
    peopleError,
    retryPeopleSearch,
    activeSearchFilterCount,
    clearSearchFilters,
    handleSubmitSearch,
  };
}
