import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { config } from '../config.js';
import {
  databasePoolSnapshot,
  type PoolSnapshot,
} from '../db/pool.js';
import {
  metricsContentType,
  observeDatabasePool,
  observeRedisConnection,
  renderMetrics,
} from '../lib/metrics.js';
import { assertKeyServiceConnectivity } from '../lib/keyService.js';
import { assertS3BucketConnectivity } from '../lib/s3.js';
import { getConfiguredClusters } from '../lib/countryCapabilities.js';

type HealthRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  readDb: Pool;
  replicaConfigured: boolean;
  redis: Redis;
  docsAuthHook: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  ensureSecurityAdminAccess: (
    request: { headers: Record<string, string | string[] | undefined>; authUser?: { userId: string; role?: string } },
    reply: { code: (statusCode: number) => unknown },
  ) => { ok: false; error: string } | null;
};

export const registerHealthRoutes = ({
  app,
  db,
  readDb,
  replicaConfigured,
  redis,
  docsAuthHook,
  ensureSecurityAdminAccess,
}: HealthRouteDependencies) => {
  app.get('/health', async () => {
    const [{ now }] = (await db.query<{ now: string }>('SELECT NOW() AS now')).rows;
    const redisPing = await redis.ping();

    return {
      ok: true,
      service: 'thryftverse-api',
      now,
      redis: redisPing,
    };
  });

  // Liveness — just confirms the process is alive (no dependency checks).
  app.get('/health/live', async () => ({ ok: true, service: 'thryftverse-api', timestamp: new Date().toISOString() }));

  // Readiness — checks all dependencies. Returns 503 if any are down.
  app.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, string> = {};
    let allHealthy = true;

    try {
      const result = await db.query('SELECT 1');
      if (result.rowCount !== null) checks.database = 'ok';
      else { checks.database = 'degraded'; allHealthy = false; }
    } catch {
      checks.database = 'down';
      allHealthy = false;
    }

    try {
      const pong = await redis?.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'degraded';
      if (pong !== 'PONG') allHealthy = false;
    } catch {
      checks.redis = 'down';
      allHealthy = false;
    }

    const body = { ok: allHealthy, service: 'thryftverse-api', checks, timestamp: new Date().toISOString() };
    if (!allHealthy) {
      reply.code(503);
    }
    return body;
  });

  app.get('/metrics', {
    preHandler: [docsAuthHook],
  }, async (_request, reply) => {
    observeDatabasePool({ pool: 'primary', ...databasePoolSnapshot(db) });
    if (replicaConfigured) {
      observeDatabasePool({ pool: 'replica', ...databasePoolSnapshot(readDb) });
    }
    observeRedisConnection(redis?.status === 'ready');
    reply.header('Content-Type', metricsContentType());
    return renderMetrics();
  });

  app.get('/health/deep', async (request, reply) => {
    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    const status = {
      api: 'ok',
      postgres: 'unknown',
      replica: 'unknown',
      redis: 'unknown',
      keyService: 'unknown',
      ml: 'unknown',
      s3: 'unknown',
    } as const;

    const result: {
      ok: boolean;
      checks: {
        api: string;
        postgres: string;
        replica: string;
        redis: string;
        keyService: string;
        ml: string;
        s3: string;
      };
      details?: Record<string, unknown>;
    } = {
      ok: true,
      checks: {
        ...status,
      },
      details: {},
    };

    try {
      await db.query('SELECT 1');
      result.checks.postgres = 'ok';
    } catch (error) {
      result.ok = false;
      result.checks.postgres = 'error';
      result.details!.postgres = (error as Error).message;
    }

    if (replicaConfigured) {
      try {
        await readDb.query('SELECT 1');
        result.checks.replica = 'ok';
      } catch (error) {
        result.ok = false;
        result.checks.replica = 'error';
        result.details!.replica = (error as Error).message;
      }
    } else {
      result.checks.replica = 'not_configured';
    }
    result.details!.databasePools = {
      primary: databasePoolSnapshot(db),
      replica: replicaConfigured ? databasePoolSnapshot(readDb) : null,
    };

    try {
      const redisPing = await redis.ping();
      result.checks.redis = redisPing === 'PONG' ? 'ok' : 'error';
      if (redisPing !== 'PONG') {
        result.ok = false;
        result.details!.redis = `Unexpected ping result: ${redisPing}`;
      }
    } catch (error) {
      result.ok = false;
      result.checks.redis = 'error';
      result.details!.redis = (error as Error).message;
    }

    try {
      await assertKeyServiceConnectivity();
      result.checks.keyService = 'ok';
    } catch (error) {
      result.ok = false;
      result.checks.keyService = 'error';
      result.details!.keyService = (error as Error).message;
    }

    try {
      const decisionResponse = await fetch(`${config.decisionServiceUrl}/health`);
      if (!decisionResponse.ok) {
        throw new Error(`Decision service responded ${decisionResponse.status}`);
      }
      result.checks.ml = 'ok';
    } catch (error) {
      result.ok = false;
      result.checks.ml = 'error';
      result.details!.ml = (error as Error).message;
    }

    try {
      await assertS3BucketConnectivity();
      result.checks.s3 = 'ok';
    } catch (error) {
      result.ok = false;
      result.checks.s3 = 'error';
      result.details!.s3 = (error as Error).message;
    }

    const paymentClusters = getConfiguredClusters();
    const resultWithClusters = {
      ...result,
      paymentClusters,
    };

    if (resultWithClusters.ok) {
      delete resultWithClusters.details;
      return resultWithClusters;
    }

    if (config.nodeEnv === 'production') {
      delete resultWithClusters.details;
    }

    reply.code(503);
    return resultWithClusters;
  });
};
