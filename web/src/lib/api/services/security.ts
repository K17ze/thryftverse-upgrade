/**
 * Web security service — mirrors the mobile settings-security surfaces:
 *  - `frontend/src/services/accountSecurityApi.ts` (session inventory)
 *  - `frontend/src/services/accountApi.ts` (connected accounts)
 *  - `frontend/src/services/passkeyApi.ts` (WebAuthn lifecycle)
 *  - `/auth/2fa/*` TOTP enrolment (backend routes/auth.ts)
 *
 * All calls hit the same `/api/v1` endpoints as mobile — session rows and
 * linked OAuth grants are shared across devices, so a session signed out
 * on web loses access on that device and the mobile session list agrees.
 */

import { startRegistration } from '@simplewebauthn/browser';
import { ApiRequestError, fetchJson } from '../http';
import type {
  ConnectedAccount,
  ConnectedAccountsResult,
  PasskeyRecord,
  SecuritySession,
} from '@/lib/contracts/settings';

// ── Session inventory ───────────────────────────────────────────────────────

interface ApiSecuritySession extends SecuritySession {
  userAgent?: string | null;
  isRevoked?: boolean;
}

/** GET /account-security/sessions — server-derives `isCurrent` so the row
 *  the viewer is on is marked without the client guessing. */
export async function fetchSecuritySessions(signal?: AbortSignal): Promise<SecuritySession[]> {
  const payload = await fetchJson<{ ok: boolean; sessions: ApiSecuritySession[] }>(
    '/account-security/sessions',
    undefined,
    { signal },
  );
  return (payload.sessions ?? []).filter((s) => s.isRevoked !== true);
}

/** DELETE /account-security/sessions/:id — revokes that session's refresh
 *  token server-side; the device loses access on its next request. There
 *  is no un-revoke — callers must not offer Undo for live revocations. */
export async function revokeSecuritySession(sessionId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/account-security/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
}

/** POST /account-security/sessions/revoke-others — keeps only the caller's
 *  session. Same semantics as mobile "Sign out all other sessions". */
export async function revokeOtherSecuritySessions(): Promise<{ revokedCount: number }> {
  const payload = await fetchJson<{ ok: true; revokedCount: number }>(
    '/account-security/sessions/revoke-others',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  return { revokedCount: payload.revokedCount };
}

// ── Connected accounts ──────────────────────────────────────────────────────

interface ApiConnectedAccount {
  id: string;
  provider: ConnectedAccount['provider'];
  providerEmail: string | null;
  linkedAt: string;
  metadata?: Record<string, unknown> | null;
}

/** GET /users/me/connected-accounts — `hasPassword` is sourced verbatim:
 *  `false` when the backend reports none (or omits the field on an older
 *  deploy) so the UI never claims a password exists when it may not —
 *  the unlink guard depends on it. */
export async function fetchConnectedAccounts(
  signal?: AbortSignal,
): Promise<ConnectedAccountsResult> {
  const payload = await fetchJson<{
    ok: boolean;
    accounts: ApiConnectedAccount[];
    hasPassword?: boolean;
  }>('/users/me/connected-accounts', undefined, { signal });
  return {
    accounts: (payload.accounts ?? []).map((a) => ({
      id: a.id,
      provider: a.provider,
      providerEmail: a.providerEmail ?? null,
      linkedAt: a.linkedAt,
    })),
    hasPassword: payload.hasPassword === true,
  };
}

/** DELETE /users/me/connected-accounts/:id — severs the OAuth grant
 *  server-side. Re-linking requires a fresh OAuth consent on sign-in, so
 *  callers must not offer Undo for live unlinks. */
export async function unlinkConnectedAccount(id: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/users/me/connected-accounts/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

// ── Two-factor (TOTP) ───────────────────────────────────────────────────────

/** POST /auth/2fa/enroll — returns the TOTP secret + otpauth URL for the
 *  authenticator handshake. The factor stays disabled until verify lands. */
export async function enrollTwoFactor(): Promise<{ secret: string; otpauthUrl: string }> {
  const payload = await fetchJson<{
    ok: boolean;
    secret?: string;
    otpauthUrl?: string;
    error?: string;
  }>('/auth/2fa/enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!payload.ok || typeof payload.secret !== 'string' || typeof payload.otpauthUrl !== 'string') {
    throw new ApiRequestError(payload.error ?? 'Could not start two-factor setup');
  }
  return { secret: payload.secret, otpauthUrl: payload.otpauthUrl };
}

/** POST /auth/2fa/verify — confirms a code from the enrolled authenticator.
 *  Success flips the account's two_factor_enabled flag server-side and
 *  returns plaintext recovery codes — the only time they're ever shown
 *  (the backend stores hashes), so callers must render them display-once. */
export async function verifyTwoFactor(code: string): Promise<{ recoveryCodes: string[] }> {
  const payload = await fetchJson<{
    ok: boolean;
    error?: string;
    recoveryCodes?: string[];
  }>('/auth/2fa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!payload.ok) throw new ApiRequestError(payload.error ?? 'Verification failed');
  return { recoveryCodes: payload.recoveryCodes ?? [] };
}

/** POST /auth/2fa/disable — the backend requires a live authenticator code
 *  or a recovery code when 2FA is enabled; a disabled factor needs neither. */
export async function disableTwoFactor(input: {
  code?: string;
  recoveryCode?: string;
}): Promise<void> {
  const payload = await fetchJson<{ ok: boolean; error?: string }>('/auth/2fa/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!payload.ok) throw new ApiRequestError(payload.error ?? 'Could not disable two-factor');
}

// ── Passkeys (WebAuthn) ─────────────────────────────────────────────────────

/** POST /auth/passkey/register/options → browser ceremony → verify.
 *  Mirrors mobile passkeyApi.registerPasskey — the server challenges and
 *  verifies the attestation; the credential is not trusted locally. */
export async function registerPasskey(name?: string): Promise<PasskeyRecord> {
  const optionsResponse = await fetchJson<{
    ok: boolean;
    options?: Record<string, unknown>;
    error?: string;
  }>('/auth/passkey/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!optionsResponse.ok || !optionsResponse.options) {
    throw new ApiRequestError(optionsResponse.error ?? 'Could not start passkey registration');
  }

  let attestation;
  try {
    attestation = await startRegistration(
      optionsResponse.options as unknown as Parameters<typeof startRegistration>[0],
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'NotAllowedError') {
      throw new ApiRequestError('Passkey creation was cancelled or timed out');
    }
    throw error;
  }

  const verifyResponse = await fetchJson<{
    ok: boolean;
    passkey?: {
      credentialId: string;
      deviceType?: string;
      transports?: string[];
      backupEligible?: boolean;
      createdAt?: string;
      lastUsedAt?: string | null;
      name?: string | null;
    };
    error?: string;
  }>('/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: attestation, name }),
  });
  if (!verifyResponse.ok || !verifyResponse.passkey) {
    throw new ApiRequestError(verifyResponse.error ?? 'Passkey registration failed');
  }
  const p = verifyResponse.passkey;
  return {
    credentialId: p.credentialId,
    name: p.name ?? name ?? null,
    deviceType: p.deviceType ?? 'platform',
    createdAt: p.createdAt ?? new Date().toISOString(),
    lastUsedAt: p.lastUsedAt ?? null,
  };
}

/** GET /auth/passkeys — the account's registered credentials. */
export async function listPasskeys(signal?: AbortSignal): Promise<PasskeyRecord[]> {
  const payload = await fetchJson<{ ok: boolean; passkeys?: PasskeyRecord[] }>(
    '/auth/passkeys',
    undefined,
    { signal },
  );
  return payload.passkeys ?? [];
}

/** DELETE /auth/passkeys/:credentialId — removes the credential
 *  server-side; the authenticator's copy is inert without it. */
export async function removePasskey(credentialId: string): Promise<void> {
  await fetchJson<{ ok: boolean }>(
    `/auth/passkeys/${encodeURIComponent(credentialId)}`,
    { method: 'DELETE' },
  );
}
