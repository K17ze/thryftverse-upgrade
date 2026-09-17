/**
 * Account security API routes.
 *
 * Exposes endpoints for session management, compromise declaration, and
 * account-takeover recovery. These are the user-facing endpoints that
 * implement the ATO state machine from the fraud/scams/ATO flagship
 * analysis (2026-08-25).
 *
 * Endpoints:
 * - GET  /account-security/sessions — redacted session inventory
 * - DELETE /account-security/sessions/:id — revoke a single session
 * - POST /account-security/sessions/revoke-others — revoke all other sessions
 * - POST /account-security/incidents — declare compromise (start containment)
 * - GET  /account-security/incidents/:id — get incident detail (user-safe)
 * - POST /account-security/recovery/:id/challenges — create a recovery challenge
 * - POST /account-security/recovery/:id/challenges/:challengeId/verify — verify
 * - POST /account-security/incidents/:id/restore — restore access (never auto-releases money)
 *
 * Design (AGENTS.md §4 — Anti-AI design policy):
 * - User-facing endpoints return user-safe state, not internal scores/signals.
 * - Sessions are redacted: no token hashes, no raw device fingerprints.
 * - The server derives the current-session marker — the client never asserts it.
 * - Money is NEVER auto-released on recovery. The cooldown is enforced server-side.
 */

import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import {
  declareCompromise,
  getActiveCompromiseCase,
  getCompromiseCase,
  getSessionInventory,
  revokeSuspiciousSessions,
  startRecovery,
  completeRecovery,
  type RecoveryMethod,
  type SessionInventoryEntry,
} from '../lib/accountTakeoverService.js';
import { getUserSafeInterventionState } from '../lib/riskDecision.js';
import { sendAuthEmail } from '../lib/authEmail.js';
import { sendSms } from '../lib/sms/smsProvider.js';
import { verifyTotp } from '../lib/totp.js';
import { decryptJsonPayload } from '../lib/keyService.js';
import { verifyPasskeyStepUp } from '../lib/passkeyService.js';

export interface AccountSecurityRouteDependencies {
  app: FastifyInstance;
  db: Pool;
  redis: Redis;
}

const unauthorized = (reply: FastifyReply) => {
  reply.code(401);
  return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
};

const notFound = (reply: FastifyReply) => {
  reply.code(404);
  return { ok: false, error: 'Not found', code: 'NOT_FOUND' };
};

const declareIncidentSchema = z.object({
  suspiciousSessionIds: z.array(z.string().min(2).max(120)).optional(),
  details: z.string().max(2000).optional(),
});

const createChallengeSchema = z.object({
  factor: z.enum(['passkey', 'totp', 'email', 'phone']),
});

const verifyChallengeSchema = z.object({
  // OTP/TOTP proofs arrive as strings; a passkey assertion arrives as the
  // WebAuthn response object.
  proof: z.union([z.string().min(1).max(500), z.record(z.unknown())]),
});

const restoreSchema = z.object({
  // Single-use token issued by the challenge-verify endpoint. Required for
  // non-admin restores — recovery completion must be gated on proof of a
  // verified challenge, never on session possession alone.
  restoreToken: z.string().min(8).max(200),
});

/**
 * Map a user-selected recovery factor (from the zod enum) to the ATO
 * service's `RecoveryMethod` vocabulary. Passkey re-auth is its own method;
 * email/phone/totp all route through a previously established trusted channel.
 */
const mapFactorToRecoveryMethod = (factor: 'passkey' | 'totp' | 'email' | 'phone'): RecoveryMethod => {
  switch (factor) {
    case 'passkey':
      return 'passkey_reauth';
    case 'email':
    case 'phone':
    case 'totp':
      return 'trusted_channel';
  }
};

/**
 * Derive a coarse platform label from a raw User-Agent string. Used only for
 * the redacted session inventory shown to the user — never for risk scoring.
 */
const derivePlatform = (userAgent: string | null): string => {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macOS';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('linux')) return 'Linux';
  return 'Unknown';
};

/**
 * Derive a simplified device name from a raw User-Agent string. The session
 * inventory is redacted — we surface a human-readable label, not the raw UA.
 */
const deriveDeviceName = (userAgent: string | null): string => {
  if (!userAgent) return 'Unknown device';
  const platform = derivePlatform(userAgent);
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('android')) {
    // Try to extract a model hint after 'android' — fall back to generic.
    const match = userAgent.match(/Android[^;]*;\s*([^)]+)\s*Build/);
    return match ? match[1].trim() : 'Android device';
  }
  if (platform === 'macOS') return 'Mac';
  if (platform === 'Windows') return 'Windows PC';
  if (platform === 'Linux') return 'Linux device';
  return 'Unknown device';
};

/**
 * Map a redacted `SessionInventoryEntry` to the user-facing session shape the
 * frontend expects: `id` (from `sessionId`), plus derived `deviceName` and
 * `platform`. Token hashes and raw fingerprints are never included.
 */
const toUserSafeSession = (entry: SessionInventoryEntry) => ({
  id: entry.sessionId,
  userAgent: entry.userAgent,
  ipAddress: entry.ipAddress,
  createdAt: entry.createdAt,
  lastSeenAt: entry.lastSeenAt,
  isCurrent: entry.isCurrent,
  isRevoked: entry.isRevoked,
  deviceName: deriveDeviceName(entry.userAgent),
  platform: derivePlatform(entry.userAgent),
});

export const registerAccountSecurityRoutes = ({
  app,
  db,
  redis,
}: AccountSecurityRouteDependencies) => {
  // ── GET /account-security/sessions ──────────────────────────────────
  // Redacted session inventory with server-derived current-session marker.
  app.get('/account-security/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) return unauthorized(reply);

    try {
      const currentSessionId = (authUser as { sessionId?: string }).sessionId ?? undefined;
      const sessions = await getSessionInventory(authUser.userId, currentSessionId);
      return { ok: true, sessions: sessions.map(toUserSafeSession) };
    } catch (err) {
      request.log.error({ err, userId: authUser.userId }, 'Failed to fetch session inventory');
      reply.code(500);
      return { ok: false, error: 'Failed to load sessions', code: 'INTERNAL_ERROR' };
    }
  });

  // ── DELETE /account-security/sessions/:id ───────────────────────────
  // Revoke a single session. Idempotent — revoking an already-revoked
  // session is a no-op.
  app.delete('/account-security/sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) return unauthorized(reply);

    const { id: sessionId } = request.params as { id: string };
    if (!sessionId || sessionId.length < 2 || sessionId.length > 120) {
      reply.code(400);
      return { ok: false, error: 'Invalid session id', code: 'INVALID_SESSION_ID' };
    }

    try {
      // Verify the session belongs to the user before revoking
      const sessionResult = await db.query(
        `SELECT user_id FROM user_sessions WHERE id = $1`,
        [sessionId],
      );
      if (!sessionResult.rowCount || sessionResult.rowCount === 0) {
        return notFound(reply);
      }
      if (sessionResult.rows[0].user_id !== authUser.userId) {
        reply.code(403);
        return { ok: false, error: 'Forbidden', code: 'FORBIDDEN' };
      }

      await db.query(
        `UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
        [sessionId],
      );
      // Also revoke refresh tokens for this session
      await db.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE session_id = $1 AND revoked_at IS NULL`,
        [sessionId],
      );

      return { ok: true };
    } catch (err) {
      request.log.error({ err, sessionId, userId: authUser.userId }, 'Failed to revoke session');
      reply.code(500);
      return { ok: false, error: 'Failed to revoke session', code: 'INTERNAL_ERROR' };
    }
  });

  // ── POST /account-security/sessions/revoke-others ───────────────────
  // Revoke all sessions except the current one. Returns the count.
  app.post('/account-security/sessions/revoke-others', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) return unauthorized(reply);

    // The current session is derived from the refresh token in the request.
    // The auth middleware sets authUser.sessionId when available.
    const currentSessionId = (authUser as { sessionId?: string }).sessionId ?? null;

    try {
      const result = await db.query(
        `UPDATE user_sessions
         SET revoked_at = NOW()
         WHERE user_id = $1
           AND revoked_at IS NULL
           AND ($2::text IS NULL OR id <> $2)`,
        [authUser.userId, currentSessionId],
      );
      // Also revoke refresh tokens for those sessions
      await db.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE user_id = $1
           AND revoked_at IS NULL
           AND ($2::text IS NULL OR session_id <> $2)`,
        [authUser.userId, currentSessionId],
      );

      const revokedCount = result.rowCount ?? 0;
      return { ok: true, revokedCount };
    } catch (err) {
      request.log.error({ err, userId: authUser.userId }, 'Failed to revoke other sessions');
      reply.code(500);
      return { ok: false, error: 'Failed to revoke other sessions', code: 'INTERNAL_ERROR' };
    }
  });

  // ── POST /account-security/incidents ────────────────────────────────
  // Declare a compromise. Starts containment: revokes suspicious sessions,
  // holds payouts/withdrawals, creates a durable case.
  app.post('/account-security/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) return unauthorized(reply);

    const payload = declareIncidentSchema.parse(request.body ?? {});

    try {
      // Check if there's already an active compromise case
      const existing = await getActiveCompromiseCase(authUser.userId);
      if (existing) {
        // Return the existing case — don't create a duplicate
        const intervention = await getUserSafeInterventionState(db, authUser.userId);
        return {
          ok: true,
          incident: {
            caseId: existing.caseId,
            state: existing.state,
            nextAction: intervention.nextAction.label
              ? intervention.nextAction
              : { label: 'View details', route: '/account-security' },
            impactedCapabilities: intervention.impactedCapabilities,
          },
        };
      }

      // Declare the compromise and start containment
      const currentSessionId = (authUser as { sessionId?: string }).sessionId ?? undefined;
      const incident = await declareCompromise({
        userId: authUser.userId,
        detectedBy: 'user_report',
        reasonText: payload.details,
        actorId: authUser.userId,
      });

      // Revoke suspicious sessions (all except the current one if safe)
      await revokeSuspiciousSessions(incident.caseId, {
        preserveSessionId: currentSessionId,
        actorId: authUser.userId,
      });

      const intervention = await getUserSafeInterventionState(db, authUser.userId);
      return {
        ok: true,
        incident: {
          caseId: incident.caseId,
          state: incident.state,
          nextAction: intervention.nextAction.label
            ? intervention.nextAction
            : { label: 'Secure your account', route: '/account-security/recovery' },
          impactedCapabilities: intervention.impactedCapabilities,
        },
      };
    } catch (err) {
      request.log.error({ err, userId: authUser.userId }, 'Failed to declare compromise');
      reply.code(500);
      return { ok: false, error: 'Could not start account recovery', code: 'INTERNAL_ERROR' };
    }
  });

  // ── GET /account-security/incidents/:id ─────────────────────────────
  // Get incident detail (user-safe — no internal scores or surveillance).
  app.get('/account-security/incidents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) return unauthorized(reply);

    const { id: caseId } = request.params as { id: string };
    if (!caseId || caseId.length < 2 || caseId.length > 120) {
      reply.code(400);
      return { ok: false, error: 'Invalid case id', code: 'INVALID_CASE_ID' };
    }

    try {
      const incident = await getCompromiseCase(caseId);
      if (!incident) return notFound(reply);

      // Verify ownership — the user can only see their own incidents
      if (incident.userId !== authUser.userId && authUser.role !== 'admin') {
        reply.code(403);
        return { ok: false, error: 'Forbidden', code: 'FORBIDDEN' };
      }

      const intervention = await getUserSafeInterventionState(db, incident.userId);
      return {
        ok: true,
        incident: {
          caseId: incident.caseId,
          state: incident.state,
          detectedAt: incident.detectedAt,
          detectedBy: incident.detectedBy,
          sessionsRevokedCount: incident.sessionsRevokedCount,
          payoutHoldActive: incident.payoutHoldActive,
          withdrawalHoldActive: incident.withdrawalHoldActive,
          protectedChangeHoldActive: incident.protectedChangeHoldActive,
          recoveryMethod: incident.recoveryMethod,
          recoveryStartedAt: incident.recoveryStartedAt,
          cooldownUntil: incident.cooldownUntil,
          nextAction: intervention.nextAction.label
            ? intervention.nextAction
            : { label: 'View details', route: '/account-security' },
          supportRoute: '/support',
          impactedCapabilities: intervention.impactedCapabilities,
        },
      };
    } catch (err) {
      request.log.error({ err, caseId, userId: authUser.userId }, 'Failed to fetch incident');
      reply.code(500);
      return { ok: false, error: 'Failed to load incident', code: 'INTERNAL_ERROR' };
    }
  });

  // ── POST /account-security/recovery/:id/challenges ──────────────────
  // Create a recovery challenge. The user selects a factor; the server
  // sends a challenge to the established channel (never the newly changed one).
  app.post('/account-security/recovery/:id/challenges', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) return unauthorized(reply);

    const { id: caseId } = request.params as { id: string };
    if (!caseId || caseId.length < 2 || caseId.length > 120) {
      reply.code(400);
      return { ok: false, error: 'Invalid case id', code: 'INVALID_CASE_ID' };
    }

    const payload = createChallengeSchema.parse(request.body ?? {});

    try {
      const incident = await getCompromiseCase(caseId);
      if (!incident) return notFound(reply);
      if (incident.userId !== authUser.userId && authUser.role !== 'admin') {
        reply.code(403);
        return { ok: false, error: 'Forbidden', code: 'FORBIDDEN' };
      }

      // Start recovery if not already started
      if (incident.state === 'contained' || incident.state === 'suspected') {
        await startRecovery(caseId, {
          recoveryMethod: mapFactorToRecoveryMethod(payload.factor),
          actorId: authUser.userId,
        });
      }

      const challengeId = `recovery_challenge_${crypto.randomUUID()}`;
      const expiresInSeconds = 300; // 5 minutes
      const challengeKey = `recovery:challenge:${challengeId}`;

      if (payload.factor === 'email' || payload.factor === 'phone') {
        // OTP over the account's ESTABLISHED channel — never a contact method
        // changed after the compromise was declared.
        const contact = await db.query<{ email: string | null; phone: string | null }>(
          'SELECT email, phone FROM users WHERE id = $1 LIMIT 1',
          [incident.userId],
        );
        const target = payload.factor === 'email'
          ? contact.rows[0]?.email?.trim()
          : contact.rows[0]?.phone?.trim();
        if (!target) {
          reply.code(400);
          return {
            ok: false,
            error: `No ${payload.factor} on file for this account`,
            code: 'CHANNEL_UNAVAILABLE',
          };
        }

        const challengeCode = Math.floor(100000 + Math.random() * 900000).toString();
        await redis.set(challengeKey, JSON.stringify({
          caseId,
          userId: incident.userId,
          factor: payload.factor,
          code: challengeCode,
          attempts: 0,
        }), 'EX', expiresInSeconds);

        try {
          if (payload.factor === 'email') {
            await sendAuthEmail({
              to: target,
              subject: 'Your Thryftverse account recovery code',
              html: `<p>Your account recovery code is <strong>${challengeCode}</strong>. It expires in 5 minutes. If you did not request this, your account may be compromised — review your security settings.</p>`,
              text: `Your account recovery code is ${challengeCode}. It expires in 5 minutes.`,
            });
          } else {
            await sendSms({
              to: target,
              body: `Your Thryftverse account recovery code is ${challengeCode}. It expires in 5 minutes.`,
            });
          }
        } catch (deliveryErr) {
          // A challenge nobody can answer is a lockout trap — fail the request
          // honestly instead of storing an undeliverable code.
          await redis.del(challengeKey);
          request.log.error({ err: deliveryErr, caseId, factor: payload.factor }, 'Recovery challenge delivery failed');
          reply.code(503);
          return { ok: false, error: 'Could not deliver the verification code. Try again.', code: 'DELIVERY_UNAVAILABLE' };
        }
      } else {
        // totp / passkey: no delivered code — verify checks the enrolled
        // factor directly (TOTP secret or WebAuthn assertion).
        await redis.set(challengeKey, JSON.stringify({
          caseId,
          userId: incident.userId,
          factor: payload.factor,
          attempts: 0,
        }), 'EX', expiresInSeconds);
      }

      request.log.info(
        { challengeId, caseId, factor: payload.factor, userId: incident.userId },
        'Recovery challenge created',
      );

      return {
        ok: true,
        challenge: {
          challengeId,
          factor: payload.factor,
          expiresInSeconds,
        },
      };
    } catch (err) {
      request.log.error({ err, caseId }, 'Failed to create recovery challenge');
      reply.code(500);
      return { ok: false, error: 'Could not start verification', code: 'INTERNAL_ERROR' };
    }
  });

  // ── POST /account-security/recovery/:id/challenges/:challengeId/verify ─
  // Verify a recovery challenge. Replay-safe and rate-limited.
  app.post(
    '/account-security/recovery/:id/challenges/:challengeId/verify',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) return unauthorized(reply);

      const { id: caseId, challengeId } = request.params as { id: string; challengeId: string };
      if (!caseId || !challengeId) {
        reply.code(400);
        return { ok: false, error: 'Invalid parameters', code: 'INVALID_PARAMS' };
      }

      const payload = verifyChallengeSchema.parse(request.body ?? {});

      try {
        // Fetch the challenge from Redis
        const challengeKey = `recovery:challenge:${challengeId}`;
        const raw = await redis.get(challengeKey);
        if (!raw) {
          reply.code(404);
          return { ok: false, error: 'Challenge expired or not found', code: 'CHALLENGE_EXPIRED' };
        }

        const challenge = JSON.parse(raw) as {
          caseId: string;
          userId: string;
          factor: string;
          code?: string;
          attempts: number;
        };

        // Verify the challenge belongs to this case and user
        if (challenge.caseId !== caseId || challenge.userId !== authUser.userId) {
          reply.code(403);
          return { ok: false, error: 'Forbidden', code: 'FORBIDDEN' };
        }

        // Rate limit: max 5 attempts
        if (challenge.attempts >= 5) {
          await redis.del(challengeKey);
          reply.code(429);
          return { ok: false, error: 'Too many attempts. Start a new challenge.', code: 'RATE_LIMITED' };
        }

        // Factor-aware proof check — OTP codes compare against the delivered
        // code; TOTP verifies the enrolled secret; passkey runs a real
        // WebAuthn step-up assertion.
        let proofValid = false;
        let proofError: { status: number; error: string; code: string } | null = null;
        if (challenge.factor === 'totp') {
          const totpRow = await db.query<{ secret_ciphertext: string }>(
            'SELECT secret_ciphertext FROM user_totp_factors WHERE user_id = $1 AND enabled = TRUE LIMIT 1',
            [challenge.userId],
          );
          const ciphertext = totpRow.rows[0]?.secret_ciphertext;
          if (!ciphertext) {
            proofError = { status: 409, error: 'Two-factor authentication is not configured', code: 'TWO_FACTOR_NOT_CONFIGURED' };
          } else {
            const decrypted = await decryptJsonPayload<{ secret: string }>(ciphertext, `totp-factor:${challenge.userId}`);
            proofValid = typeof payload.proof === 'string'
              && !!decrypted?.secret
              && verifyTotp(decrypted.secret, payload.proof.trim(), { stepSeconds: 30, digits: 6, window: 1 });
          }
        } else if (challenge.factor === 'passkey') {
          proofValid = typeof payload.proof === 'object'
            && await verifyPasskeyStepUp(db, challenge.userId, payload.proof as never);
        } else {
          proofValid = typeof payload.proof === 'string'
            && typeof challenge.code === 'string'
            && payload.proof.trim() === challenge.code;
        }

        if (proofError) {
          await redis.del(challengeKey);
          reply.code(proofError.status);
          return { ok: false, error: proofError.error, code: proofError.code };
        }

        if (!proofValid) {
          // Increment attempts
          await redis.set(challengeKey, JSON.stringify({
            ...challenge,
            attempts: challenge.attempts + 1,
          }), 'EX', 300);
          reply.code(400);
          return { ok: false, error: 'Incorrect code', code: 'INCORRECT_PROOF' };
        }

        // Challenge verified — clean up and issue a single-use restore token.
        // Recovery completes only through the restore endpoint presenting
        // this token, so session possession alone can never finish recovery.
        await redis.del(challengeKey);
        const restoreToken = `restore_${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, '')}`;
        await redis.set(
          `recovery:verified:${caseId}`,
          JSON.stringify({ token: restoreToken, userId: challenge.userId, factor: challenge.factor }),
          'EX',
          600,
        );

        return {
          ok: true,
          verified: true,
          restoreToken,
          nextAction: {
            label: 'Back to security',
            route: '/account-security',
          },
        };
      } catch (err) {
        request.log.error({ err, caseId, challengeId }, 'Failed to verify recovery challenge');
        reply.code(500);
        return { ok: false, error: 'Verification failed', code: 'INTERNAL_ERROR' };
      }
    },
  );

  // ── POST /account-security/incidents/:id/restore ────────────────────
  // Restore access after verification. NEVER auto-releases money.
  // The cooldown is enforced server-side — a recovered login cannot
  // immediately drain funds.
  app.post('/account-security/incidents/:id/restore', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) return unauthorized(reply);

    const { id: caseId } = request.params as { id: string };
    if (!caseId || caseId.length < 2 || caseId.length > 120) {
      reply.code(400);
      return { ok: false, error: 'Invalid case id', code: 'INVALID_CASE_ID' };
    }

    try {
      const incident = await getCompromiseCase(caseId);
      if (!incident) return notFound(reply);
      if (incident.userId !== authUser.userId && authUser.role !== 'admin') {
        reply.code(403);
        return { ok: false, error: 'Forbidden', code: 'FORBIDDEN' };
      }

      // Only allow restore from recovery_in_progress state
      if (incident.state !== 'recovery_in_progress') {
        reply.code(409);
        return {
          ok: false,
          error: 'Recovery must be in progress before restoring',
          code: 'INVALID_STATE',
        };
      }

      // Proof-of-verification gate: a non-admin restore must present the
      // single-use token issued by challenge-verify. Session possession alone
      // is not proof — the whole point of recovery is that the session may be
      // attacker-held.
      const isAdmin = authUser.role === 'admin';
      let verifiedFactor: string | null = null;
      if (!isAdmin) {
        const payload = restoreSchema.parse(request.body ?? {});
        const verifiedKey = `recovery:verified:${caseId}`;
        const rawVerified = await redis.get(verifiedKey);
        const verified = rawVerified
          ? (JSON.parse(rawVerified) as { token: string; userId: string; factor: string })
          : null;
        if (!verified || verified.token !== payload.restoreToken || verified.userId !== incident.userId) {
          reply.code(403);
          return {
            ok: false,
            error: 'Identity verification is required before restoring access',
            code: 'RECOVERY_PROOF_REQUIRED',
          };
        }
        await redis.del(verifiedKey);
        verifiedFactor = verified.factor;
      }

      await completeRecovery(caseId, {
        recoveryProof: isAdmin
          ? { adminOverride: true }
          : { factor: verifiedFactor, verifiedVia: 'recovery_challenge' },
        actorId: authUser.userId,
      });

      const updated = await getCompromiseCase(caseId);
      return {
        ok: true,
        restoration: {
          caseId: updated?.caseId ?? caseId,
          state: updated?.state ?? 'restored_monitored',
          cooldownUntil: updated?.cooldownUntil ?? '',
          monitoredUntil: updated?.monitoredUntil ?? '',
          nextAction: {
            label: 'Back to security',
            route: '/account-security',
          },
        },
      };
    } catch (err) {
      request.log.error({ err, caseId }, 'Failed to restore access');
      reply.code(500);
      return { ok: false, error: 'Could not restore access', code: 'INTERNAL_ERROR' };
    }
  });
};
