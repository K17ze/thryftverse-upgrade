import { fetchJson } from '../lib/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFreshPosters, POSTER_TEMPLATES } from '../data/posters';
import { ENABLE_RUNTIME_MOCKS } from '../constants/runtimeFlags';

const POSTER_STORY_CACHE_KEY = 'thryftverse.poster-stories.cache.v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Custom Error Types ──────────────────────────────────────────────

export class PosterApiError extends Error {
  code: string;
  retryable: boolean;
  statusCode?: number;

  constructor(message: string, code: string, retryable: boolean, statusCode?: number) {
    super(message);
    this.name = 'PosterApiError';
    this.code = code;
    this.retryable = retryable;
    this.statusCode = statusCode;
  }

  static network(): PosterApiError {
    return new PosterApiError('Network error', 'NETWORK_ERROR', true);
  }

  static notFound(resource: string): PosterApiError {
    return new PosterApiError(`${resource} not found`, 'NOT_FOUND', false, 404);
  }

  static server(statusCode: number): PosterApiError {
    return new PosterApiError('Server error', 'SERVER_ERROR', true, statusCode);
  }
}

// ── Types: Stickers ─────────────────────────────────────────────────

export type PosterStickerType = 'text' | 'mention' | 'listing' | 'look' | 'style_vote' | 'poll' | 'quiz' | 'question' | 'countdown' | 'emojiSlider';

export type PosterTextStyle = 'headline' | 'editorial' | 'clean' | 'compact' | 'handwritten' | 'bubble' | 'deco' | 'poster' | 'squeeze' | 'signature' | 'minimal' | 'label' | 'outline';

export interface PollStickerPayload {
  question: string;      // max 200
  options: Array<{ id: string; label: string }>;  // exactly 2 options, label max 80
}

export interface QuizStickerPayload {
  question: string;      // max 200
  options: Array<{ id: string; label: string }>;  // 2-4 options, label max 80
  correctOptionId: string;
}

export interface QuestionStickerPayload {
  question: string;      // max 200
  // Responses are collected as replies with a special prefix
}

export interface CountdownStickerPayload {
  label: string;         // max 60
  targetDate: string;    // ISO 8601 datetime
  endLabel?: string;     // text shown when countdown ends, max 60
}

export interface EmojiSliderStickerPayload {
  question: string;      // max 100
  emoji: string;         // emoji shown at the high end of the slider
}

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
  correctOptionId?: string;
  targetDate?: string;
  endLabel?: string;
  emoji?: string;
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

export type PosterStoryAudience = 'public' | 'closeFriends' | 'private';
export type PosterStoryStatus = 'active' | 'archived' | 'deleted';
export type PosterReactionType = 'love' | 'fire' | 'style' | 'want' | 'wow' | 'laugh';

export interface PosterStoryCreator {
  id: string;
  username: string | null;
  avatar: string | null;
  /** Verification tier — if present, a badge is shown in the author row. */
  isVerified?: boolean;
  verificationTier?: 'email' | 'id' | 'seller';
  /** Whether the current viewer follows this creator. */
  isFollowing?: boolean;
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
    const parsed = JSON.parse(cached) as PosterStoryListResponse & { cachedAt?: number };
    // Check TTL — entries older than CACHE_TTL_MS are considered stale
    if (parsed.cachedAt && Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      return [];
    }
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function writeCachedPosterStories(items: PosterStory[]) {
  try {
    await AsyncStorage.setItem(
      POSTER_STORY_CACHE_KEY,
      JSON.stringify({ items, cachedAt: Date.now() })
    );
  } catch {
    // A successful live response remains usable when local persistence fails.
  }
}

/**
 * Invalidate the poster story cache. Call after create/delete/archive
 * operations to ensure stale data isn't served on next fetch.
 */
export async function invalidatePosterCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(POSTER_STORY_CACHE_KEY);
  } catch {
    // Best-effort — cache invalidation failure is non-fatal
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
  mediaFinalizationId?: string;
  mediaAssetId?: string;
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

// ── Types: Poll & Quiz Votes ────────────────────────────────────────

export interface PollVoteResult {
  selectedOptionId: string;
  options: Array<{
    id: string;
    label: string;
    voteCount: number;
    percentage: number;
  }>;
  totalVotes: number;
}

export interface QuizVoteResult {
  selectedOptionId: string;
  isCorrect: boolean;
  correctOptionId: string;
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
  const result = await fetchJson<{ ok: boolean; storyId: string }>('/poster-stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  void invalidatePosterCache();
  return result;
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
    // In production, surface API errors honestly instead of serving stale
    // cached data that may be deleted or expired (AGENTS.md §11 — fail-closed
    // trust signals). Cache fallback is dev-only via ENABLE_RUNTIME_MOCKS.
    if (ENABLE_RUNTIME_MOCKS) {
      const cached = filterPosterStories(await readCachedPosterStories(), options);
      if (cached.length > 0) return { items: cached };

      const developmentStories = filterPosterStories(getDevelopmentPosterStories(), options);
      if (developmentStories.length > 0) return { items: developmentStories };
    }

    throw error;
  }
}

export async function fetchPosterStoryById(storyId: string): Promise<PosterStory> {
  try {
    return await fetchJson<PosterStory>(`/poster-stories/${storyId}`);
  } catch (error) {
    // In production, surface API errors honestly instead of serving stale
    // cached data that may be deleted or expired (AGENTS.md §11 — fail-closed
    // trust signals). Cache fallback is dev-only via ENABLE_RUNTIME_MOCKS.
    if (ENABLE_RUNTIME_MOCKS) {
      const fallbackStories = [
        ...(await readCachedPosterStories()),
        ...getDevelopmentPosterStories(),
      ];
      const fallback = fallbackStories.find((story) => story.id === storyId);
      if (fallback) return fallback;
    }
    throw error;
  }
}

export async function deletePosterStory(storyId: string): Promise<{ ok: boolean }> {
  const result = await fetchJson<{ ok: boolean }>(`/poster-stories/${storyId}`, { method: 'DELETE' });
  void invalidatePosterCache();
  return result;
}

export async function archivePosterStory(storyId: string): Promise<{ ok: boolean }> {
  const result = await fetchJson<{ ok: boolean }>(`/poster-stories/${storyId}/archive`, { method: 'POST' });
  void invalidatePosterCache();
  return result;
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

// ── API Functions: Poll Votes ───────────────────────────────────────

export async function votePosterPoll(
  stickerId: string,
  optionId: string
): Promise<PollVoteResult> {
  if (ENABLE_RUNTIME_MOCKS) {
    return mockVotePosterPoll(stickerId, optionId);
  }
  return fetchJson<PollVoteResult>(
    `/poster-stickers/${stickerId}/poll-vote`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId }),
    }
  );
}

// ── API Functions: Quiz Votes ───────────────────────────────────────

export async function votePosterQuiz(
  stickerId: string,
  optionId: string
): Promise<QuizVoteResult> {
  if (ENABLE_RUNTIME_MOCKS) {
    return mockVotePosterQuiz(stickerId, optionId);
  }
  return fetchJson<QuizVoteResult>(
    `/poster-stickers/${stickerId}/quiz-vote`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId }),
    }
  );
}

// ── API Functions: Question Answers ─────────────────────────────────

export async function answerPosterQuestion(
  stickerId: string,
  answer: string
): Promise<{ ok: true }> {
  if (ENABLE_RUNTIME_MOCKS) {
    return { ok: true };
  }
  return fetchJson<{ ok: true }>(
    `/poster-stickers/${stickerId}/answer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    }
  );
}

// ── Mock Implementations (runtime mock fallbacks) ───────────────────

function mockVotePosterPoll(
  _stickerId: string,
  optionId: string
): Promise<PollVoteResult> {
  const mockVotes = Math.floor(Math.random() * 50) + 10;
  const otherVotes = Math.floor(Math.random() * 40) + 5;
  const total = mockVotes + otherVotes;
  return Promise.resolve({
    selectedOptionId: optionId,
    options: [
      {
        id: optionId,
        label: 'Option A',
        voteCount: mockVotes,
        percentage: Math.round((mockVotes / total) * 100),
      },
      {
        id: 'other',
        label: 'Option B',
        voteCount: otherVotes,
        percentage: Math.round((otherVotes / total) * 100),
      },
    ],
    totalVotes: total,
  });
}

function mockVotePosterQuiz(
  _stickerId: string,
  optionId: string
): Promise<QuizVoteResult> {
  const correctId = 'correct';
  const isCorrect = optionId === correctId;
  const correctVotes = Math.floor(Math.random() * 40) + 15;
  const wrongVotes = Math.floor(Math.random() * 30) + 5;
  const total = correctVotes + wrongVotes;
  return Promise.resolve({
    selectedOptionId: optionId,
    isCorrect,
    correctOptionId: correctId,
    options: [
      {
        id: correctId,
        label: 'Correct answer',
        voteCount: correctVotes,
        percentage: Math.round((correctVotes / total) * 100),
      },
      {
        id: 'wrong',
        label: 'Wrong answer',
        voteCount: wrongVotes,
        percentage: Math.round((wrongVotes / total) * 100),
      },
    ],
    totalVotes: total,
  });
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

// ── Poster Product Tags (Shoppable Pins) ────────────────────────────

export interface PosterTag {
  id: string;
  posterId: string;
  listingId: string;
  label: string;
  x: number;
  y: number;
  clickCount: number;
  lastClickedAt: string | null;
  createdAt: string;
}

export interface PosterTagListResponse {
  tags: PosterTag[];
}

export interface PosterTagCreateBody {
  listingId: string;
  label: string;
  x: number;
  y: number;
}

export async function addPosterTag(posterId: string, body: PosterTagCreateBody): Promise<{ ok: boolean; tagId: string }> {
  return fetchJson<{ ok: boolean; tagId: string }>(`/posters/${posterId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchPosterTags(posterId: string): Promise<PosterTagListResponse> {
  return fetchJson<PosterTagListResponse>(`/posters/${posterId}/tags`);
}

export async function deletePosterTag(posterId: string, tagId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/posters/${posterId}/tags/${tagId}`, { method: 'DELETE' });
}

export async function recordPosterTagClick(posterId: string, tagId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/posters/${posterId}/tags/${tagId}/click`, {
    method: 'POST',
  });
}

// ── Creator Content Scheduling ──────────────────────────────────────

export async function scheduleCreatorDocument(documentId: string, scheduledFor: string | null): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/creator/documents/${documentId}/schedule`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduledFor }),
  });
}

// ── Highlights ────────────────────────────────────────────────────────

export interface PosterHighlightFrame {
  frameId: string;
  sortOrder: number;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  backgroundColor: string | null;
}

export interface PosterHighlight {
  id: string;
  title: string;
  coverFrameId: string | null;
  coverUrl: string | null;
  sortOrder: number;
  createdAt: string;
  frames: PosterHighlightFrame[];
}

export async function fetchPosterHighlights(userId: string): Promise<{ items: PosterHighlight[] }> {
  return fetchJson<{ items: PosterHighlight[] }>(`/users/${userId}/poster-highlights`);
}

export async function createPosterHighlight(body: {
  id: string;
  title: string;
  coverFrameId?: string;
  frameIds: string[];
}): Promise<{ ok: boolean; highlightId: string }> {
  return fetchJson<{ ok: boolean; highlightId: string }>(`/poster-highlights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updatePosterHighlight(
  highlightId: string,
  body: { title?: string; coverFrameId?: string }
): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/poster-highlights/${highlightId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deletePosterHighlight(highlightId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/poster-highlights/${highlightId}`, {
    method: 'DELETE',
  });
}

export async function addFrameToHighlight(highlightId: string, frameId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/poster-highlights/${highlightId}/frames`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frameId }),
  });
}

export async function removeFrameFromHighlight(highlightId: string, frameId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/poster-highlights/${highlightId}/frames/${frameId}`, {
    method: 'DELETE',
  });
}
