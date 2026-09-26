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

function mapLookRow(row: Record<string, unknown>): Look {
  return {
    id: String(row.id),
    creatorId: String(row.creatorId ?? row.creator_id ?? ''),
    coverImageUri: String(row.coverImageUri ?? row.coverImageUrl ?? row.coverUri ?? ''),
    coverAspectRatio:
      typeof row.coverAspectRatio === 'number' ? row.coverAspectRatio : null,
    title: typeof row.title === 'string' ? row.title : null,
    itemIds: Array.isArray(row.itemIds) ? row.itemIds.map(String) : [],
    likeCount: typeof row.likeCount === 'number' ? row.likeCount : null,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
  };
}

export async function fetchLooks(signal?: AbortSignal): Promise<Look[]> {
  const payload = await fetchJson<LookListResponse & { items?: Array<Record<string, unknown>> }>(
    '/looks',
    undefined,
    { signal },
  );
  const rows = (payload.items ?? payload.looks ?? []) as unknown as Array<Record<string, unknown>>;
  return rows.map(mapLookRow);
}

export async function fetchLook(id: string, signal?: AbortSignal): Promise<Look | null> {
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
