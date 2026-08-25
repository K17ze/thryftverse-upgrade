/**
 * Fraud shadow scoring — Admin REST routes.
 *
 * Thin route layer for the fraud shadow scoring system (Phase 6).
 * Exposes endpoints for monitoring the shadow model, viewing comparison
 * stats, reviewing disagreements, and loading/unloading the shadow model.
 *
 * The shadow model never affects user-facing fraud decisions. These
 * endpoints are for offline comparison and operational management only.
 *
 * - GET  /admin/fraud/shadow/status       — shadow model status + telemetry
 * - GET  /admin/fraud/shadow/comparison   — aggregate comparison stats
 * - GET  /admin/fraud/shadow/disagreements — disagreement cases for review
 * - POST /admin/fraud/shadow/load         — load a shadow model (admin-only)
 * - POST /admin/fraud/shadow/unload       — unload the shadow model (admin-only)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import {
  FraudShadowScoringService,
  type ScoreComparisonSummary,
  type DisagreementRow,
} from '../lib/fraudShadowScoring.js';

export interface FraudShadowRouteDependencies {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const comparisonQuerySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(720).default(24),
});

const disagreementsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const loadBodySchema = z.object({
  modelPath: z.string().trim().min(1).max(2048),
  manifestPath: z.string().trim().min(1).max(2048),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureAdmin(
  request: FastifyRequest,
  createApiError: FraudShadowRouteDependencies['createApiError'],
): void {
  if (!request.authUser || request.authUser.role !== 'admin') {
    throw createApiError('FORBIDDEN', 'Admin access required');
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerFraudShadowRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: FraudShadowRouteDependencies) => {
  const shadowService = new FraudShadowScoringService({
    db,
    mlServiceUrl: config.decisionServiceUrl,
    mlServiceToken: config.decisionServiceToken,
    timeoutMs: config.fraudShadowTimeoutMs,
  });

  // GET /admin/fraud/shadow/status — shadow model status + telemetry
  app.get('/admin/fraud/shadow/status', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    try {
      const response = await fetch(
        `${config.decisionServiceUrl}/fraud/status`,
        {
          signal: AbortSignal.timeout(config.fraudShadowTimeoutMs),
        },
      );

      if (!response.ok) {
        reply.code(502);
        return {
          ok: false,
          error: `ml-service responded ${response.status}`,
          shadowEnabled: config.fraudShadowEnabled,
        };
      }

      const mlStatus = (await response.json()) as {
        shadow_model_loaded: boolean;
        shadow_model_id: string | null;
        shadow_model_version: string | null;
        champion_model_id: string;
        champion_model_version: string;
        feature_schema_version: string;
        telemetry: Record<string, unknown>;
      };

      return {
        ok: true,
        shadowEnabled: config.fraudShadowEnabled,
        shadowModelLoaded: mlStatus.shadow_model_loaded,
        shadowModelId: mlStatus.shadow_model_id,
        shadowModelVersion: mlStatus.shadow_model_version,
        championModelId: mlStatus.champion_model_id,
        championModelVersion: mlStatus.champion_model_version,
        featureSchemaVersion: mlStatus.feature_schema_version,
        telemetry: mlStatus.telemetry,
      };
    } catch (error) {
      reply.code(502);
      return {
        ok: false,
        error: 'ml-service unreachable',
        shadowEnabled: config.fraudShadowEnabled,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // GET /admin/fraud/shadow/comparison — aggregate comparison stats
  app.get('/admin/fraud/shadow/comparison', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const parsed = comparisonQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400);
      return {
        ok: false,
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      };
    }

    try {
      const summary: ScoreComparisonSummary =
        await shadowService.getScoreComparisonSummary(parsed.data.windowHours);
      return { ok: true, summary };
    } catch (error) {
      request.log.error({ err: error }, 'fraud shadow comparison query failed');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  // GET /admin/fraud/shadow/disagreements — disagreement cases for review
  app.get('/admin/fraud/shadow/disagreements', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const parsed = disagreementsQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400);
      return {
        ok: false,
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      };
    }

    try {
      const { rows, total }: { rows: DisagreementRow[]; total: number } =
        await shadowService.getDisagreements(parsed.data.limit, parsed.data.offset);
      return {
        ok: true,
        disagreements: rows,
        total,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      };
    } catch (error) {
      request.log.error({ err: error }, 'fraud shadow disagreements query failed');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  // POST /admin/fraud/shadow/load — load a shadow model (admin-only)
  app.post('/admin/fraud/shadow/load', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const payload = loadBodySchema.parse(request.body ?? {});

    try {
      const response = await fetch(
        `${config.decisionServiceUrl}/fraud/shadow/load`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-admin-service-token':
              process.env.ADMIN_SERVICE_TOKEN ?? 'local-admin-token',
          },
          signal: AbortSignal.timeout(config.fraudShadowTimeoutMs),
          body: JSON.stringify({
            model_path: payload.modelPath,
            manifest_path: payload.manifestPath,
          }),
        },
      );

      if (!response.ok) {
        reply.code(502);
        return {
          ok: false,
          error: `ml-service responded ${response.status}`,
        };
      }

      const result = (await response.json()) as {
        loaded: boolean;
        message: string;
        shadow_model_loaded: boolean;
        shadow_model_version: string | null;
      };

      return {
        ok: result.loaded,
        loaded: result.loaded,
        message: result.message,
        shadowModelLoaded: result.shadow_model_loaded,
        shadowModelVersion: result.shadow_model_version,
      };
    } catch (error) {
      request.log.error({ err: error }, 'fraud shadow model load failed');
      reply.code(502);
      return {
        ok: false,
        error: 'ml-service unreachable',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // POST /admin/fraud/shadow/unload — unload the shadow model (admin-only)
  app.post('/admin/fraud/shadow/unload', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    try {
      const response = await fetch(
        `${config.decisionServiceUrl}/fraud/shadow/unload`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-admin-service-token':
              process.env.ADMIN_SERVICE_TOKEN ?? 'local-admin-token',
          },
          signal: AbortSignal.timeout(config.fraudShadowTimeoutMs),
        },
      );

      if (!response.ok) {
        reply.code(502);
        return {
          ok: false,
          error: `ml-service responded ${response.status}`,
        };
      }

      const result = (await response.json()) as {
        loaded: boolean;
        message: string;
        shadow_model_loaded: boolean;
      };

      return {
        ok: true,
        loaded: result.loaded,
        message: result.message,
        shadowModelLoaded: result.shadow_model_loaded,
      };
    } catch (error) {
      request.log.error({ err: error }, 'fraud shadow model unload failed');
      reply.code(502);
      return {
        ok: false,
        error: 'ml-service unreachable',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  });
};
