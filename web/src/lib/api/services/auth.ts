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

// ── Two-factor challenge ─────────────────────────────────────────────────────
// /auth/login, /auth/magic-link/consume and /auth/otp/verify answer with one
// of these codes when the credentials are right but the account demands a
// second factor (TOTP enrolled via settings → security). The UI treats this
// as a challenge step, not a terminal failure — the same set the mobile
// client branches on (loginViewModels.TWO_FACTOR_CHALLENGE_CODES).

const TWO_FACTOR_CHALLENGE_CODES: ReadonlySet<string> = new Set([
  'TWO_FACTOR_REQUIRED',
  'TWO_FACTOR_CODE_REQUIRED',
  'TWO_FACTOR_CODE_INVALID',
  'TWO_FACTOR_NOT_CONFIGURED',
  'RECOVERY_CODE_REQUIRED',
  'RECOVERY_CODE_INVALID',
]);

/** Typed challenge signal — `message` is the server's reason verbatim and
 *  safe to render; `code` is the backend's `body.code`. */
export class TwoFactorChallengeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TwoFactorChallengeError';
    this.code = code;
  }
}

export function isTwoFactorChallengeError(error: unknown): error is TwoFactorChallengeError {
  return error instanceof TwoFactorChallengeError;
}

/** Auth-route failure translation: 2FA codes surface as a typed challenge
 *  error the UI can branch on; everything else keeps the friendly copy. */
function rethrowAuthError(error: unknown): never {
  const parsed = parseApiError(error);
  if (parsed.code && TWO_FACTOR_CHALLENGE_CODES.has(parsed.code)) {
    throw new TwoFactorChallengeError(
      parsed.code,
      parsed.message || 'Two-factor authentication failed',
    );
  }
  throw new Error(friendlyAuthError(error));
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

export interface LoginInput {
  email: string;
  password: string;
  /** Second-step fields — present only on the challenge resubmission after
   *  the server answered TWO_FACTOR_CODE_REQUIRED. Exactly one is sent. */
  twoFactorCode?: string;
  recoveryCode?: string;
}

/** POST /auth/login. Throws `TwoFactorChallengeError` when the account has
 *  2FA enrolled and the code is missing or wrong — retry the same call with
 *  `twoFactorCode` (authenticator) or `recoveryCode` set. */
export async function login(input: LoginInput): Promise<AuthSession> {
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
    rethrowAuthError(e);
  }
}

export async function signup(input: {
  email: string;
  password: string;
  username: string;
  /** Referral code captured from an /invite/[code] link — the server
   *  attributes the signup best-effort (unknown/self codes are ignored).
   *  Optional on the wire; only sent when present (the schema is
   *  additionalProperties:false). */
  referralCode?: string;
}): Promise<AuthSession> {
  try {
    const res = await fetchJson<AuthResponse>('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        input.referralCode
          ? { ...input, referralCode: input.referralCode }
          : { email: input.email, password: input.password, username: input.username },
      ),
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

/** Contact fields `/users/me` carries but the public `User` contract
 *  drops — the settings "Personal info" surface reads them here. Mirrors
 *  the mobile profileApi ProfileUser (email, emailVerified, phone). */
export interface AccountIdentity {
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  /** TOTP enrolment from /users/me — the security surface's 2FA switch. */
  twoFactorEnabled?: boolean;
}

export interface MeResult {
  user: User | null;
  account: AccountIdentity | null;
}

/** Fetch the authenticated user's profile — `/users/me` is the richer
 *  profile surface; falls back to `/auth/me` for identity when needed.
 *  Returns the mapped public `User` plus the private contact fields the
 *  account surfaces need. */
export async function fetchMe(signal?: AbortSignal): Promise<MeResult> {
  const session = await getAuthSession();
  if (!session?.accessToken) return { user: null, account: null };
  try {
    const res = await fetchJson<{
      ok: boolean;
      user?: ProfileUserApi & { phone?: string | null };
    }>('/users/me', undefined, { signal, maxRetries: 0 });
    if (res.ok && res.user) {
      if (!session.userId && res.user.id) {
        await setAuthSession({ ...session, userId: res.user.id });
      }
      return {
        user: mapProfileUserToUser(res.user),
        account: {
          email: res.user.email ?? null,
          emailVerified: res.user.emailVerified === true,
          phone: res.user.phone ?? null,
          twoFactorEnabled: res.user.twoFactorEnabled === true,
        },
      };
    }
    return { user: null, account: null };
  } catch (e) {
    const parsed = parseApiError(e);
    if (parsed.status === 401) return { user: null, account: null };
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

/** POST /auth/magic-link/consume — `{token, email?, twoFactorCode?,
 *  recoveryCode?}`. A 2FA-enabled account answers TWO_FACTOR_REQUIRED and
 *  the link is NOT consumed — retry the same token with a code. */
export async function consumeMagicLink(input: {
  token: string;
  email?: string;
  twoFactorCode?: string;
  recoveryCode?: string;
}): Promise<AuthSession> {
  try {
    const res = await fetchJson<AuthResponse>('/auth/magic-link/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const session = toAuthSession(res);
    await persistTokens(session, session.user.id);
    return session;
  } catch (e) {
    rethrowAuthError(e);
  }
}

export interface OtpChallenge {
  challengeId: string;
  expiresInSeconds: number;
}

/** POST /auth/otp/request — `{email}` → `{challengeId, expiresInSeconds}`.
 *  The challengeId is the verify call's handle; keep it. */
export async function requestOtp(email: string): Promise<OtpChallenge> {
  const res = await fetchJson<{
    ok: boolean;
    challengeId?: string;
    expiresInSeconds?: number;
  }>('/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok || typeof res.challengeId !== 'string' || res.challengeId.length === 0) {
    throw new ApiRequestError('OTP response missing challenge id');
  }
  return {
    challengeId: res.challengeId,
    expiresInSeconds: typeof res.expiresInSeconds === 'number' ? res.expiresInSeconds : 0,
  };
}

/** POST /auth/otp/verify — `{challengeId, code, twoFactorCode?,
 *  recoveryCode?}`. A 2FA-enabled account answers TWO_FACTOR_REQUIRED
 *  without consuming the challenge — retry the same challengeId + code
 *  with a second-factor code attached. */
export async function verifyOtp(input: {
  challengeId: string;
  code: string;
  twoFactorCode?: string;
  recoveryCode?: string;
}): Promise<AuthSession> {
  try {
    const res = await fetchJson<AuthResponse>('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const session = toAuthSession(res);
    await persistTokens(session, session.user.id);
    return session;
  } catch (e) {
    rethrowAuthError(e);
  }
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
