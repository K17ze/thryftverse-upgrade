import crypto from 'node:crypto';
import { redis } from './redis.js';

const KEY_PREFIX = 'thryftverse:refresh-used';
const INDEX_PREFIX = 'thryftverse:refresh-used-index';

function userKey(userId: string): string {
  return `${KEY_PREFIX}:${userId}`;
}

function userIndexKey(userId: string): string {
  return `${INDEX_PREFIX}:${userId}`;
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Marks a refresh token as used by adding its hash to a Redis set keyed by
 * the user ID. Each entry is also TTL'd so the set does not grow unbounded.
 * The token hash is tracked (not the raw token) so that Redis compromise does
 * not leak usable refresh tokens.
 *
 * @param userId - The user the token belongs to.
 * @param token - The raw refresh token string.
 * @param expiresIn - Seconds until the token entry should expire from Redis.
 */
export async function trackRefreshTokenUse(
  userId: string,
  token: string,
  expiresIn: number
): Promise<void> {
  const hash = tokenHash(token);
  const setKey = userKey(userId);
  const indexKey = userIndexKey(userId);

  const pipeline = redis.multi();
  pipeline.sadd(setKey, hash);
  pipeline.sadd(indexKey, setKey);
  pipeline.expire(setKey, expiresIn);
  await pipeline.exec();
}

/**
 * Checks whether a refresh token has already been used (i.e. is present in the
 * Redis set of consumed tokens for the user). Returns true if the token was
 * previously tracked via {@link trackRefreshTokenUse}.
 *
 * @param userId - The user the token belongs to.
 * @param token - The raw refresh token string.
 */
export async function isRefreshTokenUsed(
  userId: string,
  token: string
): Promise<boolean> {
  const hash = tokenHash(token);
  const result = await redis.sismember(userKey(userId), hash);
  return result === 1;
}

/**
 * Detects refresh-token reuse. If the token has already been consumed, this
 * returns true and all tracked sessions for the user should be invalidated
 * immediately (the token may have been stolen). Returns false if the token
 * has not been used before.
 *
 * @param userId - The user the token belongs to.
 * @param token - The raw refresh token string.
 */
export async function detectTokenReuse(
  userId: string,
  token: string
): Promise<boolean> {
  return isRefreshTokenUsed(userId, token);
}

/**
 * Clears all tracked refresh-token entries for a user. This should be called
 * when all of a user's sessions are invalidated (e.g. after detected token
 * reuse, password change, or security incident).
 *
 * @param userId - The user whose tracked tokens should be cleared.
 */
export async function invalidateAllUserSessions(
  userId: string
): Promise<void> {
  const setKey = userKey(userId);
  const indexKey = userIndexKey(userId);

  const pipeline = redis.multi();
  pipeline.del(setKey);
  pipeline.srem(indexKey, setKey);
  await pipeline.exec();
}
