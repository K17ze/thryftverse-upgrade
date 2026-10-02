/**
 * Web users service — mirrors frontend/src/services/profileApi.ts,
 * accountApi.ts and the reviews/transactions fragments of commerceApi.ts.
 */

import { ApiRequestError, fetchJson } from '../http';
import {
  mapPublicProfileToUser,
  mapReviewRow,
  mapUserSearchRowToUser,
  type PublicProfileAggregateApi,
  type UserTransactionApi,
} from '../mappers';
import type { Review, Transaction, User } from '@/lib/contracts/domain';

export interface PublicProfile {
  user: User;
  isSelf: boolean;
  isFollowing: boolean;
  canMessage: boolean;
  isBlocked: boolean;
  isMuted: boolean;
  isRestricted: boolean;
  canViewSocialContent: boolean;
  canViewShop: boolean;
  /** Server-computed sold total (`stats.soldListingCount`). The closet
   *  grid is paged, so its loaded length can never stand in for this. */
  soldListingCount: number;
  trader: NonNullable<PublicProfileAggregateApi['trader']> | null;
  away: NonNullable<PublicProfileAggregateApi['away']> | null;
  storefront: PublicProfileAggregateApi['storefront'] | null;
}

/** GET /sellers/:sellerId — public seller summary for rails/cards.
 *  Returns the fields SellerCard renders verbatim (rating, reviewCount,
 *  activeListingCount); null when the seller is gone. */
export interface SellerSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  rating: number | null;
  reviewCount: number;
  activeListingCount: number;
  verified: boolean;
}

export async function fetchSellerSummary(
  sellerId: string,
  signal?: AbortSignal,
): Promise<SellerSummary | null> {
  const payload = await fetchJson<{
    ok: boolean;
    seller?: {
      id?: string;
      username?: string;
      displayName?: string | null;
      avatar?: string | null;
      rating?: number | null;
      reviewCount?: number | null;
      activeListingCount?: number | null;
      verified?: boolean;
    };
  }>(`/sellers/${encodeURIComponent(sellerId)}`, undefined, { signal });
  const s = payload.seller;
  if (!payload.ok || !s?.id || !s.username) return null;
  return {
    id: String(s.id),
    username: s.username,
    displayName: s.displayName ?? null,
    avatar: s.avatar ?? null,
    rating: typeof s.rating === 'number' ? s.rating : null,
    reviewCount: typeof s.reviewCount === 'number' ? s.reviewCount : 0,
    activeListingCount:
      typeof s.activeListingCount === 'number' ? s.activeListingCount : 0,
    verified: s.verified === true,
  };
}

/** `/users/:id/profile` envelope is flat — `{ ok, user, stats, viewer,
 *  trader, away, storefront }`, not wrapped under `profile`. */
type ProfileEnvelope = { ok: boolean } & PublicProfileAggregateApi;

function readProfileEnvelope(
  payload: ProfileEnvelope,
): PublicProfileAggregateApi | null {
  return payload.ok && payload.user?.id ? payload : null;
}

export async function fetchUserProfile(
  userId: string,
  signal?: AbortSignal,
): Promise<User | null> {
  const payload = await fetchJson<ProfileEnvelope>(
    `/users/${encodeURIComponent(userId)}/profile`,
    undefined,
    { signal },
  );
  const agg = readProfileEnvelope(payload);
  return agg ? mapPublicProfileToUser(agg) : null;
}

export async function fetchUserProfileAggregate(
  userId: string,
  signal?: AbortSignal,
): Promise<PublicProfile | null> {
  const payload = await fetchJson<ProfileEnvelope>(
    `/users/${encodeURIComponent(userId)}/profile`,
    undefined,
    { signal },
  );
  const agg = readProfileEnvelope(payload);
  if (!agg) return null;
  const viewer = agg.viewer;
  return {
    user: mapPublicProfileToUser(agg),
    isSelf: viewer?.isSelf ?? false,
    isFollowing: viewer?.isFollowing ?? false,
    canMessage: viewer?.canMessage ?? false,
    isBlocked: viewer?.isBlocked ?? false,
    isMuted: viewer?.isMuted ?? false,
    isRestricted: viewer?.isRestricted ?? false,
    canViewSocialContent: viewer?.canViewSocialContent ?? true,
    canViewShop: viewer?.canViewShop ?? true,
    soldListingCount: agg.stats?.soldListingCount ?? 0,
    trader: agg.trader ?? null,
    away: agg.away ?? null,
    storefront: agg.storefront ?? null,
  };
}

export async function fetchUserByUsername(
  username: string,
  signal?: AbortSignal,
): Promise<User | null> {
  const payload = await fetchJson<{ ok: boolean; user?: { id: string } }>(
    `/users/by-username/${encodeURIComponent(username)}`,
    undefined,
    { signal },
  );
  if (!payload.ok || !payload.user?.id) return null;
  return fetchUserProfile(payload.user.id, signal);
}

export async function searchUsers(
  query: string,
  signal?: AbortSignal,
): Promise<User[]> {
  const q = encodeURIComponent(query);
  // q ≥ 2 + auth required (users.ts) — callers gate on both; limit caps at 20.
  const payload = await fetchJson<{
    ok?: boolean;
    items?: Array<{
      id: string;
      username: string;
      displayName?: string | null;
      avatar?: string | null;
      identityVerified?: boolean;
      emailVerified?: boolean;
    }>;
  }>(`/users/search?q=${q}&limit=20`, undefined, { signal });
  return (payload.items ?? []).map(mapUserSearchRowToUser);
}

/** Server-computed review aggregate — the authoritative score over ALL
 *  eligible reviews (auto rows excluded from the average, included in
 *  the count). Never recompute this client-side over a loaded page. */
export interface SellerReviewSummary {
  ratingAverage: number | null;
  reviewCount: number;
  eligibleCount: number;
  distribution: { rating: number; count: number }[];
  asOf: string | null;
}

export interface UserReviewsResult {
  reviews: Review[];
  summary: SellerReviewSummary | null;
}

export async function fetchUserReviews(
  userId: string,
  signal?: AbortSignal,
): Promise<UserReviewsResult> {
  const payload = await fetchJson<{
    ok?: boolean;
    items?: Parameters<typeof mapReviewRow>[0][];
    reviews?: Parameters<typeof mapReviewRow>[0][];
    summary?: {
      ratingAverage?: number | null;
      reviewCount?: number;
      eligibleCount?: number;
      distribution?: { rating: number; count: number }[];
      asOf?: string | null;
    } | null;
  }>(
    `/sellers/${encodeURIComponent(userId)}/reviews`,
    undefined,
    { signal },
  );
  const s = payload.summary;
  return {
    reviews: (payload.items ?? payload.reviews ?? []).map(mapReviewRow),
    summary: s
      ? {
          ratingAverage: typeof s.ratingAverage === 'number' ? s.ratingAverage : null,
          reviewCount: s.reviewCount ?? 0,
          eligibleCount: s.eligibleCount ?? 0,
          distribution: s.distribution ?? [],
          asOf: s.asOf ?? null,
        }
      : null,
  };
}

// ── Self profile mutations (profileApi.ts updateUserProfile) ────────────────
// Settings-scoped writes against /users/me — the account-contact edit in
// settings → Personal info uses this; public profile fields go through the
// same endpoint on mobile.

export interface UpdateMyProfileInput {
  displayName?: string;
  username?: string;
  bio?: string;
  location?: string;
  website?: string;
  pronouns?: string;
  /** Contact phone — editable from settings → Personal info. */
  phone?: string;
  avatar?: string | null;
  /** Profile cover image — URL or finalized upload URL (PATCH /users/me). */
  coverPhoto?: string | null;
}

export async function updateMyProfile(input: UpdateMyProfileInput): Promise<void> {
  await fetchJson('/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

// ── Follow / mute / block (accountApi.ts) ────────────────────────────────────

async function postUserAction(userId: string, action: string): Promise<void> {
  await fetchJson(`/users/${encodeURIComponent(userId)}/${action}`, {
    method: 'POST',
  });
}

async function deleteUserAction(userId: string, action: string): Promise<void> {
  await fetchJson(`/users/${encodeURIComponent(userId)}/${action}`, {
    method: 'DELETE',
  });
}

export function followUser(userId: string) {
  return postUserAction(userId, 'follow');
}
export function unfollowUser(userId: string) {
  return deleteUserAction(userId, 'follow');
}
export function muteUser(userId: string) {
  return postUserAction(userId, 'mute');
}
export function unmuteUser(userId: string) {
  return deleteUserAction(userId, 'mute');
}
export function blockUser(userId: string) {
  return postUserAction(userId, 'block');
}
/** POST /users/:id/unblock — the backend's unblock is a POST (mobile
 *  parity); there is no DELETE /users/:id/block route. */
export function unblockUser(userId: string) {
  return postUserAction(userId, 'unblock');
}

/** Restrict / unrestrict — the silent graduated-moderation rung
 *  (backend/api/src/routes/users.ts POST|DELETE /users/:id/restrict).
 *  Restricted members' messages route to requests; they aren't told. */
export function restrictUser(userId: string) {
  return postUserAction(userId, 'restrict');
}
export function unrestrictUser(userId: string) {
  return deleteUserAction(userId, 'restrict');
}

/** GET /users/me/blocked-users — the viewer's blocked list (mobile
 *  getBlockedUsers). The platform enforces blocks server-side; this list
 *  is the management surface's truth. */
export interface BlockedUserEntry {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
  reason: string | null;
}

export async function fetchBlockedUsers(
  signal?: AbortSignal,
): Promise<BlockedUserEntry[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: BlockedUserEntry[] }>(
    '/users/me/blocked-users',
    undefined,
    { signal },
  );
  return payload.items ?? [];
}

export async function fetchFollowingIds(userId: string, signal?: AbortSignal): Promise<string[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: Array<{ id: string }>; ids?: string[] }>(
    `/users/${encodeURIComponent(userId)}/following`,
    undefined,
    { signal },
  );
  if (Array.isArray(payload.ids)) return payload.ids;
  return (payload.items ?? []).map((i) => i.id);
}

// ── Follow lists (mobile profileApi.fetchFollowers / fetchFollowing) ──────────

export interface FollowListUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  /** Whether the authenticated viewer currently follows this row. */
  isFollowing?: boolean;
  /** Whether the viewer and this row follow each other. Declared for
   *  contract parity with mobile; the backend doesn't emit it yet. */
  isMutual?: boolean;
  /** Verified marker — absent today; readers must stay fail-closed. */
  isVerified?: boolean;
}

async function fetchFollowList(
  userId: string,
  kind: 'followers' | 'following',
  cursor?: string,
  signal?: AbortSignal,
): Promise<{ items: FollowListUser[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: '40' });
  if (cursor) params.set('cursor', cursor);
  const payload = await fetchJson<{ items?: FollowListUser[]; nextCursor?: string | null }>(
    `/users/${encodeURIComponent(userId)}/${kind}?${params.toString()}`,
    undefined,
    { signal },
  );
  return { items: payload.items ?? [], nextCursor: payload.nextCursor ?? null };
}

export function fetchFollowers(userId: string, cursor?: string, signal?: AbortSignal) {
  return fetchFollowList(userId, 'followers', cursor, signal);
}

export function fetchFollowingList(userId: string, cursor?: string, signal?: AbortSignal) {
  return fetchFollowList(userId, 'following', cursor, signal);
}

// ── Privacy consent (mobile consentApi.ts — GET/PATCH /users/me/consent) ─────

/** Wire consent record — the backend's `user_privacy_consents` row verbatim.
 *  Mind the polarity: `analyticsOptOut` is opt-OUT, while the web settings
 *  matrix's `analytics` flag is opt-IN — reconcile through
 *  `wirePrivacyConsent`/`syncDataConsent` in lib/store/settingsPrefs. */
export interface PrivacyConsent {
  personalisedAds: boolean;
  recommendationPersonalisation: boolean;
  partnerSharing: boolean;
  analyticsOptOut: boolean;
  updatedAt: string | null;
}

const EMPTY_CONSENT: PrivacyConsent = {
  personalisedAds: false,
  recommendationPersonalisation: true,
  partnerSharing: false,
  analyticsOptOut: false,
  updatedAt: null,
};

/** GET /users/me/consent — the account's recorded privacy choices. The
 *  route returns defaults (no row written yet) rather than 404. */
export async function fetchPrivacyConsent(signal?: AbortSignal): Promise<PrivacyConsent> {
  const payload = await fetchJson<{ ok: boolean; consent?: PrivacyConsent }>(
    '/users/me/consent',
    undefined,
    { signal },
  );
  return payload.consent ?? EMPTY_CONSENT;
}

/** PATCH /users/me/consent — the route writes EVERY column on each call
 *  (omitted fields reset to schema defaults, they are not preserved), so
 *  the body must be the full projection of the member's choices. Returns
 *  the stored row. */
export async function updatePrivacyConsent(
  consent: Omit<PrivacyConsent, 'updatedAt'>,
): Promise<PrivacyConsent> {
  const payload = await fetchJson<{ ok: boolean; consent?: PrivacyConsent }>(
    '/users/me/consent',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(consent),
    },
  );
  return payload.consent ?? { ...consent, updatedAt: null };
}

// ── GDPR data export (mobile accountApi.ts requestMyDataExport) ─────────────

/** GET /users/me/export — synchronous: the route assembles the full
 *  account snapshot (profile, addresses, orders, listings, messages,
 *  wallets, consents…) inside one transaction and returns it inline under
 *  `export`. The POST /users/me/export/async + GET /users/me/export/:id
 *  pair exists for queued delivery, but this surface follows the same
 *  sync path mobile uses. */
export interface MyDataExport {
  requestId: string | null;
  /** The assembled GDPR snapshot — the JSON document to download. */
  export: Record<string, unknown>;
}

export async function fetchMyDataExport(signal?: AbortSignal): Promise<MyDataExport> {
  const payload = await fetchJson<{
    ok: boolean;
    requestId?: string;
    export?: Record<string, unknown>;
  }>(
    '/users/me/export',
    undefined,
    // The snapshot assembles ~20 tables inside one transaction — allow a
    // longer window than the transport default and don't auto-retry (each
    // attempt re-runs the whole assembly).
    { signal, maxRetries: 0, timeoutMs: 60_000 },
  );
  if (!payload.export) {
    throw new ApiRequestError('Export payload missing from the server response');
  }
  return { requestId: payload.requestId ?? null, export: payload.export };
}

// ── Account deletion (mobile accountApi.ts requestAccountDeletion) ──────────

/** OAuth re-auth proof for passwordless accounts — the backend verifies
 *  `identityToken` against auth_oauth_identities. The web client has no
 *  provider-token flow, so OAuth-only accounts receive the server's
 *  OAUTH_REAUTH_REQUIRED error verbatim. Declared for contract parity. */
export interface DeleteAccountOauthProof {
  provider: 'google' | 'apple';
  identityToken: string;
}

export interface DeleteMyAccountInput {
  /** Exact phrase — the backend rejects anything but 'DELETE'. */
  confirmPhrase: string;
  /** Re-auth proof for credential accounts (password_hash present). */
  password?: string;
  /** Required when the account has two_factor_enabled. */
  totpCode?: string;
  reason?: string;
  oauth?: DeleteAccountOauthProof;
}

/** DELETE /users/me — server-verified re-auth (password or OAuth proof,
 *  plus a TOTP code when two-factor is on), then real GDPR erasure:
 *  personal data is anonymised, listings are pulled, every session is
 *  revoked. Failure modes the caller surfaces verbatim: 403 'Password
 *  verification failed', 403 'Two-factor authentication code is
 *  required'/'Invalid…', 400 OAUTH_REAUTH_REQUIRED, 409 'Account has
 *  unresolved orders, returns, or payouts' (+ `blockers`). */
export async function deleteMyAccount(
  input: DeleteMyAccountInput,
): Promise<{ requestId: string | null; message: string | null }> {
  const payload = await fetchJson<{ ok: boolean; requestId?: string; message?: string }>(
    '/users/me',
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmPhrase: input.confirmPhrase,
        reason: input.reason?.trim() || undefined,
        password: input.password || undefined,
        totpCode: input.totpCode?.trim() || undefined,
        oauth: input.oauth,
      }),
    },
  );
  return { requestId: payload.requestId ?? null, message: payload.message ?? null };
}

// ── Wallet transactions (commerceApi.ts listUserTransactions) ────────────────

export async function fetchUserTransactions(
  userId: string,
  signal?: AbortSignal,
): Promise<Transaction[]> {
  const payload = await fetchJson<{ ok: true; total: number; items: UserTransactionApi[] }>(
    `/users/${encodeURIComponent(userId)}/transactions?limit=50&offset=0`,
    undefined,
    { signal },
  );
  return (payload.items ?? []).map((t) => ({
    id: t.id,
    type: t.type as Transaction['type'],
    amount: t.amount,
    status: t.status as Transaction['status'],
    date: t.createdAt,
    description: t.description ?? '',
  }));
}

// ── Muted / restricted lists (profileApi getMutedUsers / getRestrictedUsers) ──
// Graduated-moderation management lists. Unlike blocked-users (`items`),
// both endpoints answer `{ ok, users: [...] }` rows straight off
// user_relationship_states.

export interface MutedUserEntry {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  mutedAt: string;
}

export async function fetchMutedUsers(
  signal?: AbortSignal,
): Promise<MutedUserEntry[]> {
  const payload = await fetchJson<{ ok?: boolean; users?: MutedUserEntry[] }>(
    '/users/me/muted-users',
    undefined,
    { signal },
  );
  return payload.users ?? [];
}

export interface RestrictedUserEntry {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  restrictedAt: string;
}

export async function fetchRestrictedUsers(
  signal?: AbortSignal,
): Promise<RestrictedUserEntry[]> {
  const payload = await fetchJson<{ ok?: boolean; users?: RestrictedUserEntry[] }>(
    '/users/me/restricted-users',
    undefined,
    { signal },
  );
  return payload.users ?? [];
}

// ── Privacy preferences (accountApi fetchPrivacyPreferences /
//    updateActivityStatus / updateSearchVisibility / privateProfile) ──

export interface PrivacyPreferences {
  activityStatusVisible: boolean;
  searchVisibility: 'visible' | 'hidden';
}

/** GET /users/me/privacy-preferences — hydrates the privacy screen's
 *  activity-status and search-visibility switches. */
export async function fetchPrivacyPreferences(
  signal?: AbortSignal,
): Promise<PrivacyPreferences> {
  const payload = await fetchJson<{ ok: boolean; privacyPreferences: PrivacyPreferences }>(
    '/users/me/privacy-preferences',
    undefined,
    { signal },
  );
  return payload.privacyPreferences;
}

/** PATCH /users/me/activity-status — toggling off tears down live
 *  presence server-side; returns the stored posture. */
export async function updateActivityStatus(visible: boolean): Promise<boolean> {
  const payload = await fetchJson<{ ok: true; activityStatusVisible: boolean }>(
    '/users/me/activity-status',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible }),
    },
  );
  return payload.activityStatusVisible;
}

/** PATCH /users/me/search-visibility — 'visible' | 'hidden'. */
export async function updateSearchVisibility(
  visibility: 'visible' | 'hidden',
): Promise<'visible' | 'hidden'> {
  const payload = await fetchJson<{ ok: true; searchVisibility: 'visible' | 'hidden' }>(
    '/users/me/search-visibility',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    },
  );
  return payload.searchVisibility;
}

/** PATCH /users/me/preferences { privateProfile } — a private profile
 *  hides the closet, looks, boards and stats from non-followers
 *  (canViewSocialContent in the profile aggregate). Rides the shared
 *  account-preferences endpoint; declared here because the seller-hub
 *  update input only covers the away fields. */
export async function updatePrivateProfile(privateProfile: boolean): Promise<void> {
  await fetchJson('/users/me/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ privateProfile }),
  });
}

// ── Chat privacy (accountApi fetchChatPrivacy / updateChatPrivacy) ──
// GET/PATCH /users/me/chat-privacy — allowMessagesFrom is the
// server-enforced DM gate the messaging settings surface owns.

export interface ChatPrivacySettings {
  readReceiptsEnabled: boolean;
  allowMessagesFrom: 'everyone' | 'following' | 'nobody';
  offersInChatEnabled: boolean;
  orderUpdatesInChatEnabled: boolean;
}

export async function fetchChatPrivacy(
  signal?: AbortSignal,
): Promise<ChatPrivacySettings> {
  const payload = await fetchJson<{ ok: true; chatPrivacy: ChatPrivacySettings }>(
    '/users/me/chat-privacy',
    undefined,
    { signal },
  );
  return payload.chatPrivacy;
}

export async function updateChatPrivacy(
  updates: Partial<ChatPrivacySettings>,
): Promise<ChatPrivacySettings> {
  const payload = await fetchJson<{ ok: true; chatPrivacy: ChatPrivacySettings }>(
    '/users/me/chat-privacy',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    },
  );
  return payload.chatPrivacy;
}

// ── Postage defaults (accountApi fetchPostagePreferences /
//    updateUserPostagePreferences) ──
// GET/PATCH /users/me/postage — the seller shipping defaults applied to
// new listings.

export interface PostagePreferences {
  carrierKey: string;
  freeShipping: boolean;
  bundleDiscount: boolean;
}

export interface UpdatePostagePreferencesInput {
  carrierKey?: string;
  freeShipping?: boolean;
  bundleDiscount?: boolean;
}

export async function fetchPostagePreferences(
  signal?: AbortSignal,
): Promise<PostagePreferences> {
  const payload = await fetchJson<{ ok: true; postage: PostagePreferences }>(
    '/users/me/postage',
    undefined,
    { signal },
  );
  return payload.postage;
}

export async function updatePostagePreferences(
  input: UpdatePostagePreferencesInput,
): Promise<PostagePreferences> {
  const payload = await fetchJson<{ ok: true; postage: PostagePreferences }>(
    '/users/me/postage',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return payload.postage;
}

// ── Country capabilities (capabilitiesApi getUserCountryCapabilities) ──
// GET /users/:userId/capabilities — the route resolves the actor against
// the authenticated session, so callers pass the real user id (the 'me'
// literal would fail the user-context check).

export interface CapabilityCarrier {
  id: string;
  label: string;
  priceFromGbp: number;
  etaMinDays: number;
  etaMaxDays: number;
  tracking: boolean;
}

export interface CountryCapabilities {
  countryCode: string;
  effectiveCountryCode: string;
  postage: { carriers: CapabilityCarrier[] };
}

export async function fetchCountryCapabilities(
  userId: string,
  signal?: AbortSignal,
): Promise<CountryCapabilities | null> {
  const payload = await fetchJson<{
    ok?: boolean;
    capabilities?: CountryCapabilities;
  }>(`/users/${encodeURIComponent(userId)}/capabilities`, undefined, { signal });
  return payload.capabilities ?? null;
}

// ── Email notification preferences (accountApi.ts EmailPreferences) ─────────
// GET/PUT /users/me/email-preferences — the account's per-category email
// posture. The email wire is finer than push: the notification matrix maps
// onto it via EMAIL_PREF_WIRE_FIELD in lib/store/settingsPrefs.

export interface EmailPreferences {
  orderUpdates: boolean;
  messageNotifications: boolean;
  priceDropAlerts: boolean;
  newListingsFromFollowing: boolean;
  auctionAlerts: boolean;
  marketing: boolean;
  securityAlerts: boolean;
  distributionNotices: boolean;
  corporateActionNotices: boolean;
}

/** Absent fields fall back to the route's documented defaults (all on
 *  except marketing) — the GET always emits the full map, this just
 *  keeps an older deploy honest. */
export async function fetchEmailPreferences(
  signal?: AbortSignal,
): Promise<EmailPreferences> {
  const payload = await fetchJson<{
    ok: boolean;
    preferences?: Partial<Record<keyof EmailPreferences, unknown>>;
  }>('/users/me/email-preferences', undefined, { signal });
  const p = payload.preferences ?? {};
  return {
    orderUpdates: p.orderUpdates !== false,
    messageNotifications: p.messageNotifications !== false,
    priceDropAlerts: p.priceDropAlerts !== false,
    newListingsFromFollowing: p.newListingsFromFollowing !== false,
    auctionAlerts: p.auctionAlerts !== false,
    marketing: p.marketing === true,
    securityAlerts: p.securityAlerts !== false,
    distributionNotices: p.distributionNotices !== false,
    corporateActionNotices: p.corporateActionNotices !== false,
  };
}

export async function updateEmailPreferences(
  updates: Partial<EmailPreferences>,
): Promise<void> {
  await fetchJson<{ ok: boolean }>('/users/me/email-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

// ── Personalisation (accountApi.ts updateUserPersonalisation) ───────────────
// GET/PATCH /users/me/personalisation — account-carried feed
// personalisation. Every field is optional in both directions; the GET
// sanitizes so a never-written account (NULL columns) resolves to a
// partial instead of lying about types.

export interface MyPersonalisation {
  genderFilter?: string[];
  categoriesAndSizesPref?: string;
  brandsPref?: string;
  membersPref?: string;
}

export async function fetchMyPersonalisation(
  signal?: AbortSignal,
): Promise<MyPersonalisation> {
  const payload = await fetchJson<{
    ok: boolean;
    personalisation?: Partial<Record<keyof MyPersonalisation, unknown>>;
  }>('/users/me/personalisation', undefined, { signal });
  const p = payload.personalisation ?? {};
  const out: MyPersonalisation = {};
  if (Array.isArray(p.genderFilter)) {
    out.genderFilter = p.genderFilter.filter(
      (g): g is string => typeof g === 'string',
    );
  }
  if (typeof p.categoriesAndSizesPref === 'string' && p.categoriesAndSizesPref) {
    out.categoriesAndSizesPref = p.categoriesAndSizesPref;
  }
  if (typeof p.brandsPref === 'string' && p.brandsPref) {
    out.brandsPref = p.brandsPref;
  }
  if (typeof p.membersPref === 'string' && p.membersPref) {
    out.membersPref = p.membersPref;
  }
  return out;
}

export async function updateMyPersonalisation(
  input: MyPersonalisation,
): Promise<void> {
  await fetchJson<{ ok: boolean }>('/users/me/personalisation', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

// ── Sustainability preferences (impactApi.ts) ───────────────────────────────
// GET/PUT /users/me/sustainability-preferences — account-level goals and
// display toggles. The GET emits a flat payload (no `ok` envelope) and the
// route returns server defaults when the account has no row.
// Note: the PUT upserts with COALESCE — a null target is treated as
// "keep existing", so clearing a goal can't round-trip (mobile parity).

export interface SustainabilityPreferences {
  carbonTargetKg: number | null;
  ratioTargetPct: number | null;
  plasticFreePackaging: boolean;
  showBadges: boolean;
  trackImpact: boolean;
  localFirst: boolean;
}

export async function fetchSustainabilityPreferences(
  signal?: AbortSignal,
): Promise<SustainabilityPreferences> {
  const payload = await fetchJson<Partial<SustainabilityPreferences>>(
    '/users/me/sustainability-preferences',
    undefined,
    { signal },
  );
  return {
    carbonTargetKg:
      typeof payload.carbonTargetKg === 'number' ? payload.carbonTargetKg : null,
    ratioTargetPct:
      typeof payload.ratioTargetPct === 'number' ? payload.ratioTargetPct : null,
    plasticFreePackaging: payload.plasticFreePackaging !== false,
    showBadges: payload.showBadges !== false,
    trackImpact: payload.trackImpact !== false,
    localFirst: payload.localFirst === true,
  };
}

export async function updateSustainabilityPreferences(
  prefs: Partial<SustainabilityPreferences>,
): Promise<void> {
  await fetchJson<{ ok: boolean }>('/users/me/sustainability-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
}

// ── Locale (PATCH /users/me/locale) ─────────────────────────────────────────
// Account-carried language/currency/region. The locale store fires this as
// a best-effort mirror — the device choice applies first, the write just
// keeps the account's other devices in step.

export interface MyLocaleUpdate {
  locale?: string;
  currencyCode?: string;
  regionCode?: string;
}

export async function updateMyLocale(input: MyLocaleUpdate): Promise<void> {
  await fetchJson<{ ok: boolean }>('/users/me/locale', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

// ── Report user (profileApi.ts reportUser) ───────────────────────────────
// POST /users/:userId/report — the consumer-report write that bridges into
// the safety case graph via recordConsumerReport (routes/users.ts). The
// reason enum is the shared 14-value vocabulary; `idempotencyKey` dedupes
// a retried submit to the original report row server-side.

export type UserReportReason =
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
  input: {
    reason: UserReportReason;
    details?: string;
    idempotencyKey?: string;
  },
): Promise<{ reportId: string; noticeId?: string }> {
  const payload = await fetchJson<{
    ok: boolean;
    reportId?: string;
    noticeId?: string;
  }>(`/users/${encodeURIComponent(userId)}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: input.reason,
      details: input.details?.trim() ? input.details.trim() : undefined,
      idempotencyKey: input.idempotencyKey,
    }),
  });
  if (!payload.ok || !payload.reportId) {
    throw new Error('Report was not submitted');
  }
  return { reportId: payload.reportId, noticeId: payload.noticeId };
}

// ── Report review (reviewApi.ts reportReview) ────────────────────────────
// POST /reviews/:reviewId/report — reviews carry their own reason enum
// (routes/supportReviews.ts); a repeat report from the same account is a
// 409 the caller surfaces verbatim.

export type ReviewReportReason =
  | 'fake_or_incentivized'
  | 'harmful_or_abusive'
  | 'personal_data'
  | 'spam'
  | 'off_topic'
  | 'other';

export async function reportReview(
  reviewId: string,
  input: { reason: ReviewReportReason; details?: string },
): Promise<{ reportId: string }> {
  const payload = await fetchJson<{ ok: boolean; reportId?: string }>(
    `/reviews/${encodeURIComponent(reviewId)}/report`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: input.reason,
        details: input.details?.trim() ? input.details.trim() : undefined,
      }),
    },
  );
  if (!payload.ok || !payload.reportId) {
    throw new Error('Report was not submitted');
  }
  return { reportId: payload.reportId };
}
