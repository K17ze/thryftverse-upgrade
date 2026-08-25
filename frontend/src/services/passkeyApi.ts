/**
 * Passkey/WebAuthn API service.
 *
 * Provides typed access to the passkey endpoints introduced by AUTH-017.
 * Uses @simplewebauthn/browser for the browser-side WebAuthn API calls.
 *
 * Design (AGENTS.md §4 — Anti-AI design policy):
 *   - The passkey UI is simple and native: a button to register, a button
 *     to log in. No decorative security badges, no animated shields.
 *   - Passkey names are user-facing labels (e.g. "iPhone Face ID"), not
 *     internal credential IDs.
 *   - Errors are plain-language, not WebAuthn protocol jargon.
 */

import { fetchJson } from '../lib/apiClient';
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PasskeyInfo {
  id: string;
  userId: string;
  credentialId: string;
  name: string | null;
  deviceType: string;
  transports: string[];
  backupEligible: boolean;
  backupState: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

// ---------------------------------------------------------------------------
// Registration (authenticated — user adds a passkey to their account)
// ---------------------------------------------------------------------------

/**
 * Register a new passkey for the authenticated user.
 * Triggers the browser's WebAuthn registration flow (Face ID, Touch ID, etc.).
 */
export async function registerPasskey(name?: string): Promise<{
  credentialId: string;
  deviceType: string;
  transports: string[];
  backupEligible: boolean;
}> {
  // 1. Get registration options from the server
  const optionsResponse = await fetchJson<{
    ok: boolean;
    options: Record<string, unknown>;
  }>('/auth/passkey/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!optionsResponse.ok || !optionsResponse.options) {
    throw new Error('Could not start passkey registration');
  }

  // 2. Start the browser WebAuthn registration flow
  let attResp;
  try {
    attResp = await startRegistration(optionsResponse.options as unknown as never);
  } catch (err) {
    if (err instanceof Error && err.name === 'NotAllowedError') {
      throw new Error('Passkey creation was cancelled or timed out');
    }
    throw err;
  }

  // 3. Verify the registration with the server
  const verifyResponse = await fetchJson<{
    ok: boolean;
    passkey: {
      credentialId: string;
      deviceType: string;
      transports: string[];
      backupEligible: boolean;
    };
    error?: string;
  }>('/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: attResp, name }),
  });

  if (!verifyResponse.ok || !verifyResponse.passkey) {
    throw new Error(verifyResponse.error ?? 'Passkey registration failed');
  }

  return verifyResponse.passkey;
}

// ---------------------------------------------------------------------------
// Authentication (public — user logs in with a passkey)
// ---------------------------------------------------------------------------

/**
 * Authenticate with a passkey. Triggers the browser's WebAuthn authentication
 * flow. If email is provided, targets the user's registered passkeys.
 * If not, uses discoverable credentials (usernameless login).
 */
export async function loginWithPasskey(email?: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
    emailVerified: boolean;
  };
}> {
  // 1. Get authentication options from the server
  const optionsResponse = await fetchJson<{
    ok: boolean;
    options: Record<string, unknown>;
  }>('/auth/passkey/login/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!optionsResponse.ok || !optionsResponse.options) {
    throw new Error('Could not start passkey login');
  }

  // 2. Start the browser WebAuthn authentication flow
  let asseResp;
  try {
    asseResp = await startAuthentication(optionsResponse.options as unknown as never);
  } catch (err) {
    if (err instanceof Error && err.name === 'NotAllowedError') {
      throw new Error('Passkey authentication was cancelled or timed out');
    }
    throw err;
  }

  // 3. Verify the authentication with the server
  const verifyResponse = await fetchJson<{
    ok: boolean;
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      username: string;
      role: string;
      emailVerified: boolean;
    };
    error?: string;
  }>('/auth/passkey/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: asseResp }),
  });

  if (!verifyResponse.ok || !verifyResponse.accessToken) {
    throw new Error(verifyResponse.error ?? 'Passkey login failed');
  }

  return {
    accessToken: verifyResponse.accessToken,
    refreshToken: verifyResponse.refreshToken,
    user: verifyResponse.user,
  };
}

// ---------------------------------------------------------------------------
// Step-up authentication (authenticated — verify passkey for high-risk action)
// ---------------------------------------------------------------------------

/**
 * Step-up authentication with a passkey. Used for high-risk actions like
 * payout changes, protected field changes, and ATO recovery.
 */
export async function stepUpWithPasskey(): Promise<boolean> {
  const optionsResponse = await fetchJson<{
    ok: boolean;
    options: Record<string, unknown>;
  }>('/auth/passkey/step-up/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!optionsResponse.ok || !optionsResponse.options) {
    throw new Error('Could not start step-up verification');
  }

  let asseResp;
  try {
    asseResp = await startAuthentication(optionsResponse.options as unknown as never);
  } catch (err) {
    if (err instanceof Error && err.name === 'NotAllowedError') {
      throw new Error('Verification was cancelled or timed out');
    }
    throw err;
  }

  const verifyResponse = await fetchJson<{ ok: boolean; verified: boolean; error?: string }>(
    '/auth/passkey/step-up/verify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: asseResp }),
    },
  );

  if (!verifyResponse.ok || !verifyResponse.verified) {
    throw new Error(verifyResponse.error ?? 'Step-up verification failed');
  }

  return true;
}

// ---------------------------------------------------------------------------
// Management (authenticated — list, rename, remove passkeys)
// ---------------------------------------------------------------------------

export async function listUserPasskeys(): Promise<PasskeyInfo[]> {
  const response = await fetchJson<{ ok: boolean; passkeys: PasskeyInfo[] }>(
    '/auth/passkeys',
  );
  if (!response.ok) return [];
  return response.passkeys;
}

export async function renameUserPasskey(credentialId: string, name: string): Promise<void> {
  await fetchJson(`/auth/passkeys/${credentialId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function removeUserPasskey(credentialId: string): Promise<void> {
  await fetchJson(`/auth/passkeys/${credentialId}`, {
    method: 'DELETE',
  });
}
