import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SignJWT, jwtVerify, importPKCS8, importSPKI, type KeyLike } from 'jose';
import { db } from '../db/pool.js';
import { config } from '../config.js';

export type AuthRole = 'user' | 'seller' | 'moderator' | 'admin';

const AUTH_ROLES = new Set<AuthRole>(['user', 'seller', 'moderator', 'admin']);

export interface AuthenticatedUser {
  userId: string;
  role: AuthRole;
  sessionId: string;
}

type RefreshLookupRow = {
  id: number;
  user_id: string;
  session_id: string;
  expires_at: string;
  revoked_at: string | null;
  session_revoked_at: string | null;
  role: AuthRole;
};

const JWT_AUDIENCE = 'thryftverse-app';
const JWT_ISSUER = 'thryftverse-api';

type ResolvedSigningKey =
  | { algorithm: 'HS256'; secret: string }
  | { algorithm: 'EdDSA'; privateKey: KeyLike | Uint8Array };

type ResolvedVerifyingKey =
  | { algorithm: 'HS256'; secret: string }
  | { algorithm: 'EdDSA'; publicKey: KeyLike | Uint8Array };

let cachedSigningKey: ResolvedSigningKey | null = null;
let cachedVerifyingKey: ResolvedVerifyingKey | null = null;

async function resolveSigningKeyAsync(): Promise<ResolvedSigningKey> {
  if (cachedSigningKey) {
    return cachedSigningKey;
  }

  if (
    config.jwtAlgorithm === 'EdDSA'
    && config.jwtEd25519PrivateKey
  ) {
    const privateKey = await importPKCS8(config.jwtEd25519PrivateKey, 'EdDSA');
    cachedSigningKey = { algorithm: 'EdDSA', privateKey };
    return cachedSigningKey;
  }

  cachedSigningKey = { algorithm: 'HS256', secret: config.authAccessTokenSecret };
  return cachedSigningKey;
}

async function resolveVerifyingKeyAsync(): Promise<ResolvedVerifyingKey> {
  if (cachedVerifyingKey) {
    return cachedVerifyingKey;
  }

  if (
    config.jwtAlgorithm === 'EdDSA'
    && config.jwtEd25519PublicKey
  ) {
    const publicKey = await importSPKI(config.jwtEd25519PublicKey, 'EdDSA');
    cachedVerifyingKey = { algorithm: 'EdDSA', publicKey };
    return cachedVerifyingKey;
  }

  cachedVerifyingKey = { algorithm: 'HS256', secret: config.authAccessTokenSecret };
  return cachedVerifyingKey;
}

function createOpaqueToken(prefix = 'tok') {
  return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
}

function hashOpaqueToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function futureTimestamp(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export interface SignTokenPayload {
  sub: string;
  role: AuthRole;
  sid: string;
  typ: string;
}

/**
 * Signs a JWT payload using the configured algorithm (EdDSA when Ed25519 keys
 * are present, HS256 otherwise for backward compatibility). Returns a compact
 * JWT string.
 */
export async function signToken(payload: SignTokenPayload): Promise<string> {
  const key = await resolveSigningKeyAsync();

  if (key.algorithm === 'EdDSA') {
    return new SignJWT({ role: payload.role, sid: payload.sid, typ: payload.typ })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(payload.sub)
      .setAudience(JWT_AUDIENCE)
      .setIssuer(JWT_ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${config.authAccessTokenTtlSeconds}s`)
      .setJti(crypto.randomUUID())
      .sign(key.privateKey);
  }

  return jwt.sign(
    {
      role: payload.role,
      sid: payload.sid,
      typ: payload.typ,
    },
    key.secret,
    {
      algorithm: 'HS256',
      subject: payload.sub,
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
      expiresIn: config.authAccessTokenTtlSeconds,
      jwtid: crypto.randomUUID(),
    }
  );
}

async function signAccessToken(userId: string, role: AuthRole, sessionId: string): Promise<string> {
  return signToken({ sub: userId, role, sid: sessionId, typ: 'access' });
}

/**
 * Verifies a JWT token and returns the parsed payload, or null if the token is
 * invalid, expired, or has an unexpected audience/issuer. Supports both EdDSA
 * and HS256 algorithms depending on configuration.
 */
export async function verifyToken(token: string): Promise<SignTokenPayload | null> {
  const key = await resolveVerifyingKeyAsync();

  if (key.algorithm === 'EdDSA') {
    try {
      const { payload } = await jwtVerify(token, key.publicKey, {
        algorithms: ['EdDSA'],
        audience: JWT_AUDIENCE,
        issuer: JWT_ISSUER,
      });
      return parseJosePayload(payload);
    } catch {
      return null;
    }
  }

  try {
    const payload = jwt.verify(token, key.secret, {
      algorithms: ['HS256'],
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
    });
    return parseJosePayload(payload);
  } catch {
    return null;
  }
}

function parseJosePayload(payload: unknown): SignTokenPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const maybe = payload as {
    sub?: unknown;
    role?: unknown;
    sid?: unknown;
    typ?: unknown;
  };

  if (
    typeof maybe.sub !== 'string' ||
    typeof maybe.role !== 'string' ||
    typeof maybe.sid !== 'string' ||
    maybe.typ !== 'access' ||
    !AUTH_ROLES.has(maybe.role as AuthRole)
  ) {
    return null;
  }

  return {
    sub: maybe.sub,
    role: maybe.role as AuthRole,
    sid: maybe.sid,
    typ: maybe.typ,
  };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, config.authPasswordHashCost);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function issueAuthSession(
  input: {
    userId: string;
    role: AuthRole;
  },
  context: {
    ipAddress?: string;
    userAgent?: string;
  }
) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const sessionId = `ses_${crypto.randomUUID()}`;
    const refreshToken = createOpaqueToken('rft');
    const refreshTokenHash = hashOpaqueToken(refreshToken);
    const refreshTokenExpiresAt = futureTimestamp(config.authRefreshTokenTtlSeconds);

    await client.query(
      `
        INSERT INTO user_sessions (id, user_id, user_agent, ip_address)
        VALUES ($1, $2, $3, $4)
      `,
      [sessionId, input.userId, context.userAgent ?? null, context.ipAddress ?? null]
    );

    await client.query(
      `
        INSERT INTO refresh_tokens (session_id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
      [sessionId, input.userId, refreshTokenHash, refreshTokenExpiresAt]
    );

    await client.query(
      `
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = $1
      `,
      [input.userId]
    );

    await client.query('COMMIT');

    return {
      accessToken: await signAccessToken(input.userId, input.role, sessionId),
      refreshToken,
      sessionId,
      accessTokenExpiresInSeconds: config.authAccessTokenTtlSeconds,
      refreshTokenExpiresAt,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function rotateRefreshSession(
  refreshToken: string,
  context: {
    ipAddress?: string;
    userAgent?: string;
  }
) {
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const lookupResult = await client.query<RefreshLookupRow>(
      `
        SELECT
          rt.id,
          rt.user_id,
          rt.session_id,
          rt.expires_at,
          rt.revoked_at,
          us.revoked_at AS session_revoked_at,
          u.role
        FROM refresh_tokens rt
        INNER JOIN user_sessions us ON us.id = rt.session_id
        INNER JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1
        LIMIT 1
        FOR UPDATE
      `,
      [refreshTokenHash]
    );

    const row = lookupResult.rows[0];

    if (!row) {
      throw new Error('Invalid refresh token');
    }

    if (row.revoked_at || row.session_revoked_at) {
      throw new Error('Refresh token is revoked');
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new Error('Refresh token expired');
    }

    const nextRefreshToken = createOpaqueToken('rft');
    const nextRefreshTokenHash = hashOpaqueToken(nextRefreshToken);
    const nextRefreshTokenExpiresAt = futureTimestamp(config.authRefreshTokenTtlSeconds);

    await client.query(
      `
        UPDATE refresh_tokens
        SET revoked_at = NOW()
        WHERE id = $1
      `,
      [row.id]
    );

    await client.query(
      `
        INSERT INTO refresh_tokens (session_id, user_id, token_hash, expires_at, rotated_from_id)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [row.session_id, row.user_id, nextRefreshTokenHash, nextRefreshTokenExpiresAt, row.id]
    );

    await client.query(
      `
        UPDATE user_sessions
        SET
          last_seen_at = NOW(),
          user_agent = COALESCE($2, user_agent),
          ip_address = COALESCE($3, ip_address)
        WHERE id = $1
      `,
      [row.session_id, context.userAgent ?? null, context.ipAddress ?? null]
    );

    await client.query('COMMIT');

    return {
      userId: row.user_id,
      role: row.role,
      sessionId: row.session_id,
      accessToken: await signAccessToken(row.user_id, row.role, row.session_id),
      refreshToken: nextRefreshToken,
      accessTokenExpiresInSeconds: config.authAccessTokenTtlSeconds,
      refreshTokenExpiresAt: nextRefreshTokenExpiresAt,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeSessionByRefreshToken(refreshToken: string) {
  const refreshTokenHash = hashOpaqueToken(refreshToken);

  await db.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL
    `,
    [refreshTokenHash]
  );
}

export async function revokeAllUserSessions(userId: string) {
  await db.query(
    `
      UPDATE user_sessions
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId]
  );

  await db.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId]
  );
}

export async function revokeOtherUserSessions(userId: string, keepSessionId: string) {
  await db.query(
    `
      UPDATE user_sessions
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND id <> $2
        AND revoked_at IS NULL
    `,
    [userId, keepSessionId]
  );

  await db.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND session_id <> $2
        AND revoked_at IS NULL
    `,
    [userId, keepSessionId]
  );
}

export async function verifyAccessToken(accessToken: string): Promise<AuthenticatedUser | null> {
  const parsed = await verifyToken(accessToken);
  if (!parsed) {
    return null;
  }

  const sessionResult = await db.query<{
    id: string;
    revoked_at: string | null;
  }>(
    `
      SELECT id, revoked_at
      FROM user_sessions
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [parsed.sid, parsed.sub]
  );

  const session = sessionResult.rows[0];
  if (!session || session.revoked_at) {
    return null;
  }

  return {
    userId: parsed.sub,
    role: parsed.role,
    sessionId: parsed.sid,
  };
}

export function hashOpaqueValue(value: string) {
  return hashOpaqueToken(value);
}

export function createPublicToken(prefix: string) {
  return createOpaqueToken(prefix);
}
