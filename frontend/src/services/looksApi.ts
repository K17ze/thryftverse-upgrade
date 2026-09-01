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
  /** Whether the creator has identity/trader verification evidence.
   *  Backed by seller_trust_evidence (identity_checked / trader_verified). */
  verified?: boolean;
}

export interface LookMediaEntry {
  url: string;
  mediaType: 'image' | 'video';
  mediaFinalizationId?: string;
  mediaAssetId?: string;
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
  /** Additional carousel slides beyond the primary mediaUrl. Empty array when
   *  the look has only one media item. Position 0 is the primary mediaUrl. */
  mediaUrls?: LookMediaEntry[];
  visibility: 'public' | 'followers' | 'private';
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt?: string;
  tags: LookTagApiItem[];
  likeCount: number;
  commentCount: number;
  saveCount: number;
  likedByViewer: boolean;
  savedByViewer: boolean;
  /** Native media pixel width, when the backend exposes it. Used by
   *  resolveLookTemplate to derive the real tile aspect ratio instead of
   *  fabricating one from the item index (Design.md §1841). */
  mediaWidth?: number;
  /** Native media pixel height, when the backend exposes it. */
  mediaHeight?: number;
  /** Pre-computed cover aspect ratio (width / height), when the backend
   *  exposes it. Takes precedence over mediaWidth/mediaHeight. */
  coverAspectRatio?: number;
  /** Versioned composition document for collage looks. When present, the
   * viewer should render this canonical composition instead of only mediaUrl. */
  compositionDocument?: unknown;
  /** When non-null, this look is a repost of the referenced source look. */
  sourceLookId?: string | null;
  /** Source look attribution info (present when sourceLookId is non-null). */
  sourceLook?: {
    creatorId: string;
    creatorUsername: string | null;
    creatorAvatar: string | null;
  } | null;
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
  /** Durable proof that the primary media PUT was verified by the backend. */
  mediaFinalizationId?: string;
  /** Authoritative media lifecycle row returned by upload finalization. */
  mediaAssetId?: string;
  mediaType?: 'image' | 'video';
  /** Carousel slides beyond the primary mediaUrl. Max 9 additional slides
   *  (10 total including primary). Each entry with a mediaFinalizationId
   *  will be verified by the backend. */
  mediaUrls?: LookMediaEntry[];
  visibility?: 'public' | 'followers' | 'private';
  tags?: LookCreateTag[];
  status?: 'draft' | 'published' | 'archived';
  compositionDocument?: unknown;
  sourceLookId?: string;
}

export async function createLookOnApi(body: LookCreateBody): Promise<{ ok: boolean; lookId: string }> {
  return fetchJson<{ ok: boolean; lookId: string }>('/looks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateLookOnApi(
  lookId: string,
  body: Partial<LookCreateBody>
): Promise<{ ok: boolean; lookId: string }> {
  return fetchJson<{ ok: boolean; lookId: string }>(`/looks/${lookId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchLooksFromApi(options?: { creatorId?: string; status?: string; sort?: string; limit?: number; cursor?: string }): Promise<LookApiResponse> {
  const params = new URLSearchParams();
  if (options?.creatorId) params.set('creatorId', options.creatorId);
  if (options?.status) params.set('status', options.status);
  if (options?.sort) params.set('sort', options.sort);
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

export async function repostLookOnApi(lookId: string): Promise<{ ok: boolean; lookId: string }> {
  return fetchJson<{ ok: boolean; lookId: string }>(`/looks/${lookId}/repost`, {
    method: 'POST',
  });
}

export interface LookRelatedResponse {
  items: LookApiItem[];
  nextCursor?: string | null;
}

export async function fetchRelatedLooksFromApi(
  lookId: string,
  options?: { cursor?: string; limit?: number }
): Promise<LookRelatedResponse> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return fetchJson<LookRelatedResponse>(`/looks/${lookId}/related${qs ? `?${qs}` : ''}`);
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
  parentId: string | null;
  author: LookCreator;
  /** Empty for tombstones — deleted comments with live replies keep their
   *  thread but never serve their body. */
  body: string;
  /** True when this row is a tombstone (deleted, kept for its replies). */
  deleted: boolean;
  likeCount: number;
  likedByViewer: boolean;
  replyCount: number;
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
  body: { id: string; body: string; parentId?: string }
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

export async function likeLookCommentOnApi(
  lookId: string,
  commentId: string
): Promise<{ ok: boolean; likeCount: number; likedByViewer: boolean }> {
  return fetchJson<{ ok: boolean; likeCount: number; likedByViewer: boolean }>(
    `/looks/${lookId}/comments/${commentId}/like`,
    { method: 'POST' }
  );
}

export async function unlikeLookCommentOnApi(
  lookId: string,
  commentId: string
): Promise<{ ok: boolean; likeCount: number; likedByViewer: boolean }> {
  return fetchJson<{ ok: boolean; likeCount: number; likedByViewer: boolean }>(
    `/looks/${lookId}/comments/${commentId}/like`,
    { method: 'DELETE' }
  );
}
