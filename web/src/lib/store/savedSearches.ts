'use client';

/**
 * Saved searches — persisted query + filter sets with an alert toggle.
 * Mirrors the mobile saved_searches contract: a saved search is the render
 * cache; the alert flag is what the backend matcher uses to emit
 * saved_search_match notifications when new listings activate.
 *
 * Live mode is honest about where the truth lives: every write is an
 * optimistic local mirror of `/users/me/saved-searches` (POST upsert /
 * PATCH alerts / DELETE) with revert-on-failure — a failed write snaps
 * back and raises `syncError` so a surface can say the sync failed.
 * `hydrateSavedSearches` replaces the local list with server truth when
 * the session resolves; fixture mode stays localStorage-only.
 * Separate store from useStore so persisted slices stay composable.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  coerceFilters,
  writeFilterParams,
  type ListingFilters,
} from '@/components/filters/filterTypes';
import { DATA_MODE } from '@/lib/api/client';
import * as savedService from '@/lib/api/services/saved';
import {
  persistedSessionUserId,
  sessionEpoch,
  sessionIdentityIsCurrent,
  sessionUserId,
} from '@/lib/session/identityEpoch';

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
  /** Server-stamped last-match timestamp (live rows only) — rendered as
   *  "Last match …"; never fabricated for fixture/local entries. */
  lastNotifiedAt?: string | null;
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

  // Live-mode honesty channels (runtime state — never persisted):
  /** Set when a live write-through failed after rollback; cleared on the
   *  next successful write or hydrate. */
  syncError: string | null;
  /** True until the first live hydrate lands (or after a failed one) —
   *  the persisted list may be stale relative to the server. */
  stale: boolean;
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

const LIVE = DATA_MODE === 'live';

/**
 * Identity namespace for the persisted list — saved searches are
 * account-owned truth, so the storage bucket follows the session
 * identity: the resolved user id, else the last resolved account across
 * reloads (the identity marker — written before hydration, so a reload
 * rehydrates the same account's rows), else 'guest'. A guest bucket
 * starts empty and can never surface a previous account's searches.
 */
function scopedKey(name: string): string {
  const scope = sessionUserId() ?? persistedSessionUserId() ?? 'guest';
  return `${name}.${scope}`;
}

const accountStorage = {
  getItem: (name: string) =>
    typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(scopedKey(name)),
  setItem: (name: string, value: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(scopedKey(name), value);
  },
  removeItem: (name: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(scopedKey(name));
  },
};

/**
 * Normalized dedupe key — the backend upserts on (user, normalized
 * query+filters); the client mirrors that so a repeat save of the same
 * normalized intent returns the existing row instead of inserting a
 * duplicate optimistic copy.
 */
export function savedSearchKey(query: string, filters: ListingFilters): string {
  const f = coerceFilters(filters);
  const list = (xs: string[]) => xs.map((x) => x.trim().toLowerCase()).sort();
  return JSON.stringify([
    query.trim().toLowerCase(),
    list(f.categories),
    list(f.brands),
    list(f.sizes),
    list(f.colours),
    list(f.conditions),
    f.priceMin,
    f.priceMax,
    f.includeSold,
  ]);
}

/** Server row → local render cache shape. */
function mapRemoteSearch(row: savedService.SavedSearch): SavedSearch {
  return {
    id: row.id,
    query: row.query ?? '',
    filters: coerceFilters(row.filters ?? {}),
    alertsOn: row.alertsEnabled ?? true,
    createdAt: row.createdAt ?? new Date().toISOString(),
    kind: 'text',
    lastNotifiedAt: row.lastNotifiedAt ?? null,
  };
}

export const useSavedSearches = create<SavedSearchesState>()(
  persist(
    (set, get) => ({
      searches: [],
      syncError: null,
      stale: LIVE,

      saveSearch: (query, filters, opts) => {
        // Same normalized (query + filters) is already saved — return it
        // rather than inserting a duplicate (the server would upsert to
        // the same row anyway).
        const key = savedSearchKey(query, filters);
        const existing = get().searches.find(
          (s) => savedSearchKey(s.query, s.filters) === key,
        );
        if (existing) return existing;
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
        if (LIVE) {
          void savedService
            .createSavedSearch({
              query,
              filters: filters as unknown as Record<string, unknown>,
              alertsEnabled: search.alertsOn,
            })
            .then((remote) => {
              // Adopt the canonical server row — the backend dedupes on
              // (user, normalized query+filters), so the returned id can
              // differ from the optimistic local one.
              set((s) => ({
                syncError: null,
                searches: s.searches.map((x) =>
                  x.id === search.id
                    ? {
                        ...mapRemoteSearch(remote),
                        // Local-only context the server doesn't store.
                        kind: search.kind,
                        queryId: search.queryId,
                        resultCount: search.resultCount,
                      }
                    : x,
                ),
              }));
            })
            .catch(() => {
              // Rollback — a failed save drops the optimistic row and
              // flags the failure instead of pretending it persisted.
              set((s) => ({
                searches: s.searches.filter((x) => x.id !== search.id),
                syncError: 'save',
              }));
            });
        }
        return search;
      },

      removeSearch: (id) => {
        const before = get().searches;
        const index = before.findIndex((x) => x.id === id);
        if (index < 0) return;
        set((s) => ({ searches: s.searches.filter((x) => x.id !== id) }));
        if (LIVE) {
          void savedService
            .deleteSavedSearch(id)
            .then(() => set({ syncError: null }))
            .catch(() =>
              set((s) => ({
                // Reinsert at the original position — the row was never
                // actually deleted server-side.
                searches: [
                  ...s.searches.slice(0, index),
                  before[index],
                  ...s.searches.slice(index),
                ],
                syncError: 'remove',
              })),
            );
        }
      },

      toggleAlert: (id) => {
        const before = get().searches;
        const target = before.find((x) => x.id === id);
        if (!target) return;
        const next = !target.alertsOn;
        set((s) => ({
          searches: s.searches.map((x) =>
            x.id === id ? { ...x, alertsOn: next } : x,
          ),
        }));
        if (LIVE) {
          void savedService
            .setSavedSearchAlerts(id, next)
            .then(() => set({ syncError: null }))
            .catch(() =>
              set((s) => ({
                searches: s.searches.map((x) =>
                  x.id === id ? { ...x, alertsOn: !next } : x,
                ),
                syncError: 'alert',
              })),
            );
        }
      },

      hydrate: () => {
        void useSavedSearches.persist.rehydrate();
      },
    }),
    {
      name: 'thryftverse.web.saved-searches',
      storage: createJSONStorage(() => accountStorage),
      partialize: (s) => ({ searches: s.searches }),
    },
  ),
);

/**
 * Live mode: replace the local list with the server-authoritative saved
 * searches once the session resolves. Called from the session provider —
 * no-ops in fixture mode. The write is sequenced by the session epoch so
 * a late resolution never lands on the next account; a failed read flags
 * the store stale rather than silently keeping the old list.
 */
export async function hydrateSavedSearches(forUserId: string): Promise<void> {
  if (!LIVE) return;
  const epoch = sessionEpoch();
  const stillCurrent = () => sessionIdentityIsCurrent(forUserId, epoch);
  try {
    const rows = await savedService.fetchSavedSearches();
    if (!stillCurrent()) return;
    useSavedSearches.setState({
      searches: rows.map(mapRemoteSearch),
      stale: false,
      syncError: null,
    });
  } catch {
    if (stillCurrent()) useSavedSearches.setState({ stale: true });
  }
}
