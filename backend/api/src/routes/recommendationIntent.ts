import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';

type RouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  redis: Redis;
  resolveAuthenticatedUserId: (
    request: FastifyRequest,
    requestedUserId?: string,
  ) => string;
};

const mutateBodySchema = z.object({
  idempotencyKey: z.string().min(1).max(256),
  scope: z.enum(['topic', 'brand', 'category', 'seller', 'item', 'session']),
  targetId: z.string().min(1).max(256),
  targetLabel: z.string().min(1).max(256),
  direction: z.enum(['more', 'usual', 'less', 'exclude', 'add', 'remove']),
  source: z.enum(['your_algorithm', 'feed_action', 'onboarding', 'search']).default('your_algorithm'),
  expiresAt: z.string().datetime().optional(),
  expectedIntentVersion: z.number().int().min(0).optional(),
  topicCategory: z.string().max(128).optional(),
});

const modeBodySchema = z.object({
  profileMode: z.enum(['personalized', 'non_profiled']),
});

const statusQuerySchema = z.object({
  mutationId: z.coerce.number().int().positive(),
});

function intentEpochKey(userId: string): string {
  return `recommendations:intent:${userId}`;
}

async function invalidateIntentCache(
  redis: Redis,
  userId: string,
  log: { warn: (info: Record<string, unknown>, msg: string) => void },
): Promise<void> {
  try {
    await redis.incr(intentEpochKey(userId));
  } catch (error) {
    log.warn({ err: error, userId }, 'Intent cache invalidation unavailable');
  }
}

function bandFromDirection(direction: string): string {
  if (direction === 'more') return 'more';
  if (direction === 'less') return 'less';
  if (direction === 'exclude') return 'excluded';
  return 'usual';
}

export function registerRecommendationIntentRoutes({
  app,
  db,
  redis,
  resolveAuthenticatedUserId,
}: RouteDependencies): void {
  app.get('/recommendations/intent/:userId/profile', async (request, reply) => {
    const { userId: requestedUserId } = request.params as { userId: string };
    const userId = resolveAuthenticatedUserId(request, requestedUserId);

    let intentVersion = 0;
    let profileMode = 'personalized';
    let topics: unknown[] = [];

    try {
      const versionRow = await db.query<{
        intent_version: string;
        profile_mode: string;
      }>(
        'SELECT intent_version, profile_mode FROM user_intent_versions WHERE user_id = $1',
        [userId],
      );
      if (versionRow.rows.length > 0) {
        intentVersion = Number(versionRow.rows[0].intent_version);
        profileMode = versionRow.rows[0].profile_mode;
      }

      const topicRows = await db.query<{
        topic_id: string;
        topic_label: string;
        topic_category: string;
        influence_band: string;
        source_type: string;
        evidence_count: number;
        removable: boolean;
        paused: boolean;
        last_evidence_at: string | null;
        updated_at: string;
      }>(
        `SELECT topic_id, topic_label, topic_category, influence_band,
                source_type, evidence_count, removable, paused,
                last_evidence_at, updated_at
         FROM recommendation_topic_projection
         WHERE user_id = $1 AND paused = FALSE
         ORDER BY influence_band, topic_label`,
        [userId],
      );
      topics = topicRows.rows.map((row) => ({
        id: row.topic_id,
        label: row.topic_label,
        category: row.topic_category,
        influenceBand: row.influence_band,
        sourceType: row.source_type,
        evidenceCount: row.evidence_count,
        removable: row.removable,
        paused: row.paused,
        lastEvidenceAt: row.last_evidence_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      request.log.warn({ err: error, userId }, 'Intent profile read failed');
    }

    return {
      intentVersion,
      profileMode,
      topics,
    };
  });

  app.post('/recommendations/intent/:userId/mutate', async (request, reply) => {
    const { userId: requestedUserId } = request.params as { userId: string };
    const userId = resolveAuthenticatedUserId(request, requestedUserId);
    const body = mutateBodySchema.parse(request.body);

    const existing = await db.query<{ mutation_id: string; intent_version: string }>(
      'SELECT mutation_id, intent_version FROM user_intent_mutations WHERE user_id = $1 AND idempotency_key = $2',
      [userId, body.idempotencyKey],
    );
    if (existing.rows.length > 0) {
      return {
        mutationId: Number(existing.rows[0].mutation_id),
        intentVersion: Number(existing.rows[0].intent_version),
        status: 'already_applied',
      };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      let currentVersion = 0;
      const versionRow = await client.query<{ intent_version: string }>(
        'SELECT intent_version FROM user_intent_versions WHERE user_id = $1 FOR UPDATE',
        [userId],
      );
      if (versionRow.rows.length > 0) {
        currentVersion = Number(versionRow.rows[0].intent_version);
      }

      if (
        body.expectedIntentVersion !== undefined
        && body.expectedIntentVersion !== currentVersion
      ) {
        await client.query('ROLLBACK');
        return reply.status(409).send({
          error: 'intent_version_conflict',
          currentIntentVersion: currentVersion,
        });
      }

      const newVersion = currentVersion + 1;

      if (versionRow.rows.length === 0) {
        await client.query(
          'INSERT INTO user_intent_versions (user_id, intent_version, updated_at) VALUES ($1, $2, now())',
          [userId, newVersion],
        );
      } else {
        await client.query(
          'UPDATE user_intent_versions SET intent_version = $2, updated_at = now() WHERE user_id = $1',
          [userId, newVersion],
        );
      }

      const mutationResult = await client.query<{ mutation_id: string }>(
        `INSERT INTO user_intent_mutations (
           user_id, intent_version, scope, target_id, target_label,
           direction, source, expires_at, idempotency_key
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING mutation_id`,
        [
          userId,
          newVersion,
          body.scope,
          body.targetId,
          body.targetLabel,
          body.direction,
          body.source,
          body.expiresAt ?? null,
          body.idempotencyKey,
        ],
      );
      const mutationId = Number(mutationResult.rows[0].mutation_id);

      if (body.scope === 'topic') {
        if (body.direction === 'remove') {
          await client.query(
            'DELETE FROM recommendation_topic_projection WHERE user_id = $1 AND topic_id = $2',
            [userId, body.targetId],
          );
        } else {
          const band = bandFromDirection(body.direction);
          await client.query(
            `INSERT INTO recommendation_topic_projection (
               user_id, topic_id, topic_label, topic_category,
               influence_band, source_type, projection_version, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, 'explicit', 1, now())
             ON CONFLICT (user_id, topic_id) DO UPDATE
               SET influence_band = EXCLUDED.influence_band,
                   topic_label = EXCLUDED.topic_label,
                   projection_version = recommendation_topic_projection.projection_version + 1,
                   updated_at = now()`,
            [userId, body.targetId, body.targetLabel, body.topicCategory ?? 'Category preference', band],
          );
        }
      }

      await client.query('COMMIT');
      await invalidateIntentCache(redis, userId, request.log);

      return {
        mutationId,
        intentVersion: newVersion,
        status: 'applied',
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/recommendations/intent/:userId/reset', async (request, reply) => {
    const { userId: requestedUserId } = request.params as { userId: string };
    const userId = resolveAuthenticatedUserId(request, requestedUserId);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      let currentVersion = 0;
      const versionRow = await client.query<{ intent_version: string }>(
        'SELECT intent_version FROM user_intent_versions WHERE user_id = $1 FOR UPDATE',
        [userId],
      );
      if (versionRow.rows.length > 0) {
        currentVersion = Number(versionRow.rows[0].intent_version);
      }
      const newVersion = currentVersion + 1;

      await client.query(
        'DELETE FROM recommendation_topic_projection WHERE user_id = $1',
        [userId],
      );

      if (versionRow.rows.length === 0) {
        await client.query(
          'INSERT INTO user_intent_versions (user_id, intent_version, profile_mode, updated_at) VALUES ($1, $2, $3, now())',
          [userId, newVersion, 'personalized'],
        );
      } else {
        await client.query(
          'UPDATE user_intent_versions SET intent_version = $2, profile_mode = $3, updated_at = now() WHERE user_id = $1',
          [userId, newVersion, 'personalized'],
        );
      }

      await client.query('COMMIT');
      await invalidateIntentCache(redis, userId, request.log);

      return { intentVersion: newVersion, status: 'reset' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  app.put('/recommendations/intent/:userId/mode', async (request, reply) => {
    const { userId: requestedUserId } = request.params as { userId: string };
    const userId = resolveAuthenticatedUserId(request, requestedUserId);
    const body = modeBodySchema.parse(request.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      let currentVersion = 0;
      const versionRow = await client.query<{ intent_version: string }>(
        'SELECT intent_version FROM user_intent_versions WHERE user_id = $1 FOR UPDATE',
        [userId],
      );
      if (versionRow.rows.length > 0) {
        currentVersion = Number(versionRow.rows[0].intent_version);
      }
      const newVersion = currentVersion + 1;

      if (versionRow.rows.length === 0) {
        await client.query(
          'INSERT INTO user_intent_versions (user_id, intent_version, profile_mode, updated_at) VALUES ($1, $2, $3, now())',
          [userId, newVersion, body.profileMode],
        );
      } else {
        await client.query(
          'UPDATE user_intent_versions SET intent_version = $2, profile_mode = $3, updated_at = now() WHERE user_id = $1',
          [userId, newVersion, body.profileMode],
        );
      }

      await client.query('COMMIT');
      await invalidateIntentCache(redis, userId, request.log);

      return { intentVersion: newVersion, profileMode: body.profileMode, status: 'applied' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/recommendations/intent/:userId/status', async (request, reply) => {
    const { userId: requestedUserId } = request.params as { userId: string };
    const userId = resolveAuthenticatedUserId(request, requestedUserId);
    const { mutationId } = statusQuerySchema.parse(request.query);

    const result = await db.query<{
      mutation_id: string;
      intent_version: string;
      direction: string;
      created_at: string;
    }>(
      'SELECT mutation_id, intent_version, direction, created_at FROM user_intent_mutations WHERE user_id = $1 AND mutation_id = $2',
      [userId, mutationId],
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'mutation_not_found' });
    }

    return {
      mutationId: Number(result.rows[0].mutation_id),
      intentVersion: Number(result.rows[0].intent_version),
      direction: result.rows[0].direction,
      createdAt: result.rows[0].created_at,
      status: 'applied',
    };
  });
}
