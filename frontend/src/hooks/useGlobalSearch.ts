import { useState, useEffect, useMemo } from 'react';
import type { ListingCondition } from '../services/listingsApi';
import {
  fetchSearchAutocomplete,
  searchListingsFromApi,
  type SearchAutocompleteSuggestion,
} from '../services/feedApi';
import { friendlyBackendError } from '../services/listingMapper';
import { searchUsers, type UserSearchResult } from '../services/profileApi';
import { normalizeSearchCondition } from '../utils/searchRanking';

export interface RankedListing {
  id: string;
  title: string;
  brand: string | null;
  size: string | null;
  condition: ListingCondition | null;
  image: string;
  price: number;
  likes: number;
  sellerId: string;
  createdAt?: string;
  score: number;
  reason: string;
  /** Media height/width ratio — reserved before image load to prevent reflow. */
  mediaHeightRatio: number;
}

export type SearchScope = 'items' | 'people';

export interface UseGlobalSearchResult {
  query: string;
  setQuery: (value: string) => void;
  isSearchFocused: boolean;
  setIsSearchFocused: (value: boolean) => void;
  normalizedQuery: string;
  queryTokens: string[];
  backendSearchResults: RankedListing[];
  isSearching: boolean;
  searchError: string | null;
  searchRetryVersion: number;
  setSearchRetryVersion: (updater: (version: number) => number) => void;
  autocompleteSuggestions: SearchAutocompleteSuggestion[];
  isAutocompleteLoading: boolean;
  autocompleteError: string | null;
  searchScope: SearchScope;
  setSearchScope: (scope: SearchScope) => void;
  peopleResults: UserSearchResult[];
  isSearchingPeople: boolean;
  peopleSearchError: string | null;
  peopleSearchRetryVersion: number;
  setPeopleSearchRetryVersion: (updater: (version: number) => number) => void;
}

/**
 * Owns query input state, search-scope tabs, and the debounced fetch
 * effects for listing search, people search, and production typeahead.
 * Derived ranking/filtering/UI composition stay in the screen orchestrator.
 */
export function useGlobalSearch(initialQuery?: string): UseGlobalSearchResult {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [backendSearchResults, setBackendSearchResults] = useState<RankedListing[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRetryVersion, setSearchRetryVersion] = useState(0);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<SearchAutocompleteSuggestion[]>([]);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);
  const [autocompleteError, setAutocompleteError] = useState<string | null>(null);

  // Scope tabs: Items | People — per spec 11, search results should offer
  // scope切换 after query entry so users can find sellers, not just items.
  const [searchScope, setSearchScope] = useState<SearchScope>('items');
  const [peopleResults, setPeopleResults] = useState<UserSearchResult[]>([]);
  const [isSearchingPeople, setIsSearchingPeople] = useState(false);
  const [peopleSearchError, setPeopleSearchError] = useState<string | null>(null);
  const [peopleSearchRetryVersion, setPeopleSearchRetryVersion] = useState(0);

  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = useMemo(
    () => normalizedQuery.split(/\s+/).filter(Boolean),
    [normalizedQuery],
  );

  // Reset scope to Items whenever the query changes
  useEffect(() => {
    setSearchScope('items');
  }, [normalizedQuery]);

  useEffect(() => {
    if (!normalizedQuery || normalizedQuery.length < 2) {
      setBackendSearchResults([]);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    setBackendSearchResults([]);
    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(() => {
      searchListingsFromApi(normalizedQuery, 50)
        .then((result) => {
          if (cancelled) return;
          if (result.error) {
            setSearchError(result.error);
            setBackendSearchResults([]);
          } else {
            setBackendSearchResults(
              result.items.map((item) => ({
              id: item.id,
              title: item.title || 'Untitled listing',
              // Render only known facts. A missing brand is not the first
              // two words of a title; an unknown size is not "One size";
              // an unknown condition is not "Very good". Backend search
              // rows carry nullable commerce facts and the UI omits
              // absent values rather than inventing them (audit P0.4).
              brand: item.brand ?? null,
              size: item.size ?? null,
              condition: normalizeSearchCondition(item.condition),
              image: item.imageUrl ?? '',
              price: Number(item.priceGbp ?? 0),
              likes: 0,
              sellerId: item.sellerId,
              createdAt: item.createdAt,
              score: item.rank,
              reason: result.fallback ? 'Fuzzy match' : 'Search match',
              // Backend results don't carry media dimensions — use the
              // canonical 3:4 portrait fallback (listingMediaGeometry default).
              mediaHeightRatio: 4 / 3,
              })),
            );
          }
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedQuery, searchRetryVersion]);

  // People search — fetches matching users when scope is 'people' and a
  // query is active. Debounced 300ms to avoid hammering the user-search
  // endpoint on every keystroke (user search is more expensive than
  // listing search and benefits from explicit debouncing).
  useEffect(() => {
    if (!normalizedQuery || normalizedQuery.length < 2 || searchScope !== 'people') {
      setPeopleResults([]);
      setIsSearchingPeople(false);
      setPeopleSearchError(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsSearchingPeople(true);
      setPeopleSearchError(null);

      searchUsers(normalizedQuery, 20)
        .then((results) => {
          if (cancelled) return;
          setPeopleResults(results);
        })
        .catch((error) => {
          if (cancelled) return;
          setPeopleResults([]);
          setPeopleSearchError(friendlyBackendError(error));
        })
        .finally(() => {
          if (!cancelled) setIsSearchingPeople(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedQuery, peopleSearchRetryVersion, searchScope]);

  // Debounced, stale-safe production typeahead. A slower response for an old
  // query can never replace suggestions for the user's newer input.
  useEffect(() => {
    const partial = query.trim();
    if (!isSearchFocused || partial.length < 2) {
      setAutocompleteSuggestions([]);
      setAutocompleteError(null);
      setIsAutocompleteLoading(false);
      return;
    }

    let cancelled = false;
    setAutocompleteSuggestions([]);
    setIsAutocompleteLoading(true);
    setAutocompleteError(null);

    const timer = setTimeout(() => {
      fetchSearchAutocomplete(partial, 6).then((result) => {
        if (cancelled) return;
        setAutocompleteSuggestions(result.suggestions);
        setAutocompleteError(result.error ?? null);
        setIsAutocompleteLoading(false);
      });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isSearchFocused, query]);

  return {
    query,
    setQuery,
    isSearchFocused,
    setIsSearchFocused,
    normalizedQuery,
    queryTokens,
    backendSearchResults,
    isSearching,
    searchError,
    searchRetryVersion,
    setSearchRetryVersion,
    autocompleteSuggestions,
    isAutocompleteLoading,
    autocompleteError,
    searchScope,
    setSearchScope,
    peopleResults,
    isSearchingPeople,
    peopleSearchError,
    peopleSearchRetryVersion,
    setPeopleSearchRetryVersion,
  };
}
