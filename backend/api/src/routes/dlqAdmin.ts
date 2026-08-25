import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getDLQStats, replayDLQJob, purgeDLQ } from '../lib/dlqMonitor.js';

type DLQAdminRouteDependencies = {
  app: FastifyInstance;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const purgeBodySchema = z.object({
  olderThanDays: z.coerce.number().int().min(1).max(365).default(30),
});

function ensureAdmin(request: FastifyRequest, createApiError: DLQAdminRouteDependencies['createApiError']): void {
  if (!request.authUser || request.authUser.role !== 'admin') {
    throw createApiError('FORBIDDEN', 'Admin access required');
  }
}

/**
 * Registers DLQ (dead-letter queue) admin routes. All routes require admin
 * authentication. Exposes endpoints for viewing DLQ stats, replaying
 * individual failed jobs, and purging old DLQ entries.
 *
 * Routes:
 *   GET  /ops/dlq/stats                    — DLQ stats for all queues
 *   POST /ops/dlq/:queue/replay/:jobId     — Replay a specific job from DLQ
 *   POST /ops/dlq/:queue/purge             — Purge old entries from a DLQ
 */
export const registerDLQAdminRoutes = ({
  app,
  createApiError,
  resolveAuthenticatedUserId,
}: DLQAdminRouteDependencies) => {
  app.get('/ops/dlq/stats', async (request) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const stats = await getDLQStats();

    return {
      ok: true,
      queues: stats,
    };
  });

  app.post('/ops/dlq/:queue/replay/:jobId', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const { queue, jobId } = request.params as { queue: string; jobId: string };

    if (!queue || !jobId) {
      reply.code(400);
      return { ok: false, error: 'Queue and jobId parameters are required' };
    }

    const replayed = await replayDLQJob(queue, jobId);

    if (!replayed) {
      reply.code(404);
      return {
        ok: false,
        error: `Failed to replay job ${jobId} from DLQ for queue ${queue}. Job may not exist or queue is unknown.`,
      };
    }

    return {
      ok: true,
      queue,
      jobId,
      message: `Job ${jobId} replayed from DLQ to main queue ${queue}`,
    };
  });

  app.post('/ops/dlq/:queue/purge', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const { queue } = request.params as { queue: string };

    if (!queue) {
      reply.code(400);
      return { ok: false, error: 'Queue parameter is required' };
    }

    const parsed = purgeBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body parameters', details: parsed.error.flatten() };
    }

    const purged = await purgeDLQ(queue, parsed.data.olderThanDays);

    return {
      ok: true,
      queue,
      purged,
      olderThanDays: parsed.data.olderThanDays,
    };
  });
};
