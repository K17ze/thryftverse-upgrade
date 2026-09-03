import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { evaluateExperimentGuardrails, persistGuardrailCheck } from '../lib/guardrailEngine.js';

type ExperimentRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest, requestedUserId?: string) => string;
};

function ensureAdmin(
  request: FastifyRequest,
  createApiError: ExperimentRouteDependencies['createApiError'],
): void {
  if (!request.authUser || request.authUser.role !== 'admin') {
    throw createApiError('FORBIDDEN', 'Admin access required');
  }
}

const createExperimentSchema = z.object({
  experiment_id: z.string().min(3).max(60),
  flag_key: z.string().min(2).max(60),
  name: z.string().min(3).max(200),
  hypothesis: z.string().min(10),
  primary_metric: z.string().min(2).max(100),
  guardrail_metrics: z.array(z.string()).default([]),
  secondary_metrics: z.array(z.string()).default([]),
  variants: z.array(z.object({
    key: z.string(),
    name: z.string(),
    description: z.string().optional(),
  })).default([]),
  sample_size: z.number().int().positive().optional(),
  min_detectable_effect: z.number().positive().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});

const updateExperimentSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  hypothesis: z.string().min(10).optional(),
  primary_metric: z.string().min(2).max(100).optional(),
  guardrail_metrics: z.array(z.string()).optional(),
  secondary_metrics: z.array(z.string()).optional(),
  variants: z.array(z.object({
    key: z.string(),
    name: z.string(),
    description: z.string().optional(),
  })).optional(),
  sample_size: z.number().int().positive().optional(),
  min_detectable_effect: z.number().positive().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  status: z.enum(['draft', 'running', 'paused', 'completed', 'killed']).optional(),
  decision: z.enum(['ship', 'hold', 'kill', 'iterate']).optional(),
  decision_reason: z.string().optional(),
});

const VALID_TRANSITIONS: Record<string, Set<string>> = {
  draft: new Set(['running', 'killed']),
  running: new Set(['paused', 'completed', 'killed']),
  paused: new Set(['running', 'killed']),
  completed: new Set(),
  killed: new Set(),
};

export const registerExperimentRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: ExperimentRouteDependencies) => {
  app.get('/experiments', async (request) => {
    resolveAuthenticatedUserId(request);
    const querySchema = z.object({
      status: z.enum(['draft', 'running', 'paused', 'completed', 'killed']).optional(),
      flag_key: z.string().optional(),
    });
    const query = querySchema.parse(request.query);

    let sql = 'SELECT * FROM experiments';
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (query.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(query.status);
    }
    if (query.flag_key) {
      conditions.push(`flag_key = $${paramIdx++}`);
      params.push(query.flag_key);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC';

    const result = await db.query(sql, params);
    return { ok: true, experiments: result.rows };
  });

  app.get('/experiments/:experimentId', async (request) => {
    resolveAuthenticatedUserId(request);
    const paramsSchema = z.object({ experimentId: z.string().min(3).max(60) });
    const { experimentId } = paramsSchema.parse(request.params);

    const expResult = await db.query('SELECT * FROM experiments WHERE experiment_id = $1', [experimentId]);
    if (expResult.rows.length === 0) {
      throw createApiError('NOT_FOUND', 'Experiment not found');
    }

    const checksResult = await db.query(
      `SELECT * FROM experiment_guardrail_checks
       WHERE experiment_id = $1
       ORDER BY checked_at DESC
       LIMIT 20`,
      [experimentId],
    );

    return { ok: true, experiment: expResult.rows[0], guardrail_checks: checksResult.rows };
  });

  app.post('/experiments', async (request, reply) => {
    ensureAdmin(request, createApiError);
    const input = createExperimentSchema.parse(request.body);
    const createdBy = request.authUser?.userId ?? null;

    const result = await db.query(
      `INSERT INTO experiments (
         experiment_id, flag_key, name, hypothesis, primary_metric,
         guardrail_metrics, secondary_metrics, variants,
         sample_size, min_detectable_effect, start_date, end_date,
         status, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, 'draft', $13)
       RETURNING *`,
      [
        input.experiment_id,
        input.flag_key,
        input.name,
        input.hypothesis,
        input.primary_metric,
        JSON.stringify(input.guardrail_metrics),
        JSON.stringify(input.secondary_metrics),
        JSON.stringify(input.variants),
        input.sample_size ?? null,
        input.min_detectable_effect ?? null,
        input.start_date ?? null,
        input.end_date ?? null,
        createdBy,
      ],
    );

    reply.code(201);
    return { ok: true, experiment: result.rows[0] };
  });

  app.patch('/experiments/:experimentId', async (request, reply) => {
    ensureAdmin(request, createApiError);
    const paramsSchema = z.object({ experimentId: z.string().min(3).max(60) });
    const { experimentId } = paramsSchema.parse(request.params);
    const input = updateExperimentSchema.parse(request.body);

    const existing = await db.query<{ status: string }>(
      'SELECT status FROM experiments WHERE experiment_id = $1',
      [experimentId],
    );
    if (existing.rows.length === 0) {
      throw createApiError('NOT_FOUND', 'Experiment not found');
    }

    if (input.status && input.status !== existing.rows[0].status) {
      const allowed = VALID_TRANSITIONS[existing.rows[0].status];
      if (!allowed || !allowed.has(input.status)) {
        throw createApiError(
          'INVALID_TRANSITION',
          `Cannot transition from '${existing.rows[0].status}' to '${input.status}'`,
        );
      }
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: (string | number | null)[] = [];
    let paramIdx = 1;

    const addStringField = (field: string, value: string | undefined): void => {
      if (value !== undefined) {
        setClauses.push(`${field} = $${paramIdx++}`);
        params.push(value);
      }
    };
    const addJsonField = (field: string, value: unknown[] | undefined): void => {
      if (value !== undefined) {
        setClauses.push(`${field} = $${paramIdx++}::jsonb`);
        params.push(JSON.stringify(value));
      }
    };
    const addNumberField = (field: string, value: number | undefined): void => {
      if (value !== undefined) {
        setClauses.push(`${field} = $${paramIdx++}`);
        params.push(value);
      }
    };

    addStringField('name', input.name);
    addStringField('hypothesis', input.hypothesis);
    addStringField('primary_metric', input.primary_metric);
    addJsonField('guardrail_metrics', input.guardrail_metrics);
    addJsonField('secondary_metrics', input.secondary_metrics);
    addJsonField('variants', input.variants);
    addNumberField('sample_size', input.sample_size);
    addNumberField('min_detectable_effect', input.min_detectable_effect);
    addStringField('start_date', input.start_date);
    addStringField('end_date', input.end_date);
    addStringField('status', input.status);
    addStringField('decision', input.decision);
    addStringField('decision_reason', input.decision_reason);

    if (input.status === 'running' && !input.start_date) {
      setClauses.push(`start_date = COALESCE(start_date, NOW())`);
    }
    if (input.status === 'completed' || input.status === 'killed') {
      setClauses.push(`completed_at = COALESCE(completed_at, NOW())`);
    }
    if (input.decision) {
      setClauses.push(`decision_by = $${paramIdx++}`);
      setClauses.push(`decided_at = NOW()`);
      params.push(request.authUser?.userId ?? null);
    }

    params.push(experimentId);
    const result = await db.query(
      `UPDATE experiments SET ${setClauses.join(', ')} WHERE experiment_id = $${paramIdx} RETURNING *`,
      params,
    );

    return { ok: true, experiment: result.rows[0] };
  });

  app.post('/experiments/:experimentId/guardrails/check', async (request, reply) => {
    ensureAdmin(request, createApiError);
    const paramsSchema = z.object({ experimentId: z.string().min(3).max(60) });
    const { experimentId } = paramsSchema.parse(request.params);

    const expResult = await db.query<{
      guardrail_metrics: string[];
      status: string;
    }>(
      'SELECT guardrail_metrics, status FROM experiments WHERE experiment_id = $1',
      [experimentId],
    );
    if (expResult.rows.length === 0) {
      throw createApiError('NOT_FOUND', 'Experiment not found');
    }

    const guardrailMetrics = expResult.rows[0].guardrail_metrics ?? [];
    const evaluation = await evaluateExperimentGuardrails(db, experimentId, guardrailMetrics);

    let autoKilled = false;
    let actionTaken = evaluation.recommendation;

    if (evaluation.anyBreached && expResult.rows[0].status === 'running') {
      autoKilled = true;
      actionTaken = 'kill';
      await db.query(
        `UPDATE experiments SET status = 'killed', completed_at = NOW(), updated_at = NOW()
         WHERE experiment_id = $1 AND status = 'running'`,
        [experimentId],
      );
    }

    await persistGuardrailCheck(db, experimentId, evaluation.results, actionTaken);

    reply.code(200);
    return {
      ok: true,
      results: evaluation.results,
      any_breached: evaluation.anyBreached,
      recommendation: evaluation.recommendation,
      auto_killed: autoKilled,
    };
  });

  app.get('/experiments/:experimentId/guardrails/history', async (request) => {
    ensureAdmin(request, createApiError);
    const paramsSchema = z.object({ experimentId: z.string().min(3).max(60) });
    const { experimentId } = paramsSchema.parse(request.params);
    const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
    const { limit } = querySchema.parse(request.query);

    const result = await db.query(
      `SELECT * FROM experiment_guardrail_checks
       WHERE experiment_id = $1
       ORDER BY checked_at DESC
       LIMIT $2`,
      [experimentId, limit],
    );

    return { ok: true, checks: result.rows };
  });
};
