/**
 * Web creator-authoring service — looks + posters.
 * Mirrors the create paths in frontend/src/services/{looksApi,postersApi}.ts.
 *
 * Drafts are real entities carrying status:'draft' — the backend owns the
 * whole lifecycle, no local fabrication:
 *  - look:   POST /looks {status:'draft'}  → PATCH /looks/:id (save/publish)
 *            → DELETE /looks/:id (discard). POST is idempotent-by-payload —
 *            resume edits go through PATCH, which re-verifies media only
 *            when media fields are sent.
 *  - poster: POST /posters {status:'draft'} (upsert by id) holds the draft
 *            row; publish mints the real story via POST /poster-stories
 *            (POST /posters rows never resolve at /poster/[id], which reads
 *            GET /poster-stories/:id) then DELETEs the draft row.
 *
 * Image/video frames always carry mediaFinalizationId — the backend checks
 * the durable upload receipt before persisting media.
 */

import { fetchJson } from '../http';
import { isVideoUri } from '@/lib/utils/media';

// ── Shared field types (mirrors the Zod bodies in backend routes) ──────────

export type MediaKind = 'image' | 'video';
export type ContentStatus = 'draft' | 'published' | 'archived';
export type LookVisibility = 'public' | 'followers' | 'private';

/** Normalised pin on a look's media — x/y are fractions of the frame. */
export interface LookTagInput {
  /** Client tag id — the server namespaces row ids as `${lookId}_${id}`. */
  id: string;
  listingId?: string;
  label?: string;
  x: number;
  y: number;
}

/** Durable upload receipt from uploadMediaFile — what the backend verifies. */
export interface StagedMediaReceipt {
  publicUrl: string;
  finalizationId: string;
  mediaAssetId: string | null;
  mediaType: MediaKind;
}

// ── Look writes ───────────────────────────────────────────────────────────

export interface CreateLookBody {
  id: string;
  title?: string;
  caption?: string;
  mediaUrl: string;
  mediaFinalizationId?: string;
  mediaAssetId?: string;
  mediaType?: MediaKind;
  visibility?: LookVisibility;
  tags?: LookTagInput[];
  status?: ContentStatus;
}

export type UpdateLookBody = Partial<Omit<CreateLookBody, 'id'>>;

/** POST /looks — create; the id is the publication idempotency key. */
export async function createLook(body: CreateLookBody): Promise<{ ok: boolean; lookId: string }> {
  return fetchJson('/looks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** PATCH /looks/:id — owner edit; also the draft→publish transition. */
export async function updateLook(lookId: string, body: UpdateLookBody): Promise<{ ok: boolean; lookId: string }> {
  return fetchJson(`/looks/${encodeURIComponent(lookId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** DELETE /looks/:id — discard (drafts) or remove (published), owner/admin. */
export async function deleteLook(lookId: string): Promise<{ ok: boolean }> {
  return fetchJson(`/looks/${encodeURIComponent(lookId)}`, { method: 'DELETE' });
}

// ── Poster/story writes ───────────────────────────────────────────────────

export interface PosterStoryFrameInput {
  id: string;
  mediaType: 'image' | 'video' | 'text';
  mediaUrl?: string;
  mediaFinalizationId?: string;
  mediaAssetId?: string;
  caption?: string;
  durationMs?: number;
  sortOrder?: number;
}

export interface CreatePosterStoryBody {
  id: string;
  audience?: 'public' | 'private';
  allowReplies?: boolean;
  allowReactions?: boolean;
  expiresInHours?: number;
  frames: PosterStoryFrameInput[];
}

/** POST /poster-stories — the story entity /poster/[id] resolves. */
export async function createPosterStory(
  body: CreatePosterStoryBody,
): Promise<{ ok: boolean; storyId: string }> {
  return fetchJson('/poster-stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface UpsertPosterBody {
  id: string;
  mediaUrl?: string;
  mediaFinalizationId?: string;
  caption?: string;
  status?: ContentStatus;
  expiryHours?: number;
}

/**
 * POST /posters — plain poster row, upserted by id. Web uses this
 * exclusively for poster *drafts* (status:'draft'); publishing goes through
 * /poster-stories so the result resolves on the story detail route.
 */
export async function upsertPoster(body: UpsertPosterBody): Promise<{ ok: boolean; posterId: string }> {
  return fetchJson('/posters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** DELETE /posters/:id — discard a poster draft row (owner/admin). */
export async function deletePoster(posterId: string): Promise<{ ok: boolean }> {
  return fetchJson(`/posters/${encodeURIComponent(posterId)}`, { method: 'DELETE' });
}

// ── Drafts (status-filtered entity lists — the backend draft endpoints) ────

interface DraftBase {
  id: string;
  kind: 'look' | 'poster';
  mediaUrl: string;
  mediaType: MediaKind;
  createdAt?: string;
}

export interface LookDraft extends DraftBase {
  kind: 'look';
  title: string;
  caption: string;
  visibility: LookVisibility;
  tags: LookTagInput[];
}

export interface PosterDraft extends DraftBase {
  kind: 'poster';
  caption: string;
  expiryHours: number;
}

export type CreatorDraft = LookDraft | PosterDraft;

/** GET /looks?status=draft — the route scopes non-published status to the
 *  caller's own rows, so this is exactly "my look drafts". */
export async function fetchLookDrafts(signal?: AbortSignal): Promise<LookDraft[]> {
  const res = await fetchJson<{ items?: Array<Record<string, unknown>> }>(
    '/looks?status=draft&limit=50',
    undefined,
    { signal },
  );
  return (res.items ?? [])
    .filter((row) => row.status === 'draft')
    .map((row) => ({
      kind: 'look' as const,
      id: String(row.id),
      title: typeof row.title === 'string' ? row.title : '',
      caption: typeof row.caption === 'string' ? row.caption : '',
      mediaUrl: String(row.mediaUrl ?? ''),
      mediaType: row.mediaType === 'video' ? ('video' as const) : ('image' as const),
      visibility: (row.visibility === 'followers' || row.visibility === 'private'
        ? row.visibility
        : 'public') as LookVisibility,
      tags: (Array.isArray(row.tags) ? row.tags : [])
        .map((t): LookTagInput | null => {
          const tag = t as Record<string, unknown>;
          const x = Number(tag.x);
          const y = Number(tag.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          // Server row ids are namespaced `${lookId}_${clientTagId}` —
          // strip the prefix so a resumed draft doesn't re-prefix on save.
          const rawId = String(tag.id ?? `tag_${x}_${y}`);
          const prefix = `${String(row.id)}_`;
          return {
            id: rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId,
            listingId: typeof tag.listingId === 'string' ? tag.listingId : undefined,
            label: typeof tag.label === 'string' ? tag.label : undefined,
            x: Math.min(1, Math.max(0, x)),
            y: Math.min(1, Math.max(0, y)),
          };
        })
        .filter((t): t is LookTagInput => t !== null),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
    }));
}

/** GET /posters?creatorId=&status=draft — caller's poster draft rows.
 *  (The route doesn't self-scope drafts, so creatorId must be passed.) */
export async function fetchPosterDrafts(
  creatorId: string,
  signal?: AbortSignal,
): Promise<PosterDraft[]> {
  const usp = new URLSearchParams({ creatorId, status: 'draft', limit: '50' });
  const res = await fetchJson<{ items?: Array<Record<string, unknown>> }>(
    `/posters?${usp.toString()}`,
    undefined,
    { signal },
  );
  return (res.items ?? [])
    .filter((row) => row.status === 'draft')
    .map((row) => {
      const mediaUrl = String(row.mediaUrl ?? '');
      return {
        kind: 'poster' as const,
        id: String(row.id),
        caption: typeof row.caption === 'string' ? row.caption : '',
        mediaUrl,
        // POST /posters recompute writes media_type only when a
        // finalization id is attached — a re-saved draft can report null,
        // so fall back to the URL extension for the video glyph.
        mediaType: (row.mediaType === 'video' || isVideoUri(mediaUrl)
          ? 'video'
          : 'image') as MediaKind,
        expiryHours: typeof row.expiryHours === 'number' ? row.expiryHours : 24,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
      };
    });
}

/** The merged draft tray — look + poster rows, newest first. */
export async function fetchCreatorDrafts(
  creatorId: string,
  signal?: AbortSignal,
): Promise<CreatorDraft[]> {
  const [looks, posters] = await Promise.all([
    fetchLookDrafts(signal),
    fetchPosterDrafts(creatorId, signal),
  ]);
  return [...looks, ...posters].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  );
}
