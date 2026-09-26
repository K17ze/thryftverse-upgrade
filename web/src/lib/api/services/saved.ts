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

export interface SavedSearch {
  id: string;
  query: string;
  filters?: Record<string, unknown> | null;
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

export async function createSavedSearch(input: {
  query: string;
  filters?: Record<string, unknown>;
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

export async function deleteSavedSearch(id: string): Promise<void> {
  await fetchJson(`/users/me/saved-searches/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
