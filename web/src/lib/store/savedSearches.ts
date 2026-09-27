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
import {
  coerceFilters,
  writeFilterParams,
  type ListingFilters,
} from '@/components/filters/filterTypes';

export type SavedSearchKind = 'text' | 'visual';

export interface SavedSearch {
  id: string;
  /** The user's query text — may be empty for a pure-filter save. For
   *  visual saves this is the extracted-attribute summary, not the image. */
  query: string;
  filters: ListingFilters;
  alertsOn: boolean;
  createdAt: string;
  /** 'text' when omitted — older persisted entries are text searches.
   *  'visual' means the entry was saved from a visual-search result set;
   *  only the derived text/facet representation persists, never the image. */
  kind?: SavedSearchKind;
  /** Correlation id of the visual-search query this was saved from. */
  queryId?: string;
  /** Result count at save time — honest context, not a live count. */
  resultCount?: number;
}

export interface SaveSearchOptions {
  kind?: SavedSearchKind;
  queryId?: string;
  resultCount?: number;
  /** Override the alert default — visual saves start off because only
   *  text/facets persist; the image itself is not a durable matcher. */
  alertsOn?: boolean;
}

interface SavedSearchesState {
  searches: SavedSearch[];
  saveSearch: (
    query: string,
    filters: ListingFilters,
    opts?: SaveSearchOptions,
  ) => SavedSearch;
  removeSearch: (id: string) => void;
  toggleAlert: (id: string) => void;
  /** Restore persisted storage — call once on mount in surfaces that read
   *  during render (persist's async hydration races the first paint). */
  hydrate: () => void;
}

let counter = 0;
const nextId = () =>
  `ss-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

/** Human-readable summary of the active filters — for list rows.
 *  coerceFilters absorbs the pre-multi-select persisted shape, so a
 *  search saved before the facet upgrade still describes cleanly. */
export function describeFilters(raw: ListingFilters): string {
  const f = coerceFilters(raw);
  const parts: string[] = [];
  parts.push(...f.categories);
  parts.push(...f.brands.map((b) => b.trim()).filter(Boolean));
  if (f.conditions.length > 0) parts.push(f.conditions.join(', '));
  parts.push(
    ...f.sizes.map((s) => `Size ${s.trim()}`).filter((s) => s !== 'Size '),
  );
  parts.push(...f.colours);
  if (f.priceMin != null || f.priceMax != null) {
    const lo = f.priceMin != null ? `£${f.priceMin}` : '£0';
    const hi = f.priceMax != null ? `£${f.priceMax}` : 'Any';
    parts.push(`${lo}–${hi}`);
  }
  if (f.includeSold) parts.push('Sold items');
  return parts.join(' · ');
}

/** Build the /search href that replays this saved search — same facet
 *  codec the surfaces read, so replay is exact. */
export function searchHref(s: SavedSearch): string {
  const params = new URLSearchParams();
  if (s.query) params.set('q', s.query);
  writeFilterParams(params, coerceFilters(s.filters));
  const qs = params.toString();
  return `/search${qs ? `?${qs}` : ''}`;
}

export const useSavedSearches = create<SavedSearchesState>()(
  persist(
    (set) => ({
      searches: [],
      saveSearch: (query, filters, opts) => {
        const search: SavedSearch = {
          id: nextId(),
          query,
          filters,
          alertsOn: opts?.alertsOn ?? true,
          createdAt: new Date().toISOString(),
          ...(opts?.kind ? { kind: opts.kind } : {}),
          ...(opts?.queryId ? { queryId: opts.queryId } : {}),
          ...(opts?.resultCount !== undefined
            ? { resultCount: opts.resultCount }
            : {}),
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
      hydrate: () => {
        void useSavedSearches.persist.rehydrate();
      },
    }),
    {
      name: 'thryftverse.web.saved-searches',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ searches: s.searches }),
    },
  ),
);
