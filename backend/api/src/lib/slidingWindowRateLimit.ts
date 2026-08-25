import type { Redis } from 'ioredis';
import { getRedisClient } from './redisClient.js';
import { logger } from './logger.js';

export interface SlidingWindowLimiterOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

export interface SlidingWindowCheckResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface SlidingWindowLimiter {
  check(key: string): Promise<SlidingWindowCheckResult>;
}

interface FixedWindowState {
  count: number;
  windowStart: number;
}

function isRedisReady(client: Redis): boolean {
  return client.status === 'ready' || client.status === 'connect' || client.status === 'connecting';
}

/**
 * Creates a sliding-window rate limiter backed by Redis sorted sets.
 * Each accepted request is stored as a sorted-set member scored by
 * its timestamp; entries older than the window are evicted before
 * counting. Falls back to an in-memory fixed window when Redis is
 * unavailable, and fails open (allows the request) on Redis errors
 * to preserve availability.
 */
export function createSlidingWindowLimiter(
  options: SlidingWindowLimiterOptions
): SlidingWindowLimiter {
  const { windowMs, max, keyPrefix } = options;
  const fallbackWindows = new Map<string, FixedWindowState>();

  async function checkSlidingWindow(
    client: Redis,
    redisKey: string,
    now: number
  ): Promise<SlidingWindowCheckResult> {
    const windowStart = now - windowMs;
    const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;

    const pipeline = client.multi();
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    pipeline.zadd(redisKey, now, member);
    pipeline.zcard(redisKey);
    pipeline.pexpire(redisKey, windowMs * 2);

    const results = await pipeline.exec();
    if (!results) {
      return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
    }

    const cardResult = results[2];
    const card = cardResult[1] as number;
    const count = card;
    const allowed = count <= max;
    const remaining = Math.max(0, max - count);

    if (!allowed) {
      const rollbackPipeline = client.multi();
      rollbackPipeline.zrem(redisKey, member);
      await rollbackPipeline.exec();
    }

    return {
      allowed,
      remaining,
      resetAt: now + windowMs,
    };
  }

  function checkFixedWindow(key: string, now: number): SlidingWindowCheckResult {
    const state = fallbackWindows.get(key);
    let count = 0;
    let windowStart = now;

    if (state && now - state.windowStart < windowMs) {
      count = state.count;
      windowStart = state.windowStart;
    }

    count += 1;
    const allowed = count <= max;
    const remaining = Math.max(0, max - count);

    if (allowed) {
      fallbackWindows.set(key, { count, windowStart });
    }

    return {
      allowed,
      remaining,
      resetAt: windowStart + windowMs,
    };
  }

  return {
    async check(key: string): Promise<SlidingWindowCheckResult> {
      const now = Date.now();
      const redisKey = `${keyPrefix}:${key}`;

      try {
        const client = getRedisClient();
        if (!isRedisReady(client)) {
          return checkFixedWindow(key, now);
        }
        return await checkSlidingWindow(client, redisKey, now);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
          { err: message, key },
          '[slidingWindowRateLimit] redis error, failing open'
        );
        return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
      }
    },
  };
}
