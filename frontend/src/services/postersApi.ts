import { fetchJson } from '../lib/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFreshPosters, POSTER_TEMPLATES } from '../data/posters';
import { ENABLE_RUNTIME_MOCKS } from '../constants/runtimeFlags';

const POSTER_STORY_CACHE_KEY = 'thryftverse.poster-stories.cache.v1';

// ── Types: Stickers ─────────────────────────────────────────────────

export type PosterStickerType = 'text' | 'mention' | 'listing' | 'look' | 'style_vote';

export type PosterTextStyle = 'editorial' | 'minimal' | 'label' | 'outline';

export interface PosterStickerPayload {
  text?: string;
  textStyle?: PosterTextStyle;
  textColor?: string;
  backgroundColor?: string;
  alignment?: 'left' | 'center' | 'right';
  userId?: string;
  username?: string;
  listingId?: string;
  snapshotTitle?: string;
  snapshotImageUrl?: string;
  snapshotPriceGbp?: number;
  lookId?: string;
  snapshotCaption?: string;
  question?: string;
  options?: Array<{ id: string; label: string }>;
}

export interface PosterSticker {
  id: string;
  type: PosterStickerType;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  payload: PosterStickerPayload;
  sortOrder: number;
}

// ── Types: Frames ───────────────────────────────────────────────────

export type PosterMediaType = 'image' | 'video' | 'text';

export interface PosterFrame {
  id: string;
  mediaUrl: string;
  caption: string;
  mediaType: PosterMediaType;
  sortOrder: number;
  durationMs: number;
  backgroundColor: string | null;
  textOverlay: Record<string, unknown> | null;
  stickers: PosterSticker[];
  viewCount: number;
  reactions: Record<string, number>;
  viewerReaction: string | null;
  seenByViewer: boolean;
}

// ── Types: Stories ──────────────────────────────────────────────────

export type PosterStoryAudience = 'public' | 'private';
export type PosterStoryStatus = 'active' | 'archived' | 'deleted';
export type PosterReactionType = 'love' | 'fire' | 'style' | 'want' | 'wow' | 'laugh';

export interface PosterStoryCreator {
  id: string;
  username: string | null;
  avatar: string | null;
}

export interface PosterStory {
  id: string;
  creatorId: string;
  creator: PosterStoryCreator;
  audience: PosterStoryAudience;
  allowReplies: boolean;
  allowReactions: boolean;
  status: PosterStoryStatus;
  expiresAt: string;
  createdAt: string;
  frames: PosterFrame[];
  seenByViewer: boolean;
  viewedFrameCount: number;
  totalFrameCount: number;
  uniqueViewerCount?: number;
  /** Versioned composition document for WYSIWYG viewer rendering. */
  compositionDocument?: unknown;
}

export interface PosterStoryListResponse {
  items: PosterStory[];
}

function getDevelopmentPosterStories(): PosterStory[] {
  if (!ENABLE_RUNTIME_MOCKS) return [];

  return getFreshPosters().map((poster) => {
    const template = POSTER_TEMPLATES.find((candidate) => candidate.id === poster.templateId);
    return {
      id: poster.id,
      creatorId: poster.uploaderId,
      creator: {
        id: poster.uploaderId,
        username: poster.uploader?.username ?? null,
        avatar: poster.uploader?.avatar || null,
      },
      audience: 'public',
      allowReplies: true,
      allowReactions: true,
      status: 'active',
      expiresAt: new Date(poster.expiresAtMs).toISOString(),
      createdAt: poster.createdAt,
      frames: [{
        id: `${poster.id}_frame_0`,
        mediaUrl: poster.image,
        caption: poster.caption,
        mediaType: poster.image ? 'image' : 'text',
        sortOrder: 0,
        durationMs: 5000,
        backgroundColor: template?.thumbnailColor ?? '#1A1A1A',
        textOverlay: null,
        stickers: [],
        viewCount: 0,
        reactions: {},
        viewerReaction: null,
        seenByViewer: false,
      }],
      seenByViewer: false,
      viewedFrameCount: 0,
      totalFrameCount: 1,
      uniqueViewerCount: 0,
    } satisfies PosterStory;
  });
}

async function readCachedPosterStories(): Promise<PosterStory[]> {
  try {
    const cached = await AsyncStorage.getItem(POSTER_STORY_CACHE_KEY);
    if (!cached) return [];
    const parsed = JSON.parse(cached) as PosterStoryListResponse;
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function writeCachedPosterStories(items: PosterStory[]) {
  try {
    await AsyncStorage.setItem(POSTER_STORY_CACHE_KEY, JSON.stringify({ items }));
  } catch {
    // A successful live response remains usable when local persistence fails.
  }
}

function filterPosterStories(items: PosterStory[], options?: {
  creatorId?: string;
  active?: boolean;
  limit?: number;
}) {
  const now = Date.now();
  const filtered = items.filter((story) => {
    if (options?.creatorId && story.creatorId !== options.creatorId) return false;
    if (options?.active && (story.status !== 'active' || new Date(story.expiresAt).getTime() <= now)) return false;
    return story.status !== 'deleted';
  });
  return typeof options?.limit === 'number' ? filtered.slice(0, options.limit) : filtered;
}

export interface PosterStoryCreateFrame {
  id: string;
  mediaType: PosterMediaType;
  mediaUrl?: string;
  backgroundColor?: string;
  caption?: string;
  durationMs?: number;
  sortOrder?: number;
  stickers: Array<{
    id: string;
    type: PosterStickerType;
    x: number;
    y: number;
    scale?: number;
    rotation?: number;
    payload: PosterStickerPayload;
    sortOrder?: number;
  }>;
}

export interface PosterStoryCreateBody {
  id: string;
  audience?: PosterStoryAudience;
  allowReplies?: boolean;
  allowReactions?: boolean;
  expiresInHours?: number;
  posterMode?: 'poster' | 'look';
  frames: PosterStoryCreateFrame[];
  /** Versioned composition document for WYSIWYG viewer rendering. When
   * present, the viewer should render this canonical composition instead
   * of reconstructing from frames/stickers alone. */
  compositionDocument?: unknown;
}

// ── Types: Replies ──────────────────────────────────────────────────

export interface PosterReply {
  id: string;
  frameId: string;
  authorId: string;
  authorUsername: string | null;
  authorAvatar: string | null;
  body: string;
  createdAt: string;
}

export interface PosterReplyListResponse {
  items: PosterReply[];
}

// ── Types: Activity ─────────────────────────────────────────────────

export interface PosterStoryActivityViewer {
  userId: string;
  username: string | null;
  avatar: string | null;
  viewedFrameCount: number;
  latestViewedAt: string;
}

export interface PosterStoryActivityReaction {
  userId: string;
  username: string | null;
  avatar: string | null;
  frameId: string;
  reaction: string;
  createdAt: string;
}

export interface PosterStoryActivityReply {
  id: string;
  authorId: string;
  authorUsername: string | null;
  authorAvatar: string | null;
  frameId: string;
  body: string;
  createdAt: string;
}

export interface PosterStoryActivityStyleVote {
  stickerId: string;
  userId: string;
  username: string | null;
  optionId: string;
  createdAt: string;
}

export interface PosterStoryActivity {
  storyId: string;
  viewers: PosterStoryActivityViewer[];
  reactions: PosterStoryActivityReaction[];
  replies: PosterStoryActivityReply[];
  styleVotes: PosterStoryActivityStyleVote[];
}

// ── Types: Style Vote ───────────────────────────────────────────────

export interface PosterStyleVoteResult {
  selectedOptionId: string;
  options: Array<{
    id: string;
    label: string;
    voteCount: number;
    percentage: number;
  }>;
  totalVotes: number;
}

// ── Legacy types (for backward compat with existing posters table) ──

export interface PosterApiItem {
  id: string;
  creatorId: string;
  mediaUrl: string;
  caption: string;
  textOverlay: Record<string, unknown> | null;
  backgroundColor: string | null;
  layout: string;
  status: 'draft' | 'published' | 'archived';
  expiryHours: number;
  createdAt: string;
}

export interface PosterApiResponse {
  items: PosterApiItem[];
}

export interface PosterSingleResponse {
  ok: boolean;
  poster?: PosterApiItem;
  error?: string;
}

export interface PosterCreateBody {
  id: string;
  mediaUrl: string;
  caption?: string;
  textOverlay?: Record<string, unknown>;
  backgroundColor?: string;
  layout?: string;
  status?: 'draft' | 'published' | 'archived';
  expiryHours?: number;
}

// ── API Functions: Stories ──────────────────────────────────────────

export async function createPosterStory(body: PosterStoryCreateBody): Promise<{ ok: boolean; storyId: string }> {
  return fetchJson<{ ok: boolean; storyId: string }>('/poster-stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchPosterStories(options?: {
  creatorId?: string;
  active?: boolean;
  limit?: number;
}): Promise<PosterStoryListResponse> {
  const params = new URLSearchParams();
  if (options?.creatorId) params.set('creatorId', options.creatorId);
  if (options?.active !== undefined) params.set('active', String(options.active));
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  try {
    const response = await fetchJson<PosterStoryListResponse>(`/poster-stories${qs ? `?${qs}` : ''}`);
    if (!options?.creatorId && options?.active !== false && response.items.length > 0) {
      void writeCachedPosterStories(response.items);
    }
    return response;
  } catch (error) {
    const cached = filterPosterStories(await readCachedPosterStories(), options);
    if (cached.length > 0) return { items: cached };

    const developmentStories = filterPosterStories(getDevelopmentPosterStories(), options);
    if (developmentStories.length > 0) return { items: developmentStories };

    throw error;
  }
}

export async function fetchPosterStoryById(storyId: string): Promise<PosterStory> {
  try {
    return await fetchJson<PosterStory>(`/poster-stories/${storyId}`);
  } catch (error) {
    const fallbackStories = [
      ...(await readCachedPosterStories()),
      ...getDevelopmentPosterStories(),
    ];
    const fallback = fallbackStories.find((story) => story.id === storyId);
    if (fallback) return fallback;
    throw error;
  }
}

export async function deletePosterStory(storyId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/poster-stories/${storyId}`, { method: 'DELETE' });
}

export async function archivePosterStory(storyId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/poster-stories/${storyId}/archive`, { method: 'POST' });
}

export async function deletePosterFrame(frameId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/poster-frames/${frameId}`, { method: 'DELETE' });
}

// ── API Functions: Views ────────────────────────────────────────────

export async function recordPosterFrameView(
  frameId: string
): Promise<{ ok: boolean; uniqueViewerCount?: number }> {
  return fetchJson<{ ok: boolean; uniqueViewerCount?: number }>(
    `/poster-frames/${frameId}/view`,
    { method: 'POST' }
  );
}

// ── API Functions: Reactions ────────────────────────────────────────

export async function setPosterFrameReaction(
  frameId: string,
  reaction: PosterReactionType
): Promise<{ ok: boolean; reactionCounts: Record<string, number>; viewerReaction: string }> {
  return fetchJson<{ ok: boolean; reactionCounts: Record<string, number>; viewerReaction: string }>(
    `/poster-frames/${frameId}/reaction`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    }
  );
}

export async function removePosterFrameReaction(frameId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/poster-frames/${frameId}/reaction`, { method: 'DELETE' });
}

// ── API Functions: Replies ──────────────────────────────────────────

export async function createPosterReply(
  frameId: string,
  body: { id: string; body: string }
): Promise<{ ok: boolean; replyId: string }> {
  return fetchJson<{ ok: boolean; replyId: string }>(
    `/poster-frames/${frameId}/replies`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

export async function fetchPosterStoryReplies(storyId: string): Promise<PosterReplyListResponse> {
  return fetchJson<PosterReplyListResponse>(`/poster-stories/${storyId}/replies`);
}

// ── API Functions: Style Votes ──────────────────────────────────────

export async function votePosterStyle(
  stickerId: string,
  optionId: string
): Promise<PosterStyleVoteResult> {
  return fetchJson<PosterStyleVoteResult>(
    `/poster-stickers/${stickerId}/vote`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId }),
    }
  );
}

// ── API Functions: Activity ─────────────────────────────────────────

export async function fetchPosterStoryActivity(storyId: string): Promise<PosterStoryActivity> {
  return fetchJson<PosterStoryActivity>(`/poster-stories/${storyId}/activity`);
}

// ── API Functions: Archive ──────────────────────────────────────────

export async function fetchPosterStoryArchive(options?: {
  includeActive?: boolean;
}): Promise<PosterStoryListResponse> {
  const params = new URLSearchParams();
  if (options?.includeActive !== undefined) params.set('includeActive', String(options.includeActive));
  const qs = params.toString();
  return fetchJson<PosterStoryListResponse>(`/poster-stories/archive${qs ? `?${qs}` : ''}`);
}

// ── Legacy API Functions (backward compat wrappers) ─────────────────
// These wrap the new story-based endpoints for callers that haven't been
// migrated yet. They preserve the old function signatures.

export async function createPosterOnApi(body: PosterCreateBody): Promise<{ ok: boolean; posterId: string }> {
  return fetchJson<{ ok: boolean; posterId: string }>('/posters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchPostersFromApi(options?: {
  creatorId?: string;
  status?: string;
  limit?: number;
}): Promise<PosterApiResponse> {
  const params = new URLSearchParams();
  if (options?.creatorId) params.set('creatorId', options.creatorId);
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return fetchJson<PosterApiResponse>(`/posters${qs ? `?${qs}` : ''}`);
}

export async function fetchPosterByIdFromApi(posterId: string): Promise<PosterSingleResponse> {
  return fetchJson<PosterSingleResponse>(`/posters/${posterId}`);
}

export async function deletePosterOnApi(posterId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/posters/${posterId}`, { method: 'DELETE' });
}
