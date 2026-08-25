import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { getRetentionPolicies, runRetentionSweep } from '../lib/retentionEngine.js';
import { runMediaGarbageCollection } from '../lib/mediaGc.js';

type RetentionRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

function ensureAdmin(
  request: FastifyRequest,
  createApiError: RetentionRouteDependencies['createApiError'],
): void {
  if (!request.authUser || request.authUser.role !== 'admin') {
    throw createApiError('FORBIDDEN', 'Admin access required');
  }
}

export const registerRetentionRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: RetentionRouteDependencies) => {
  app.get('/admin/retention/policies', async (request) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const policies = await getRetentionPolicies(db);

    return {
      ok: true,
      policies,
    };
  });

  app.post('/admin/retention/sweep', async (request) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const sweepResults = await runRetentionSweep(db);
    const gcResults = await runMediaGarbageCollection(db);

    return {
      ok: true,
      sweepResults,
      mediaGc: gcResults,
    };
  });
};
