/**
 * Web saved-lists + saved-searches service — mirrors
 * frontend/src/services/savedListsApi.ts and savedSearchesApi.ts.
 * Wishlist ('wishlist') and saved ('saved') are server-authoritative lists
 * on `/users/me/*`; the Zustand store only reflects the optimistic UI.
 */

import { fetchJson } from '../http';

type SavedList = 'wishlist' | 'saved';

interface SavedListResponse {
  ok: boolean;
  itemIds?: string[];
  /** Hydrated listing summaries — saved surfaces render these directly. */
  items?: unknown[];
}

function extractIds(res: SavedListResponse): string[] {
  return Array.isArray(res.itemIds) ? res.itemIds : [];
}

export async function fetchSavedList(
  list: SavedList,
  signal?: AbortSignal,
): Promise<{ itemIds: string[]; items: unknown[] }> {
  const res = await fetchJson<SavedListResponse>(`/users/me/${list}`, undefined, { signal });
  return { itemIds: extractIds(res), items: res.items ?? [] };
}

export async function writeSavedList(
  list: SavedList,
  listingId: string,
  action: 'add' | 'remove',
): Promise<string[]> {
  const res = await fetchJson<SavedListResponse>(`/users/me/${list}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingId, action }),
  });
  return extractIds(res);
}

// ── Saved searches ────────────────────────────────────────────────────────────
// Mirrors frontend/src/services/savedSearchesApi.ts — the backend
// `saved_searches` rows are what the server-side matcher watches; the
// `alertsEnabled` flag on the row is what actually gates
// saved_search_match notifications.

export interface SavedSearch {
  id: string;
  query: string;
  filters?: Record<string, unknown> | null;
  /** Server flag that gates match notifications — absent on older rows. */
  alertsEnabled?: boolean;
  createdAt?: string;
}

export async function fetchSavedSearches(signal?: AbortSignal): Promise<SavedSearch[]> {
  const res = await fetchJson<{ ok: boolean; items?: SavedSearch[]; searches?: SavedSearch[] }>(
    '/users/me/saved-searches',
    undefined,
    { signal },
  );
  return res.items ?? res.searches ?? [];
}

/**
 * Create (or upsert) a saved search. The server dedupes on
 * (user, normalized query + filters) and returns the canonical row —
 * callers should adopt `search.id` when it differs from the id they sent.
 * `alertsEnabled` persists the alert toggle atomically with the save.
 */
export async function createSavedSearch(input: {
  id?: string;
  query: string;
  filters?: Record<string, unknown>;
  alertsEnabled?: boolean;
}): Promise<SavedSearch> {
  const res = await fetchJson<{ ok: boolean; search?: SavedSearch }>(
    '/users/me/saved-searches',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok || !res.search) throw new Error('Saved search was not created');
  return res.search;
}

/** PATCH /users/me/saved-searches/:id — toggle the server-side matcher. */
export async function setSavedSearchAlerts(
  id: string,
  alertsEnabled: boolean,
): Promise<SavedSearch> {
  const res = await fetchJson<{ ok: boolean; search?: SavedSearch }>(
    `/users/me/saved-searches/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertsEnabled }),
    },
  );
  if (!res.ok || !res.search) throw new Error('Saved search was not updated');
  return res.search;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await fetchJson(`/users/me/saved-searches/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
