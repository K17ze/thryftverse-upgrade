'use client';

import { useDeferredValue, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Listing, User } from '@/lib/contracts/domain';
import { LISTINGS, USERS } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { searchListings } from '@/lib/api/services/listings';
import { fetchAutocompleteSuggestions } from '@/lib/api/services/search';
import { searchUsers } from '@/lib/api/services/users';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import {
  rankBrands,
  useTrendingListings,
  useTrendingSearches,
} from '@/lib/hooks/search-queries';
import { TRENDING_SEARCHES } from '@/components/search/taxonomy';

export const MAX_LISTING_RESULTS = 5;
export const MAX_MEMBER_RESULTS = 3;
export const MAX_RECENT = 6;
export const MAX_BRANDS = 8;

/** Top brands by fixture occurrence — same derivation as SearchLanding. */
export const POPULAR_BRANDS = (() => {
  const counts = new Map<string, number>();
  for (const l of LISTINGS) {
    if (l.brand) counts.set(l.brand, (counts.get(l.brand) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([brand]) => brand);
})();

export type SuggestionKind =
  | 'search'
  | 'suggestion'
  | 'listing'
  | 'member'
  | 'recent'
  | 'trending'
  | 'brand';

export interface SuggestionOption {
  id: string;
  kind: SuggestionKind;
  term: string;
  listing?: Listing;
  user?: User;
  /** Set when selection navigates to a route instead of running a query. */
  href?: string;
}

export function suggestionOptionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

/**
 * Flat, ordered option list — keyboard-nav order matches visual order:
 * "search for" → matching items → members → recent → trending → brands.
 */
export function buildSuggestionOptions(
  query: string,
  recent: string[],
): SuggestionOption[] {
  const q = query.trim();
  const needle = q.toLowerCase();
  const matches = (s: string) => !needle || s.toLowerCase().includes(needle);
  const options: SuggestionOption[] = [];

  if (q) {
    options.push({ id: 'search-query', kind: 'search', term: q });
    let found = 0;
    for (const l of LISTINGS) {
      if (found >= MAX_LISTING_RESULTS) break;
      if (
        l.title.toLowerCase().includes(needle) ||
        (l.brand ?? '').toLowerCase().includes(needle)
      ) {
        options.push({
          id: `listing-${l.id}`,
          kind: 'listing',
          term: l.title,
          listing: l,
        });
        found += 1;
      }
    }
    let members = 0;
    for (const u of USERS) {
      if (members >= MAX_MEMBER_RESULTS) break;
      if (u.username.toLowerCase().includes(needle)) {
        options.push({
          id: `member-${u.id}`,
          kind: 'member',
          term: u.username,
          user: u,
          href: `/u/${u.username}`,
        });
        members += 1;
      }
    }
  }

  for (const term of recent.filter(matches).slice(0, MAX_RECENT)) {
    options.push({ id: `recent-${term}`, kind: 'recent', term });
  }
  for (const term of TRENDING_SEARCHES.filter(matches)) {
    options.push({ id: `trending-${term}`, kind: 'trending', term });
  }
  for (const brand of POPULAR_BRANDS.filter(matches).slice(0, MAX_BRANDS)) {
    options.push({ id: `brand-${brand}`, kind: 'brand', term: brand });
  }

  return options;
}

const LIVE = DATA_MODE === 'live';

/**
 * Suggestion options against the active data source. Fixture mode runs
 * the pure fixture matcher; live mode is backend-first — query text
 * suggestions come from GET /search/autocomplete (mobile parity), item
 * rows from the real catalogue (GET /listings?q=) and member rows from
 * the real directory (GET /users/search), with trending queries/brands
 * from the shared trending hooks.
 */
export function useSuggestionOptions(query: string, recent: string[]): SuggestionOption[] {
  const deferredQ = useDeferredValue(query.trim());
  const debouncedQ = useDebouncedValue(deferredQ, 220);
  const usable = debouncedQ.length >= 2;
  const autocompleteQuery = useQuery({
    queryKey: ['search-suggest', 'autocomplete', debouncedQ],
    queryFn: ({ signal }) => fetchAutocompleteSuggestions(debouncedQ, 8, signal),
    enabled: LIVE && usable,
    staleTime: 30_000,
  });
  const listingsQuery = useQuery({
    queryKey: ['search-suggest', 'listings', debouncedQ],
    queryFn: ({ signal }) => searchListings({ q: debouncedQ, limit: MAX_LISTING_RESULTS }, signal),
    enabled: LIVE && usable,
    staleTime: 30_000,
  });
  const membersQuery = useQuery({
    queryKey: ['search-suggest', 'members', debouncedQ],
    queryFn: ({ signal }) => searchUsers(debouncedQ, signal),
    enabled: LIVE && usable,
    staleTime: 30_000,
  });
  const trending = useTrendingListings(24);
  const trendingSearches = useTrendingSearches();

  return useMemo<SuggestionOption[]>(() => {
    if (!LIVE) return buildSuggestionOptions(query, recent);

    const q = query.trim();
    const needle = q.toLowerCase();
    const matches = (s: string) => !needle || s.toLowerCase().includes(needle);
    const options: SuggestionOption[] = [];
    const seenText = new Set<string>();
    const pushText = (option: SuggestionOption) => {
      const key = option.term.toLowerCase();
      if (seenText.has(key)) return;
      seenText.add(key);
      options.push(option);
    };

    if (q) {
      options.push({ id: 'search-query', kind: 'search', term: q });
      if (autocompleteQuery.isError) {
        for (const term of TRENDING_SEARCHES.filter(matches)) {
          pushText({ id: `suggestion-${term}`, kind: 'suggestion', term });
        }
        for (const brand of POPULAR_BRANDS.filter(matches)) {
          pushText({ id: `suggestion-${brand}`, kind: 'suggestion', term: brand });
        }
      } else {
        for (const s of autocompleteQuery.data?.suggestions ?? []) {
          pushText({ id: `suggestion-${s.text}`, kind: 'suggestion', term: s.text });
        }
      }
      for (const l of (listingsQuery.data?.items ?? []).slice(0, MAX_LISTING_RESULTS)) {
        options.push({ id: `listing-${l.id}`, kind: 'listing', term: l.title, listing: l });
      }
      for (const u of (membersQuery.data ?? []).slice(0, MAX_MEMBER_RESULTS)) {
        options.push({
          id: `member-${u.id}`,
          kind: 'member',
          term: u.username,
          user: u,
          href: `/u/${u.username}`,
        });
      }
    }

    for (const term of recent.filter(matches).slice(0, MAX_RECENT)) {
      options.push({ id: `recent-${term}`, kind: 'recent', term });
    }
    for (const term of trendingSearches.terms.filter(matches)) {
      pushText({ id: `trending-${term}`, kind: 'trending', term });
    }
    for (const brand of rankBrands(trending.listings, 10).filter(matches).slice(0, MAX_BRANDS)) {
      pushText({ id: `brand-${brand}`, kind: 'brand', term: brand });
    }
    return options;
  }, [
    query,
    recent,
    autocompleteQuery.data,
    autocompleteQuery.isError,
    listingsQuery.data,
    membersQuery.data,
    trending.listings,
    trendingSearches.terms,
  ]);
}
