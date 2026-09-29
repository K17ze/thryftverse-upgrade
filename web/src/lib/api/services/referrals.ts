/**
 * Web referrals service — mirrors frontend/src/services/referralsApi.ts.
 *
 * The referral code is server-owned: GET /users/:id/referral-code is a
 * get-or-create (`ensureReferralCode`) so the code is durable, unique and
 * attributable. The web client never mints one locally — a client-derived
 * code cannot attribute signups, so a fetch failure surfaces as an
 * unavailable state, never a fabricated code.
 */

import { fetchJson, getAuthSession } from '../http';

export interface ReferralStats {
  invited: number;
  joined: number;
  rewarded: number;
  creditsBalance: number;
}

/** GET /users/:id/referrals row — shares are not server-observable, so
 *  every row is an attributed join ('joined'); joinedAt is the display
 *  date and there is no reward amount until a reward ledger exists. */
export interface ReferralHistoryItem {
  id: string;
  username: string | null;
  status: 'joined';
  joinedAt: string;
}

/** Resolve the authed user id for self-scoped `/users/:id/*` routes — the
 *  session stores it at login/signup/`fetchMe` (same source commerce.ts
 *  reads). */
async function selfUserId(): Promise<string> {
  const session = await getAuthSession();
  if (!session?.userId) throw new Error('No authenticated user');
  return session.userId;
}

/** GET /users/:id/referral-code → the member's durable code. */
export async function fetchReferralCode(signal?: AbortSignal): Promise<string> {
  const userId = await selfUserId();
  const payload = await fetchJson<{ ok: boolean; code?: string }>(
    `/users/${encodeURIComponent(userId)}/referral-code`,
    undefined,
    { signal },
  );
  if (!payload.ok || typeof payload.code !== 'string' || payload.code.length === 0) {
    throw new Error('Referral code unavailable');
  }
  return payload.code;
}

/** GET /users/:id/referral-stats → real counts from
 *  user_referral_attributions (the server emits invited==joined —
 *  shares are not server-observable). */
export async function fetchReferralStats(signal?: AbortSignal): Promise<ReferralStats> {
  const userId = await selfUserId();
  const payload = await fetchJson<{ ok: boolean } & Partial<ReferralStats>>(
    `/users/${encodeURIComponent(userId)}/referral-stats`,
    undefined,
    { signal },
  );
  if (!payload.ok) throw new Error('Referral stats unavailable');
  return {
    invited: payload.invited ?? 0,
    joined: payload.joined ?? 0,
    rewarded: payload.rewarded ?? 0,
    creditsBalance: payload.creditsBalance ?? 0,
  };
}

/** GET /users/:id/referrals → the attributed signups, newest first. */
export async function fetchReferralHistory(
  signal?: AbortSignal,
): Promise<ReferralHistoryItem[]> {
  const userId = await selfUserId();
  const payload = await fetchJson<{ ok: boolean; items?: ReferralHistoryItem[] }>(
    `/users/${encodeURIComponent(userId)}/referrals`,
    undefined,
    { signal },
  );
  if (!payload.ok || !Array.isArray(payload.items)) {
    throw new Error('Referral history unavailable');
  }
  return payload.items;
}
