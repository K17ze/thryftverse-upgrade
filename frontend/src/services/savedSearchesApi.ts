import { fetchJson } from '../lib/apiClient';

/**
 * Server-persisted saved searches (P0: previously device-local only).
 * The local Zustand store stays the render cache; these calls keep the
 * backend `saved_searches` table in sync so the server-side matcher can
 * push `saved_search_match` notifications when a new listing activates.
 */

export interface RemoteSavedSearchFilters {
  brands?: string[];
  sizes?: string[];
  condition?: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  category?: string;
  [key: string]: unknown;
}

export interface RemoteSavedSearch {
  id: string;
  query: string;
  filters: RemoteSavedSearchFilters;
  alertsEnabled: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SavedSearchResponse {
  ok: true;
  search: RemoteSavedSearch;
}

interface SavedSearchListResponse {
  ok: true;
  searches: RemoteSavedSearch[];
}

/** List the caller's saved searches (server canonical list). */
export async function listSavedSearches(): Promise<RemoteSavedSearch[]> {
  const res = await fetchJson<SavedSearchListResponse>('/users/me/saved-searches');
  return res.searches;
}

/**
 * Create or update a saved search. Sending an existing `id` syncs that row;
 * omitting it creates one. The server dedupes on (user, normalized query +
 * filters) and returns the canonical row — callers should adopt
 * `search.id` when it differs from the id they sent.
 */
export async function upsertSavedSearch(input: {
  id?: string;
  query: string;
  filters?: RemoteSavedSearchFilters;
  alertsEnabled?: boolean;
}): Promise<RemoteSavedSearch> {
  const res = await fetchJson<SavedSearchResponse>('/users/me/saved-searches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.search;
}

/** Toggle server-side match alerts for a saved search. */
export async function setSavedSearchAlertsEnabled(
  searchId: string,
  alertsEnabled: boolean,
): Promise<RemoteSavedSearch> {
  const res = await fetchJson<SavedSearchResponse>(
    `/users/me/saved-searches/${encodeURIComponent(searchId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertsEnabled }),
    },
  );
  return res.search;
}

/** Delete a saved search (idempotent server-side). */
export async function deleteSavedSearch(searchId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/users/me/saved-searches/${encodeURIComponent(searchId)}`,
    { method: 'DELETE' },
  );
}
