import { fetchJson } from '../lib/apiClient';
import { mapBackendListings } from './listingMapper';
import type { Listing } from '../domain';

/**
 * Saved-lists contract — the server source of truth for the heart (wishlist)
 * and bookmark (saved) surfaces. `GET` returns the id list plus hydrated
 * listing summaries (feed `ListingSummary` shape) so saved surfaces render
 * real items instead of intersecting ids with resident feed pages.
 */
export type SavedListKind = 'wishlist' | 'saved';

interface SavedListResponse {
  ok: true;
  itemIds: string[];
  items?: unknown[];
}

export interface SavedListResult {
  itemIds: string[];
  items: Listing[];
}

export async function fetchSavedList(list: SavedListKind): Promise<SavedListResult> {
  const res = await fetchJson<SavedListResponse>(`/users/me/${list}`);
  return {
    itemIds: Array.isArray(res.itemIds) ? res.itemIds : [],
    items: mapBackendListings(res.items),
  };
}

/** Toggle a listing in a saved list. Returns the authoritative id list. */
export async function setSavedListItem(
  list: SavedListKind,
  listingId: string,
  action: 'add' | 'remove',
): Promise<string[]> {
  const res = await fetchJson<SavedListResponse>(`/users/me/${list}`, {
    method: 'POST',
    body: JSON.stringify({ listingId, action }),
  });
  return Array.isArray(res.itemIds) ? res.itemIds : [];
}
