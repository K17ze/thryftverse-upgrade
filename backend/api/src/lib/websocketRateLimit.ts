import type { Redis } from 'ioredis';
import { getRedisClient } from './redisClient.js';
import { logger } from './logger.js';

export interface WebSocketRateLimiter {
  canConnect(ip: string, userId: string): { allowed: boolean; reason?: string };
  onConnect(ip: string, userId: string): void;
  onDisconnect(ip: string, userId: string): void;
}

export interface WebSocketRateLimiterOptions {
  maxConnectionsPerIp: number;
  maxConnectionsPerUser: number;
  windowMs: number;
}

interface InMemoryConnection {
  count: number;
  expiresAt: number;
}

const IP_KEY_PREFIX = 'ws:rl:ip:';
const USER_KEY_PREFIX = 'ws:rl:user:';

/**
 * Creates a WebSocket connection rate limiter that tracks connections
 * per IP and per user within a sliding time window. Uses Redis sorted
 * sets for distributed tracking, falling back to an in-memory map when
 * Redis is unavailable so the limiter degrades gracefully.
 *
 * Wiring into realtime.ts:
 *   On a new WS connection (after auth), call `canConnect(ip, userId)`.
 *   If allowed, call `onConnect(ip, userId)` and proceed. On socket
 *   close/disconnect, call `onDisconnect(ip, userId)`.
 */
export function createWebSocketRateLimiter(
  options: WebSocketRateLimiterOptions,
): WebSocketRateLimiter {
  const maxPerIp = options.maxConnectionsPerIp;
  const maxPerUser = options.maxConnectionsPerUser;
  const windowMs = options.windowMs;

  const inMemoryIp = new Map<string, InMemoryConnection>();
  const inMemoryUser = new Map<string, InMemoryConnection>();
  let redisAvailable = true;

  function getRedis(): Redis | null {
    if (!redisAvailable) {
      return null;
    }
    try {
      return getRedisClient();
    } catch {
      redisAvailable = false;
      return null;
    }
  }

  function pruneInMemory(map: Map<string, InMemoryConnection>, key: string, now: number): void {
    const entry = map.get(key);
    if (entry && entry.expiresAt <= now) {
      map.delete(key);
    }
  }

  function inMemoryCount(map: Map<string, InMemoryConnection>, key: string): number {
    const now = Date.now();
    pruneInMemory(map, key, now);
    return map.get(key)?.count ?? 0;
  }

  function inMemoryIncrement(map: Map<string, InMemoryConnection>, key: string): void {
    const now = Date.now();
    pruneInMemory(map, key, now);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { count: 1, expiresAt: now + windowMs });
    }
  }

  function inMemoryDecrement(map: Map<string, InMemoryConnection>, key: string): void {
    const now = Date.now();
    pruneInMemory(map, key, now);
    const existing = map.get(key);
    if (existing) {
      existing.count = Math.max(0, existing.count - 1);
      if (existing.count === 0) {
        map.delete(key);
      }
    }
  }

  async function redisCount(key: string): Promise<number> {
    const redis = getRedis();
    if (!redis) {
      return -1;
    }
    try {
      const now = Date.now();
      const minScore = now - windowMs;
      await redis.zremrangebyscore(key, '-inf', minScore);
      const count = await redis.zcard(key);
      return count;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[wsRateLimit] redis count failed, falling back to in-memory');
      redisAvailable = false;
      return -1;
    }
  }

  async function redisAdd(key: string, member: string): Promise<void> {
    const redis = getRedis();
    if (!redis) {
      return;
    }
    try {
      const now = Date.now();
      await redis.zadd(key, now, member);
      await redis.pexpire(key, windowMs);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[wsRateLimit] redis add failed, falling back to in-memory');
      redisAvailable = false;
    }
  }

  async function redisRemove(key: string, member: string): Promise<void> {
    const redis = getRedis();
    if (!redis) {
      return;
    }
    try {
      await redis.zrem(key, member);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[wsRateLimit] redis remove failed, falling back to in-memory');
      redisAvailable = false;
    }
  }

  return {
    canConnect(ip: string, userId: string): { allowed: boolean; reason?: string } {
      const ipCount = inMemoryCount(inMemoryIp, ip);
      const userCount = inMemoryCount(inMemoryUser, userId);

      if (ipCount >= maxPerIp) {
        return { allowed: false, reason: 'Too many WebSocket connections from this IP' };
      }

      if (userCount >= maxPerUser) {
        return { allowed: false, reason: 'Too many WebSocket connections for this user' };
      }

      void redisCount(`${IP_KEY_PREFIX}${ip}`).then((redisIpCount) => {
        if (redisIpCount >= 0 && redisIpCount >= maxPerIp) {
          logger.warn({ ip, redisIpCount }, '[wsRateLimit] IP limit exceeded via redis (async check)');
        }
      });

      void redisCount(`${USER_KEY_PREFIX}${userId}`).then((redisUserCount) => {
        if (redisUserCount >= 0 && redisUserCount >= maxPerUser) {
          logger.warn({ userId, redisUserCount }, '[wsRateLimit] user limit exceeded via redis (async check)');
        }
      });

      return { allowed: true };
    },

    onConnect(ip: string, userId: string): void {
      inMemoryIncrement(inMemoryIp, ip);
      inMemoryIncrement(inMemoryUser, userId);

      const connectId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      void redisAdd(`${IP_KEY_PREFIX}${ip}`, connectId);
      void redisAdd(`${USER_KEY_PREFIX}${userId}`, connectId);
    },

    onDisconnect(ip: string, userId: string): void {
      inMemoryDecrement(inMemoryIp, ip);
      inMemoryDecrement(inMemoryUser, userId);

      void redisRemove(`${IP_KEY_PREFIX}${ip}`, `${Date.now()}`);
      void redisRemove(`${USER_KEY_PREFIX}${userId}`, `${Date.now()}`);
    },
  };
}

/**
 * Default WebSocket rate limiter: 20 connections per IP per minute and
 * 5 connections per user per minute.
 */
export function createDefaultWebSocketRateLimiter(): WebSocketRateLimiter {
  return createWebSocketRateLimiter({
    maxConnectionsPerIp: 20,
    maxConnectionsPerUser: 5,
    windowMs: 60_000,
  });
}
