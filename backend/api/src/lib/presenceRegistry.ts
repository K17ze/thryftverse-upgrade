import type { Redis } from 'ioredis';
import { config } from '../config.js';
import { getRedisClient } from './redisClient.js';
import { logger } from './logger.js';

const PRESENCE_KEY_PREFIX = 'presence:user:';
const PRESENCE_TOPIC_PREFIX = 'presence:topic:';
const PRESENCE_HIDDEN_KEY = 'presence:hidden';

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

function parseRecord(raw: string | undefined): PresenceRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PresenceRecord>;
    if (typeof parsed.socketId === 'string' && Array.isArray(parsed.topics)) {
      return parsed as PresenceRecord;
    }
  } catch {
    // Malformed record — treated as absent.
  }
  return null;
}

/**
 * Registers a socket as online with its subscribed topics. Presence is
 * stored as a Redis hash of `socketId → record` per user so multi-device
 * sessions stay online while ANY socket is live — last-writer-wins on a
 * single record would broadcast a false "offline" when the most recent
 * socket closed while another was still connected. The hash TTL is
 * refreshed on every heartbeat; when the last socket is removed the hash
 * empties and Redis deletes the key. Never throws.
 *
 * Returns whether the user already had a live socket record before this
 * write. The HLEN rides inside the same MULTI as the HSET — commands in a
 * Redis transaction execute sequentially with no interleaving — so it is
 * the atomic "was already online" signal the previous
 * isUserOnline→setPresence read-modify-write lacked: two concurrent
 * connects can no longer both observe "offline" and double-publish
 * `presence.update`. Returns false on Redis failure, matching
 * isUserOnline's degrade-to-broadcast contract.
 */
export async function setPresence(
  userId: string,
  socketId: string,
  topics: string[]
): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) {
      logger.warn({ userId }, '[presenceRegistry] redis unavailable, skipping setPresence');
      return false;
    }

    const record: PresenceRecord = { socketId, topics, lastSeen: Date.now() };
    const key = presenceKey(userId);

    const pipeline = client.multi();
    pipeline.hlen(key);
    pipeline.hset(key, socketId, JSON.stringify(record));
    pipeline.expire(key, config.presenceTtlSeconds);
    for (const topic of topics) {
      pipeline.sadd(topicKey(topic), userId);
    }
    const results = await pipeline.exec();
    const priorSocketCount = Number(results?.[0]?.[1] ?? 0);
    return priorSocketCount > 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message, userId }, '[presenceRegistry] setPresence failed');
    return false;
  }
}

/**
 * Removes one socket's presence entry and drops the user from topic sets
 * that no remaining socket still holds. Never throws — all errors are
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
    const all = await client.hgetall(key);
    const mine = parseRecord(all[socketId]);
    if (!mine) {
      return;
    }

    // Topics another live socket still subscribes to must keep the user
    // registered — only srem topics unique to the departing socket.
    const remainingTopics = new Set<string>();
    for (const [otherSocketId, raw] of Object.entries(all)) {
      if (otherSocketId === socketId) continue;
      const other = parseRecord(raw);
      if (other) {
        for (const topic of other.topics) {
          remainingTopics.add(topic);
        }
      }
    }

    const pipeline = client.multi();
    pipeline.hdel(key, socketId);
    for (const topic of mine.topics) {
      if (!remainingTopics.has(topic)) {
        pipeline.srem(topicKey(topic), userId);
      }
    }
    await pipeline.exec();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message, userId }, '[presenceRegistry] removePresence failed');
  }
}

/**
 * Removes ALL of a user's presence records — every socket entry in the
 * `presence:user:{userId}` hash plus the user's membership in every topic
 * set any of those sockets subscribed to. Used when a user's
 * `activity_status_visible` privacy setting is switched off mid-session:
 * live sockets keep heartbeating, but the registry must not report or
 * broadcast them as online. Never throws — all errors are caught and
 * logged.
 */
export async function clearUserPresence(userId: string): Promise<void> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) {
      logger.warn({ userId }, '[presenceRegistry] redis unavailable, skipping clearUserPresence');
      return;
    }

    const key = presenceKey(userId);
    const all = await client.hgetall(key);
    const topics = new Set<string>();
    for (const raw of Object.values(all)) {
      const record = parseRecord(raw);
      if (record) {
        for (const topic of record.topics) {
          topics.add(topic);
        }
      }
    }

    const pipeline = client.multi();
    pipeline.del(key);
    for (const topic of topics) {
      pipeline.srem(topicKey(topic), userId);
    }
    await pipeline.exec();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message, userId }, '[presenceRegistry] clearUserPresence failed');
  }
}

/**
 * Marks a user presence-hidden (activity_status_visible toggled off
 * mid-session): clears all live socket records and adds them to the
 * hidden set so subsequent heartbeats can't resurrect the record while
 * the flag is off. Never throws.
 */
export async function markPresenceHidden(userId: string): Promise<void> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) return;
    await clearUserPresence(userId);
    await client.sadd(PRESENCE_HIDDEN_KEY, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message, userId }, '[presenceRegistry] markPresenceHidden failed');
  }
}

/**
 * Removes a user from the hidden set (activity_status_visible toggled
 * back on) — the next heartbeat re-registers their sockets normally.
 * Never throws.
 */
export async function unmarkPresenceHidden(userId: string): Promise<void> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) return;
    await client.srem(PRESENCE_HIDDEN_KEY, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message, userId }, '[presenceRegistry] unmarkPresenceHidden failed');
  }
}

/**
 * Whether a user is presence-hidden. Never throws — on failure returns
 * false so callers degrade to normal presence behaviour.
 */
export async function isPresenceHidden(userId: string): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) return false;
    return (await client.sismember(PRESENCE_HIDDEN_KEY, userId)) === 1;
  } catch {
    return false;
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

    const hidden = await client.smembers(PRESENCE_HIDDEN_KEY);
    const hiddenSet = new Set(hidden);

    if (topic) {
      const members = await client.smembers(topicKey(topic));
      return members.filter((id) => !hiddenSet.has(id));
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
      if (userId.length > 0 && !hiddenSet.has(userId)) {
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
 * Checks whether a user is currently online — i.e. has at least one live
 * socket record that has not expired. Never throws — on failure returns
 * false so callers can fall back to broadcasting.
 */
export async function isUserOnline(userId: string): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) {
      return false;
    }

    const pipeline = client.multi();
    pipeline.hlen(presenceKey(userId));
    pipeline.sismember(PRESENCE_HIDDEN_KEY, userId);
    const [countRes, hiddenRes] = (await pipeline.exec()) ?? [];
    const count = (countRes?.[1] as number | undefined) ?? 0;
    const hidden = hiddenRes?.[1] === 1;
    return count > 0 && !hidden;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message, userId }, '[presenceRegistry] isUserOnline failed');
    return false;
  }
}

/**
 * Returns the union of topics across a user's live sockets.
 * Never throws — on failure returns an empty array.
 */
export async function getSubscribedTopics(userId: string): Promise<string[]> {
  try {
    const client = getRedisClient();
    if (!isRedisReady(client)) {
      return [];
    }

    const all = await client.hgetall(presenceKey(userId));
    const topics = new Set<string>();
    for (const raw of Object.values(all)) {
      const record = parseRecord(raw);
      if (record) {
        for (const topic of record.topics) {
          topics.add(topic);
        }
      }
    }
    return [...topics];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message, userId }, '[presenceRegistry] getSubscribedTopics failed');
    return [];
  }
}
