import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { z } from 'zod';

/**
 * Attestation & device-integrity routes.
 *
 * These endpoints implement the server side of the App Attest (iOS) and
 * Google Play Integrity (Android) flows exposed by the `ThryftIntegrity`
 * native module on the client.
 *
 *   POST /attestation/challenge  — mint a single-use challenge (≥16 bytes,
 *                                   base64url) cached in Redis with a 5-minute
 *                                   TTL. The client includes this challenge in
 *                                   its attestation/assertion so the server
 *                                   can prove freshness and prevent replay.
 *
 *   POST /attestation/verify     — verify an attestation (iOS) or integrity
 *                                   token (Android) against the cached
 *                                   challenge. On success the derived public
 *                                   key is persisted so subsequent assertions
 *                                   can be verified.
 *
 *   POST /integrity/verify       — verify a Google Play Integrity token and
 *                                   decode the device-integrity verdict.
 *
 * NOTE: The cryptographic verification is intentionally stubbed with TODOs.
 * A production implementation must:
 *   - iOS:     validate the attestation object against the Apple App Attest
 *              Root CA chain, confirm the challenge matches, and persist the
 *              ECDSA public key. See Apple TN3161.
 *   - Android: call the Google Play Integrity API
 *              (`https://playintegrity.googleapis.com/v1/...:decodeIntegrityToken`)
 *              with the project's Google Cloud service account, then inspect
 *              the `deviceIntegrity` verdict.
 */

const CHALLENGE_TTL_SECONDS = 300; // 5 minutes
const CHALLENGE_BYTE_LENGTH = 32; // 256-bit challenge (≥16-byte requirement)

type AttestationRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  redis: Redis;
};

/**
 * Ensure the `device_attestation_keys` table exists. Called lazily on first
 * verify so the route is self-bootstrapping without a dedicated migration.
 */
async function ensureAttestationTable(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS device_attestation_keys (
      key_id        TEXT    PRIMARY KEY,
      platform      TEXT    NOT NULL,
      public_key    TEXT    NOT NULL,
      trust_state   TEXT    NOT NULL DEFAULT 'trusted',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Verify an Apple App Attest attestation object against the Apple Root CA
 * chain and confirm the embedded challenge matches.
 *
 * TODO(security): Implement full cryptographic verification per Apple TN3161:
 *   1. Parse the CBOR attestation object (`fmt`, `attStmt`, `authData`).
 *   2. Verify the attestation certificate chain chains to the Apple App Attest
 *      Root CA.
 *   3. Confirm `authData` contains the correct RP ID hash and no AAGUID.
 *   4. Extract the credential public key (COSE EC2 P-256).
 *   5. Confirm the `challenge` in the client data JSON matches the cached
 *      challenge from Redis.
 *   6. Return the extracted public key (base64 SPKI) for persistence.
 *
 * Until implemented, this stub trusts the attestation and derives a placeholder
 * public key from the keyId. DO NOT ship to production without the full check.
 */
async function verifyAppleAttestation(
  _keyId: string,
  _attestation: string,
  _challenge: string,
): Promise<{ trusted: boolean; publicKey: string }> {
  // TODO(security): full Apple App Attest certificate-chain + challenge verification.
  return {
    trusted: true,
    publicKey: `placeholder:apple:${_keyId}`,
  };
}

/**
 * Verify a Google Play Integrity token by calling the Google Play Integrity API.
 *
 * TODO(security): Implement the server-side verification:
 *   1. Obtain a Google OAuth2 access token for the Play Integrity service
 *      account (service-account JSON, `https://www.googleapis.com/auth/playintegrity`).
 *   2. POST to
 *      `https://playintegrity.googleapis.com/v1/{packageName}:decodeIntegrityToken`
 *      with `{ integrityToken: token }`.
 *   3. Inspect `tokenPayloadExternal.accountDetails` and
 *      `deviceIntegrity.deviceRecognitionVerdict`.
 *   4. Confirm the `requestHash` matches the hash of the original request.
 *
 * Until implemented, this stub returns an empty device-integrity verdict.
 */
async function verifyPlayIntegrityToken(
  _token: string,
  _requestHash: string,
): Promise<{ deviceIntegrity: string[] }> {
  // TODO(security): full Google Play Integrity API verification.
  return { deviceIntegrity: [] };
}

export const registerAttestationRoutes = ({
  app,
  db,
  redis,
}: AttestationRouteDependencies) => {
  // ── POST /attestation/challenge ──────────────────────────────────────
  app.post('/attestation/challenge', async (request: FastifyRequest, reply: FastifyReply) => {
    const challengeBytes = crypto.randomBytes(CHALLENGE_BYTE_LENGTH);
    const challenge = challengeBytes.toString('base64url');
    const challengeId = crypto.randomUUID();

    try {
      await redis.set(
        `attestation:challenge:${challengeId}`,
        challenge,
        'EX',
        CHALLENGE_TTL_SECONDS,
      );
    } catch (error) {
      request.log.error({ err: error }, 'Failed to store attestation challenge in Redis');
      reply.code(503);
      return { ok: false, error: 'Unable to issue challenge' };
    }

    return {
      ok: true,
      challenge,
      challengeId,
      expiresIn: CHALLENGE_TTL_SECONDS,
    };
  });

  // ── POST /attestation/verify ─────────────────────────────────────────
  app.post('/attestation/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodySchema = z.object({
      keyId: z.string().min(8).max(256),
      attestation: z.string().min(16),
      challenge: z.string().min(16),
      challengeId: z.string().min(8).max(128),
      platform: z.enum(['ios', 'android']),
    });

    const payload = bodySchema.parse(request.body);

    // Validate the challenge from Redis (single-use — deleted after read).
    let cachedChallenge: string | null = null;
    try {
      cachedChallenge = await redis.get(`attestation:challenge:${payload.challengeId}`);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to read attestation challenge from Redis');
      reply.code(503);
      return { ok: false, error: 'Unable to verify challenge' };
    }

    if (!cachedChallenge || cachedChallenge !== payload.challenge) {
      reply.code(400);
      return {
        ok: false,
        trusted: false,
        trustState: 'failed',
        error: 'Challenge mismatch or expired',
      };
    }

    // Consume the challenge so it cannot be replayed.
    try {
      await redis.del(`attestation:challenge:${payload.challengeId}`);
    } catch {
      // Best-effort — the TTL will reclaim it regardless.
    }

    let trusted = false;
    let publicKey = '';
    let trustState: 'trusted' | 'failed' = 'failed';

    if (payload.platform === 'ios') {
      const result = await verifyAppleAttestation(
        payload.keyId,
        payload.attestation,
        payload.challenge,
      );
      trusted = result.trusted;
      publicKey = result.publicKey;
      trustState = result.trusted ? 'trusted' : 'failed';
    } else {
      // Android: the `attestation` field carries the Play Integrity token.
      const verdict = await verifyPlayIntegrityToken(payload.attestation, payload.keyId);
      trusted = verdict.deviceIntegrity.includes('MEETS_DEVICE_INTEGRITY');
      publicKey = `placeholder:android:${payload.keyId}`;
      trustState = trusted ? 'trusted' : 'failed';
    }

    if (trusted) {
      try {
        await ensureAttestationTable(db);
        await db.query(
          `INSERT INTO device_attestation_keys (key_id, platform, public_key, trust_state)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (key_id) DO UPDATE
             SET public_key = EXCLUDED.public_key,
                 trust_state = EXCLUDED.trust_state,
                 updated_at = NOW();`,
          [payload.keyId, payload.platform, publicKey, trustState],
        );
      } catch (error) {
        request.log.error({ err: error }, 'Failed to persist attestation public key');
        reply.code(500);
        return { ok: false, trusted: false, trustState: 'failed', error: 'Unable to persist key' };
      }
    }

    return {
      ok: true,
      trusted,
      trustState,
    };
  });

  // ── POST /integrity/verify ───────────────────────────────────────────
  app.post('/integrity/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodySchema = z.object({
      token: z.string().min(16),
      requestHash: z.string().min(8).max(256),
    });

    const payload = bodySchema.parse(request.body);

    try {
      const verdict = await verifyPlayIntegrityToken(payload.token, payload.requestHash);
      return {
        ok: true,
        deviceIntegrity: verdict.deviceIntegrity,
      };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to verify Play Integrity token');
      reply.code(502);
      return {
        ok: false,
        deviceIntegrity: [],
        error: 'Play Integrity verification failed',
      };
    }
  });
};
