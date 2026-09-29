/**
 * Web social-content service — looks, posters, moodboards, galleria.
 * Mirrors frontend/src/services/{looksApi,postersApi,moodboardApi,galleriaApi}.ts.
 */

import { fetchJson, ApiRequestError } from '../http';
import type { Look, Moodboard, Poster } from '@/lib/contracts/domain';
import type { PosterArchiveStory } from '@/lib/data/fixtures-posters';

// ── Looks ─────────────────────────────────────────────────────────────────────

interface LookListResponse {
  ok?: boolean;
  items?: Look[];
  looks?: Look[];
}

/** Look rows carry a creator summary + comment/tag counts the base Look
 *  contract doesn't model — the backend enriches both list and detail. */
export type LookWithCounts = Look & {
  commentCount?: number;
  creator?: { id: string; username: string | null; avatar: string | null; verified: boolean } | null;
  mediaUrls?: string[];
};

function mapLookRow(row: Record<string, unknown>): LookWithCounts {
  const creator = row.creator as Record<string, unknown> | null | undefined;
  const tags = Array.isArray(row.tags) ? (row.tags as Array<Record<string, unknown>>) : [];
  const itemIds = Array.isArray(row.itemIds)
    ? row.itemIds.map(String)
    : tags
        .map((t) => t.listingId ?? t.listing_id)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return {
    id: String(row.id),
    creatorId: String(row.creatorId ?? row.creator_id ?? creator?.id ?? ''),
    creator: creator
      ? {
          id: String(creator.id ?? ''),
          username: typeof creator.username === 'string' ? creator.username : null,
          avatar: typeof creator.avatar === 'string' ? creator.avatar : null,
          verified: creator.verified === true,
        }
      : null,
    coverImageUri: String(
      row.coverImageUri ?? row.coverImageUrl ?? row.coverUri ?? row.mediaUrl ?? row.posterUrl ?? '',
    ),
    coverAspectRatio:
      typeof row.coverAspectRatio === 'number' ? row.coverAspectRatio : null,
    title: typeof row.title === 'string' ? row.title : null,
    itemIds,
    likeCount: typeof row.likeCount === 'number' ? row.likeCount : null,
    commentCount:
      typeof row.commentCount === 'number'
        ? row.commentCount
        : typeof row.comment_count === 'number'
          ? row.comment_count
          : undefined,
    mediaUrls: Array.isArray(row.mediaUrls) ? row.mediaUrls.map(String) : undefined,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
  };
}

export async function fetchLooks(
  options?: { creatorId?: string; sort?: 'foryou' | 'following'; limit?: number },
  signal?: AbortSignal,
): Promise<LookWithCounts[]> {
  const usp = new URLSearchParams();
  if (options?.creatorId) usp.set('creatorId', options.creatorId);
  if (options?.sort) usp.set('sort', options.sort);
  if (options?.limit) usp.set('limit', String(options.limit));
  const qs = usp.toString() ? `?${usp.toString()}` : '';
  const payload = await fetchJson<LookListResponse & { items?: Array<Record<string, unknown>> }>(
    `/looks${qs}`,
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

/** POST/DELETE /looks/:id/save — the look-scoped save edge. Saving a look
 *  must never post to /users/me/saved (that list is listings). */
export async function setLookSaved(lookId: string, saved: boolean): Promise<void> {
  await fetchJson(`/looks/${encodeURIComponent(lookId)}/save`, {
    method: saved ? 'POST' : 'DELETE',
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
          // Still-image contexts (archive tile, viewer stage) need the JPEG
          // preview — a video frame's mediaUrl is an m3u8 playlist.
          mediaUrl: String(f.previewUrl ?? f.preview_url ?? f.mediaUrl ?? f.media_url ?? ''),
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
  const items = Array.isArray(row.items) ? (row.items as Array<Record<string, unknown>>) : [];
  return {
    id: String(row.id),
    ownerId: String(row.ownerId ?? row.owner_id ?? row.creatorId ?? row.creator_id ?? ''),
    title: String(row.title ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    coverUri: String(row.coverUri ?? row.coverImage ?? row.coverImageUrl ?? ''),
    curator: typeof row.curator === 'string' ? row.curator : null,
    curatorAvatar: typeof row.curatorAvatar === 'string' ? row.curatorAvatar : null,
    isPublic: typeof row.isPublic === 'boolean' ? row.isPublic : undefined,
    /** Real item thumbnails — rails collage these rather than a single cover. */
    thumbs: items
      .map((i) => String(i.imageUri ?? i.image_uri ?? ''))
      .filter(Boolean)
      .slice(0, 4),
    aspectRatio: typeof row.aspectRatio === 'number' ? row.aspectRatio : null,
    itemCount:
      typeof row.itemCount === 'number' ? row.itemCount : items.length || null,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
  };
}

/** GET /moodboards — public discovery boards (visibility='public'). */
export async function fetchMoodboards(signal?: AbortSignal): Promise<Moodboard[]> {
  const payload = await fetchJson<{ items?: Array<Record<string, unknown>>; moodboards?: Array<Record<string, unknown>> }>(
    '/moodboards',
    undefined,
    { signal },
  );
  return (payload.items ?? payload.moodboards ?? []).map(mapMoodboardRow);
}

/** GET /me/moodboards — the caller's own boards (owned + collaborated). */
export async function fetchMyMoodboards(signal?: AbortSignal): Promise<Moodboard[]> {
  const payload = await fetchJson<{ items?: Array<Record<string, unknown>>; moodboards?: Array<Record<string, unknown>> }>(
    '/me/moodboards',
    undefined,
    { signal },
  );
  return (payload.items ?? payload.moodboards ?? []).map(mapMoodboardRow);
}

// ── Moodboard detail (GET /moodboards/:id) ────────────────────────────────────

export interface MoodboardItemApi {
  id: string;
  listingId: string;
  sourceType: string;
  sourceLookId?: string | null;
  mediaType: string;
  imageUri: string;
  videoUri: string;
  mediaAssetId?: string | null;
  title: string | null;
  caption: string;
  price: number;
  aspectRatio: number;
  /** Saved canvas placement (x/y normalised 0–1, item centre). Optional
   *  only for defensive mapping — the backend always emits it; items
   *  without a saved position scatter deterministically client-side. */
  position?: { x: number; y: number; scale: number; rotation: number };
  revision?: number;
  addedAt: string;
}

export interface MoodboardDetailApi {
  id: string;
  title: string;
  description: string | null;
  curator: string;
  curatorAvatar: string;
  creatorId: string;
  viewerRole: string | null;
  items: MoodboardItemApi[];
  coverImage: string | null;
  isPublic: boolean;
  theme: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchMoodboard(
  id: string,
  signal?: AbortSignal,
): Promise<MoodboardDetailApi | null> {
  try {
    return await fetchJson<MoodboardDetailApi>(
      `/moodboards/${encodeURIComponent(id)}`,
      undefined,
      { signal },
    );
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}

// ── Moodboard writes (owner/editor) ──────────────────────────────────────────
// The detail surface's edits — rename, membership, canvas placement — have
// real endpoints; the overlay store is the optimistic mirror that reverts
// on failure (lib/hooks/moodboard-queries.ts), never the persistence layer
// in live mode.

/** PATCH /moodboards/:moodboardId — rename (and other meta fields). */
export async function updateMoodboardMeta(
  moodboardId: string,
  patch: {
    title?: string;
    description?: string;
    theme?: string;
    visibility?: 'public' | 'private';
  },
): Promise<void> {
  await fetchJson(`/moodboards/${encodeURIComponent(moodboardId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

/** POST /moodboards/:moodboardId/items — file a listing onto the board. */
export async function addMoodboardItem(
  moodboardId: string,
  listingId: string,
): Promise<void> {
  await fetchJson(`/moodboards/${encodeURIComponent(moodboardId)}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingId }),
  });
}

/** DELETE /moodboards/:moodboardId/items/:itemId — itemId is the board-item
 *  row id from GET /moodboards/:id (not the listing id). */
export async function removeMoodboardItem(
  moodboardId: string,
  itemId: string,
): Promise<void> {
  await fetchJson(
    `/moodboards/${encodeURIComponent(moodboardId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  );
}

/** PATCH /moodboards/:moodboardId/items/:itemId — canvas placement
 *  (positionX/positionY in 0..1, rotation, scale). */
export async function setMoodboardItemPosition(
  moodboardId: string,
  itemId: string,
  position: { positionX: number; positionY: number; rotation?: number; scale?: number },
): Promise<void> {
  await fetchJson(
    `/moodboards/${encodeURIComponent(moodboardId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(position),
    },
  );
}

/** PATCH /moodboards/:moodboardId/items/:itemId/reorder — canvas layer
 *  move. `itemId` is the board-item row id from GET /moodboards/:id. */
export async function reorderMoodboardItem(
  moodboardId: string,
  itemId: string,
  direction: 'front' | 'back',
): Promise<void> {
  await fetchJson(
    `/moodboards/${encodeURIComponent(moodboardId)}/items/${encodeURIComponent(itemId)}/reorder`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    },
  );
}

// ── Poster stories (poster detail) ───────────────────────────────────────────

/** Wire shape of GET /poster-stories/:storyId (enriched server projection). */
export interface PosterStoryApi {
  id: string;
  creatorId: string;
  creator: { id: string; username: string | null; avatar: string | null };
  audience: string;
  allowReplies: boolean;
  allowReactions: boolean;
  status: string;
  expiresAt: string;
  createdAt: string;
  contentType: string;
  moodboardId: string | null;
  frames: Array<{
    id: string;
    mediaUrl: string;
    posterUrl?: string | null;
    caption?: string | null;
    mediaType: string;
    sortOrder: number;
    viewCount: number;
    seenByViewer: boolean;
  }>;
  seenByViewer: boolean;
  viewedFrameCount: number;
  totalFrameCount: number;
  /** Creator-only — undefined for other viewers. */
  uniqueViewerCount?: number;
}

/** GET /poster-stories — the active story feed (unseen-first, then newest,
 *  server-ordered). Same enriched item shape as the detail read. */
export async function fetchPosterStories(
  signal?: AbortSignal,
): Promise<PosterStoryApi[]> {
  const payload = await fetchJson<{ items?: PosterStoryApi[] } | PosterStoryApi[]>(
    '/poster-stories',
    undefined,
    { signal },
  );
  return Array.isArray(payload) ? payload : (payload.items ?? []);
}

export async function fetchPosterStory(
  storyId: string,
  signal?: AbortSignal,
): Promise<PosterStoryApi | null> {
  try {
    return await fetchJson<PosterStoryApi>(
      `/poster-stories/${encodeURIComponent(storyId)}`,
      undefined,
      { signal },
    );
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}

// ── Poster story writes + owner surfaces ─────────────────────────────────
// Mirrors the remaining postersApi.ts block — views, replies, archive,
// activity. All caller-gated on DATA_MODE === 'live' and a session; the
// routes resolve the actor from auth and 401 for guests.

/** POST /poster-frames/:frameId/view — record a frame view (drives
 *  seen-state and the creator's viewer list). Fire-and-forget from the
 *  viewer; the backend dedupes on (frame_id, viewer_id) and ignores
 *  creator self-views. */
export async function recordPosterFrameView(frameId: string): Promise<void> {
  await fetchJson(`/poster-frames/${encodeURIComponent(frameId)}/view`, {
    method: 'POST',
  });
}

/** POST /poster-frames/:frameId/replies — private reply on a frame; lands
 *  on the creator's story activity surface. `id` is client-generated so a
 *  retried submit can't double-post. */
export async function createPosterReply(
  frameId: string,
  input: { id: string; body: string },
): Promise<{ replyId: string }> {
  const res = await fetchJson<{ ok?: boolean; replyId?: string }>(
    `/poster-frames/${encodeURIComponent(frameId)}/replies`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return { replyId: String(res.replyId ?? input.id) };
}

/** POST /poster-stories/:storyId/archive — owner moves a live story into
 *  the archive (or admin). */
export async function archivePosterStory(storyId: string): Promise<void> {
  await fetchJson(`/poster-stories/${encodeURIComponent(storyId)}/archive`, {
    method: 'POST',
  });
}

/** DELETE /poster-stories/:storyId — owner (or admin) permanent delete. */
export async function deletePosterStory(storyId: string): Promise<void> {
  await fetchJson(`/poster-stories/${encodeURIComponent(storyId)}`, {
    method: 'DELETE',
  });
}

/** GET /poster-stories/archive — the caller's own story history, newest
 *  first. `includeActive` mirrors the archive surface's "all" scope:
 *  active stories alongside expired/archived ones (the default archive
 *  read is expired/archived only). */
export async function fetchPosterStoryArchive(
  options?: { includeActive?: boolean },
  signal?: AbortSignal,
): Promise<PosterStoryApi[]> {
  const usp = new URLSearchParams();
  if (options?.includeActive !== undefined) {
    usp.set('includeActive', String(options.includeActive));
  }
  const qs = usp.toString();
  const payload = await fetchJson<{ items?: PosterStoryApi[] }>(
    `/poster-stories/archive${qs ? `?${qs}` : ''}`,
    undefined,
    { signal },
  );
  return payload.items ?? [];
}

// ── Poster story activity (owner insights) ──────────────────────────────
// GET /poster-stories/:storyId/activity — creator-only; the wire rows map
// 1:1 onto the fixture PosterStoryActivity contract.

export interface PosterStoryActivityApi {
  storyId: string;
  viewers: Array<{
    userId: string;
    username: string | null;
    avatar: string | null;
    viewedFrameCount: number;
    latestViewedAt: string;
  }>;
  reactions: Array<{
    userId: string;
    username: string | null;
    avatar: string | null;
    frameId: string;
    reaction: string;
    createdAt: string;
  }>;
  replies: Array<{
    id: string;
    authorId: string;
    authorUsername: string | null;
    authorAvatar: string | null;
    frameId: string;
    body: string;
    createdAt: string;
  }>;
  styleVotes: Array<{
    stickerId: string;
    userId: string;
    username: string | null;
    optionId: string;
    createdAt: string;
  }>;
}

export async function fetchPosterStoryActivity(
  storyId: string,
  signal?: AbortSignal,
): Promise<PosterStoryActivityApi> {
  return fetchJson<PosterStoryActivityApi>(
    `/poster-stories/${encodeURIComponent(storyId)}/activity`,
    undefined,
    { signal },
  );
}

/** Style-vote sticker definition recovered from an enriched story's
 *  frames — the activity endpoint returns raw vote rows (stickerId +
 *  optionId), so the votes breakdown resolves labels from the stickers
 *  embedded on the story itself. */
export interface PosterStyleStickerApi {
  id: string;
  label: string;
  options: { id: string; label: string }[];
}

export function posterStoryStyleStickers(
  story: PosterStoryApi,
): PosterStyleStickerApi[] {
  const out: PosterStyleStickerApi[] = [];
  for (const frame of story.frames) {
    const stickers =
      (frame as { stickers?: Array<Record<string, unknown>> }).stickers ?? [];
    for (const s of stickers) {
      if (s.type !== 'style_vote') continue;
      const payload = (s.payload ?? {}) as Record<string, unknown>;
      const options = Array.isArray(payload.options)
        ? (payload.options as Array<Record<string, unknown>>)
            .map((o) => ({
              id: String(o.id ?? ''),
              label: String(o.label ?? ''),
            }))
            .filter((o) => o.id.length > 0)
        : [];
      out.push({
        id: String(s.id ?? ''),
        label:
          typeof payload.question === 'string' && payload.question
            ? payload.question
            : 'Style vote',
        options,
      });
    }
  }
  return out;
}

/** Archive-shaped projection of a wire story — the shared shape the
 *  archive grid, the viewer's owner tier and the activity surface consume.
 *  An expired story still carrying status 'active' reads as archived,
 *  matching the archive endpoint's own membership rule. */
export function mapPosterStoryToArchive(
  story: PosterStoryApi,
): PosterArchiveStory {
  const live =
    story.status === 'active' &&
    new Date(story.expiresAt).getTime() > Date.now();
  return {
    id: story.id,
    creatorId: story.creatorId,
    status: live ? 'active' : 'archived',
    frames: story.frames.map((f) => ({
      id: f.id,
      mediaUrl: f.posterUrl || f.mediaUrl,
      caption: f.caption ?? undefined,
    })),
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    viewCount: story.uniqueViewerCount ?? 0,
  };
}

/** POST /poster-highlights — create a highlight from owned story frames.
 *  `id` is client-generated (backend schema requires it). */
export async function createPosterHighlight(input: {
  id: string;
  title: string;
  coverFrameId?: string;
  frameIds: string[];
}): Promise<{ highlightId: string }> {
  const res = await fetchJson<{ ok?: boolean; highlightId?: string }>(
    '/poster-highlights',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return { highlightId: String(res.highlightId ?? input.id) };
}

/** POST /moodboards — visibility is a contract field (public | private). */
export async function createMoodboard(input: {
  title: string;
  visibility: 'public' | 'private';
  /** Canvas theme id — backend schema accepts it at create; defaults
   *  server-side to 'theme-linen' when omitted. */
  theme?: string;
}): Promise<{ id: string }> {
  const res = await fetchJson<{ ok?: boolean; moodboard?: { id?: string }; id?: string }>(
    '/moodboards',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        visibility: input.visibility,
        ...(input.theme ? { theme: input.theme } : {}),
      }),
    },
  );
  return { id: String(res.moodboard?.id ?? res.id ?? '') };
}

/** PATCH /moodboards/:id — title, visibility and theme are writable post-create. */
export async function updateMoodboard(
  moodboardId: string,
  patch: { title?: string; visibility?: 'public' | 'private'; theme?: string },
): Promise<void> {
  await fetchJson(`/moodboards/${encodeURIComponent(moodboardId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

// ── Moodboard comments (backend /moodboards/:id/comments CRUD) ───────────
// Comments anchor to a canvas item (itemId) or the board itself. Resolve
// and delete require owner/editor capability server-side; the sheet's
// affordances gate the same way client-side.

export interface BoardComment {
  id: string;
  boardId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  itemId: string | null;
  body: string;
  resolved: boolean;
  createdAt: string;
}

interface BoardCommentRow {
  id: string | number;
  boardId?: string;
  authorId?: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  itemId?: string | null;
  body?: string;
  resolved?: boolean;
  createdAt?: string;
}

function mapBoardComment(row: BoardCommentRow, boardId: string): BoardComment {
  return {
    id: String(row.id),
    boardId: row.boardId ?? boardId,
    authorId: String(row.authorId ?? ''),
    authorName: row.authorName ?? '',
    authorAvatar: row.authorAvatar ?? '',
    itemId: row.itemId ?? null,
    body: row.body ?? '',
    resolved: row.resolved === true,
    createdAt: String(row.createdAt ?? ''),
  };
}

export async function fetchBoardComments(
  moodboardId: string,
  signal?: AbortSignal,
): Promise<BoardComment[]> {
  const res = await fetchJson<{ items?: BoardCommentRow[] }>(
    `/moodboards/${encodeURIComponent(moodboardId)}/comments`,
    undefined,
    { signal },
  );
  return (res.items ?? []).map((row) => mapBoardComment(row, moodboardId));
}

export async function createBoardComment(
  moodboardId: string,
  input: { body: string; itemId?: string | null },
): Promise<BoardComment | null> {
  const res = await fetchJson<BoardCommentRow | { ok?: boolean; comment?: BoardCommentRow }>(
    `/moodboards/${encodeURIComponent(moodboardId)}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: input.body, ...(input.itemId ? { itemId: input.itemId } : {}) }),
    },
  );
  const row = 'comment' in res && res.comment ? res.comment : (res as BoardCommentRow);
  return row?.id ? mapBoardComment(row, moodboardId) : null;
}

export async function setBoardCommentResolved(
  moodboardId: string,
  commentId: string,
  resolved: boolean,
): Promise<void> {
  await fetchJson(
    `/moodboards/${encodeURIComponent(moodboardId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    },
  );
}

export async function deleteBoardComment(
  moodboardId: string,
  commentId: string,
): Promise<void> {
  await fetchJson(
    `/moodboards/${encodeURIComponent(moodboardId)}/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
  );
}

// ── Moodboard collaborators (members + invites) ─────────────────────────
// Roles mirror the mobile contract: owner / editor / commenter / viewer.
// Role changes and removals are owner capabilities server-side; invites
// return their link token exactly once (only a hash is stored).

export type BoardRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface BoardMember {
  userId: string;
  displayName: string | null;
  avatar: string | null;
  role: BoardRole;
  state: string;
  joinedAt: string;
}

export interface BoardInvite {
  id: string;
  role: BoardRole;
  state: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  revokedAt: string | null;
  recipientUserId: string | null;
}

export async function fetchBoardMembers(
  moodboardId: string,
  signal?: AbortSignal,
): Promise<BoardMember[]> {
  const res = await fetchJson<{
    items?: Array<{
      userId: string;
      displayName: string | null;
      avatar: string | null;
      role: string;
      state: string;
      joinedAt: string;
    }>;
  }>(`/moodboards/${encodeURIComponent(moodboardId)}/members`, undefined, { signal });
  return (res.items ?? []).map((m) => ({
    userId: m.userId,
    displayName: m.displayName ?? null,
    avatar: m.avatar ?? null,
    role: (m.role as BoardRole) ?? 'viewer',
    state: m.state,
    joinedAt: m.joinedAt,
  }));
}

export async function setBoardMemberRole(
  moodboardId: string,
  userId: string,
  role: Exclude<BoardRole, 'owner'>,
): Promise<void> {
  await fetchJson(
    `/moodboards/${encodeURIComponent(moodboardId)}/members/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    },
  );
}

export async function removeBoardMember(
  moodboardId: string,
  userId: string,
): Promise<void> {
  await fetchJson(
    `/moodboards/${encodeURIComponent(moodboardId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}

export async function fetchBoardInvites(
  moodboardId: string,
  signal?: AbortSignal,
): Promise<BoardInvite[]> {
  const res = await fetchJson<{ items?: BoardInvite[] }>(
    `/moodboards/${encodeURIComponent(moodboardId)}/invites`,
    undefined,
    { signal },
  );
  return res.items ?? [];
}

/** POST /moodboards/:id/invites — the plaintext token comes back once;
 *  the backend stores only its hash, so the link is unrecoverable later. */
export async function createBoardInvite(
  moodboardId: string,
  role: Exclude<BoardRole, 'owner'>,
): Promise<{ id: string; token: string } | null> {
  const res = await fetchJson<{ id?: string; token?: string }>(
    `/moodboards/${encodeURIComponent(moodboardId)}/invites`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    },
  );
  return res.id && res.token ? { id: res.id, token: res.token } : null;
}

export async function revokeBoardInvite(
  moodboardId: string,
  inviteId: string,
): Promise<void> {
  await fetchJson(
    `/moodboards/${encodeURIComponent(moodboardId)}/invites/${encodeURIComponent(inviteId)}/revoke`,
    { method: 'POST' },
  );
}

/** POST /moodboards/invites/accept — the invite link's landing call. The
 *  plaintext token resolves to the board server-side; the caller joins as
 *  the invite's role. Errors propagate with status: 410 expired, 404
 *  invalid/already-used, 401 guests. */
export async function acceptMoodboardInvite(token: string): Promise<{ boardId: string }> {
  const res = await fetchJson<{ ok: boolean; boardId: string }>(
    '/moodboards/invites/accept',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    },
  );
  return { boardId: res.boardId };
}

// ── Moodboard versions (revision history) ────────────────────────────────
// The list wire carries metadata only (revision, label, source, pinned,
// author) — snapshot content stays server-side, so restore goes through
// the dedicated endpoint and the board refetches with restored items.

export interface BoardVersion {
  id: string;
  boardId: string;
  revision: number;
  label: string | null;
  source: string;
  isPinned: boolean;
  createdAt: string;
  createdByName: string | null;
}

export async function fetchBoardVersions(
  moodboardId: string,
  signal?: AbortSignal,
): Promise<BoardVersion[]> {
  const res = await fetchJson<{ items?: BoardVersion[] }>(
    `/moodboards/${encodeURIComponent(moodboardId)}/versions`,
    undefined,
    { signal },
  );
  return res.items ?? [];
}

/** POST /moodboards/:id/versions — the server snapshots the board's
 *  current state; the client sends only the optional label. */
export async function createBoardVersion(
  moodboardId: string,
  label?: string,
): Promise<void> {
  await fetchJson(`/moodboards/${encodeURIComponent(moodboardId)}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(label ? { label } : {}),
  });
}

export async function setBoardVersionPinned(
  moodboardId: string,
  versionId: string,
  isPinned: boolean,
): Promise<void> {
  await fetchJson(
    `/moodboards/${encodeURIComponent(moodboardId)}/versions/${encodeURIComponent(versionId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPinned }),
    },
  );
}

/** POST /moodboards/:id/versions/:versionId/restore — owner-only; history
 *  is never overwritten (the restore itself becomes a new revision). */
export async function restoreBoardVersion(
  moodboardId: string,
  versionId: string,
): Promise<void> {
  await fetchJson(
    `/moodboards/${encodeURIComponent(moodboardId)}/versions/${encodeURIComponent(versionId)}/restore`,
    { method: 'POST' },
  );
}

// ── Storefront featured items (storefrontApi.ts) ──────────────────────
// The pinned "shop window" rail on a seller's profile. The contract lives
// in services/storefront.ts — these delegate so existing rail callers keep
// their import surface.

import {
  fetchPublicStorefront,
  setFeaturedListings as setStorefrontFeaturedListings,
  type StorefrontFeaturedListing,
} from './storefront';

export type { StorefrontFeaturedListing };

/** GET /storefronts/:sellerId — published storefront; featured list may be empty. */
export async function fetchStorefrontFeatured(
  sellerId: string,
  signal?: AbortSignal,
): Promise<StorefrontFeaturedListing[]> {
  const res = await fetchPublicStorefront(sellerId, signal);
  return res.featuredListings;
}

/** PUT /storefronts/me/featured-listings — owner pin order, max 8 (backend caps). */
export async function setFeaturedListings(listingIds: string[]): Promise<void> {
  await setStorefrontFeaturedListings(listingIds);
}
