import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { SignJWT, jwtVerify, importSPKI, importPKCS8, type KeyLike } from 'jose';
import { db } from '../db/pool.js';
import { config } from '../config.js';
import { logger } from './logger.js';

// ── Workforce JWT ───────────────────────────────────────────────────────
//
// Separate audience and issuer from consumer tokens. Consumer JWTs
// (audience "thryftverse-app") are cryptographically rejected by ops routes.
//
// NIST SP 800-63B-4 (July 2025 final):
//   - AAL2 must offer phishing-resistant authentication option
//   - AAL3 requires phishing-resistant authenticator with non-exportable key
//   - WebAuthn/FIDO2 is the standard for phishing resistance
//   - Manual OTP is NOT phishing-resistant

const WORKFORCE_JWT_AUDIENCE = 'thryftverse-ops';
const WORKFORCE_JWT_ISSUER = 'thryftverse-workforce-idp';

export interface WorkforcePrincipal {
  id: string;
  idpSubject: string;
  displayName: string;
  email: string;
  team: string;
  region: string;
  legalEntity: string;
  jurisdiction: string | null;
  employmentStatus: string;
  isServiceIdentity: boolean;
  authAssuranceLevel: number;
  managedDeviceId: string | null;
  trainingFlags: Record<string, unknown>;
  riskScore: number;
  dormantSince: string | null;
  disabledAt: string | null;
}

export interface WorkforceSession {
  id: string;
  principalId: string;
  deviceId: string | null;
  devicePosture: Record<string, unknown>;
  networkZone: string;
  sourceIp: string | null;
  authAssurance: number;
  stepUpAt: string | null;
  stepUpReason: string | null;
  riskScore: number;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string;
}

export interface WorkforceToken {
  principal: WorkforcePrincipal;
  session: WorkforceSession;
  permissions: string[];
  grants: Array<{ permission: string; scope: Record<string, unknown>; expiresAt: string }>;
}

// ── Token signing ───────────────────────────────────────────────────────

type ResolvedKey =
  | { algorithm: 'HS256'; secret: string }
  | { algorithm: 'EdDSA'; privateKey: KeyLike | Uint8Array };

type ResolvedVerifyKey =
  | { algorithm: 'HS256'; secret: string }
  | { algorithm: 'EdDSA'; publicKey: KeyLike | Uint8Array };

let cachedSignKey: ResolvedKey | null = null;
let cachedVerifyKey: ResolvedVerifyKey | null = null;

async function resolveSignKey(): Promise<ResolvedKey> {
  if (cachedSignKey) return cachedSignKey;
  if (config.jwtAlgorithm === 'EdDSA' && config.jwtEd25519PrivateKey) {
    const privateKey = await importPKCS8(config.jwtEd25519PrivateKey, 'EdDSA');
    cachedSignKey = { algorithm: 'EdDSA', privateKey };
    return cachedSignKey;
  }
  cachedSignKey = { algorithm: 'HS256', secret: config.authAccessTokenSecret };
  return cachedSignKey;
}

async function resolveVerifyKey(): Promise<ResolvedVerifyKey> {
  if (cachedVerifyKey) return cachedVerifyKey;
  if (config.jwtAlgorithm === 'EdDSA' && config.jwtEd25519PublicKey) {
    const publicKey = await importSPKI(config.jwtEd25519PublicKey, 'EdDSA');
    cachedVerifyKey = { algorithm: 'EdDSA', publicKey };
    return cachedVerifyKey;
  }
  cachedVerifyKey = { algorithm: 'HS256', secret: config.authAccessTokenSecret };
  return cachedVerifyKey;
}

export async function signWorkforceToken(input: {
  principalId: string;
  sessionId: string;
  authAssurance: number;
  stepUpAt?: string;
  stepUpReason?: string;
}): Promise<string> {
  const key = await resolveSignKey();

  if (key.algorithm === 'EdDSA') {
    return new SignJWT({
      typ: 'workforce_access',
      assurance: input.authAssurance,
      sid: input.sessionId,
      step_up: input.stepUpAt ?? null,
      step_up_reason: input.stepUpReason ?? null,
    })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(input.principalId)
      .setAudience(WORKFORCE_JWT_AUDIENCE)
      .setIssuer(WORKFORCE_JWT_ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${config.authAccessTokenTtlSeconds}s`)
      .setJti(crypto.randomUUID())
      .sign(key.privateKey);
  }

  // HS256 fallback — still separate audience/issuer from consumer
  const payload = {
    typ: 'workforce_access',
    assurance: input.authAssurance,
    sid: input.sessionId,
    step_up: input.stepUpAt ?? null,
    step_up_reason: input.stepUpReason ?? null,
  };
  // Use jose for HS256 too for consistency
  const secret = new TextEncoder().encode(key.secret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.principalId)
    .setAudience(WORKFORCE_JWT_AUDIENCE)
    .setIssuer(WORKFORCE_JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${config.authAccessTokenTtlSeconds}s`)
    .setJti(crypto.randomUUID())
    .sign(secret);
}

// ── Token verification ──────────────────────────────────────────────────

interface WorkforceJWTPayload {
  sub: string;
  typ: string;
  assurance: number;
  sid?: string;
  step_up: string | null;
  step_up_reason: string | null;
}

export async function verifyWorkforceToken(token: string): Promise<WorkforceJWTPayload | null> {
  const key = await resolveVerifyKey();

  try {
    if (key.algorithm === 'EdDSA') {
      const { payload } = await jwtVerify(token, key.publicKey, {
        algorithms: ['EdDSA'],
        audience: WORKFORCE_JWT_AUDIENCE,
        issuer: WORKFORCE_JWT_ISSUER,
      });
      return parseWorkforcePayload(payload);
    }

    const secret = new TextEncoder().encode(key.secret);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      audience: WORKFORCE_JWT_AUDIENCE,
      issuer: WORKFORCE_JWT_ISSUER,
    });
    return parseWorkforcePayload(payload);
  } catch {
    return null;
  }
}

function parseWorkforcePayload(payload: unknown): WorkforceJWTPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.sub !== 'string' ||
    p.typ !== 'workforce_access' ||
    typeof p.assurance !== 'number'
  ) {
    return null;
  }
  return {
    sub: p.sub,
    typ: p.typ as string,
    assurance: p.assurance,
    step_up: (p.step_up as string) ?? null,
    step_up_reason: (p.step_up_reason as string) ?? null,
  };
}

// ── Resolve workforce token to full principal + session + permissions ───

export async function resolveWorkforceToken(token: string): Promise<WorkforceToken | null> {
  const parsed = await verifyWorkforceToken(token);
  if (!parsed) return null;

  const client = await db.connect();
  try {
    // Load principal
    const principalRow = await client.query<{
      id: string;
      idp_subject: string;
      display_name: string;
      email: string;
      team: string;
      region: string;
      legal_entity: string;
      jurisdiction: string | null;
      employment_status: string;
      is_service_identity: boolean;
      auth_assurance_level: number;
      managed_device_id: string | null;
      training_flags: Record<string, unknown>;
      risk_score: number;
      dormant_since: string | null;
      disabled_at: string | null;
    }>(
      `SELECT * FROM workforce_principals WHERE id = $1 LIMIT 1`,
      [parsed.sub],
    );

    const pRow = principalRow.rows[0];
    if (!pRow || pRow.disabled_at || pRow.employment_status !== 'active') {
      return null;
    }

    // Service identities cannot use interactive console sessions
    if (pRow.is_service_identity) {
      return null;
    }

    // Load the specific session bound to this token via the sid claim.
    // This prevents token-from-session-A resolving to session-B context
    // when a principal has multiple concurrent sessions.
    const sessionId = parsed.sid;
    if (!sessionId) return null;

    const sessionRow = await client.query<{
      id: string;
      device_id: string | null;
      device_posture: Record<string, unknown>;
      network_zone: string;
      source_ip: string | null;
      auth_assurance: number;
      step_up_at: string | null;
      step_up_reason: string | null;
      risk_score: number;
      idle_expires_at: string;
      absolute_expires_at: string;
      revoked_at: string | null;
      last_seen_at: string;
    }>(
      `
        SELECT * FROM workforce_sessions
        WHERE id = $1
          AND principal_id = $2
          AND revoked_at IS NULL
          AND absolute_expires_at > NOW()
          AND idle_expires_at > NOW()
        LIMIT 1
      `,
      [sessionId, parsed.sub],
    );

    const sRow = sessionRow.rows[0];
    if (!sRow) return null;

    // Update last_seen_at and idle_expires_at (sliding window)
    const idleTtlSeconds = config.workforceSessionIdleTtlSeconds;
    await client.query(
      `
        UPDATE workforce_sessions
        SET last_seen_at = NOW(), idle_expires_at = NOW() + ($1 || ' seconds')::INTERVAL
        WHERE id = $2
      `,
      [String(idleTtlSeconds), sRow.id],
    );

    // Load active grants with permissions
    const grantsRow = await client.query<{
      permission_action: string;
      scope: Record<string, unknown>;
      expires_at: string;
    }>(
      `
        SELECT wp.action AS permission_action, wg.scope, wg.expires_at
        FROM workforce_grants wg
        INNER JOIN workforce_permissions wp ON wp.id = wg.permission_id
        WHERE wg.principal_id = $1
          AND wg.revoked_at IS NULL
          AND wg.effective_at <= NOW()
          AND wg.expires_at > NOW()
      `,
      [parsed.sub],
    );

    const grants = grantsRow.rows.map((r) => ({
      permission: r.permission_action,
      scope: r.scope,
      expiresAt: r.expires_at,
    }));

    const permissions = grants.map((g) => g.permission);

    const principal: WorkforcePrincipal = {
      id: pRow.id,
      idpSubject: pRow.idp_subject,
      displayName: pRow.display_name,
      email: pRow.email,
      team: pRow.team,
      region: pRow.region,
      legalEntity: pRow.legal_entity,
      jurisdiction: pRow.jurisdiction,
      employmentStatus: pRow.employment_status,
      isServiceIdentity: pRow.is_service_identity,
      authAssuranceLevel: pRow.auth_assurance_level,
      managedDeviceId: pRow.managed_device_id,
      trainingFlags: pRow.training_flags,
      riskScore: pRow.risk_score,
      dormantSince: pRow.dormant_since,
      disabledAt: pRow.disabled_at,
    };

    const session: WorkforceSession = {
      id: sRow.id,
      principalId: parsed.sub,
      deviceId: sRow.device_id,
      devicePosture: sRow.device_posture,
      networkZone: sRow.network_zone,
      sourceIp: sRow.source_ip,
      authAssurance: sRow.auth_assurance,
      stepUpAt: sRow.step_up_at,
      stepUpReason: sRow.step_up_reason,
      riskScore: sRow.risk_score,
      idleExpiresAt: sRow.idle_expires_at,
      absoluteExpiresAt: sRow.absolute_expires_at,
      revokedAt: sRow.revoked_at,
      lastSeenAt: sRow.last_seen_at,
    };

    return { principal, session, permissions, grants };
  } finally {
    client.release();
  }
}

// ── Session creation ────────────────────────────────────────────────────

export async function createWorkforceSession(input: {
  principalId: string;
  deviceId?: string;
  devicePosture?: Record<string, unknown>;
  networkZone?: string;
  sourceIp?: string;
  userAgentHash?: string;
  authAssurance: number;
  stepUpReason?: string;
}): Promise<{ sessionId: string; token: string; expiresAt: string }> {
  const sessionId = `wfs_${crypto.randomUUID()}`;
  const absoluteTtlSeconds = config.workforceSessionAbsoluteTtlSeconds;
  const idleTtlSeconds = config.workforceSessionIdleTtlSeconds;

  await db.query(
    `
      INSERT INTO workforce_sessions (
        id, principal_id, device_id, device_posture, network_zone,
        source_ip, user_agent_hash, auth_assurance, step_up_at, step_up_reason,
        idle_expires_at, absolute_expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9,
        NOW() + ($10 || ' seconds')::INTERVAL,
        NOW() + ($11 || ' seconds')::INTERVAL)
    `,
    [
      sessionId,
      input.principalId,
      input.deviceId ?? null,
      JSON.stringify(input.devicePosture ?? {}),
      input.networkZone ?? 'unknown',
      input.sourceIp ?? null,
      input.userAgentHash ?? null,
      input.authAssurance,
      input.stepUpReason ?? null,
      String(idleTtlSeconds),
      String(absoluteTtlSeconds),
    ],
  );

  const token = await signWorkforceToken({
    principalId: input.principalId,
    sessionId,
    authAssurance: input.authAssurance,
    stepUpReason: input.stepUpReason,
  });

  return {
    sessionId,
    token,
    expiresAt: new Date(Date.now() + config.authAccessTokenTtlSeconds * 1000).toISOString(),
  };
}

// ── Step-up authentication ──────────────────────────────────────────────
//
// Required immediately before payout approval, journal adjustment,
// destination reveal, data export, account recovery, DLQ purge, break-glass.

export async function performStepUp(
  db: Pool | PoolClient,
  sessionId: string,
  reason: string,
): Promise<void> {
  await db.query(
    `
      UPDATE workforce_sessions
      SET step_up_at = NOW(), step_up_reason = $2
      WHERE id = $1 AND revoked_at IS NULL
    `,
    [sessionId, reason],
  );
}

export function hasRecentStepUp(session: WorkforceSession, maxAgeSeconds = 300): boolean {
  if (!session.stepUpAt) return false;
  const stepUpTime = new Date(session.stepUpAt).getTime();
  return Date.now() - stepUpTime < maxAgeSeconds * 1000;
}

// ── Session revocation ──────────────────────────────────────────────────

export async function revokeWorkforceSession(sessionId: string): Promise<void> {
  await db.query(
    `UPDATE workforce_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId],
  );
}

export async function revokeAllWorkforceSessions(principalId: string): Promise<void> {
  await db.query(
    `UPDATE workforce_sessions SET revoked_at = NOW() WHERE principal_id = $1 AND revoked_at IS NULL`,
    [principalId],
  );
}

// ── Leaver disablement (propagates within 5 minutes) ────────────────────

export async function disableWorkforcePrincipal(
  principalId: string,
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE workforce_principals SET disabled_at = NOW(), employment_status = 'disabled', updated_at = NOW() WHERE id = $1`,
      [principalId],
    );
    await client.query(
      `UPDATE workforce_sessions SET revoked_at = NOW() WHERE principal_id = $1 AND revoked_at IS NULL`,
      [principalId],
    );
    await client.query(
      `UPDATE workforce_grants SET revoked_at = NOW() WHERE principal_id = $1 AND revoked_at IS NULL`,
      [principalId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
