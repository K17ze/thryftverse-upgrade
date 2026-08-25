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
} from '../lib/realtime.js';
import { canUserSubscribeToRealtimeTopic } from '../lib/realtimeAuthorization.js';

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

    registerWsClient({
      socket: connection.socket,
      topics: Array.from(topics.values()),
      userId: authUserId,
      authorizeTopic: async (topic) =>
        canUserSubscribeToRealtimeTopic(db, authUserId, topic),
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

    registerSseClient({
      reply,
      topics: Array.from(topics.values()),
      userId: authUserId,
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
