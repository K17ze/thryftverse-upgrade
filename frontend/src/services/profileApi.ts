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
  /** Identity/KYC verification — separate from email verification. */
  identityVerified?: boolean;
  /** Seller standards verification — separate from email/identity. */
  sellerVerified?: boolean;
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
  /** Identity/KYC verification — separate from email verification. */
  identityVerified?: boolean;
  /** Seller standards verification — separate from email/identity. */
  sellerVerified?: boolean;
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
  /** Whether the viewer can see social content (Looks, creations). False for
   *  non-followers viewing a private profile. Shop is always visible. */
  canViewSocialContent?: boolean;
  /** Whether the viewer can see the shop. Always true (commerce obligation). */
  canViewShop?: boolean;
}

export interface PublicProfileAway {
  holidayMode: boolean;
  awayMessage: string | null;
}

/** DSA Article 30 trader disclosure. Legally required in the EU/UK. */
export interface PublicProfileTrader {
  classification: 'trader' | 'non_trader';
  /** Legal name of the business — only disclosed for verified traders. */
  legalName: string | null;
  contactEmail: string | null;
  registrationNumber: string | null;
  address: string | null;
  vatNumber: string | null;
}

export interface PublicProfileStorefrontSection {
  kind: string;
  title: string;
  sortOrder: number;
}

export interface PublicProfileStorefrontSummary {
  announcement: string | null;
  sections: PublicProfileStorefrontSection[];
  featuredListingIds: string[];
}

export interface PublicProfileAggregate {
  user: PublicProfileUser;
  stats: PublicProfileStats;
  viewer: PublicProfileViewer;
  /** Authoritative away state — only present when holiday mode is on. */
  away?: PublicProfileAway;
  /** DSA Article 30 trader disclosure — only present when a compliance record exists. */
  trader?: PublicProfileTrader;
  /** Published storefront summary — only present when a published storefront exists. */
  storefront?: PublicProfileStorefrontSummary;
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
  away?: PublicProfileAway;
  trader?: PublicProfileTrader;
  storefront?: PublicProfileStorefrontSummary;
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
  /** Avatar URL (legacy) — must reference your own upload. Prefer avatarAssetId. */
  avatar?: string | null;
  /** Cover photo URL (legacy) — must reference your own upload. Prefer coverAssetId. */
  coverPhoto?: string | null;
  coverVideo?: string | null;
  /** Verified media asset ID for avatar — backend verifies ownership. */
  avatarAssetId?: string;
  /** Verified media asset ID for cover — backend verifies ownership. */
  coverAssetId?: string;
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
  return {
    user: response.user,
    stats: response.stats,
    viewer: response.viewer,
    away: response.away,
    trader: response.trader,
    storefront: response.storefront,
  };
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

// ── Appeal (DSA Article 20) ───────────────────────────────────────────

export interface DecisionSummary {
  id: string;
  decision: string;
  userReasonCode: string;
  summary: string;
  decidedAt: string;
  durationKind: 'permanent' | 'temporary';
  durationUntil: string | null;
  withinComplaintWindow: boolean;
}

export async function fetchDecisionSummary(decisionId: string): Promise<DecisionSummary> {
  const response = await fetchJson<{ ok: boolean; decision: DecisionSummary }>(
    `/appeals/${encodeURIComponent(decisionId)}`,
    { method: 'GET' },
  );
  return response.decision;
}

export async function appealDecisionOnApi(
  decisionId: string,
  grounds: string,
  evidenceUris?: string[],
): Promise<{ ok: boolean; appealId: string }> {
  const body: Record<string, unknown> = { decisionId, grounds };
  if (evidenceUris && evidenceUris.length > 0) body.evidence_uris = evidenceUris;
  return fetchJson<{ ok: boolean; appealId: string }>('/appeals', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ── Report ───────────────────────────────────────────────────────────

export type ReportReason =
  | 'spam'
  | 'inappropriate'
  | 'counterfeit'
  | 'unresponsive'
  | 'harassment'
  | 'off_platform'
  | 'hate_speech'
  | 'prohibited'
  | 'scam'
  | 'misinformation'
  | 'privacy'
  | 'impersonation'
  | 'minor_safety'
  | 'other';

export async function reportUser(
  userId: string,
  reason: ReportReason,
  details?: string,
  evidenceUris?: string[]
): Promise<{ reportId: string }> {
  const response = await fetchJson<{ ok: boolean; reportId: string }>(
    `/users/${encodeURIComponent(userId)}/report`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, details: details ?? undefined, evidence_uris: evidenceUris }),
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
  /** Whether the authenticated viewer currently follows this user. */
  isFollowing?: boolean;
  /** Whether the viewer and this user follow each other (mutual). */
  isMutual?: boolean;
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
  /** Present on authenticated search responses; optional for local adapters. */
  isFollowing?: boolean;
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
