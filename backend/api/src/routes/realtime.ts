import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  parseRealtimeTopics,
  registerSseClient,
  registerWsClient,
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
};
