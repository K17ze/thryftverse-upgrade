import { fetchJson } from '../lib/apiClient';

export interface ProfileUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  phone: string | null;
  avatar: string | null;
  coverPhoto: string | null;
  coverVideo: string | null;
  role: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfileUser {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  avatar: string | null;
  coverPhoto: string | null;
  coverVideo: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface PublicProfileStats {
  activeListingCount: number;
  soldListingCount: number;
  publishedLookCount: number;
  followerCount: number;
  followingCount: number;
  reviewCount: number;
  ratingAverage: number | null;
}

export interface PublicProfileViewer {
  isSelf: boolean;
  isFollowing: boolean;
  isBlocked: boolean;
  isBlockedByTarget: boolean;
  canMessage: boolean;
}

export interface PublicProfileAggregate {
  user: PublicProfileUser;
  stats: PublicProfileStats;
  viewer: PublicProfileViewer;
}

interface ProfileResponse {
  ok: true;
  user: ProfileUser;
}

interface PublicProfileAggregateResponse {
  ok: true;
  user: PublicProfileUser;
  stats: PublicProfileStats;
  viewer: PublicProfileViewer;
}

export async function fetchMyProfile(): Promise<ProfileUser> {
  const response = await fetchJson<ProfileResponse>('/users/me', { method: 'GET' });
  return response.user;
}

export interface UpdateProfileInput {
  displayName?: string;
  username?: string;
  bio?: string;
  location?: string;
  website?: string;
  phone?: string;
  avatar?: string;
  coverPhoto?: string;
  coverVideo?: string;
}

export async function updateMyProfile(input: UpdateProfileInput): Promise<ProfileUser> {
  const response = await fetchJson<ProfileResponse>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return response.user;
}

export async function fetchPublicProfile(userId: string): Promise<PublicProfileUser> {
  const response = await fetchJson<PublicProfileAggregateResponse>(`/users/${encodeURIComponent(userId)}/profile`, {
    method: 'GET',
  });
  return response.user;
}

export async function fetchPublicProfileAggregate(userId: string): Promise<PublicProfileAggregate> {
  const response = await fetchJson<PublicProfileAggregateResponse>(`/users/${encodeURIComponent(userId)}/profile`, {
    method: 'GET',
  });
  return { user: response.user, stats: response.stats, viewer: response.viewer };
}

// ── Follow ───────────────────────────────────────────────────────────

export async function followUser(userId: string): Promise<{ isFollowing: boolean }> {
  const response = await fetchJson<{ ok: boolean; isFollowing: boolean }>(
    `/users/${encodeURIComponent(userId)}/follow`,
    { method: 'POST' }
  );
  return { isFollowing: response.isFollowing };
}

export async function unfollowUser(userId: string): Promise<{ isFollowing: boolean }> {
  const response = await fetchJson<{ ok: boolean; isFollowing: boolean }>(
    `/users/${encodeURIComponent(userId)}/follow`,
    { method: 'DELETE' }
  );
  return { isFollowing: response.isFollowing };
}

// ── Block / unblock ──────────────────────────────────────────────────

export async function blockUser(userId: string): Promise<{ isBlocked: boolean }> {
  const response = await fetchJson<{ ok: boolean; isBlocked: boolean }>(
    `/users/${encodeURIComponent(userId)}/block`,
    { method: 'POST' }
  );
  return { isBlocked: response.isBlocked };
}

export async function unblockUser(userId: string): Promise<{ isBlocked: boolean }> {
  const response = await fetchJson<{ ok: boolean; isBlocked: boolean }>(
    `/users/${encodeURIComponent(userId)}/unblock`,
    { method: 'POST' }
  );
  return { isBlocked: response.isBlocked };
}

// ── Report ───────────────────────────────────────────────────────────

export type ReportReason =
  | 'spam'
  | 'inappropriate'
  | 'counterfeit'
  | 'unresponsive'
  | 'harassment'
  | 'other';

export async function reportUser(
  userId: string,
  reason: ReportReason,
  details?: string
): Promise<{ reportId: string }> {
  const response = await fetchJson<{ ok: boolean; reportId: string }>(
    `/users/${encodeURIComponent(userId)}/report`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, details: details ?? undefined }),
    }
  );
  return { reportId: response.reportId };
}

// ── Follow counts / lists ────────────────────────────────────────────

export interface FollowListUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

export async function fetchFollowCounts(userId: string): Promise<{ followerCount: number; followingCount: number }> {
  const response = await fetchJson<{ ok: boolean; followerCount: number; followingCount: number }>(
    `/users/${encodeURIComponent(userId)}/follow-counts`
  );
  return { followerCount: response.followerCount, followingCount: response.followingCount };
}

export async function fetchFollowers(userId: string, cursor?: string): Promise<{ items: FollowListUser[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  params.set('limit', '40');
  if (cursor) params.set('cursor', cursor);
  const response = await fetchJson<{ items: FollowListUser[]; nextCursor: string | null }>(
    `/users/${encodeURIComponent(userId)}/followers?${params.toString()}`
  );
  return { items: response.items ?? [], nextCursor: response.nextCursor ?? null };
}

export async function fetchFollowing(userId: string, cursor?: string): Promise<{ items: FollowListUser[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  params.set('limit', '40');
  if (cursor) params.set('cursor', cursor);
  const response = await fetchJson<{ items: FollowListUser[]; nextCursor: string | null }>(
    `/users/${encodeURIComponent(userId)}/following?${params.toString()}`
  );
  return { items: response.items ?? [], nextCursor: response.nextCursor ?? null };
}

export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

export async function searchUsers(query: string, limit?: number): Promise<UserSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const params = new URLSearchParams();
  params.set('q', trimmed);
  if (limit) params.set('limit', String(Math.min(limit, 20)));
  const response = await fetchJson<{ ok: boolean; items: UserSearchResult[] }>(
    `/users/search?${params.toString()}`
  );
  return response.items;
}