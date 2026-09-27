/**
 * Web social-content service — looks, posters, moodboards, galleria.
 * Mirrors frontend/src/services/{looksApi,postersApi,moodboardApi,galleriaApi}.ts.
 */

import { fetchJson } from '../http';
import type { Look, Moodboard, Poster } from '@/lib/contracts/domain';

// ── Looks ─────────────────────────────────────────────────────────────────────

interface LookListResponse {
  ok?: boolean;
  items?: Look[];
  looks?: Look[];
}

/** Look rows carry a comment count the base Look contract doesn't model. */
export type LookWithCounts = Look & { commentCount?: number };

function mapLookRow(row: Record<string, unknown>): LookWithCounts {
  return {
    id: String(row.id),
    creatorId: String(row.creatorId ?? row.creator_id ?? ''),
    coverImageUri: String(row.coverImageUri ?? row.coverImageUrl ?? row.coverUri ?? ''),
    coverAspectRatio:
      typeof row.coverAspectRatio === 'number' ? row.coverAspectRatio : null,
    title: typeof row.title === 'string' ? row.title : null,
    itemIds: Array.isArray(row.itemIds) ? row.itemIds.map(String) : [],
    likeCount: typeof row.likeCount === 'number' ? row.likeCount : null,
    commentCount:
      typeof row.commentCount === 'number'
        ? row.commentCount
        : typeof row.comment_count === 'number'
          ? row.comment_count
          : undefined,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
  };
}

export async function fetchLooks(signal?: AbortSignal): Promise<LookWithCounts[]> {
  const payload = await fetchJson<LookListResponse & { items?: Array<Record<string, unknown>> }>(
    '/looks',
    undefined,
    { signal },
  );
  const rows = (payload.items ?? payload.looks ?? []) as unknown as Array<Record<string, unknown>>;
  return rows.map(mapLookRow);
}

export async function fetchLook(id: string, signal?: AbortSignal): Promise<LookWithCounts | null> {
  const payload = await fetchJson<{ ok: boolean; look?: Record<string, unknown> }>(
    `/looks/${encodeURIComponent(id)}`,
    undefined,
    { signal },
  );
  return payload.ok && payload.look ? mapLookRow(payload.look) : null;
}

export async function setLookLiked(lookId: string, liked: boolean): Promise<void> {
  await fetchJson(`/looks/${encodeURIComponent(lookId)}/like`, {
    method: liked ? 'POST' : 'DELETE',
  });
}

// ── Look comments (looksApi.ts comment block) ─────────────────────────

export interface LookComment {
  id: string;
  lookId: string;
  authorId: string;
  parentId: string | null;
  author: {
    id: string;
    username: string | null;
    avatar: string | null;
    verified: boolean;
  };
  /** Empty for tombstones — deleted comments keep their thread, not their body. */
  body: string;
  deleted: boolean;
  likeCount: number;
  likedByViewer: boolean;
  replyCount: number;
  createdAt: string;
}

interface LookCommentRow {
  id: string;
  look_id?: string;
  lookId?: string;
  author_id?: string;
  authorId?: string;
  parent_id?: string | null;
  parentId?: string | null;
  author?: { id?: string; username?: string | null; avatar?: string | null; verified?: boolean };
  body?: string;
  deleted?: boolean;
  deleted_at?: string | null;
  like_count?: string | number;
  likeCount?: number;
  liked_by_viewer?: boolean;
  likedByViewer?: boolean;
  reply_count?: string | number;
  replyCount?: number;
  created_at?: string;
  createdAt?: string;
}

function mapLookComment(row: LookCommentRow): LookComment {
  const authorId = String(row.authorId ?? row.author_id ?? row.author?.id ?? '');
  return {
    id: String(row.id),
    lookId: String(row.lookId ?? row.look_id ?? ''),
    authorId,
    parentId: (row.parentId ?? row.parent_id ?? null) as string | null,
    author: {
      id: authorId,
      username: row.author?.username ?? null,
      avatar: row.author?.avatar ?? null,
      verified: row.author?.verified === true,
    },
    body: typeof row.body === 'string' ? row.body : '',
    deleted: row.deleted === true || row.deleted_at != null,
    likeCount: Number(row.likeCount ?? row.like_count ?? 0),
    likedByViewer: row.likedByViewer ?? row.liked_by_viewer ?? false,
    replyCount: Number(row.replyCount ?? row.reply_count ?? 0),
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
  };
}

export async function fetchLookComments(
  lookId: string,
  signal?: AbortSignal,
): Promise<LookComment[]> {
  const res = await fetchJson<{ items?: LookCommentRow[] }>(
    `/looks/${encodeURIComponent(lookId)}/comments`,
    undefined,
    { signal },
  );
  return (res.items ?? []).map(mapLookComment);
}

export async function createLookComment(
  lookId: string,
  body: string,
  parentId?: string,
): Promise<LookComment> {
  const res = await fetchJson<{ ok: boolean; comment: LookCommentRow }>(
    `/looks/${encodeURIComponent(lookId)}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? `lc_${crypto.randomUUID()}`
            : `lc_${Date.now().toString(36)}`,
        body,
        parentId,
      }),
    },
  );
  return mapLookComment(res.comment);
}

export async function deleteLookComment(lookId: string, commentId: string): Promise<void> {
  await fetchJson(
    `/looks/${encodeURIComponent(lookId)}/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
  );
}

export async function setLookCommentLiked(
  lookId: string,
  commentId: string,
  liked: boolean,
): Promise<{ likeCount: number; likedByViewer: boolean }> {
  return fetchJson<{ likeCount: number; likedByViewer: boolean }>(
    `/looks/${encodeURIComponent(lookId)}/comments/${encodeURIComponent(commentId)}/like`,
    { method: liked ? 'POST' : 'DELETE' },
  );
}

// ── Posters ───────────────────────────────────────────────────────────────────

function mapPosterRow(row: Record<string, unknown>): Poster {
  return {
    id: String(row.id),
    authorId: String(row.authorId ?? row.author_id ?? ''),
    coverUri: String(row.coverUri ?? row.coverImageUrl ?? ''),
    aspectRatio: typeof row.aspectRatio === 'number' ? row.aspectRatio : null,
    caption: typeof row.caption === 'string' ? row.caption : null,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
  };
}

export async function fetchPosters(signal?: AbortSignal): Promise<Poster[]> {
  const payload = await fetchJson<{ items?: Array<Record<string, unknown>>; posters?: Array<Record<string, unknown>> }>(
    '/posters',
    undefined,
    { signal },
  );
  return (payload.items ?? payload.posters ?? []).map(mapPosterRow);
}

// ── Poster highlights (postersApi.ts highlight block) ─────────────────
// Public per-member story collections — the profile rail reads these.

export interface ApiPosterHighlight {
  id: string;
  title: string;
  /** Resolved cover image (coverFrameId's poster preview, else first frame). */
  coverUri: string;
  frames: { frameId: string; mediaUrl: string; caption?: string }[];
}

export async function fetchPosterHighlights(
  userId: string,
  signal?: AbortSignal,
): Promise<ApiPosterHighlight[]> {
  const res = await fetchJson<{ items?: Array<Record<string, unknown>> }>(
    `/users/${encodeURIComponent(userId)}/poster-highlights`,
    undefined,
    { signal },
  );
  return (res.items ?? []).map((row) => {
    const frames = Array.isArray(row.frames)
      ? (row.frames as Array<Record<string, unknown>>).map((f) => ({
          frameId: String(f.frameId ?? f.frame_id ?? f.id ?? ''),
          mediaUrl: String(f.mediaUrl ?? f.media_url ?? f.previewUrl ?? ''),
          caption: typeof f.caption === 'string' && f.caption ? f.caption : undefined,
        }))
      : [];
    const cover =
      (typeof row.coverUrl === 'string' && row.coverUrl) ||
      (typeof row.coverUri === 'string' && row.coverUri) ||
      frames[0]?.mediaUrl ||
      '';
    return { id: String(row.id), title: String(row.title ?? ''), coverUri: cover, frames };
  });
}

// ── Moodboards ────────────────────────────────────────────────────────────────

function mapMoodboardRow(row: Record<string, unknown>): Moodboard {
  return {
    id: String(row.id),
    ownerId: String(row.ownerId ?? row.owner_id ?? ''),
    title: String(row.title ?? ''),
    coverUri: String(row.coverUri ?? row.coverImageUrl ?? ''),
    aspectRatio: typeof row.aspectRatio === 'number' ? row.aspectRatio : null,
    itemCount: typeof row.itemCount === 'number' ? row.itemCount : null,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
  };
}

export async function fetchMoodboards(signal?: AbortSignal): Promise<Moodboard[]> {
  const payload = await fetchJson<{ items?: Array<Record<string, unknown>>; moodboards?: Array<Record<string, unknown>> }>(
    '/moodboards',
    undefined,
    { signal },
  );
  return (payload.items ?? payload.moodboards ?? []).map(mapMoodboardRow);
}

/** POST /moodboards — visibility is a contract field (public | private). */
export async function createMoodboard(input: {
  title: string;
  visibility: 'public' | 'private';
}): Promise<{ id: string }> {
  const res = await fetchJson<{ ok?: boolean; moodboard?: { id?: string }; id?: string }>(
    '/moodboards',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: input.title, visibility: input.visibility }),
    },
  );
  return { id: String(res.moodboard?.id ?? res.id ?? '') };
}

/** PATCH /moodboards/:id — title and visibility are both writable post-create. */
export async function updateMoodboard(
  moodboardId: string,
  patch: { title?: string; visibility?: 'public' | 'private' },
): Promise<void> {
  await fetchJson(`/moodboards/${encodeURIComponent(moodboardId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

// ── Storefront featured items (storefrontApi.ts) ──────────────────────
// The pinned "shop window" rail on a seller's profile.

export interface StorefrontFeaturedListing {
  id: string;
  title: string;
  priceGbpMinor: number;
  imageUrl: string | null;
  status: string;
}

/** GET /storefronts/:sellerId — published storefront; featured list may be empty. */
export async function fetchStorefrontFeatured(
  sellerId: string,
  signal?: AbortSignal,
): Promise<StorefrontFeaturedListing[]> {
  const res = await fetchJson<{
    ok?: boolean;
    featuredListings?: Array<Record<string, unknown>>;
  }>(`/storefronts/${encodeURIComponent(sellerId)}`, undefined, { signal });
  return (res.featuredListings ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ''),
    priceGbpMinor:
      typeof row.priceGbpMinor === 'number'
        ? row.priceGbpMinor
        : Number(row.priceGbpMinor ?? row.price ?? 0),
    imageUrl: (row.imageUrl ?? row.image_url ?? null) as string | null,
    status: String(row.status ?? 'active'),
  }));
}

/** PUT /storefronts/me/featured-listings — owner pin order, max 8 (backend caps). */
export async function setFeaturedListings(listingIds: string[]): Promise<void> {
  await fetchJson('/storefronts/me/featured-listings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingIds }),
  });
}
