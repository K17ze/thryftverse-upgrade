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
  /** Server revision number for optimistic-concurrency checks. */
  revision: number;
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
  /** Server revision number for optimistic-concurrency checks. */
  revision: number;
  /** ISO timestamp of soft-delete, or null if the board is active. */
  deletedAt: string | null;
}

// ---------------------------------------------------------------------------
// Operation types
// ---------------------------------------------------------------------------

/** Operation types supported by the server-authoritative LWW operation endpoint. */
export type MoodboardOperationType =
  | 'item.add'
  | 'item.transform'
  | 'item.remove'
  | 'item.reorder'
  | 'board.theme'
  | 'board.rename'
  | 'board.visibility';

/** A client-submitted operation with idempotency key and base revision. */
export interface MoodboardOperationRequest {
  /** Client-generated idempotency key. Retries with the same key return the original result. */
  clientOperationId: string;
  /** The revision the client believed it was editing against. */
  baseRevision: number;
  type: MoodboardOperationType;
  /** Target item id for item-level operations. */
  itemId?: string;
  /** Operation-specific payload (position, theme, title, etc.). */
  payload: Record<string, unknown>;
}

/** Server response to an operation submission. */
export type MoodboardOperationResponse =
  | { outcome: 'applied'; operationId: string; revision: number; canonicalPatch: Record<string, unknown> }
  | { outcome: 'duplicate'; operationId: string; revision: number }
  | { outcome: 'conflict'; currentRevision: number; operationsSinceBase: Array<{ operationType: string; itemId: string | null; payload: Record<string, unknown>; appliedRevision: number }> }
  | { outcome: 'forbidden'; recoverLocalCopy: true };

/** A canonical operation from the server operation log. */
export interface MoodboardOperation {
  id: string;
  boardId: string;
  actorId: string;
  clientOperationId: string;
  baseRevision: number;
  appliedRevision: number;
  operationType: MoodboardOperationType;
  itemId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
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
    revision: number;
  }>;
  coverImage: string;
  isPublic: boolean;
  theme: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
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
  revision: number;
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
    revision: raw.revision,
    deletedAt: raw.deletedAt,
  };
}

function mapApiItem(raw: ApiMoodboardItemResponse): MoodboardItem {
  return { ...raw, isDemo: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the current user's moodboards (owned and member boards).
 * Errors propagate to the caller — no silent mock fallback.
 */
export async function fetchMoodboards(): Promise<Moodboard[]> {
  try {
    const data = await fetchJson<ApiMoodboardListResponse>('/me/moodboards?limit=50');
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
 * Submit an operation to the server-authoritative LWW operation endpoint.
 * Uses a client operation id for idempotency — retries with the same id
 * return the original result instead of re-applying. Errors propagate.
 */
export async function submitMoodboardOperation(
  moodboardId: string,
  operation: MoodboardOperationRequest,
): Promise<MoodboardOperationResponse> {
  const data = await fetchJson<MoodboardOperationResponse>(
    `/moodboards/${moodboardId}/operations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation),
    },
  );
  return data;
}

/**
 * Fetch operations for a board since a given revision. Used to catch up
 * after a conflict response. Errors propagate.
 */
export async function fetchMoodboardOperations(
  moodboardId: string,
  sinceRevision: number,
): Promise<MoodboardOperation[]> {
  const data = await fetchJson<{ items: MoodboardOperation[] }>(
    `/moodboards/${moodboardId}/operations?since=${sinceRevision}`,
  );
  return data.items;
}

/**
 * Restore a trashed moodboard. Owner-only. Errors propagate.
 */
export async function restoreMoodboard(moodboardId: string): Promise<Moodboard> {
  const data = await fetchJson<ApiMoodboard>(
    `/moodboards/${moodboardId}/restore`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  );
  return mapApiMoodboard(data);
}

/**
 * Resolve a theme by its ID synchronously using LOCAL_THEME_FALLBACK.
 * Used by the editor before fetchMoodboardThemes() has loaded.
 */
export function getThemeById(themeId: string): MoodboardTheme {
  return resolveTheme(themeId);
}

// ---------------------------------------------------------------------------
// Invite types
// ---------------------------------------------------------------------------

/** Invite role — the capability the invitee will receive on acceptance. */
export type MoodboardInviteRole = 'editor' | 'commenter' | 'viewer';

/** Invite state in its lifecycle. */
export type MoodboardInviteState = 'pending' | 'accepted' | 'revoked' | 'expired';

/** A moodboard invite DTO (token_hash never exposed). */
export interface MoodboardInvite {
  id: string;
  role: MoodboardInviteRole;
  state: MoodboardInviteState;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  revokedAt: string | null;
  recipientUserId: string | null;
}

/** Response from creating an invite — includes the plaintext token (shown once). */
export interface MoodboardInviteCreated extends MoodboardInvite {
  token: string;
}

// ---------------------------------------------------------------------------
// Member types
// ---------------------------------------------------------------------------

/** Board member role. */
export type MoodboardMemberRole = 'owner' | 'editor' | 'commenter' | 'viewer';

/** A board member with user info. */
export interface MoodboardMember {
  userId: string;
  displayName: string;
  avatar: string;
  role: MoodboardMemberRole;
  state: 'active' | 'suspended' | 'removed';
  joinedAt: string;
}

// ---------------------------------------------------------------------------
// Comment types
// ---------------------------------------------------------------------------

/** A canvas-anchored comment. itemId is null for board-level comments. */
export interface MoodboardComment {
  id: string;
  boardId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  itemId: string | null;
  body: string;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Version snapshot types
// ---------------------------------------------------------------------------

/** Version snapshot source. */
export type MoodboardVersionSource = 'manual' | 'auto' | 'restore';

/** A version snapshot metadata (snapshot JSON not included in list view). */
export interface MoodboardVersion {
  id: string;
  boardId: string;
  revision: number;
  label: string | null;
  source: MoodboardVersionSource;
  isPinned: boolean;
  createdAt: string;
  createdByName: string | null;
}

// ---------------------------------------------------------------------------
// Invite API
// ---------------------------------------------------------------------------

/**
 * Create a new invite for a moodboard. Returns the plaintext token (shown
 * once to the inviter). Errors propagate to the caller.
 */
export async function createMoodboardInvite(
  moodboardId: string,
  role: MoodboardInviteRole = 'editor',
  recipientUserId?: string,
): Promise<MoodboardInviteCreated> {
  const body: Record<string, unknown> = { role };
  if (recipientUserId) body.recipientUserId = recipientUserId;
  const data = await fetchJson<MoodboardInviteCreated>(
    `/moodboards/${moodboardId}/invites`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  return data;
}

/**
 * Fetch all invites for a moodboard. Errors propagate to the caller.
 */
export async function fetchMoodboardInvites(moodboardId: string): Promise<MoodboardInvite[]> {
  const data = await fetchJson<{ items: MoodboardInvite[] }>(`/moodboards/${moodboardId}/invites`);
  return data.items;
}

/**
 * Revoke a pending invite. Errors propagate to the caller.
 */
export async function revokeMoodboardInvite(moodboardId: string, inviteId: string): Promise<boolean> {
  await fetchJson<{ ok: boolean }>(`/moodboards/${moodboardId}/invites/${inviteId}/revoke`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
  });
  return true;
}

/**
 * Accept an invite by its plaintext token. Returns the board id the user
 * has now joined. Errors propagate to the caller.
 */
export async function acceptMoodboardInvite(token: string): Promise<{ boardId: string }> {
  const data = await fetchJson<{ ok: boolean; boardId: string }>(`/moodboards/invites/accept`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  });
  return { boardId: data.boardId };
}

// ---------------------------------------------------------------------------
// Member API
// ---------------------------------------------------------------------------

/**
 * Fetch all members of a moodboard. Errors propagate to the caller.
 */
export async function fetchMoodboardMembers(moodboardId: string): Promise<MoodboardMember[]> {
  const data = await fetchJson<{ items: MoodboardMember[] }>(`/moodboards/${moodboardId}/members`);
  return data.items;
}

/**
 * Update a member's role on a moodboard. Errors propagate to the caller.
 */
export async function updateMoodboardMemberRole(
  moodboardId: string,
  userId: string,
  role: MoodboardInviteRole,
): Promise<boolean> {
  await fetchJson<{ ok: boolean }>(`/moodboards/${moodboardId}/members/${userId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
  });
  return true;
}

/**
 * Remove a member from a moodboard. Errors propagate to the caller.
 */
export async function removeMoodboardMember(moodboardId: string, userId: string): Promise<boolean> {
  await fetchJson<{ ok: boolean }>(`/moodboards/${moodboardId}/members/${userId}`, {
    method: 'DELETE',
  });
  return true;
}

// ---------------------------------------------------------------------------
// Comment API
// ---------------------------------------------------------------------------

/**
 * Fetch all comments for a moodboard. Errors propagate to the caller.
 */
export async function fetchMoodboardComments(moodboardId: string): Promise<MoodboardComment[]> {
  const data = await fetchJson<{ items: MoodboardComment[] }>(`/moodboards/${moodboardId}/comments`);
  return data.items;
}

/**
 * Create a comment on a moodboard. Pass itemId to anchor it to a canvas
 * item; omit for a board-level comment. Errors propagate to the caller.
 */
export async function createMoodboardComment(
  moodboardId: string,
  body: string,
  itemId?: string,
): Promise<MoodboardComment> {
  const payload: Record<string, unknown> = { body };
  if (itemId) payload.itemId = itemId;
  const data = await fetchJson<MoodboardComment>(`/moodboards/${moodboardId}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  return data;
}

/**
 * Resolve or unresolve a comment. Errors propagate to the caller.
 */
export async function resolveMoodboardComment(
  moodboardId: string,
  commentId: string,
  resolved: boolean,
): Promise<boolean> {
  await fetchJson<{ ok: boolean }>(`/moodboards/${moodboardId}/comments/${commentId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolved }),
  });
  return true;
}

/**
 * Delete a comment. Errors propagate to the caller.
 */
export async function deleteMoodboardComment(moodboardId: string, commentId: string): Promise<boolean> {
  await fetchJson<{ ok: boolean }>(`/moodboards/${moodboardId}/comments/${commentId}`, {
    method: 'DELETE',
  });
  return true;
}

// ---------------------------------------------------------------------------
// Version snapshot API
// ---------------------------------------------------------------------------

/**
 * Create a version snapshot of a moodboard. An optional label may be
 * supplied for manual snapshots. Errors propagate to the caller.
 */
export async function createMoodboardVersion(
  moodboardId: string,
  label?: string,
): Promise<MoodboardVersion> {
  const payload: Record<string, unknown> = {};
  if (label) payload.label = label;
  const data = await fetchJson<MoodboardVersion>(`/moodboards/${moodboardId}/versions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  return data;
}

/**
 * Fetch version snapshots for a moodboard. Errors propagate to the caller.
 */
export async function fetchMoodboardVersions(moodboardId: string): Promise<MoodboardVersion[]> {
  const data = await fetchJson<{ items: MoodboardVersion[] }>(`/moodboards/${moodboardId}/versions`);
  return data.items;
}

/**
 * Restore a moodboard to a prior version snapshot. Returns the restored
 * board. Errors propagate to the caller.
 */
export async function restoreMoodboardVersion(
  moodboardId: string,
  versionId: string,
): Promise<Moodboard> {
  const data = await fetchJson<ApiMoodboard>(`/moodboards/${moodboardId}/versions/${versionId}/restore`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
  });
  return mapApiMoodboard(data);
}

/**
 * Pin or unpin a version snapshot. Errors propagate to the caller.
 */
export async function pinMoodboardVersion(
  moodboardId: string,
  versionId: string,
  isPinned: boolean,
): Promise<boolean> {
  await fetchJson<{ ok: boolean }>(`/moodboards/${moodboardId}/versions/${versionId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPinned }),
  });
  return true;
}

// ---------------------------------------------------------------------------
// Publication API — publish a moodboard as a poster
// ---------------------------------------------------------------------------

/**
 * Publish a moodboard as a poster story. Creates a poster story with
 * contentType='moodboard' that references this board. The poster viewer
 * renders the moodboard canvas interactively. Returns the story ID.
 */
export async function publishMoodboardAsPoster(
  moodboardId: string,
  options?: { caption?: string; expiryHours?: number },
): Promise<{ storyId: string }> {
  const body: Record<string, unknown> = {
    moodboardId,
  };
  if (options?.caption) body.caption = options.caption;
  if (options?.expiryHours) body.expiresInHours = options.expiryHours;
  const data = await fetchJson<{ ok: boolean; storyId: string }>(`/poster-stories/moodboard`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { storyId: data.storyId };
}
