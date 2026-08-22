import { Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

let sharedClient: Redis | null = null;

/**
 * Returns a lazily-initialised shared Redis client singleton used by
 * the realtime sequence manager and other realtime pub/sub helpers.
 * Connection errors are logged but never thrown so callers can degrade
 * gracefully to in-memory fallbacks.
 */
export function getRedisClient(): Redis {
  if (sharedClient) {
    return sharedClient;
  }

  sharedClient = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });

  sharedClient.on('error', (err) => {
    logger.warn({ err: err.message }, '[redisClient] shared redis error');
  });

  return sharedClient;
}

/**
 * Closes the shared Redis client if one was created. Safe to call
 * multiple times.
 */
export async function closeRedisClient(): Promise<void> {
  if (sharedClient) {
    await sharedClient.quit();
    sharedClient = null;
  }
}
