import { getRedisClient } from './redisClient.js';
import { logger } from './logger.js';

const SEQUENCE_KEY_PREFIX = 'realtime:sequence:';
const fallbackSequenceMap = new Map<string, number>();

function sequenceKey(topic: string): string {
  return `${SEQUENCE_KEY_PREFIX}${topic}`;
}

/**
 * Atomically increments and returns the next sequence number for a
 * topic using Redis `INCR`. On Redis failure, degrades to an
 * in-memory counter so the instance continues to function. Never
 * throws.
 */
export async function getNextSequence(topic: string): Promise<number> {
  try {
    const client = getRedisClient();
    const next = await client.incr(sequenceKey(topic));
    return next;
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), topic },
      '[realtimeSequence] Redis INCR failed — falling back to in-memory',
    );
    const next = (fallbackSequenceMap.get(topic) ?? 0) + 1;
    fallbackSequenceMap.set(topic, next);
    return next;
  }
}

/**
 * Returns the current sequence number for a topic without
 * incrementing. On Redis failure, returns the in-memory value or 0.
 * Never throws.
 */
export async function getSequence(topic: string): Promise<number> {
  try {
    const client = getRedisClient();
    const raw = await client.get(sequenceKey(topic));
    return raw ? Number(raw) : 0;
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), topic },
      '[realtimeSequence] Redis GET failed — returning in-memory value',
    );
    return fallbackSequenceMap.get(topic) ?? 0;
  }
}

/**
 * Resets the sequence for a topic to zero. Intended for testing.
 * Never throws.
 */
export async function resetSequence(topic: string): Promise<void> {
  try {
    const client = getRedisClient();
    await client.del(sequenceKey(topic));
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), topic },
      '[realtimeSequence] Redis DEL failed — resetting in-memory only',
    );
  }
  fallbackSequenceMap.delete(topic);
}
