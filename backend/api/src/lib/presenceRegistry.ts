import type { Redis } from 'ioredis';
import { config } from '../config.js';
import { getRedisClient } from './redisClient.js';
import { logger } from './logger.js';

const PRESENCE_KEY_PREFIX = 'presence:user:';
const PRESENCE_TOPIC_PREFIX = 'presence:topic:';

interface PresenceRecord {
  socketId: string;
  topics: string[];
  lastSeen: number;
}

function presenceKey(userId: string): string {
  return `${PRESENCE_KEY_PREFIX}${userId}`;
}

function topicKey(topic: string): string {
  return `${PRESENCE_TOPIC_PREFIX}${topic}`;
}

function isRedisReady(client: Redis): boolean {
  return client.status === 'ready' || client.status === 'connect' || client.status === 'connecting';
}

/**
 * Registers a user as online with their subscribed topics. Stores a
 * per-user presence record with a TTL (refreshed by heartbeat) and
 * adds the user to a Redis set per topic for topic-scoped lookups.
 * Never throws — all errors are caught and logged.
 */
export async function setPresence(
  userId: string,
  socketId: string,
  topics: string[]
): Promise<void> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) {
      logger.warn({ userId }, '[presenceRegistry] redis unavailable, skipping setPresence');
      return;
    }

    const now = Date.now();
    const record: PresenceRecord = { socketId, topics, lastSeen: now };
    const key = presenceKey(userId);
    const ttl = config.presenceTtlSeconds;

    const pipeline = client.multi();
    pipeline.set(key, JSON.stringify(record), 'EX', ttl);
    for (const topic of topics) {
      pipeline.sadd(topicKey(topic), userId);
    }
    await pipeline.exec();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message, userId }, '[presenceRegistry] setPresence failed');
  }
}

/**
 * Removes a user's presence entry and removes them from all topic
 * sets they were registered against. Never throws — all errors are
 * caught and logged.
 */
export async function removePresence(
  userId: string,
  socketId: string
): Promise<void> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) {
      logger.warn({ userId }, '[presenceRegistry] redis unavailable, skipping removePresence');
      return;
    }

    const key = presenceKey(userId);
    const raw = await client.get(key);
    if (!raw) {
      return;
    }

    let record: PresenceRecord | null = null;
    try {
      const parsed = JSON.parse(raw) as Partial<PresenceRecord>;
      if (
        typeof parsed.socketId === 'string'
        && Array.isArray(parsed.topics)
      ) {
        record = parsed as PresenceRecord;
      }
    } catch {
      return;
    }

    if (!record || record.socketId !== socketId) {
      return;
    }

    const pipeline = client.multi();
    pipeline.del(key);
    for (const topic of record.topics) {
      pipeline.srem(topicKey(topic), userId);
    }
    await pipeline.exec();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message, userId }, '[presenceRegistry] removePresence failed');
  }
}

/**
 * Returns online user IDs, optionally filtered by topic. When a topic
 * is supplied, only users subscribed to that topic are returned. Never
 * throws — on failure returns an empty array.
 */
export async function getOnlineUsers(topic?: string): Promise<string[]> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) {
      logger.warn('[presenceRegistry] redis unavailable, getOnlineUsers returning empty');
      return [];
    }

    if (topic) {
      return await client.smembers(topicKey(topic));
    }

    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await client.scan(
        cursor,
        'MATCH',
        `${PRESENCE_KEY_PREFIX}*`,
        'COUNT',
        200
      );
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    const userIds: string[] = [];
    for (const key of keys) {
      const userId = key.slice(PRESENCE_KEY_PREFIX.length);
      if (userId.length > 0) {
        userIds.push(userId);
      }
    }
    return userIds;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message }, '[presenceRegistry] getOnlineUsers failed');
    return [];
  }
}

/**
 * Checks whether a user is currently online (has an active presence
 * record that has not expired). Never throws — on failure returns
 * false so callers can fall back to broadcasting.
 */
export async function isUserOnline(userId: string): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) {
      return false;
    }

    const exists = await client.exists(presenceKey(userId));
    return exists === 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message, userId }, '[presenceRegistry] isUserOnline failed');
    return false;
  }
}

/**
 * Returns the list of topics a user is currently subscribed to.
 * Never throws — on failure returns an empty array.
 */
export async function getSubscribedTopics(userId: string): Promise<string[]> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) {
      return [];
    }

    const raw = await client.get(presenceKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Partial<PresenceRecord>;
    if (!Array.isArray(parsed.topics)) {
      return [];
    }
    return parsed.topics;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message, userId }, '[presenceRegistry] getSubscribedTopics failed');
    return [];
  }
}
