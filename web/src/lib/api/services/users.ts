/**
 * Web users service — mirrors frontend/src/services/profileApi.ts,
 * accountApi.ts and the reviews/transactions fragments of commerceApi.ts.
 */

import { fetchJson } from '../http';
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
}

export async function fetchUserProfile(
  userId: string,
  signal?: AbortSignal,
): Promise<User | null> {
  const payload = await fetchJson<{
    ok: boolean;
    profile?: PublicProfileAggregateApi;
  }>(`/users/${encodeURIComponent(userId)}/profile`, undefined, { signal });
  if (!payload.ok || !payload.profile) return null;
  return mapPublicProfileToUser(payload.profile);
}

export async function fetchUserProfileAggregate(
  userId: string,
  signal?: AbortSignal,
): Promise<PublicProfile | null> {
  const payload = await fetchJson<{
    ok: boolean;
    profile?: PublicProfileAggregateApi;
  }>(`/users/${encodeURIComponent(userId)}/profile`, undefined, { signal });
  if (!payload.ok || !payload.profile) return null;
  return {
    user: mapPublicProfileToUser(payload.profile),
    isSelf: payload.profile.viewer?.isSelf ?? false,
    isFollowing: payload.profile.viewer?.isFollowing ?? false,
    canMessage: payload.profile.viewer?.canMessage ?? false,
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
  }>(`/users/search?q=${q}`, undefined, { signal });
  return (payload.items ?? []).map(mapUserSearchRowToUser);
}

export async function fetchUserReviews(
  userId: string,
  signal?: AbortSignal,
): Promise<Review[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: Parameters<typeof mapReviewRow>[0][]; reviews?: Parameters<typeof mapReviewRow>[0][] }>(
    `/sellers/${encodeURIComponent(userId)}/reviews`,
    undefined,
    { signal },
  );
  return (payload.items ?? payload.reviews ?? []).map(mapReviewRow);
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
export function unblockUser(userId: string) {
  return deleteUserAction(userId, 'block');
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
