'use client';

/**
 * Saved searches — persisted query + filter sets with an alert toggle.
 * Mirrors the mobile saved_searches contract: a saved search is the render
 * cache; the alert flag is what the backend matcher uses to emit
 * saved_search_match notifications when new listings activate.
 * Separate store from useStore so persisted slices stay composable.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ListingFilters } from '@/components/filters/filterTypes';

export interface SavedSearch {
  id: string;
  /** The user's query text — may be empty for a pure-filter save. */
  query: string;
  filters: ListingFilters;
  alertsOn: boolean;
  createdAt: string;
}

interface SavedSearchesState {
  searches: SavedSearch[];
  saveSearch: (query: string, filters: ListingFilters) => SavedSearch;
  removeSearch: (id: string) => void;
  toggleAlert: (id: string) => void;
}

let counter = 0;
const nextId = () =>
  `ss-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

/** Human-readable summary of the active filters — for list rows. */
export function describeFilters(f: ListingFilters): string {
  const parts: string[] = [];
  if (f.category) parts.push(f.category);
  if (f.brand.trim()) parts.push(f.brand.trim());
  if (f.conditions.length > 0) parts.push(f.conditions.join(', '));
  if (f.size.trim()) parts.push(`Size ${f.size.trim()}`);
  if (f.priceMin != null || f.priceMax != null) {
    const lo = f.priceMin != null ? `£${f.priceMin}` : '£0';
    const hi = f.priceMax != null ? `£${f.priceMax}` : 'Any';
    parts.push(`${lo}–${hi}`);
  }
  return parts.join(' · ');
}

/** Build the /search href that replays this saved search. */
export function searchHref(s: SavedSearch): string {
  const params = new URLSearchParams();
  if (s.query) params.set('q', s.query);
  const f = s.filters;
  if (f.category) params.set('category', f.category);
  if (f.brand.trim()) params.set('brand', f.brand.trim());
  if (f.conditions.length > 0) params.set('condition', f.conditions.join('|'));
  if (f.size.trim()) params.set('size', f.size.trim());
  if (f.priceMin != null) params.set('min', String(f.priceMin));
  if (f.priceMax != null) params.set('max', String(f.priceMax));
  const qs = params.toString();
  return `/search${qs ? `?${qs}` : ''}`;
}

export const useSavedSearches = create<SavedSearchesState>()(
  persist(
    (set) => ({
      searches: [],
      saveSearch: (query, filters) => {
        const search: SavedSearch = {
          id: nextId(),
          query,
          filters,
          alertsOn: true,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ searches: [search, ...s.searches] }));
        return search;
      },
      removeSearch: (id) =>
        set((s) => ({ searches: s.searches.filter((x) => x.id !== id) })),
      toggleAlert: (id) =>
        set((s) => ({
          searches: s.searches.map((x) =>
            x.id === id ? { ...x, alertsOn: !x.alertsOn } : x,
          ),
        })),
    }),
    {
      name: 'thryftverse.web.saved-searches',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ searches: s.searches }),
    },
  ),
);
