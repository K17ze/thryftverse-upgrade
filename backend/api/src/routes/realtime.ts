import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  parseRealtimeTopics,
  registerSseClient,
  registerWsClient,
  getTopicSequence,
  replayEventsFromSequence,
  canReplayGap,
  publishRealtimeEvent,
} from '../lib/realtime.js';
import { canUserSubscribeToRealtimeTopic } from '../lib/realtimeAuthorization.js';
import { isPresenceHidden, isUserOnline, removePresence, setPresence } from '../lib/presenceRegistry.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

type RealtimeRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
};

const realtimeQuerySchema = z.object({
  topics: z.string().optional(),
});

const authorizedTopicsFor = async (db: Pool, userId: string, requestedTopics: string[]) => {
  const authorizedTopics: string[] = [];
  for (const topic of requestedTopics) {
    if (await canUserSubscribeToRealtimeTopic(db, userId, topic)) {
      authorizedTopics.push(topic);
    }
  }
  return authorizedTopics;
};

// The user_presence table is the persistent fallback for the Redis-backed
// registry — refresh cadence is deliberately coarser than the Redis TTL
// heartbeat to bound write volume per connection, but never coarser than
// the TTL itself: the REST snapshot counts `is_online` while last_seen_at
// is within ~2×TTL, so a refresh interval above the TTL would report false
// offline during exactly the Redis-outage window the fallback exists for.
const PRESENCE_DB_REFRESH_MS = Math.min(60_000, config.presenceTtlSeconds * 1000);

export function publishPresenceTransition(userId: string, isOnline: boolean): void {
  publishRealtimeEvent({
    topic: `presence.user:${userId}`,
    type: 'presence.update',
    payload: {
      userId,
      isOnline,
      lastSeenAt: new Date().toISOString(),
    },
  }).catch((error) => {
    logger.warn({ err: error instanceof Error ? error.message : String(error), userId }, '[presence] failed to publish presence.update');
  });
}

/**
 * trackConnectionPresence — wires a live realtime connection into the
 * presence registry. Marks the user online on connect, refreshes the
 * Redis presence record on the configured heartbeat cadence so it outlives
 * its TTL, mirrors state into the `user_presence` fallback table, and on
 * close marks the socket offline and broadcasts a `presence.update`
 * transition on `presence.user:{userId}` — but only when the user's
 * `activity_status_visible` privacy setting permits it and the transition
 * is real (no other live socket for the same user). Never throws.
 */
async function trackConnectionPresence(input: {
  db: Pool;
  userId: string;
  socketId: string;
  topics: string[];
  onClose: (listener: () => void) => void;
  /** Probe for a socket that already closed before this call — its
      `close` event fired during async client registration, so the
      `onClose` listener attached below would never run. */
  isClosed?: () => boolean;
}): Promise<void> {
  const { db, userId, socketId, topics, onClose, isClosed } = input;

  // Socket died while registerWsClient/registerSseClient was in flight —
  // its close event already fired, so the listener we'd attach would
  // never run and the heartbeat would leak the process lifetime while
  // presence ghosts online until key expiry.
  if (isClosed?.()) return;

  // Resolved fresh on every transition decision — a mid-session
  // `activity_status_visible` toggle must take effect without waiting for
  // reconnect. The lookup only runs on online/offline transitions (and at
  // connect), not per heartbeat, so the per-call indexed read is cheap.
  const resolveStatusVisible = async (): Promise<boolean> => {
    try {
      const visibility = await db.query<{ activity_status_visible: boolean }>(
        `SELECT activity_status_visible FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      return visibility.rows[0]?.activity_status_visible ?? true;
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error.message : String(error), userId },
        '[presence] activity-status lookup failed; defaulting to visible'
      );
      return true;
    }
  };

  let closed = false;
  let lastDbRefresh = Date.now();

  // A resurrected record (all prior socket records expired) is a real
  // online transition — without the publish, peers stay stale-offline
  // until they remount and refetch the REST snapshot. Skipped entirely
  // while the user is presence-hidden: their `activity_status_visible`
  // toggle marks them in the hidden set at toggle time, and the heartbeat
  // must not resurrect the record nor re-flip the fallback table.
  const refreshPresence = async (): Promise<void> => {
    if (await isPresenceHidden(userId)) return;
    // setPresence reports the pre-write online state atomically (HLEN inside
    // the same transaction as the HSET) — the previous isUserOnline→setPresence
    // read-modify-write let two concurrent connects both observe "offline"
    // and double-publish presence.update.
    const wasOnline = await setPresence(userId, socketId, topics);
    if (!wasOnline && (await resolveStatusVisible())) {
      publishPresenceTransition(userId, true);
    }
  };

  const heartbeat = setInterval(() => {
    if (closed) return;
    void refreshPresence();
    if (Date.now() - lastDbRefresh >= PRESENCE_DB_REFRESH_MS) {
      lastDbRefresh = Date.now();
      void (async () => {
        if (await isPresenceHidden(userId)) return;
        await db.query(
          `UPDATE user_presence SET last_seen_at = NOW(), is_online = TRUE, updated_at = NOW() WHERE user_id = $1 AND socket_id = $2`,
          [userId, socketId]
        ).catch(() => {});
      })();
    }
  }, config.presenceHeartbeatIntervalMs);
  heartbeat.unref?.();

  // The close listener is registered synchronously — a socket that closes
  // while the async setup below is in flight must still clear the heartbeat
  // and drop its presence record, otherwise the interval leaks and the user
  // ghosts online until the key expires.
  onClose(() => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    void (async () => {
      await removePresence(userId, socketId);
      const stillOnline = await isUserOnline(userId);
      try {
        await db.query(
          `UPDATE user_presence SET is_online = FALSE, last_seen_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND socket_id = $2`,
          [userId, socketId]
        );
      } catch {
        // Fallback-table write failure is non-fatal — Redis holds truth.
      }
      if (!stillOnline && (await resolveStatusVisible())) {
        publishPresenceTransition(userId, false);
      }
    })();
  });

  if (closed) return;
  await refreshPresence();
  if (closed) return;

  try {
    // Gate on the hidden set like refreshPresence does — a presence-hidden
    // user's reconnect must not flip the fallback table back to online.
    if (!(await isPresenceHidden(userId))) {
      await db.query(
        `
          INSERT INTO user_presence (user_id, socket_id, topics, last_seen_at, is_online)
          VALUES ($1, $2, $3, NOW(), TRUE)
          ON CONFLICT (user_id, socket_id)
          DO UPDATE SET topics = EXCLUDED.topics, last_seen_at = NOW(), is_online = TRUE, updated_at = NOW()
        `,
        [userId, socketId, topics]
      );
    }
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), userId },
      '[presence] failed to upsert user_presence row'
    );
  }
}

export const registerRealtimeRoutes = ({ app, db }: RealtimeRouteDependencies) => {
  app.get('/realtime/ws', { websocket: true }, async (connection, request) => {
    const parsed = realtimeQuerySchema.safeParse(request.query ?? {});
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      connection.socket.close(4401, 'unauthorized');
      return;
    }

    const requestedTopics = parsed.success ? parseRealtimeTopics(parsed.data.topics) : [];
    const authorizedTopics = await authorizedTopicsFor(db, authUserId, requestedTopics);
    const topics = new Set<string>([
      `notifications.user:${authUserId}`,
      ...authorizedTopics,
    ]);

    const clientId = await registerWsClient({
      socket: connection.socket,
      topics: Array.from(topics.values()),
      userId: authUserId,
      authorizeTopic: async (topic) =>
        canUserSubscribeToRealtimeTopic(db, authUserId, topic),
    });

    void trackConnectionPresence({
      db,
      userId: authUserId,
      socketId: clientId,
      topics: Array.from(topics.values()),
      onClose: (listener) => connection.socket.on('close', listener),
      isClosed: () => connection.socket.readyState !== connection.socket.OPEN,
    });
  });

  app.get('/realtime/stream', async (request, reply) => {
    const parsed = realtimeQuerySchema.safeParse(request.query ?? {});
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      reply.code(401);
      return {
        ok: false,
        error: 'Unauthorized',
      };
    }

    const requestedTopics = parsed.success ? parseRealtimeTopics(parsed.data.topics) : [];
    const authorizedTopics = await authorizedTopicsFor(db, authUserId, requestedTopics);
    const topics = new Set<string>([
      `notifications.user:${authUserId}`,
      ...authorizedTopics,
    ]);

    const clientId = await registerSseClient({
      reply,
      topics: Array.from(topics.values()),
      userId: authUserId,
    });

    void trackConnectionPresence({
      db,
      userId: authUserId,
      socketId: clientId,
      topics: Array.from(topics.values()),
      onClose: (listener) => reply.raw.on('close', listener),
      isClosed: () => reply.raw.writableEnded || reply.raw.destroyed,
    });
  });

  // R01: Event versioning resync endpoint.
  // Returns the current sequence number for a topic so clients can
  // detect gaps after reconnection. The client compares the returned
  // sequence with the last event seq it received; if there's a gap,
  // it knows it missed events and should refetch the canonical state
  // (e.g., re-fetch auction detail) rather than trusting stale data.
  app.get('/realtime/seq', async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const querySchema = z.object({
      topic: z.string().min(2).max(120),
    });
    const parsed = querySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid topic' };
    }

    const { topic } = parsed.data;
    const authorized = await canUserSubscribeToRealtimeTopic(db, authUserId, topic);
    if (!authorized) {
      reply.code(403);
      return { ok: false, error: 'Not authorized for this topic' };
    }

    return {
      ok: true,
      topic,
      seq: await getTopicSequence(topic),
    };
  });

  // R07: Event replay endpoint.
  // Returns events from a given sequence number so clients that detect
  // a gap (via /realtime/seq) can replay missed events without a full
  // resnapshot. When the gap exceeds the buffer size, returns
  // `canReplay: false` signaling the client to resnapshot instead.
  app.get('/realtime/replay', async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const querySchema = z.object({
      topic: z.string().min(2).max(120),
      fromSeq: z.coerce.number().int().min(0).default(0),
    });
    const parsed = querySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid parameters' };
    }

    const { topic, fromSeq } = parsed.data;
    const authorized = await canUserSubscribeToRealtimeTopic(db, authUserId, topic);
    if (!authorized) {
      reply.code(403);
      return { ok: false, error: 'Not authorized for this topic' };
    }

    const replayable = canReplayGap(topic, fromSeq);
    if (!replayable) {
      return {
        ok: true,
        topic,
        canReplay: false,
        currentSeq: await getTopicSequence(topic),
        events: [],
      };
    }

    const events = replayEventsFromSequence(topic, fromSeq);
    return {
      ok: true,
      topic,
      canReplay: true,
      currentSeq: await getTopicSequence(topic),
      events,
    };
  });
};
