import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type { FastifyRequest } from 'fastify';
import { logger } from './logger.js';

export interface AuthenticatedApiKey {
  keyId: string;
  name: string;
  scopes: string[];
}

interface ApiKeyRow {
  id: string;
  name: string;
  scopes: string[];
  is_active: boolean;
  expires_at: string | null;
}

const KEY_PREFIX = 'tvk_';

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateApiKey(): string {
  return `${KEY_PREFIX}${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Creates a new API key, storing only the SHA-256 hash in the database.
 * The raw key is returned once and is never retrievable again.
 */
export async function createApiKey(
  db: Pool,
  options: { name: string; scopes: string[]; createdBy: string; expiresAt?: Date },
): Promise<{ key: string; keyId: string }> {
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 8);
  const keyId = crypto.randomUUID();

  await db.query(
    `
      INSERT INTO api_keys (id, name, key_hash, key_prefix, scopes, created_by, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      keyId,
      options.name,
      keyHash,
      keyPrefix,
      options.scopes,
      options.createdBy,
      options.expiresAt ? options.expiresAt.toISOString() : null,
    ],
  );

  return { key: rawKey, keyId };
}

/**
 * Verifies an API key by hashing the input and comparing to the stored
 * hash. Returns the key metadata if found and active, or null otherwise.
 * Updates last_used_at on successful verification.
 */
export async function verifyApiKey(
  db: Pool,
  key: string,
): Promise<AuthenticatedApiKey | null> {
  if (!key.startsWith(KEY_PREFIX)) {
    return null;
  }

  const keyHash = hashApiKey(key);

  const result = await db.query<ApiKeyRow>(
    `
      SELECT id, name, scopes, is_active, expires_at
      FROM api_keys
      WHERE key_hash = $1
      LIMIT 1
    `,
    [keyHash],
  );

  const row = result.rows[0];
  if (!row || !row.is_active) {
    return null;
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }

  await db
    .query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.id])
    .catch((err: unknown) => {
      logger.warn({ err: (err as Error).message }, '[apiKeyAuth] failed to update last_used_at');
    });

  return {
    keyId: row.id,
    name: row.name,
    scopes: row.scopes,
  };
}

/**
 * Revokes an API key by setting is_active to false.
 */
export async function revokeApiKey(db: Pool, keyId: string): Promise<void> {
  await db.query(
    `
      UPDATE api_keys
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
    `,
    [keyId],
  );
}

/**
 * Fastify hook that extracts an API key from the x-api-key header and
 * verifies it against the database. Returns the authenticated key
 * metadata, or null if no valid key was provided.
 */
export async function authenticateApiKey(
  request: FastifyRequest,
  db: Pool,
): Promise<AuthenticatedApiKey | null> {
  const headerValue = request.headers['x-api-key'];
  if (!headerValue || Array.isArray(headerValue)) {
    return null;
  }

  const key = headerValue.trim();
  if (!key) {
    return null;
  }

  try {
    return await verifyApiKey(db, key);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[apiKeyAuth] verifyApiKey failed');
    return null;
  }
}
