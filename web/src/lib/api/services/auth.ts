/**
 * Web auth service — mirrors frontend/src/services/authApi.ts.
 * Persists the refresh-token session via the web transport (localStorage)
 * and maps `/auth/me` users onto the web `User` contract.
 */

import {
  ApiRequestError,
  clearAuthSession,
  fetchJson,
  getAuthSession,
  parseApiError,
  setAuthSession,
} from '../http';
import type { User } from '@/lib/contracts/domain';
import { mapProfileUserToUser, type ProfileUserApi } from '../mappers';

// ── Wire payloads (identical to mobile authApi) ──────────────────────────────

interface AuthTokenPayload {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresInSeconds?: number;
  refreshTokenExpiresAt?: string;
}

export interface AuthUserApi {
  id: string;
  username: string;
  email?: string | null;
  displayName?: string | null;
  emailVerified?: boolean;
  identityVerified?: boolean;
  sellerVerified?: boolean;
  role?: string;
}

interface AuthResponse {
  ok: boolean;
  user?: AuthUserApi;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresInSeconds?: number;
  refreshTokenExpiresAt?: string;
}

export interface AuthSession {
  user: AuthUserApi;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds?: number;
  refreshTokenExpiresAt?: string;
}

function friendlyAuthError(error: unknown): string {
  const parsed = parseApiError(error);
  const msg = (parsed.message ?? '').toLowerCase();
  if (parsed.code === 'INVALID_CREDENTIALS' || msg.includes('invalid credentials')) {
    return 'Incorrect email or password.';
  }
  if (parsed.code === 'EMAIL_TAKEN' || parsed.code === 'USERNAME_TAKEN' || msg.includes('already')) {
    return 'That email or username is already taken.';
  }
  if (parsed.status === 429 || msg.includes('rate')) {
    return 'Too many attempts. Try again in a moment.';
  }
  if (parsed.isNetworkError) {
    return 'Could not reach the server. Check your connection.';
  }
  return parsed.message || 'Something went wrong. Please try again.';
}

async function persistTokens(t: AuthTokenPayload, userId?: string) {
  if (typeof t.accessToken !== 'string' || typeof t.refreshToken !== 'string') {
    throw new ApiRequestError('Auth response missing tokens');
  }
  await setAuthSession({
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    accessTokenExpiresInSeconds: t.accessTokenExpiresInSeconds,
    refreshTokenExpiresAt: t.refreshTokenExpiresAt,
    userId,
  });
}

function toAuthSession(r: AuthResponse): AuthSession {
  if (!r.ok || !r.user || typeof r.accessToken !== 'string' || typeof r.refreshToken !== 'string') {
    throw new ApiRequestError('Auth response incomplete');
  }
  return {
    user: r.user,
    accessToken: r.accessToken,
    refreshToken: r.refreshToken,
    accessTokenExpiresInSeconds: r.accessTokenExpiresInSeconds,
    refreshTokenExpiresAt: r.refreshTokenExpiresAt,
  };
}

export async function login(input: { email: string; password: string }): Promise<AuthSession> {
  try {
    const res = await fetchJson<AuthResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const session = toAuthSession(res);
    await persistTokens(session, session.user.id);
    return session;
  } catch (e) {
    throw new Error(friendlyAuthError(e));
  }
}

export async function signup(input: {
  email: string;
  password: string;
  username: string;
}): Promise<AuthSession> {
  try {
    const res = await fetchJson<AuthResponse>('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const session = toAuthSession(res);
    await persistTokens(session, session.user.id);
    return session;
  } catch (e) {
    throw new Error(friendlyAuthError(e));
  }
}

export async function logout(): Promise<void> {
  try {
    const session = await getAuthSession();
    if (session?.refreshToken) {
      await fetchJson('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    }
  } catch {
    // best-effort — the local session is dropped regardless
  } finally {
    await clearAuthSession();
  }
}

/** Fetch the authenticated user's profile — `/users/me` is the richer
 *  profile surface; falls back to `/auth/me` for identity when needed. */
export async function fetchMe(signal?: AbortSignal): Promise<User | null> {
  const session = await getAuthSession();
  if (!session?.accessToken) return null;
  try {
    const res = await fetchJson<{ ok: boolean; user?: ProfileUserApi }>(
      '/users/me',
      undefined,
      { signal, maxRetries: 0 },
    );
    if (res.ok && res.user) {
      if (!session.userId && res.user.id) {
        await setAuthSession({ ...session, userId: res.user.id });
      }
      return mapProfileUserToUser(res.user);
    }
    return null;
  } catch (e) {
    const parsed = parseApiError(e);
    if (parsed.status === 401) return null;
    throw e;
  }
}

export async function requestMagicLink(email: string): Promise<void> {
  await fetchJson('/auth/magic-link/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function consumeMagicLink(token: string): Promise<AuthSession> {
  const res = await fetchJson<AuthResponse>('/auth/magic-link/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const session = toAuthSession(res);
  await persistTokens(session, session.user.id);
  return session;
}

export async function requestOtp(email: string): Promise<void> {
  await fetchJson('/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function verifyOtp(email: string, code: string): Promise<AuthSession> {
  const res = await fetchJson<AuthResponse>('/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const session = toAuthSession(res);
  await persistTokens(session, session.user.id);
  return session;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await fetchJson('/auth/password-reset/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  await fetchJson('/auth/password-reset/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await fetchJson('/auth/password/change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
