/**
 * Moodboard API — user-generated editorial composition layer
 *
 * This service provides the data contract for the ThryftVerse Moodboard — a
 * Depop "Outfits" / Pinterest board equivalent that lets users create and
 * share their own editorial collages from marketplace listings.
 *
 * The service calls the real backend (`/moodboards`). It does NOT silently
 * fall back to mock data on failure — errors propagate to the caller so the
 * UI can show an honest loading/error state. LOCAL_THEME_FALLBACK provides
 * synchronous theme lookups before the async themes list has loaded
 * (AGENTS.md §11 — truth-lockdown).
 */

import { fetchJson } from '../lib/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Position + transform of an item on the moodboard canvas. */
export interface MoodboardItemPosition {
  /** Normalised x position (0–1 relative to canvas width). */
  x: number;
  /** Normalised y position (0–1 relative to canvas height). */
  y: number;
  /** Scale factor (1 = original size). */
  scale: number;
  /** Rotation in degrees (0–360). */
  rotation: number;
}

/** A single listing placed on a moodboard canvas. */
export interface MoodboardItem {
  id: string;
  /** The source listing ID (for navigation back to the listing). */
  listingId: string;
  /** Image URI for the item on the canvas. */
  imageUri: string;
  /** Display title (listing title at time of addition). */
  title: string;
  /** Price in GBP at time of addition. */
  price: number;
  /** Position and transform on the canvas. */
  position: MoodboardItemPosition;
  /** ISO timestamp of when the item was added. */
  addedAt: string;
  /** Honest flag — true while this item comes from mock data. */
  isDemo: boolean;
}

/** A visual theme for the moodboard canvas background. */
export interface MoodboardTheme {
  id: string;
  /** Human-readable label (e.g. "Linen", "Noir", "Sage"). */
  label: string;
  /** Canvas background color. */
  backgroundColor: string;
  /** Accent color for UI chrome on the canvas. */
  accentColor: string;
  /** Font / text color on the canvas. */
  fontColor: string;
  /** Honest flag — true while this theme comes from mock data. */
  isDemo: boolean;
}

/** A user-created moodboard — a collage of listings on a themed canvas. */
export interface Moodboard {
  id: string;
  title: string;
  description: string;
  /** Curator (user) display name. */
  curator: string;
  /** Curator avatar URL. */
  curatorAvatar: string;
  /** Items placed on the canvas. */
  items: MoodboardItem[];
  /** Cover image URI (composed preview or first item image). */
  coverImage: string;
  /** Whether the moodboard is publicly discoverable. */
  isPublic: boolean;
  /** Theme ID for the canvas background. */
  theme: string;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of last update. */
  updatedAt: string;
  /** Honest flag — true while this moodboard comes from mock data. */
  isDemo: boolean;
}

// ---------------------------------------------------------------------------
// Demo flag — the UI reads this to decide whether to show a "Demo mode" badge.
// ---------------------------------------------------------------------------
// Demo mode is disabled: no API call may silently fall back to in-memory mock
// data and report success (truth-lockdown). Kept as an export so existing
// references compile, but it is now always `false`.
export const MOODBOARD_DEMO_MODE = false;

// ---------------------------------------------------------------------------
// Local theme definitions — synchronous fallback for getThemeById()
// ---------------------------------------------------------------------------
// These theme definitions are used by getThemeById() when the async
// fetchMoodboardThemes() list has not loaded yet. They are NOT a silent
// fallback for API failures — they exist only so the editor can resolve a
// theme ID to its visual properties without a network round-trip.

const LOCAL_THEME_FALLBACK: MoodboardTheme[] = [
  { id: 'theme-linen', label: 'Linen', backgroundColor: '#F7F4EE', accentColor: '#8A6A3F', fontColor: '#2A2A2A', isDemo: true },
  { id: 'theme-noir', label: 'Noir', backgroundColor: '#1A1A1A', accentColor: '#C9A46A', fontColor: '#F4F0E8', isDemo: true },
  { id: 'theme-sage', label: 'Sage', backgroundColor: '#E8EDE6', accentColor: '#4A6741', fontColor: '#2A3A28', isDemo: true },
  { id: 'theme-blush', label: 'Blush', backgroundColor: '#F5E6E4', accentColor: '#9A6B7A', fontColor: '#4A2A30', isDemo: true },
  { id: 'theme-stone', label: 'Stone', backgroundColor: '#E5E2DC', accentColor: '#6B6B6B', fontColor: '#333333', isDemo: true },
  { id: 'theme-midnight', label: 'Midnight', backgroundColor: '#0F1A2E', accentColor: '#4A7AC4', fontColor: '#E8EDF5', isDemo: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTheme(themeId: string): MoodboardTheme {
  return LOCAL_THEME_FALLBACK.find((t) => t.id === themeId) ?? LOCAL_THEME_FALLBACK[0];
}

interface ApiMoodboard {
  id: string;
  title: string;
  description: string;
  curator: string;
  curatorAvatar: string;
  items: Array<{
    id: string;
    listingId: string;
    imageUri: string;
    title: string;
    price: number;
    position: { x: number; y: number; scale: number; rotation: number };
    addedAt: string;
  }>;
  coverImage: string;
  isPublic: boolean;
  theme: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiMoodboardListResponse {
  items: ApiMoodboard[];
}

interface ApiMoodboardItemResponse {
  id: string;
  listingId: string;
  imageUri: string;
  title: string;
  price: number;
  position: { x: number; y: number; scale: number; rotation: number };
  addedAt: string;
}

function mapApiMoodboard(raw: ApiMoodboard): Moodboard {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    curator: raw.curator,
    curatorAvatar: raw.curatorAvatar,
    items: raw.items.map((it) => ({ ...it, isDemo: false })),
    coverImage: raw.coverImage,
    isPublic: raw.isPublic,
    theme: raw.theme,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    isDemo: false,
  };
}

function mapApiItem(raw: ApiMoodboardItemResponse): MoodboardItem {
  return { ...raw, isDemo: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the current user's moodboards.
 * Errors propagate to the caller — no silent mock fallback.
 */
export async function fetchMoodboards(): Promise<Moodboard[]> {
  try {
    const data = await fetchJson<ApiMoodboardListResponse>('/moodboards?limit=50');
    return data.items.map(mapApiMoodboard);
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch a single moodboard with its items.
 * Returns null if the moodboard ID is not found.
 * Errors propagate to the caller — no silent mock fallback.
 */
export async function fetchMoodboardDetail(id: string): Promise<Moodboard | null> {
  try {
    const data = await fetchJson<ApiMoodboard>(`/moodboards/${id}`);
    return mapApiMoodboard(data);
  } catch (error) {
    throw error;
  }
}

/**
 * Create a new moodboard with a title and theme.
 * Errors propagate to the caller — no silent mock fallback.
 */
export async function createMoodboard(title: string, theme: string): Promise<Moodboard> {
  try {
    const data = await fetchJson<ApiMoodboard>('/moodboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, theme, visibility: 'private' }),
    });
    return mapApiMoodboard(data);
  } catch (error) {
    throw error;
  }
}

/**
 * Add an item (by listing ID) to a moodboard.
 * Errors propagate to the caller — no silent mock fallback.
 */
export async function addItemToMoodboard(
  moodboardId: string,
  listingId: string,
): Promise<MoodboardItem | null> {
  try {
    const data = await fetchJson<ApiMoodboardItemResponse>(
      `/moodboards/${moodboardId}/items`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      },
    );
    return mapApiItem(data);
  } catch (error) {
    throw error;
  }
}

/**
 * Remove an item from a moodboard.
 * Errors propagate to the caller — no silent mock fallback.
 */
export async function removeItemFromMoodboard(
  moodboardId: string,
  itemId: string,
): Promise<boolean> {
  try {
    await fetchJson<{ ok: boolean }>(
      `/moodboards/${moodboardId}/items/${itemId}`,
      { method: 'DELETE' },
    );
    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Update the position (x, y, scale, rotation) of an item on the canvas.
 * Errors propagate to the caller — no silent mock fallback.
 */
export async function updateItemPosition(
  moodboardId: string,
  itemId: string,
  position: MoodboardItemPosition,
): Promise<boolean> {
  try {
    await fetchJson<{ ok: boolean }>(`/moodboards/${moodboardId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positionX: position.x,
        positionY: position.y,
        rotation: position.rotation,
        scale: position.scale,
      }),
    });
    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Reorder an item's layer (bring to front or send to back).
 * Errors propagate to the caller — no silent mock fallback.
 */
export async function reorderItem(
  moodboardId: string,
  itemId: string,
  direction: 'front' | 'back',
): Promise<boolean> {
  try {
    await fetchJson<{ ok: boolean }>(`/moodboards/${moodboardId}/items/${itemId}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch available moodboard themes for the canvas background.
 * Attempts a real backend call; errors propagate to the caller.
 */
export async function fetchMoodboardThemes(): Promise<MoodboardTheme[]> {
  const data = await fetchJson<{ items: Array<{ id: string; label: string; backgroundColor: string; accentColor: string; fontColor: string }> }>('/moodboards/themes');
  return data.items.map((t) => ({ ...t, isDemo: false }));
}

/**
 * Update the theme of a moodboard. Errors propagate to the caller — no
 * silent mock fallback.
 */
export async function updateMoodboardTheme(
  moodboardId: string,
  theme: string,
): Promise<boolean> {
  try {
    await fetchJson<{ ok: boolean }>(`/moodboards/${moodboardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch public moodboards for the discovery surface.
 * Errors propagate to the caller — no silent mock fallback.
 */
export async function fetchPublicMoodboards(): Promise<Moodboard[]> {
  try {
    const data = await fetchJson<ApiMoodboardListResponse>('/moodboards?limit=24');
    return data.items.map(mapApiMoodboard);
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch items available to add to a moodboard (from saved items, recently
 * viewed, or search). Attempts a real backend call; errors propagate so the
 * caller can show an honest loading/error state.
 */
export async function fetchPickerItems(): Promise<MoodboardItem[]> {
  const data = await fetchJson<{ items: ApiMoodboardItemResponse[] }>('/moodboards/picker-items');
  return data.items.map(mapApiItem);
}

/**
 * Resolve a theme by its ID synchronously using LOCAL_THEME_FALLBACK.
 * Used by the editor before fetchMoodboardThemes() has loaded.
 */
export function getThemeById(themeId: string): MoodboardTheme {
  return resolveTheme(themeId);
}
