import { fetchJson } from '../lib/apiClient';

export interface LookTagApiItem {
  id: string;
  listingId: string | null;
  label: string;
  x: number;
  y: number;
}

export interface LookCreator {
  id: string;
  username: string | null;
  avatar: string | null;
}

export interface LookApiItem {
  id: string;
  creatorId: string;
  creator: LookCreator;
  title: string;
  caption: string;
  mediaUrl: string;
  /** Media type — defaults to 'image' when absent for backward compatibility */
  mediaType?: 'image' | 'video';
  visibility: 'public' | 'private';
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt?: string;
  tags: LookTagApiItem[];
  likeCount: number;
  commentCount: number;
  saveCount: number;
  likedByViewer: boolean;
  savedByViewer: boolean;
  /** Versioned composition document for collage looks. When present, the
   * viewer should render this canonical composition instead of only mediaUrl. */
  compositionDocument?: unknown;
}

export interface LookApiResponse {
  items: LookApiItem[];
  nextCursor?: string | null;
}

export interface LookSingleResponse {
  ok: boolean;
  look?: LookApiItem;
  error?: string;
}

export interface LookCreateTag {
  id: string;
  listingId?: string;
  label: string;
  x: number;
  y: number;
}

export interface LookCreateBody {
  id: string;
  title: string;
  caption?: string;
  mediaUrl: string;
  visibility?: 'public' | 'private';
  tags?: LookCreateTag[];
  status?: 'draft' | 'published' | 'archived';
  compositionDocument?: unknown;
}

export async function createLookOnApi(body: LookCreateBody): Promise<{ ok: boolean; lookId: string }> {
  return fetchJson<{ ok: boolean; lookId: string }>('/looks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchLooksFromApi(options?: { creatorId?: string; status?: string; limit?: number; cursor?: string }): Promise<LookApiResponse> {
  const params = new URLSearchParams();
  if (options?.creatorId) params.set('creatorId', options.creatorId);
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  const qs = params.toString();
  return fetchJson<LookApiResponse>(`/looks${qs ? `?${qs}` : ''}`);
}

export async function fetchLookByIdFromApi(lookId: string): Promise<LookSingleResponse> {
  return fetchJson<LookSingleResponse>(`/looks/${lookId}`);
}

export async function deleteLookOnApi(lookId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/looks/${lookId}`, { method: 'DELETE' });
}

// ── Like ──

export async function likeLookOnApi(lookId: string): Promise<{ ok: boolean; likeCount: number; likedByViewer: boolean }> {
  return fetchJson<{ ok: boolean; likeCount: number; likedByViewer: boolean }>(`/looks/${lookId}/like`, {
    method: 'POST',
  });
}

export async function unlikeLookOnApi(lookId: string): Promise<{ ok: boolean; likeCount: number; likedByViewer: boolean }> {
  return fetchJson<{ ok: boolean; likeCount: number; likedByViewer: boolean }>(`/looks/${lookId}/like`, {
    method: 'DELETE',
  });
}

// ── Save ──

export async function saveLookOnApi(lookId: string): Promise<{ ok: boolean; saveCount: number; savedByViewer: boolean }> {
  return fetchJson<{ ok: boolean; saveCount: number; savedByViewer: boolean }>(`/looks/${lookId}/save`, {
    method: 'POST',
  });
}

export async function unsaveLookOnApi(lookId: string): Promise<{ ok: boolean; saveCount: number; savedByViewer: boolean }> {
  return fetchJson<{ ok: boolean; saveCount: number; savedByViewer: boolean }>(`/looks/${lookId}/save`, {
    method: 'DELETE',
  });
}

// ── Comments ──

export interface LookCommentApiItem {
  id: string;
  lookId: string;
  authorId: string;
  author: LookCreator;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface LookCommentsResponse {
  items: LookCommentApiItem[];
}

export async function fetchLookCommentsFromApi(lookId: string): Promise<LookCommentsResponse> {
  return fetchJson<LookCommentsResponse>(`/looks/${lookId}/comments`);
}

export async function createLookCommentOnApi(
  lookId: string,
  body: { id: string; body: string }
): Promise<{ ok: boolean; comment: LookCommentApiItem }> {
  return fetchJson<{ ok: boolean; comment: LookCommentApiItem }>(`/looks/${lookId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteLookCommentOnApi(
  lookId: string,
  commentId: string
): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/looks/${lookId}/comments/${commentId}`, {
    method: 'DELETE',
  });
}