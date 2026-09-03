import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';

type FlagRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  redis: Redis;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest, requestedUserId?: string) => string;
};

const KNOWN_FLAG_KEYS = [
  'new_home_feed',
  'live_shopping_enabled',
  'co_own_v2',
  'ai_listing_assist',
  'moodboard_beta',
  'conversational_search',
  'advanced_filters',
  'seller_analytics_v2',
] as const;

type FlagKey = (typeof KNOWN_FLAG_KEYS)[number];

function ensureAdmin(
  request: FastifyRequest,
  createApiError: FlagRouteDependencies['createApiError'],
): void {
  if (!request.authUser || request.authUser.role !== 'admin') {
    throw createApiError('FORBIDDEN', 'Admin access required');
  }
}

function deterministicHash(userId: string, flagKey: string): number {
  const hash = crypto.createHash('sha256');
  hash.update(`${userId}:${flagKey}`);
  const digest = hash.digest('hex');
  return parseInt(digest.slice(0, 8), 16);
}

interface FlagEvaluation {
  enabled: boolean;
  variant: string | null;
  reason: 'hash' | 'override';
}

async function evaluateFlag(
  redis: Redis,
  userId: string,
  flagKey: FlagKey,
): Promise<FlagEvaluation> {
  try {
    const override = await redis.get(`flag:override:${flagKey}`);
    if (override !== null) {
      const enabled = override === 'true';
      return { enabled, variant: enabled ? 'control' : null, reason: 'override' };
    }
  } catch {
    // Redis unavailable — fall through to hash evaluation.
  }

  const hash = deterministicHash(userId, flagKey);
  let rolloutPct = 100;
  try {
    const rolloutStr = await redis.get(`flag:rollout:${flagKey}`);
    if (rolloutStr !== null) {
      rolloutPct = parseInt(rolloutStr, 10);
      if (Number.isNaN(rolloutPct)) rolloutPct = 100;
    }
  } catch {
    // Redis unavailable — default to 100% rollout.
  }

  const bucket = hash % 100;
  const enabled = bucket < rolloutPct;
  return { enabled, variant: enabled ? 'control' : null, reason: 'hash' };
}

const killSchema = z.object({
  flag_key: z.enum(KNOWN_FLAG_KEYS),
  reason: z.string().min(3).max(500),
  trigger: z.enum(['manual', 'guardrail', 'incident']).default('manual'),
  guardrail_breaches: z.array(z.object({
    metric: z.string(),
    value: z.number(),
    threshold: z.number(),
  })).default([]),
  experiment_id: z.string().optional(),
});

const restoreSchema = z.object({
  flag_key: z.enum(KNOWN_FLAG_KEYS),
  rollout_percentage: z.number().int().min(0).max(100).default(100),
});

export const registerFlagRoutes = ({
  app,
  db,
  redis,
  createApiError,
  resolveAuthenticatedUserId,
}: FlagRouteDependencies) => {
  app.get('/flags/evaluate', async (request) => {
    const userId = resolveAuthenticatedUserId(request);
    const querySchema = z.object({
      keys: z.string().optional(),
    });
    const { keys } = querySchema.parse(request.query);

    const flagKeys: FlagKey[] = keys
      ? (keys.split(',').filter((k): k is FlagKey =>
          (KNOWN_FLAG_KEYS as readonly string[]).includes(k.trim())))
      : [...KNOWN_FLAG_KEYS];

    const flags: Record<string, FlagEvaluation> = {};
    for (const flagKey of flagKeys) {
      flags[flagKey] = await evaluateFlag(redis, userId, flagKey);
    }

    void Promise.allSettled(
      flagKeys.map((flagKey) => {
        const eval_ = flags[flagKey];
        return db
          .query(
            `INSERT INTO analytics_events (
               event_name, schema_version, event_time, actor_user_id,
               request_id, surface, properties
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
            [
              'feature_flag_evaluated',
              '1.0',
              new Date().toISOString(),
              userId,
              request.id,
              'server',
              JSON.stringify({
                flag_key: flagKey,
                variant: eval_.variant,
                enabled: eval_.enabled,
                reason: eval_.reason,
              }),
            ],
          )
          .catch(() => {
            // Best-effort — analytics must not block flag evaluation.
          });
      }),
    );

    return { ok: true, flags, user_id: userId };
  });

  app.post('/flags/kill', async (request, reply) => {
    ensureAdmin(request, createApiError);
    const input = killSchema.parse(request.body);
    const killedBy = request.authUser?.userId ?? 'unknown';

    let previousRollout: number | null = null;
    try {
      const rolloutStr = await redis.get(`flag:rollout:${input.flag_key}`);
      if (rolloutStr !== null) {
        previousRollout = parseInt(rolloutStr, 10);
      }
      await redis.set(`flag:override:${input.flag_key}`, 'false');
      await redis.set(`flag:rollout:${input.flag_key}`, '0');
    } catch (error) {
      request.log.error(
        { err: error, flagKey: input.flag_key },
        'Failed to set kill-switch in Redis — flag may remain active',
      );
      throw createApiError('INTERNAL', 'Failed to activate kill-switch');
    }

    const killResult = await db.query<{ kill_id: string }>(
      `INSERT INTO flag_kill_events (
         flag_key, killed_by, reason, trigger,
         guardrail_breaches, previous_rollout, experiment_id
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       RETURNING kill_id`,
      [
        input.flag_key,
        killedBy,
        input.reason,
        input.trigger,
        JSON.stringify(input.guardrail_breaches),
        previousRollout,
        input.experiment_id ?? null,
      ],
    );
    const killId = killResult.rows[0]?.kill_id;

    void db
      .query(
        `INSERT INTO analytics_events (
           event_name, schema_version, event_time, actor_user_id,
           request_id, surface, properties
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          'flag_killed',
          '1.0',
          new Date().toISOString(),
          killedBy,
          request.id,
          'server',
          JSON.stringify({
            flag_key: input.flag_key,
            reason: input.reason,
            trigger: input.trigger,
            guardrail_breaches: input.guardrail_breaches,
            experiment_id: input.experiment_id ?? null,
          }),
        ],
      )
      .catch(() => {
        // Best-effort audit event.
      });

    request.log.info(
      { flagKey: input.flag_key, killedBy, reason: input.reason, trigger: input.trigger },
      'Feature flag killed',
    );

    reply.code(200);
    return {
      ok: true,
      flag_key: input.flag_key,
      killed_at: new Date().toISOString(),
      kill_id: killId,
    };
  });

  app.post('/flags/restore', async (request) => {
    ensureAdmin(request, createApiError);
    const input = restoreSchema.parse(request.body);

    try {
      await redis.del(`flag:override:${input.flag_key}`);
      await redis.set(`flag:rollout:${input.flag_key}`, String(input.rollout_percentage));
    } catch (error) {
      request.log.error(
        { err: error, flagKey: input.flag_key },
        'Failed to restore flag in Redis',
      );
      throw createApiError('INTERNAL', 'Failed to restore flag');
    }

    return { ok: true, flag_key: input.flag_key, rollout_percentage: input.rollout_percentage };
  });

  app.get('/flags/audit', async (request) => {
    ensureAdmin(request, createApiError);
    const querySchema = z.object({
      flag_key: z.enum(KNOWN_FLAG_KEYS).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    });
    const { flag_key, limit } = querySchema.parse(request.query);

    let sql = 'SELECT * FROM flag_kill_events';
    const params: (string | number)[] = [];
    if (flag_key) {
      sql += ' WHERE flag_key = $1';
      params.push(flag_key);
    }
    sql += ' ORDER BY killed_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await db.query(sql, params);
    return { ok: true, events: result.rows };
  });

  app.get('/flags/state', async (request) => {
    ensureAdmin(request, createApiError);

    const flags: Record<string, { override: string | null; rollout_percentage: number | null; status: string }> = {};

    for (const flagKey of KNOWN_FLAG_KEYS) {
      let override: string | null = null;
      let rolloutPct: number | null = null;
      try {
        override = await redis.get(`flag:override:${flagKey}`);
        const rolloutStr = await redis.get(`flag:rollout:${flagKey}`);
        if (rolloutStr !== null) {
          rolloutPct = parseInt(rolloutStr, 10);
          if (Number.isNaN(rolloutPct)) rolloutPct = null;
        }
      } catch {
        // Redis unavailable — report nulls.
      }
      const status = override === 'false' || rolloutPct === 0 ? 'killed' : 'active';
      flags[flagKey] = { override, rollout_percentage: rolloutPct, status };
    }

    return { ok: true, flags };
  });
};
