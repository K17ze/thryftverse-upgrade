import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import type { AuthRole } from '../lib/auth.js';
import {
  createPublicToken,
  hashOpaqueValue,
  hashPassword,
  issueAuthSession,
  revokeAllUserSessions,
  revokeOtherUserSessions,
  revokeSessionByRefreshToken,
  rotateRefreshSession,
  verifyPassword,
} from '../lib/auth.js';
import {
  detectTokenReuse,
  trackRefreshTokenUse,
  invalidateAllUserSessions as invalidateAllTrackedRefreshTokens,
} from '../lib/tokenRefresh.js';
import { sendAuthEmail } from '../lib/authEmail.js';
import {
  decryptJsonPayload,
  encryptJsonPayload,
} from '../lib/keyService.js';
import {
  verifyAppleIdentityToken,
  verifyGoogleIdentityToken,
  type VerifiedSocialIdentity,
} from '../lib/identityProviders.js';
import {
  createOtpauthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotp,
} from '../lib/totp.js';
import { resolveClientIp } from '../lib/compliance.js';
import { checkFraudNonBlocking } from '../lib/fraudDetection.js';
import type { Redis } from 'ioredis';

// ── Types ──────────────────────────────────────────────────────────────

type AuthUserRow = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  password_hash: string | null;
  email_verified_at: string | null;
  two_factor_enabled: boolean;
};

type OAuthIdentityLookupRow = {
  user_id: string;
};

type MagicLinkTokenRow = {
  id: number;
  user_id: string | null;
  email: string;
  expires_at: string;
  consumed_at: string | null;
};

type OtpChallengeRow = {
  id: string;
  user_id: string | null;
  email: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  consumed_at: string | null;
};

type TotpFactorRow = {
  user_id: string;
  secret_ciphertext: string;
  enabled: boolean;
};

type RecoveryCodeRow = {
  id: number;
  code_hash: string;
  consumed_at: string | null;
};

// ── Inline helpers (copied from index.ts — auth-specific) ──────────────

function normalizeAuthEmail(value: string): string {
  return value.trim().toLowerCase();
}

function createUsernameSeed(email: string | null, fallback = 'member'): string {
  const source = (email ? email.split('@')[0] : fallback).toLowerCase();
  const normalized = source.replace(/[^a-z0-9_]/g, '').slice(0, 22);
  const base = normalized.length >= 3 ? normalized : fallback;
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base}_${suffix}`.slice(0, 32);
}

function createFutureIsoTimestamp(ttlSeconds: number): string {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

function createOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function normalizeOtpCode(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

function normalizeRecoveryCode(value: string): string {
  return value.trim().toUpperCase();
}

function buildMagicLinkUrl(token: string, email: string): string {
  const separator = config.authMagicLinkBaseUrl.includes('?') ? '&' : '?';
  return `${config.authMagicLinkBaseUrl}${separator}token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

function buildMagicLinkEmail(url: string) {
  return {
    subject: 'Your Thryftverse login link',
    text: `Use this secure login link to access your Thryftverse account: ${url}\n\nThis link expires in ${Math.round(config.authMagicLinkTtlSeconds / 60)} minutes.`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; line-height: 1.5; color: #171717;">
        <h2 style="margin-bottom: 12px;">Sign in to Thryftverse</h2>
        <p style="margin-bottom: 16px;">Use the secure link below to continue:</p>
        <p style="margin-bottom: 20px;"><a href="${url}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:999px;text-decoration:none;">Sign in now</a></p>
        <p style="margin-bottom: 0; color: #525252;">This link expires in ${Math.round(config.authMagicLinkTtlSeconds / 60)} minutes.</p>
      </div>
    `.trim(),
  };
}

function buildOtpEmail(code: string) {
  return {
    subject: 'Your Thryftverse verification code',
    text: `Your Thryftverse one-time code is ${code}. It expires in ${Math.round(config.authOtpTtlSeconds / 60)} minutes.`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; line-height: 1.5; color: #171717;">
        <h2 style="margin-bottom: 12px;">Your one-time code</h2>
        <p style="margin-bottom: 12px;">Enter this code to continue signing in:</p>
        <p style="font-size: 30px; letter-spacing: 6px; font-weight: 700; margin: 0 0 16px;">${code}</p>
        <p style="margin-bottom: 0; color: #525252;">This code expires in ${Math.round(config.authOtpTtlSeconds / 60)} minutes.</p>
      </div>
    `.trim(),
  };
}

function resolveHeaderString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
    return first?.trim() ?? null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function resolveRequestIpAddress(request: { ip: string; headers: Record<string, string | string[] | undefined> }): string {
  return resolveClientIp(request.ip, request.headers['x-forwarded-for']);
}

function resolveRequestUserAgent(request: { headers: Record<string, string | string[] | undefined> }): string | null {
  return resolveHeaderString(request.headers['user-agent']);
}

function resolveTotpAccountLabel(user: Pick<AuthUserRow, 'email' | 'username'>): string {
  if (user.email && user.email.trim().length > 0) {
    return user.email;
  }

  return user.username;
}

async function loadTotpFactor(client: Pool | PoolClient, userId: string, forUpdate = false): Promise<TotpFactorRow | null> {
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const result = await client.query<TotpFactorRow>(
    `
      SELECT user_id, secret_ciphertext, enabled
      FROM user_totp_factors
      WHERE user_id = $1
      LIMIT 1
      ${lockClause}
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

async function readTotpSecret(client: Pool | PoolClient, userId: string): Promise<string | null> {
  const factor = await loadTotpFactor(client, userId, false);
  if (!factor) {
    return null;
  }

  const decrypted = await decryptJsonPayload<{ secret: string }>(
    factor.secret_ciphertext,
    `totp-factor:${userId}`
  );

  if (!decrypted?.secret || typeof decrypted.secret !== 'string') {
    return null;
  }

  return decrypted.secret;
}

async function validateTwoFactorTokenForUser(
  client: Pool | PoolClient,
  user: AuthUserRow,
  token: string
): Promise<{ ok: boolean; error?: string; status?: number; code?: string }> {
  const normalizedToken = normalizeOtpCode(token);
  if (normalizedToken.length < 6) {
    return {
      ok: false,
      error: 'Two-factor authentication code is required',
      status: 400,
      code: 'TWO_FACTOR_CODE_REQUIRED',
    };
  }

  const secret = await readTotpSecret(client, user.id);
  if (!secret) {
    return {
      ok: false,
      error: 'Two-factor authentication is not fully configured for this account',
      status: 409,
      code: 'TWO_FACTOR_NOT_CONFIGURED',
    };
  }

  const tokenValid = verifyTotp(secret, normalizedToken, {
    stepSeconds: 30,
    digits: 6,
    window: 1,
  });

  if (tokenValid) {
    return { ok: true };
  }

  return {
    ok: false,
    error: 'Invalid two-factor authentication code',
    status: 401,
    code: 'TWO_FACTOR_CODE_INVALID',
  };
}

async function validateRecoveryCodeForUser(
  client: Pool | PoolClient,
  userId: string,
  recoveryCode: string
): Promise<{ ok: boolean; error?: string; status?: number; code?: string }> {
  const normalizedCode = normalizeRecoveryCode(recoveryCode);
  if (!normalizedCode) {
    return {
      ok: false,
      error: 'Recovery code is required',
      status: 400,
      code: 'RECOVERY_CODE_REQUIRED',
    };
  }

  const codeHash = hashOpaqueValue(normalizedCode);
  const result = await client.query<RecoveryCodeRow>(
    `
      SELECT id, code_hash, consumed_at
      FROM user_recovery_codes
      WHERE user_id = $1
        AND code_hash = $2
      LIMIT 1
      FOR UPDATE
    `,
    [userId, codeHash]
  );

  const row = result.rows[0];
  if (!row || row.consumed_at) {
    return {
      ok: false,
      error: 'Recovery code is invalid or already used',
      status: 401,
      code: 'RECOVERY_CODE_INVALID',
    };
  }

  await client.query(
    `
      UPDATE user_recovery_codes
      SET consumed_at = NOW()
      WHERE id = $1
    `,
    [row.id]
  );

  return { ok: true };
}

async function loadAuthUserById(client: Pool | PoolClient, userId: string, forUpdate = false): Promise<AuthUserRow | null> {
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const result = await client.query<AuthUserRow>(
    `
      SELECT id, username, email, role, password_hash, email_verified_at, two_factor_enabled
      FROM users
      WHERE id = $1
      LIMIT 1
      ${lockClause}
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

async function loadAuthUserByEmail(client: Pool | PoolClient, email: string, forUpdate = false): Promise<AuthUserRow | null> {
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const result = await client.query<AuthUserRow>(
    `
      SELECT id, username, email, role, password_hash, email_verified_at, two_factor_enabled
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      ${lockClause}
    `,
    [email]
  );

  return result.rows[0] ?? null;
}

async function createAuthUserFromIdentity(
  client: Pool | PoolClient,
  input: {
    email: string | null;
    emailVerified: boolean;
    usernameHint?: string | null;
  }
): Promise<AuthUserRow> {
  const userId = createPublicToken('usr');
  const emailVerifiedAt = input.email && input.emailVerified ? new Date().toISOString() : null;
  const username = createUsernameSeed(input.email, input.usernameHint?.trim() || 'member');

  const result = await client.query<AuthUserRow>(
    `
      INSERT INTO users (id, username, email, role, email_verified_at)
      VALUES ($1, $2, $3, 'user', $4)
      RETURNING id, username, email, role, password_hash, email_verified_at, two_factor_enabled
    `,
    [userId, username, input.email, emailVerifiedAt]
  );

  return result.rows[0];
}

function normalizeAuthRole(role: string | null | undefined): AuthRole {
  if (role === 'seller' || role === 'moderator' || role === 'admin') {
    return role;
  }

  return 'user';
}

function toAuthUserPayload(row: Pick<AuthUserRow, 'id' | 'username' | 'email' | 'role' | 'email_verified_at' | 'two_factor_enabled'>) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: normalizeAuthRole(row.role),
    emailVerified: Boolean(row.email_verified_at),
    twoFactorEnabled: Boolean(row.two_factor_enabled),
  };
}

function toAuthSuccessPayload(
  user: AuthUserRow,
  authSession: Awaited<ReturnType<typeof issueAuthSession>>
) {
  return {
    ok: true,
    user: toAuthUserPayload(user),
    accessToken: authSession.accessToken,
    refreshToken: authSession.refreshToken,
    accessTokenExpiresInSeconds: authSession.accessTokenExpiresInSeconds,
    refreshTokenExpiresAt: authSession.refreshTokenExpiresAt,
  };
}

async function issueSessionForAuthUser(
  user: AuthUserRow,
  request: {
    headers: Record<string, string | string[] | undefined>;
    ip: string;
  }
) {
  const authSession = await issueAuthSession(
    {
      userId: user.id,
      role: normalizeAuthRole(user.role),
    },
    {
      userAgent: resolveRequestUserAgent(request) ?? undefined,
      ipAddress: request.ip,
    }
  );

  return toAuthSuccessPayload(user, authSession);
}

async function resolveUserFromSocialIdentity(identity: VerifiedSocialIdentity, db: Pool): Promise<AuthUserRow> {
  const normalizedEmail = identity.email && identity.emailVerified
    ? normalizeAuthEmail(identity.email)
    : null;
  const client = await db.connect();
  let createdUserId: string | null = null;

  try {
    await client.query('BEGIN');

    const identityResult = await client.query<OAuthIdentityLookupRow>(
      `
        SELECT user_id
        FROM auth_oauth_identities
        WHERE provider = $1
          AND provider_user_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [identity.provider, identity.providerUserId]
    );

    let user: AuthUserRow | null = null;

    if (identityResult.rowCount) {
      user = await loadAuthUserById(client, identityResult.rows[0].user_id, true);
    }

    if (!user && normalizedEmail) {
      user = await loadAuthUserByEmail(client, normalizedEmail, true);
    }

    if (!user) {
      user = await createAuthUserFromIdentity(client, {
        email: normalizedEmail,
        emailVerified: identity.emailVerified,
        usernameHint: identity.provider,
      });
      createdUserId = user.id;
    } else if (normalizedEmail) {
      const maybeUpdated = await client.query<AuthUserRow>(
        `
          UPDATE users
          SET
            email = COALESCE(email, $2),
            email_verified_at = CASE
              WHEN $3 THEN COALESCE(email_verified_at, NOW())
              ELSE email_verified_at
            END
          WHERE id = $1
          RETURNING id, username, email, role, password_hash, email_verified_at, two_factor_enabled
        `,
        [user.id, normalizedEmail, identity.emailVerified]
      );
      user = maybeUpdated.rows[0] ?? user;
    }

    const upsertIdentityResult = await client.query<OAuthIdentityLookupRow>(
      `
        INSERT INTO auth_oauth_identities (provider, provider_user_id, user_id, email, email_verified)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (provider, provider_user_id)
        DO UPDATE
          SET
            user_id = auth_oauth_identities.user_id,
            email = COALESCE(EXCLUDED.email, auth_oauth_identities.email),
            email_verified = auth_oauth_identities.email_verified OR EXCLUDED.email_verified,
            updated_at = NOW(),
            last_login_at = NOW()
        RETURNING user_id
      `,
      [identity.provider, identity.providerUserId, user.id, normalizedEmail, identity.emailVerified]
    );

    const resolvedUserId = upsertIdentityResult.rows[0]?.user_id;
    if (!resolvedUserId) {
      throw new Error('Unable to resolve social identity');
    }

    if (createdUserId && createdUserId !== resolvedUserId) {
      await client.query(
        `
          DELETE FROM users
          WHERE id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM auth_oauth_identities
              WHERE user_id = $1
            )
        `,
        [createdUserId]
      );
    }

    if (user.id !== resolvedUserId) {
      const resolvedUser = await loadAuthUserById(client, resolvedUserId, true);
      if (!resolvedUser) {
        throw new Error('Unable to load social account');
      }
      user = resolvedUser;
    }

    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Dependencies ───────────────────────────────────────────────────────

type AuthRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  redis: Redis;
};

export const registerAuthRoutes = ({ app, db, redis }: AuthRouteDependencies) => {
  // ── POST /auth/signup ──────────────────────────────────────────────
  app.post(
    '/auth/signup',
    {
      bodyLimit: 4096,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'username', 'password'],
          properties: {
            email: { type: 'string', maxLength: 320 },
            username: { type: 'string', minLength: 3, maxLength: 32 },
            password: { type: 'string', minLength: 8, maxLength: 128 },
          },
          additionalProperties: false,
        },
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodySchema = z.object({
        email: z.string().trim().email().max(320),
        username: z.string().trim().min(3).max(32),
        password: z.string().min(8).max(128),
      });

      const payload = bodySchema.parse(request.body ?? {});
      const email = payload.email.trim().toLowerCase();

      const existing = await db.query<{ id: string }>(
        `
          SELECT id
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
        `,
        [email]
      );

      if (existing.rowCount) {
        reply.code(409);
        return {
          ok: false,
          error: 'An account with this email already exists',
        };
      }

      const userId = createPublicToken('usr');
      const passwordHash = await hashPassword(payload.password);

      const createResult = await db.query<AuthUserRow>(
        `
          INSERT INTO users (id, username, email, password_hash, role)
          VALUES ($1, $2, $3, $4, 'user')
          RETURNING id, username, email, role, password_hash, email_verified_at, two_factor_enabled
        `,
        [userId, payload.username.trim(), email, passwordHash]
      );

      const user = createResult.rows[0];
      const authSession = await issueAuthSession(
        {
          userId: user.id,
          role: normalizeAuthRole(user.role),
        },
        {
          userAgent: request.headers['user-agent'],
          ipAddress: request.ip,
        }
      );

      try {
        await checkFraudNonBlocking(
          redis,
          {
            eventType: 'signup',
            userId: user.id,
            email,
            headers: request.headers as Record<string, string | string[] | undefined>,
            ip: request.ip,
          },
          undefined,
          request.log,
        );
      } catch {
        // Fraud check failures must never break signup
      }

      reply.code(201);
      return {
        ok: true,
        user: toAuthUserPayload(user),
        accessToken: authSession.accessToken,
        refreshToken: authSession.refreshToken,
        accessTokenExpiresInSeconds: authSession.accessTokenExpiresInSeconds,
        refreshTokenExpiresAt: authSession.refreshTokenExpiresAt,
      };
    }
  );

  // ── POST /auth/login ───────────────────────────────────────────────
  app.post(
    '/auth/login',
    {
      bodyLimit: 4096,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', maxLength: 320 },
            password: { type: 'string', minLength: 1, maxLength: 128 },
            twoFactorCode: { type: 'string', minLength: 4, maxLength: 12 },
            recoveryCode: { type: 'string', minLength: 6, maxLength: 32 },
          },
          additionalProperties: false,
        },
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodySchema = z.object({
        email: z.string().trim().email().max(320),
        password: z.string().min(1).max(128),
        twoFactorCode: z.string().trim().min(4).max(12).optional(),
        recoveryCode: z.string().trim().min(6).max(32).optional(),
      });

      const payload = bodySchema.parse(request.body ?? {});

      const userResult = await db.query<AuthUserRow>(
        `
          SELECT id, username, email, role, password_hash, email_verified_at, two_factor_enabled
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
        `,
        [payload.email.trim().toLowerCase()]
      );

      const user = userResult.rows[0];
      const passwordHash = user?.password_hash;

      if (!user || !passwordHash) {
        reply.code(401);
        return {
          ok: false,
          error: 'Invalid credentials',
        };
      }

      const passwordMatches = await verifyPassword(payload.password, passwordHash);
      if (!passwordMatches) {
        reply.code(401);
        return {
          ok: false,
          error: 'Invalid credentials',
        };
      }

      if (user.two_factor_enabled) {
        const client = await db.connect();
        try {
          await client.query('BEGIN');

          const lockedUser = await loadAuthUserById(client, user.id, true);
          if (!lockedUser || !lockedUser.two_factor_enabled) {
            await client.query('ROLLBACK');
          } else if (payload.recoveryCode) {
            const recoveryValidation = await validateRecoveryCodeForUser(
              client,
              lockedUser.id,
              payload.recoveryCode
            );

            if (!recoveryValidation.ok) {
              await client.query('ROLLBACK');
              reply.code(recoveryValidation.status ?? 401);
              return {
                ok: false,
                error: recoveryValidation.error ?? 'Two-factor authentication failed',
                code: recoveryValidation.code,
              };
            }

            await client.query('COMMIT');
          } else {
            const tokenValidation = await validateTwoFactorTokenForUser(
              client,
              lockedUser,
              payload.twoFactorCode ?? ''
            );

            if (!tokenValidation.ok) {
              await client.query('ROLLBACK');
              reply.code(tokenValidation.status ?? 401);
              return {
                ok: false,
                error: tokenValidation.error ?? 'Two-factor authentication failed',
                code: tokenValidation.code,
              };
            }

            await client.query('COMMIT');
          }
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      const authSession = await issueAuthSession(
        {
          userId: user.id,
          role: normalizeAuthRole(user.role),
        },
        {
          userAgent: request.headers['user-agent'],
          ipAddress: request.ip,
        }
      );

      return {
        ok: true,
        user: toAuthUserPayload(user),
        accessToken: authSession.accessToken,
        refreshToken: authSession.refreshToken,
        accessTokenExpiresInSeconds: authSession.accessTokenExpiresInSeconds,
        refreshTokenExpiresAt: authSession.refreshTokenExpiresAt,
      };
    }
  );

  // ── POST /auth/2fa/enroll ──────────────────────────────────────────
  app.post(
    '/auth/2fa/enroll',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.authUser) {
        reply.code(401);
        return {
          ok: false,
          error: 'Unauthorized',
        };
      }

      const user = await loadAuthUserById(db, request.authUser.userId, false);
      if (!user) {
        reply.code(404);
        return {
          ok: false,
          error: 'User not found',
        };
      }

      const secret = generateTotpSecret();
      const encrypted = await encryptJsonPayload(
        'profile',
        { secret },
        `totp-factor:${user.id}`
      );

      await db.query(
        `
          INSERT INTO user_totp_factors (user_id, secret_ciphertext, enabled, updated_at)
          VALUES ($1, $2, FALSE, NOW())
          ON CONFLICT (user_id)
          DO UPDATE
            SET secret_ciphertext = EXCLUDED.secret_ciphertext,
                enabled = FALSE,
                updated_at = NOW()
        `,
        [user.id, encrypted.ciphertext]
      );

      await db.query(
        `
          UPDATE users
          SET two_factor_enabled = FALSE
          WHERE id = $1
        `,
        [user.id]
      );

      const accountLabel = resolveTotpAccountLabel(user);
      const issuer = 'Thryftverse';
      const otpauthUrl = createOtpauthUrl({
        secret,
        issuer,
        accountName: accountLabel,
        digits: 6,
        period: 30,
      });

      return {
        ok: true,
        issuer,
        accountName: accountLabel,
        secret,
        otpauthUrl,
      };
    }
  );

  // ── POST /auth/2fa/verify ──────────────────────────────────────────
  app.post(
    '/auth/2fa/verify',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.authUser) {
        reply.code(401);
        return {
          ok: false,
          error: 'Unauthorized',
        };
      }

      const bodySchema = z.object({
        code: z.string().trim().min(4).max(12),
      });

      const payload = bodySchema.parse(request.body ?? {});

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const user = await loadAuthUserById(client, request.authUser.userId, true);
        if (!user) {
          await client.query('ROLLBACK');
          reply.code(404);
          return {
            ok: false,
            error: 'User not found',
          };
        }

        const factor = await loadTotpFactor(client, user.id, true);
        if (!factor) {
          await client.query('ROLLBACK');
          reply.code(400);
          return {
            ok: false,
            error: 'Start two-factor enrollment before verification',
            code: 'TWO_FACTOR_ENROLLMENT_REQUIRED',
          };
        }

        const tokenValidation = await validateTwoFactorTokenForUser(client, user, payload.code);
        if (!tokenValidation.ok) {
          await client.query('ROLLBACK');
          reply.code(tokenValidation.status ?? 401);
          return {
            ok: false,
            error: tokenValidation.error ?? 'Invalid two-factor authentication code',
            code: tokenValidation.code,
          };
        }

        const recoveryCodes = generateRecoveryCodes(8);
        const recoveryCodeHashes = recoveryCodes.map((code) => hashOpaqueValue(code));

        await client.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [user.id]);
        for (const hash of recoveryCodeHashes) {
          await client.query(
            `
              INSERT INTO user_recovery_codes (user_id, code_hash)
              VALUES ($1, $2)
            `,
            [user.id, hash]
          );
        }

        await client.query(
          `
            UPDATE user_totp_factors
            SET enabled = TRUE, updated_at = NOW()
            WHERE user_id = $1
          `,
          [user.id]
        );

        await client.query(
          `
            UPDATE users
            SET two_factor_enabled = TRUE
            WHERE id = $1
          `,
          [user.id]
        );

        await client.query('COMMIT');

        return {
          ok: true,
          message: 'Two-factor authentication enabled',
          recoveryCodes,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  );

  // ── POST /auth/2fa/disable ─────────────────────────────────────────
  app.post('/auth/2fa/disable', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      reply.code(401);
      return {
        ok: false,
        error: 'Unauthorized',
      };
    }

    const bodySchema = z.object({
      code: z.string().trim().min(4).max(12).optional(),
      recoveryCode: z.string().trim().min(6).max(32).optional(),
    });

    const payload = bodySchema.parse(request.body ?? {});
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const user = await loadAuthUserById(client, request.authUser.userId, true);
      if (!user) {
        await client.query('ROLLBACK');
        reply.code(404);
        return {
          ok: false,
          error: 'User not found',
        };
      }

      if (user.two_factor_enabled) {
        if (!payload.code && !payload.recoveryCode) {
          await client.query('ROLLBACK');
          reply.code(400);
          return {
            ok: false,
            error: 'Two-factor verification code is required to disable 2FA',
            code: 'TWO_FACTOR_CODE_REQUIRED',
          };
        }

        const validation = payload.recoveryCode
          ? await validateRecoveryCodeForUser(client, user.id, payload.recoveryCode)
          : await validateTwoFactorTokenForUser(client, user, payload.code ?? '');

        if (!validation.ok) {
          await client.query('ROLLBACK');
          reply.code(validation.status ?? 401);
          return {
            ok: false,
            error: validation.error ?? 'Two-factor authentication failed',
            code: validation.code,
          };
        }
      }

      await client.query(
        `
          UPDATE users
          SET two_factor_enabled = FALSE
          WHERE id = $1
        `,
        [request.authUser.userId]
      );

      await client.query(
        `
          UPDATE user_totp_factors
          SET enabled = FALSE, updated_at = NOW()
          WHERE user_id = $1
        `,
        [request.authUser.userId]
      );

      await client.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [request.authUser.userId]);

      await client.query('COMMIT');

      return {
        ok: true,
        message: 'Two-factor authentication disabled',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // ── POST /auth/oauth/google ────────────────────────────────────────
  app.post(
    '/auth/oauth/google',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodySchema = z.object({
        idToken: z.string().min(20),
      });

      const payload = bodySchema.parse(request.body ?? {});

      let identity: VerifiedSocialIdentity;
      try {
        identity = await verifyGoogleIdentityToken(payload.idToken);
      } catch {
        reply.code(401);
        return {
          ok: false,
          error: 'Google identity token is invalid',
        };
      }

      const user = await resolveUserFromSocialIdentity(identity, db);
      return issueSessionForAuthUser(user, request);
    }
  );

  // ── POST /auth/oauth/apple ─────────────────────────────────────────
  app.post(
    '/auth/oauth/apple',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodySchema = z.object({
        identityToken: z.string().min(20),
      });

      const payload = bodySchema.parse(request.body ?? {});

      let identity: VerifiedSocialIdentity;
      try {
        identity = await verifyAppleIdentityToken(payload.identityToken);
      } catch {
        reply.code(401);
        return {
          ok: false,
          error: 'Apple identity token is invalid',
        };
      }

      const user = await resolveUserFromSocialIdentity(identity, db);
      return issueSessionForAuthUser(user, request);
    }
  );

  // ── POST /auth/magic-link/request ──────────────────────────────────
  app.post(
    '/auth/magic-link/request',
    {
      config: {
        rateLimit: {
          max: 12,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodySchema = z.object({
        email: z.string().trim().email().max(320),
      });

      const payload = bodySchema.parse(request.body ?? {});
      const normalizedEmail = normalizeAuthEmail(payload.email);

      const userLookup = await db.query<{ id: string }>(
        `
          SELECT id
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
        `,
        [normalizedEmail]
      );

      const token = createPublicToken('mlk');
      const tokenHash = hashOpaqueValue(token);
      const expiresAt = createFutureIsoTimestamp(config.authMagicLinkTtlSeconds);

      await db.query(
        `
          INSERT INTO auth_magic_links (
            user_id,
            email,
            token_hash,
            expires_at,
            requested_ip,
            requested_user_agent
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          userLookup.rows[0]?.id ?? null,
          normalizedEmail,
          tokenHash,
          expiresAt,
          resolveRequestIpAddress(request),
          resolveRequestUserAgent(request),
        ]
      );

      const magicLinkUrl = buildMagicLinkUrl(token, normalizedEmail);
      const magicEmail = buildMagicLinkEmail(magicLinkUrl);

      try {
        await sendAuthEmail({
          to: normalizedEmail,
          subject: magicEmail.subject,
          html: magicEmail.html,
          text: magicEmail.text,
        });
      } catch (error) {
        request.log.error({ err: error }, 'Magic link email delivery failed');
        reply.code(502);
        return {
          ok: false,
          error: 'Unable to send magic link right now',
        };
      }

      const response: {
        ok: true;
        message: string;
        developmentMagicLink?: string;
        developmentToken?: string;
      } = {
        ok: true,
        message: 'If your email is valid, a sign-in link has been sent.',
      };

      if (config.nodeEnv !== 'production' && config.authExposeDevelopmentArtifacts) {
        response.developmentMagicLink = magicLinkUrl;
        response.developmentToken = token;
      }

      return response;
    }
  );

  // ── POST /auth/magic-link/consume ──────────────────────────────────
  app.post(
    '/auth/magic-link/consume',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodySchema = z.object({
        token: z.string().min(20),
        email: z.string().trim().email().max(320).optional(),
      });

      const payload = bodySchema.parse(request.body ?? {});
      const tokenHash = hashOpaqueValue(payload.token);
      const normalizedRequestEmail = payload.email ? normalizeAuthEmail(payload.email) : null;

      const client = await db.connect();
      let user: AuthUserRow | null = null;
      let failure:
        | {
            status: number;
            body: { ok: false; error: string; code: string };
          }
        | null = null;

      try {
        await client.query('BEGIN');

        const tokenResult = await client.query<MagicLinkTokenRow>(
          `
            SELECT id, user_id, email, expires_at, consumed_at
            FROM auth_magic_links
            WHERE token_hash = $1
            LIMIT 1
            FOR UPDATE
          `,
          [tokenHash]
        );

        const tokenRow = tokenResult.rows[0];
        if (!tokenRow || tokenRow.consumed_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
          await client.query('ROLLBACK');
          failure = {
            status: 400,
            body: {
              ok: false,
              error: 'Magic link is invalid or expired',
              code: 'MAGIC_LINK_INVALID',
            },
          };
        } else {
          const tokenEmail = normalizeAuthEmail(tokenRow.email);
          if (normalizedRequestEmail && normalizedRequestEmail !== tokenEmail) {
            await client.query('ROLLBACK');
            failure = {
              status: 400,
              body: {
                ok: false,
                error: 'Magic link email does not match',
                code: 'MAGIC_LINK_EMAIL_MISMATCH',
              },
            };
          } else {
            if (tokenRow.user_id) {
              user = await loadAuthUserById(client, tokenRow.user_id, true);
            }

            if (!user) {
              user = await loadAuthUserByEmail(client, tokenEmail, true);
            }

            if (!user) {
              user = await createAuthUserFromIdentity(client, {
                email: tokenEmail,
                emailVerified: true,
                usernameHint: 'email',
              });
            } else {
              const maybeVerified = await client.query<AuthUserRow>(
                `
                  UPDATE users
                  SET
                    email = COALESCE(email, $2),
                    email_verified_at = COALESCE(email_verified_at, NOW())
                  WHERE id = $1
                  RETURNING id, username, email, role, password_hash, email_verified_at, two_factor_enabled
                `,
                [user.id, tokenEmail]
              );
              user = maybeVerified.rows[0] ?? user;
            }

            await client.query(
              `
                UPDATE auth_magic_links
                SET
                  consumed_at = NOW(),
                  user_id = $2
                WHERE id = $1
              `,
              [tokenRow.id, user.id]
            );

            await client.query('COMMIT');
          }
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      if (failure) {
        reply.code(failure.status);
        return failure.body;
      }

      if (!user) {
        reply.code(500);
        return {
          ok: false,
          error: 'Unable to complete magic-link sign in',
        };
      }

      return issueSessionForAuthUser(user, request);
    }
  );

  // ── POST /auth/otp/request ─────────────────────────────────────────
  app.post(
    '/auth/otp/request',
    {
      config: {
        rateLimit: {
          max: 12,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodySchema = z.object({
        email: z.string().trim().email().max(320),
      });

      const payload = bodySchema.parse(request.body ?? {});
      const normalizedEmail = normalizeAuthEmail(payload.email);

      const userLookup = await db.query<{ id: string }>(
        `
          SELECT id
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
        `,
        [normalizedEmail]
      );

      const challengeId = createPublicToken('otp');
      const code = createOtpCode();
      const codeHash = hashOpaqueValue(code);
      const expiresAt = createFutureIsoTimestamp(config.authOtpTtlSeconds);

      await db.query(
        `
          INSERT INTO auth_otp_challenges (
            id,
            user_id,
            email,
            code_hash,
            max_attempts,
            expires_at,
            requested_ip,
            requested_user_agent
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          challengeId,
          userLookup.rows[0]?.id ?? null,
          normalizedEmail,
          codeHash,
          config.authOtpMaxAttempts,
          expiresAt,
          resolveRequestIpAddress(request),
          resolveRequestUserAgent(request),
        ]
      );

      const otpEmail = buildOtpEmail(code);

      try {
        await sendAuthEmail({
          to: normalizedEmail,
          subject: otpEmail.subject,
          html: otpEmail.html,
          text: otpEmail.text,
        });
      } catch (error) {
        request.log.error({ err: error }, 'OTP email delivery failed');
        reply.code(502);
        return {
          ok: false,
          error: 'Unable to send OTP right now',
        };
      }

      const response: {
        ok: true;
        challengeId: string;
        expiresInSeconds: number;
        developmentCode?: string;
      } = {
        ok: true,
        challengeId,
        expiresInSeconds: config.authOtpTtlSeconds,
      };

      if (config.nodeEnv !== 'production' && config.authExposeDevelopmentArtifacts) {
        response.developmentCode = code;
      }

      return response;
    }
  );

  // ── POST /auth/otp/verify ──────────────────────────────────────────
  app.post(
    '/auth/otp/verify',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodySchema = z.object({
        challengeId: z.string().min(20),
        code: z.string().trim().min(4).max(10),
      });

      const payload = bodySchema.parse(request.body ?? {});

      const client = await db.connect();
      let user: AuthUserRow | null = null;
      let failure:
        | {
            status: number;
            body: { ok: false; error: string; code: string; attemptsRemaining?: number };
          }
        | null = null;

      try {
        await client.query('BEGIN');

        const challengeResult = await client.query<OtpChallengeRow>(
          `
            SELECT id, user_id, email, code_hash, attempts, max_attempts, expires_at, consumed_at
            FROM auth_otp_challenges
            WHERE id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [payload.challengeId]
        );

        const challenge = challengeResult.rows[0];
        if (!challenge || challenge.consumed_at) {
          await client.query('ROLLBACK');
          failure = {
            status: 400,
            body: {
              ok: false,
              error: 'OTP challenge is invalid or already used',
              code: 'OTP_CHALLENGE_INVALID',
            },
          };
        } else if (new Date(challenge.expires_at).getTime() <= Date.now()) {
          await client.query('ROLLBACK');
          failure = {
            status: 400,
            body: {
              ok: false,
              error: 'OTP challenge has expired',
              code: 'OTP_CHALLENGE_EXPIRED',
            },
          };
        } else if (challenge.attempts >= challenge.max_attempts) {
          await client.query('ROLLBACK');
          failure = {
            status: 429,
            body: {
              ok: false,
              error: 'Maximum OTP attempts reached',
              code: 'OTP_ATTEMPTS_EXCEEDED',
              attemptsRemaining: 0,
            },
          };
        } else {
          const providedHash = hashOpaqueValue(payload.code.trim());
          if (providedHash !== challenge.code_hash) {
            const nextAttempts = challenge.attempts + 1;
            const attemptsRemaining = Math.max(0, challenge.max_attempts - nextAttempts);

            await client.query(
              `
                UPDATE auth_otp_challenges
                SET attempts = $2
                WHERE id = $1
              `,
              [challenge.id, nextAttempts]
            );

            await client.query('COMMIT');

            failure = {
              status: attemptsRemaining === 0 ? 429 : 400,
              body: {
                ok: false,
                error: attemptsRemaining === 0 ? 'Maximum OTP attempts reached' : 'OTP code is invalid',
                code: attemptsRemaining === 0 ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_CODE_INVALID',
                attemptsRemaining,
              },
            };
          } else {
            if (challenge.user_id) {
              user = await loadAuthUserById(client, challenge.user_id, true);
            }

            if (!user) {
              user = await loadAuthUserByEmail(client, challenge.email, true);
            }

            if (!user) {
              user = await createAuthUserFromIdentity(client, {
                email: normalizeAuthEmail(challenge.email),
                emailVerified: true,
                usernameHint: 'otp',
              });
            } else {
              const maybeVerified = await client.query<AuthUserRow>(
                `
                  UPDATE users
                  SET
                    email = COALESCE(email, $2),
                    email_verified_at = COALESCE(email_verified_at, NOW())
                  WHERE id = $1
                  RETURNING id, username, email, role, password_hash, email_verified_at, two_factor_enabled
                `,
                [user.id, normalizeAuthEmail(challenge.email)]
              );
              user = maybeVerified.rows[0] ?? user;
            }

            await client.query(
              `
                UPDATE auth_otp_challenges
                SET
                  attempts = attempts + 1,
                  consumed_at = NOW(),
                  user_id = $2
                WHERE id = $1
              `,
              [challenge.id, user.id]
            );

            await client.query('COMMIT');
          }
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      if (failure) {
        reply.code(failure.status);
        return failure.body;
      }

      if (!user) {
        reply.code(500);
        return {
          ok: false,
          error: 'Unable to complete OTP sign in',
        };
      }

      return issueSessionForAuthUser(user, request);
    }
  );

  // ── POST /auth/refresh ─────────────────────────────────────────────
  app.post('/auth/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodySchema = z.object({
      refreshToken: z.string().min(20),
    });

    const payload = bodySchema.parse(request.body ?? {});

    try {
      const authSession = await rotateRefreshSession(payload.refreshToken, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      });

      const reused = await detectTokenReuse(authSession.userId, payload.refreshToken);
      if (reused) {
        await revokeAllUserSessions(authSession.userId);
        await invalidateAllTrackedRefreshTokens(authSession.userId);
        reply.code(401);
        return {
          ok: false,
          error: 'Refresh token reuse detected — all sessions invalidated',
        };
      }

      await trackRefreshTokenUse(
        authSession.userId,
        payload.refreshToken,
        config.authRefreshTokenTtlSeconds
      );

      const userResult = await db.query<AuthUserRow>(
        `
          SELECT id, username, email, role, password_hash, email_verified_at, two_factor_enabled
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [authSession.userId]
      );

      const user = userResult.rows[0];
      if (!user) {
        reply.code(401);
        return {
          ok: false,
          error: 'Session is no longer valid',
        };
      }

      return {
        ok: true,
        user: toAuthUserPayload(user),
        accessToken: authSession.accessToken,
        refreshToken: authSession.refreshToken,
        accessTokenExpiresInSeconds: authSession.accessTokenExpiresInSeconds,
        refreshTokenExpiresAt: authSession.refreshTokenExpiresAt,
      };
    } catch {
      reply.code(401);
      return {
        ok: false,
        error: 'Refresh token invalid or expired',
      };
    }
  });

  // ── GET /auth/me ───────────────────────────────────────────────────
  app.get('/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      reply.code(401);
      return {
        ok: false,
        error: 'Unauthorized',
      };
    }

    const result = await db.query<AuthUserRow>(
      `
        SELECT id, username, email, role, password_hash, email_verified_at, two_factor_enabled
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [request.authUser.userId]
    );

    const user = result.rows[0];
    if (!user) {
      reply.code(404);
      return {
        ok: false,
        error: 'User not found',
      };
    }

    return {
      ok: true,
      user: toAuthUserPayload(user),
    };
  });

  // ── POST /auth/logout ──────────────────────────────────────────────
  app.post('/auth/logout', async (request: FastifyRequest) => {
    const bodySchema = z.object({
      refreshToken: z.string().min(20).optional(),
    });

    const payload = bodySchema.parse(request.body ?? {});

    if (payload.refreshToken) {
      await revokeSessionByRefreshToken(payload.refreshToken);
    }

    if (request.authUser) {
      await db.query(
        `
          UPDATE user_sessions
          SET revoked_at = NOW()
          WHERE id = $1
            AND user_id = $2
            AND revoked_at IS NULL
        `,
        [request.authUser.sessionId, request.authUser.userId]
      );

      await db.query(
        `
          UPDATE refresh_tokens
          SET revoked_at = NOW()
          WHERE session_id = $1
            AND user_id = $2
            AND revoked_at IS NULL
        `,
        [request.authUser.sessionId, request.authUser.userId]
      );
    }

    return { ok: true };
  });

  // ── POST /auth/password/change ─────────────────────────────────────
  app.post(
    '/auth/password/change',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }

      const bodySchema = z.object({
        currentPassword: z.string().min(1).max(128),
        newPassword: z.string().min(8).max(128),
      });

      const payload = bodySchema.parse(request.body ?? {});

      if (payload.currentPassword === payload.newPassword) {
        reply.code(400);
        return { ok: false, error: 'New password must be different from current password' };
      }

      const userResult = await db.query<{ id: string; password_hash: string | null }>(
        `
          SELECT id, password_hash
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [request.authUser.userId]
      );

      const user = userResult.rows[0];
      if (!user) {
        reply.code(404);
        return { ok: false, error: 'User not found' };
      }

      if (!user.password_hash) {
        reply.code(400);
        return {
          ok: false,
          error: 'This account does not use a password. Use your sign-in provider instead.',
        };
      }

      const currentMatches = await verifyPassword(payload.currentPassword, user.password_hash);
      if (!currentMatches) {
        reply.code(401);
        return { ok: false, error: 'Current password is incorrect' };
      }

      const nextPasswordHash = await hashPassword(payload.newPassword);

      await db.query(
        `
          UPDATE users
          SET
            password_hash = $2,
            password_changed_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `,
        [user.id, nextPasswordHash]
      );

      await revokeOtherUserSessions(user.id, request.authUser.sessionId);

      return {
        ok: true,
        message: 'Password updated. Other devices have been signed out.',
      };
    }
  );

  // ── POST /auth/password-reset/request ──────────────────────────────
  app.post('/auth/password-reset/request', async (request: FastifyRequest) => {
    const bodySchema = z.object({
      email: z.string().trim().email().max(320),
    });

    const payload = bodySchema.parse(request.body ?? {});
    const normalizedEmail = payload.email.trim().toLowerCase();

    const userResult = await db.query<{ id: string }>(
      `
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [normalizedEmail]
    );

    let developmentToken: string | undefined;

    if (userResult.rowCount) {
      const userId = userResult.rows[0].id;
      const resetToken = createPublicToken('pwd');
      const resetTokenHash = hashOpaqueValue(resetToken);
      const expiresAt = new Date(Date.now() + config.authPasswordResetTokenTtlSeconds * 1000).toISOString();

      await db.query(
        `
          INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
          VALUES ($1, $2, $3)
        `,
        [userId, resetTokenHash, expiresAt]
      );

      if (config.nodeEnv !== 'production' && config.authExposeDevelopmentArtifacts) {
        developmentToken = resetToken;
      }
    }

    return {
      ok: true,
      message: 'If an account exists for that email, a reset link has been issued.',
      developmentToken,
    };
  });

  // ── POST /auth/password-reset/confirm ──────────────────────────────
  app.post('/auth/password-reset/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodySchema = z.object({
      token: z.string().min(20),
      newPassword: z.string().min(8).max(128),
    });

    const payload = bodySchema.parse(request.body ?? {});
    const tokenHash = hashOpaqueValue(payload.token);

    const tokenResult = await db.query<{
      id: number;
      user_id: string;
      expires_at: string;
      used_at: string | null;
    }>(
      `
        SELECT id, user_id, expires_at, used_at
        FROM password_reset_tokens
        WHERE token_hash = $1
        LIMIT 1
      `,
      [tokenHash]
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      reply.code(400);
      return {
        ok: false,
        error: 'Reset token invalid or expired',
      };
    }

    const nextPasswordHash = await hashPassword(payload.newPassword);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `
          UPDATE users
          SET
            password_hash = $2,
            password_changed_at = NOW(),
            two_factor_enabled = COALESCE(two_factor_enabled, FALSE)
          WHERE id = $1
        `,
        [tokenRow.user_id, nextPasswordHash]
      );

      await client.query(
        `
          UPDATE password_reset_tokens
          SET used_at = NOW()
          WHERE id = $1
        `,
        [tokenRow.id]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await revokeAllUserSessions(tokenRow.user_id);

    return {
      ok: true,
      message: 'Password reset complete. Please log in again.',
    };
  });
};
