/**
 * Passkey/WebAuthn service for ThryftVerse.
 *
 * Implements the NCSC CYBERUK 2026 recommendation: passkeys as the primary
 * phishing-resistant authentication factor. Passkeys cryptographically bind
 * authentication to the legitimate service (RP), eliminating credential
 * stuffing, phishing, and session hijacking via credential theft.
 *
 * This module wraps @simplewebauthn/server v10 and provides:
 *   - Registration: generate options, verify response, store credential
 *   - Authentication: generate options, verify response, return user
 *   - Step-up: verify a passkey challenge for high-risk actions
 *   - Management: list, rename, remove passkeys
 *
 * Design (AGENTS.md §11 — Truthful, anti-AI design policy):
 *   - Challenges are single-use, stored in passkey_challenges with 5-minute expiry
 *   - Credential IDs are globally unique (WebAuthn spec)
 *   - Sign counters detect cloned authenticators
 *   - Backup-eligible passkeys (synced via Apple/Google) are tracked for
 *     account-recovery planning
 *   - The service never logs credential private keys or challenge secrets
 *
 * 2026 research context:
 *   - NCSC: "passkeys are as secure or more secure than traditional MFA
 *     against all common credential attacks observed in the wild"
 *   - NCSC: "FIDO2 authentication with user verification constitutes
 *     multi-factor authentication"
 *   - NCSC: "large-scale attacks directly targeting correctly implemented
 *     passkeys are unlikely"
 */

import type { Pool } from 'pg';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PasskeyCredential {
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

// Browser response types are JSON from the WebAuthn API — we use `any` here
// because the @simplewebauthn/types package is deprecated and the server
// library's verify functions accept the JSON shape directly.
type BrowserRegistrationResponse = Record<string, unknown>;
type BrowserAuthenticationResponse = Record<string, unknown>;

export interface RegistrationOptionsResult {
  challenge: string;
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
}

export interface AuthenticationOptionsResult {
  challenge: string;
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
}

export interface VerifiedRegistration {
  credentialId: string;
  publicKey: Buffer;
  counter: number;
  deviceType: string;
  transports: string[];
  backupEligible: boolean;
  backupState: boolean;
}

export interface VerifiedAuthentication {
  userId: string;
  credentialId: string;
  newCounter: number;
}

// ---------------------------------------------------------------------------
// RP configuration
// ---------------------------------------------------------------------------

function rpConfig() {
  return {
    rpName: config.webauthnRpName,
    rpID: config.webauthnRpId,
    origins: config.webauthnOrigins,
  };
}

// ---------------------------------------------------------------------------
// Challenge management
// ---------------------------------------------------------------------------

async function storeChallenge(
  db: Pool,
  userId: string | null,
  challenge: string,
  challengeType: 'registration' | 'authentication',
): Promise<void> {
  await db.query(
    `INSERT INTO passkey_challenges (user_id, challenge, challenge_type)
     VALUES ($1, $2, $3)`,
    [userId, challenge, challengeType],
  );
}

async function consumeChallenge(
  db: Pool,
  challenge: string,
): Promise<{ userId: string | null; challengeType: string } | null> {
  const result = await db.query(
    `UPDATE passkey_challenges
     SET consumed_at = NOW()
     WHERE challenge = $1
       AND consumed_at IS NULL
       AND expires_at > NOW()
     RETURNING user_id, challenge_type`,
    [challenge],
  );
  if (!result.rowCount || result.rowCount === 0) return null;
  return {
    userId: result.rows[0].user_id,
    challengeType: result.rows[0].challenge_type,
  };
}

// Cleanup expired challenges (fire-and-forget, called opportunistically)
export async function cleanupExpiredChallenges(db: Pool): Promise<void> {
  await db.query(`DELETE FROM passkey_challenges WHERE expires_at < NOW()`);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Generate registration options for a user. The user must be authenticated
 * to register a passkey. The challenge is stored server-side and must be
 * consumed during verification.
 */
export async function generatePasskeyRegistrationOptions(
  db: Pool,
  userId: string,
  userEmail: string,
  userDisplayName?: string,
): Promise<RegistrationOptionsResult> {
  const { rpName, rpID } = rpConfig();

  // Fetch existing credentials to exclude them (prevents duplicate registration)
  const existingResult = await db.query(
    `SELECT credential_id, transports FROM user_passkeys WHERE user_id = $1`,
    [userId],
  );
  const excludeCredentials = existingResult.rows.map((row) => ({
    id: row.credential_id as string,
    transports: row.transports as never,
  }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName: userEmail,
    userDisplayName: userDisplayName ?? userEmail,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await storeChallenge(db, userId, options.challenge, 'registration');

  return { challenge: options.challenge, options };
}

/**
 * Verify a registration response from the browser. Stores the credential
 * on success. The user must be authenticated — this is not a public endpoint.
 */
export async function verifyPasskeyRegistration(
  db: Pool,
  userId: string,
  response: BrowserRegistrationResponse,
  credentialName?: string,
): Promise<VerifiedRegistration> {
  const { rpID, origins } = rpConfig();

  // Fetch the stored challenge for this user
  const challengeResult = await db.query(
    `SELECT challenge FROM passkey_challenges
     WHERE user_id = $1
       AND challenge_type = 'registration'
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );
  if (!challengeResult.rowCount || challengeResult.rowCount === 0) {
    throw new Error('No active registration challenge found. Please request new options.');
  }
  const expectedChallenge = challengeResult.rows[0].challenge as string;

  const verification = await verifyRegistrationResponse({
    response: response as never,
    expectedChallenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey registration verification failed');
  }

  const info = verification.registrationInfo;
  const credentialId = info.credentialID;
  const publicKey = Buffer.from(info.credentialPublicKey);
  const counter = info.counter;
  const deviceType = info.credentialDeviceType;
  // Transports are in the response, not the verification result
  const transports = (response as { response?: { transports?: string[] } }).response?.transports ?? [];

  // Store the credential
  await db.query(
    `INSERT INTO user_passkeys
       (user_id, credential_id, public_key, counter, device_type, transports, name,
        backup_eligible, backup_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (credential_id) DO UPDATE
       SET counter = $4, last_used_at = NOW()`,
    [
      userId,
      credentialId,
      publicKey,
      counter,
      deviceType,
      transports,
      credentialName ?? null,
      info.credentialBackedUp ?? false,
      info.credentialBackedUp ?? false,
    ],
  );

  // Mark the user as having a passkey registered
  await db.query(
    `UPDATE users SET passkey_registered = TRUE WHERE id = $1`,
    [userId],
  );

  // Consume the challenge
  await consumeChallenge(db, expectedChallenge);

  return {
    credentialId,
    publicKey,
    counter,
    deviceType,
    transports,
    backupEligible: info.credentialBackedUp ?? false,
    backupState: info.credentialBackedUp ?? false,
  };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Generate authentication options. This is a PUBLIC endpoint — the user
 * does not need to be authenticated to start passkey login. If the email
 * is provided, we find the user and their credentials for a targeted login.
 * If not, we generate options for discoverable credentials (usernameless).
 */
export async function generatePasskeyAuthenticationOptions(
  db: Pool,
  userEmail?: string,
): Promise<AuthenticationOptionsResult> {
  const { rpID } = rpConfig();

  let allowCredentials: { id: string; transports?: string[] }[] = [];
  let userId: string | null = null;

  if (userEmail) {
    const userResult = await db.query(
      `SELECT id FROM users WHERE email = $1`,
      [userEmail.toLowerCase()],
    );
    if (userResult.rowCount && userResult.rowCount > 0) {
      userId = userResult.rows[0].id as string;
      const credResult = await db.query(
        `SELECT credential_id, transports FROM user_passkeys WHERE user_id = $1`,
        [userId],
      );
      allowCredentials = credResult.rows.map((row) => ({
        id: row.credential_id as string,
        transports: row.transports as never,
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: allowCredentials.length > 0 ? allowCredentials as never : undefined,
    userVerification: 'preferred',
  });

  await storeChallenge(db, userId, options.challenge, 'authentication');

  return { challenge: options.challenge, options };
}

/**
 * Verify an authentication response from the browser. Returns the user ID
 * on success. This is a PUBLIC endpoint — the user is not yet authenticated.
 */
export async function verifyPasskeyAuthentication(
  db: Pool,
  response: BrowserAuthenticationResponse,
): Promise<VerifiedAuthentication> {
  const { rpID, origins } = rpConfig();

  // Find the credential by ID
  const credResult = await db.query(
    `SELECT user_id, credential_id, public_key, counter
     FROM user_passkeys
     WHERE credential_id = $1`,
    [response.id],
  );
  if (!credResult.rowCount || credResult.rowCount === 0) {
    throw new Error('Passkey credential not found');
  }

  const credential = credResult.rows[0];
  const userId = credential.user_id as string;
  const credentialId = credential.credential_id as string;
  const publicKey = Buffer.from(credential.public_key as Buffer);
  const counter = credential.counter as number;

  // Fetch the stored challenge
  const challengeResult = await db.query(
    `SELECT challenge FROM passkey_challenges
     WHERE (user_id = $1 OR user_id IS NULL)
       AND challenge_type = 'authentication'
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );
  if (!challengeResult.rowCount || challengeResult.rowCount === 0) {
    throw new Error('No active authentication challenge found. Please request new options.');
  }
  const expectedChallenge = challengeResult.rows[0].challenge as string;

  const verification = await verifyAuthenticationResponse({
    response: response as never,
    expectedChallenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    authenticator: {
      credentialID: credentialId,
      credentialPublicKey: new Uint8Array(publicKey),
      counter,
    },
  });

  if (!verification.verified) {
    throw new Error('Passkey authentication verification failed');
  }

  const newCounter = verification.authenticationInfo.newCounter;

  // Update the credential counter and last used timestamp
  await db.query(
    `UPDATE user_passkeys
     SET counter = $1, last_used_at = NOW()
     WHERE credential_id = $2`,
    [newCounter, credentialId],
  );

  // Consume the challenge
  await consumeChallenge(db, expectedChallenge);

  return {
    userId,
    credentialId,
    newCounter,
  };
}

// ---------------------------------------------------------------------------
// Step-up authentication
// ---------------------------------------------------------------------------

/**
 * Generate step-up authentication options for a user who is already
 * authenticated. Used for high-risk actions (payout changes, protected
 * field changes, ATO recovery). The user must have at least one passkey
 * registered.
 */
export async function generatePasskeyStepUpOptions(
  db: Pool,
  userId: string,
): Promise<AuthenticationOptionsResult> {
  const { rpID } = rpConfig();

  const credResult = await db.query(
    `SELECT credential_id, transports FROM user_passkeys WHERE user_id = $1`,
    [userId],
  );
  if (!credResult.rowCount || credResult.rowCount === 0) {
    throw new Error('No passkey registered for this user');
  }

  const allowCredentials = credResult.rows.map((row) => ({
    id: row.credential_id as string,
    transports: row.transports as never,
  }));

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: 'required',
  });

  await storeChallenge(db, userId, options.challenge, 'authentication');

  return { challenge: options.challenge, options };
}

/**
 * Verify a step-up authentication response. Returns true if the passkey
 * challenge was successfully verified for the given user.
 */
export async function verifyPasskeyStepUp(
  db: Pool,
  userId: string,
  response: BrowserAuthenticationResponse,
): Promise<boolean> {
  const result = await verifyPasskeyAuthentication(db, response);
  return result.userId === userId;
}

// ---------------------------------------------------------------------------
// Management
// ---------------------------------------------------------------------------

/**
 * List all passkeys for a user. Returns redacted, user-safe information
 * (no public keys, no counters — those are internal).
 */
export async function listPasskeys(db: Pool, userId: string): Promise<PasskeyCredential[]> {
  const result = await db.query(
    `SELECT id, user_id, credential_id, name, device_type, transports,
            backup_eligible, backup_state, created_at, last_used_at
     FROM user_passkeys
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    credentialId: row.credential_id,
    name: row.name,
    deviceType: row.device_type,
    transports: row.transports,
    backupEligible: row.backup_eligible,
    backupState: row.backup_state,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

/**
 * Rename a passkey (user-facing label only).
 */
export async function renamePasskey(
  db: Pool,
  userId: string,
  credentialId: string,
  name: string,
): Promise<void> {
  const result = await db.query(
    `UPDATE user_passkeys SET name = $1
     WHERE user_id = $2 AND credential_id = $3`,
    [name.slice(0, 120), userId, credentialId],
  );
  if (!result.rowCount || result.rowCount === 0) {
    throw new Error('Passkey not found');
  }
}

/**
 * Remove a passkey. If this is the last passkey, update the user's
 * passkey_registered flag.
 */
export async function removePasskey(
  db: Pool,
  userId: string,
  credentialId: string,
): Promise<void> {
  const result = await db.query(
    `DELETE FROM user_passkeys
     WHERE user_id = $1 AND credential_id = $2
     RETURNING id`,
    [userId, credentialId],
  );
  if (!result.rowCount || result.rowCount === 0) {
    throw new Error('Passkey not found');
  }

  // Check if any passkeys remain
  const remaining = await db.query(
    `SELECT 1 FROM user_passkeys WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (!remaining.rowCount || remaining.rowCount === 0) {
    await db.query(
      `UPDATE users SET passkey_registered = FALSE WHERE id = $1`,
      [userId],
    );
  }
}
