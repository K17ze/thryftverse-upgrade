/**
 * Model Artifact Registry — Admin REST Routes
 *
 * Thin route layer for the model artifact registry (migration 144).
 * Every handler validates admin auth, parses the request with zod,
 * and delegates to direct SQL against the model_artifacts table.
 *
 * The registry is intentionally minimal: register, list, fetch, and
 * promote/retire/block. It is not MLflow — it is the artifact lineage
 * system that lets an auditor answer "what model served this traffic,
 * was it approved, and what produced it."
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type ModelArtifactRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

type ModelArtifactRow = {
  model_id: string;
  model_version: string;
  task: string;
  owner: string;
  criticality: string;
  artifact_uri: string;
  artifact_sha256: string;
  container_digest: string | null;
  training_code_commit: string;
  training_dataset_manifest: string;
  feature_schema_version: string;
  preprocessing_version: string;
  framework_runtime: string;
  evaluation_report_uri: string | null;
  model_card_uri: string | null;
  approval_actor: string | null;
  approved_at: Date | null;
  status: string;
  rollback_model_version: string | null;
  retention_deletion_metadata: Record<string, unknown>;
  created_at: Date;
};

type ModelArtifactDTO = {
  modelId: string;
  modelVersion: string;
  task: string;
  owner: string;
  criticality: string;
  artifactUri: string;
  artifactSha256: string;
  containerDigest: string | null;
  trainingCodeCommit: string;
  trainingDatasetManifest: string;
  featureSchemaVersion: string;
  preprocessingVersion: string;
  frameworkRuntime: string;
  evaluationReportUri: string | null;
  modelCardUri: string | null;
  approvalActor: string | null;
  approvedAt: string | null;
  status: string;
  rollbackModelVersion: string | null;
  retentionDeletionMetadata: Record<string, unknown>;
  createdAt: string;
};

function mapRowToDTO(row: ModelArtifactRow): ModelArtifactDTO {
  return {
    modelId: row.model_id,
    modelVersion: row.model_version,
    task: row.task,
    owner: row.owner,
    criticality: row.criticality,
    artifactUri: row.artifact_uri,
    artifactSha256: row.artifact_sha256,
    containerDigest: row.container_digest,
    trainingCodeCommit: row.training_code_commit,
    trainingDatasetManifest: row.training_dataset_manifest,
    featureSchemaVersion: row.feature_schema_version,
    preprocessingVersion: row.preprocessing_version,
    frameworkRuntime: row.framework_runtime,
    evaluationReportUri: row.evaluation_report_uri,
    modelCardUri: row.model_card_uri,
    approvalActor: row.approval_actor,
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
    status: row.status,
    rollbackModelVersion: row.rollback_model_version,
    retentionDeletionMetadata: row.retention_deletion_metadata,
    createdAt: row.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const TASKS = [
  'recommendation_ranking', 'visual_search', 'catalogue_import',
  'fraud_scoring', 'moderation_triage',
] as const;

const STATUSES = ['candidate', 'shadow', 'active', 'retired', 'blocked'] as const;

const registerBodySchema = z.object({
  modelId: z.string().trim().min(2).max(120),
  modelVersion: z.string().trim().min(1).max(120),
  task: z.enum(TASKS),
  owner: z.string().trim().min(2).max(120),
  criticality: z.enum(['low', 'medium', 'high']),
  artifactUri: z.string().trim().min(1).max(2048),
  artifactSha256: z.string().regex(/^[0-9a-f]{64}$/),
  containerDigest: z.string().trim().max(512).optional(),
  trainingCodeCommit: z.string().trim().min(7).max(120),
  trainingDatasetManifest: z.string().trim().min(1).max(2048),
  featureSchemaVersion: z.string().trim().min(1).max(120),
  preprocessingVersion: z.string().trim().min(1).max(120),
  frameworkRuntime: z.string().trim().min(2).max(120),
  evaluationReportUri: z.string().trim().max(2048).optional(),
  modelCardUri: z.string().trim().max(2048).optional(),
  rollbackModelVersion: z.string().trim().max(120).optional(),
  retentionDeletionMetadata: z.record(z.unknown()).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  task: z.enum(TASKS).optional(),
  owner: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const paramsSchema = z.object({
  modelId: z.string().min(2).max(120),
  modelVersion: z.string().min(1).max(120),
});

const statusBodySchema = z.object({
  status: z.enum(STATUSES),
  approvalActor: z.string().trim().min(2).max(120).optional(),
  rollbackModelVersion: z.string().trim().max(120).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureAdmin(
  request: FastifyRequest,
  createApiError: ModelArtifactRouteDependencies['createApiError'],
): void {
  if (!request.authUser || request.authUser.role !== 'admin') {
    throw createApiError('FORBIDDEN', 'Admin access required');
  }
}

const SELECT_COLUMNS = `
  model_id, model_version, task, owner, criticality, artifact_uri,
  artifact_sha256, container_digest, training_code_commit,
  training_dataset_manifest, feature_schema_version,
  preprocessing_version, framework_runtime, evaluation_report_uri,
  model_card_uri, approval_actor, approved_at, status,
  rollback_model_version, retention_deletion_metadata, created_at
`;

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerModelArtifactRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: ModelArtifactRouteDependencies) => {
  // POST /admin/model-artifacts — register a new model artifact (admin-only)
  app.post('/admin/model-artifacts', async (request, reply) => {
    ensureAdmin(request, createApiError);
    const actorUserId = resolveAuthenticatedUserId(request);

    const payload = registerBodySchema.parse(request.body ?? {});

    try {
      const result = await db.query<ModelArtifactRow>(
        `INSERT INTO model_artifacts (
           model_id, model_version, task, owner, criticality,
           artifact_uri, artifact_sha256, container_digest,
           training_code_commit, training_dataset_manifest,
           feature_schema_version, preprocessing_version,
           framework_runtime, evaluation_report_uri, model_card_uri,
           rollback_model_version, retention_deletion_metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
         RETURNING ${SELECT_COLUMNS}`,
        [
          payload.modelId,
          payload.modelVersion,
          payload.task,
          payload.owner,
          payload.criticality,
          payload.artifactUri,
          payload.artifactSha256,
          payload.containerDigest ?? null,
          payload.trainingCodeCommit,
          payload.trainingDatasetManifest,
          payload.featureSchemaVersion,
          payload.preprocessingVersion,
          payload.frameworkRuntime,
          payload.evaluationReportUri ?? null,
          payload.modelCardUri ?? null,
          payload.rollbackModelVersion ?? null,
          JSON.stringify(payload.retentionDeletionMetadata ?? {}),
        ],
      );
      reply.code(201);
      return { ok: true, artifact: mapRowToDTO(result.rows[0]) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('duplicate key')) {
        reply.code(409);
        return {
          ok: false,
          error: 'A model artifact with this model_id and model_version already exists',
        };
      }
      request.log.error({ err: error }, 'model artifact registration failed');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  // GET /admin/model-artifacts — list artifacts with optional filters
  app.get('/admin/model-artifacts', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const parsed = listQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid query parameters', details: parsed.error.flatten() };
    }
    const filters = parsed.data;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.task) {
      params.push(filters.task);
      conditions.push(`task = $${params.length}`);
    }
    if (filters.owner) {
      params.push(filters.owner);
      conditions.push(`owner = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filters.limit, filters.offset);

    const result = await db.query<ModelArtifactRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM model_artifacts
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      ok: true,
      artifacts: result.rows.map(mapRowToDTO),
      limit: filters.limit,
      offset: filters.offset,
    };
  });

  // GET /admin/model-artifacts/:modelId/:modelVersion — fetch a specific artifact
  app.get('/admin/model-artifacts/:modelId/:modelVersion', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const { modelId, modelVersion } = paramsSchema.parse(request.params);

    const result = await db.query<ModelArtifactRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM model_artifacts
       WHERE model_id = $1 AND model_version = $2`,
      [modelId, modelVersion],
    );

    if (result.rowCount === 0) {
      reply.code(404);
      return { ok: false, error: 'Model artifact not found' };
    }

    return { ok: true, artifact: mapRowToDTO(result.rows[0]) };
  });

  // PATCH /admin/model-artifacts/:modelId/:modelVersion/status — promote/retire/block
  app.patch('/admin/model-artifacts/:modelId/:modelVersion/status', async (request, reply) => {
    ensureAdmin(request, createApiError);
    const actorUserId = resolveAuthenticatedUserId(request);

    const { modelId, modelVersion } = paramsSchema.parse(request.params);
    const payload = statusBodySchema.parse(request.body ?? {});

    // Promotion to active requires an explicit approval actor.
    if (payload.status === 'active' && !payload.approvalActor) {
      reply.code(422);
      return {
        ok: false,
        error: 'Promotion to active requires an approvalActor',
      };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Lock the target row and capture the current active version for rollback.
      const current = await client.query<{ status: string; rollback_model_version: string | null }>(
        `SELECT status, rollback_model_version
         FROM model_artifacts
         WHERE model_id = $1 AND model_version = $2
         FOR UPDATE`,
        [modelId, modelVersion],
      );

      if (current.rowCount === 0) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Model artifact not found' };
      }

      const currentStatus = current.rows[0].status;

      // If promoting to active, retire the currently-active model for this task
      // and record it as the rollback target (unless an explicit one was supplied).
      if (payload.status === 'active') {
        const previousActive = await client.query<{ model_version: string }>(
          `SELECT model_version
           FROM model_artifacts
           WHERE model_id = $1 AND status = 'active' AND model_version <> $2
           FOR UPDATE`,
          [modelId, modelVersion],
        );

        if (previousActive.rowCount && previousActive.rowCount > 0) {
          await client.query(
            `UPDATE model_artifacts
             SET status = 'retired'
             WHERE model_id = $1 AND model_version = $2`,
            [modelId, previousActive.rows[0].model_version],
          );
        }

        const rollbackTarget =
          payload.rollbackModelVersion ??
          previousActive.rows[0]?.model_version ??
          current.rows[0].rollback_model_version ??
          null;

        const updated = await client.query<ModelArtifactRow>(
          `UPDATE model_artifacts
             SET status = $3,
                 approval_actor = $4,
                 approved_at = NOW(),
                 rollback_model_version = $5
           WHERE model_id = $1 AND model_version = $2
             AND status <> 'active'
           RETURNING ${SELECT_COLUMNS}`,
          [modelId, modelVersion, payload.status, payload.approvalActor, rollbackTarget],
        );

        if (updated.rowCount === 0) {
          await client.query('ROLLBACK');
          reply.code(409);
          return { ok: false, error: 'Model is already active' };
        }

        await client.query('COMMIT');
        return { ok: true, artifact: mapRowToDTO(updated.rows[0]) };
      }

      // Non-active transitions (shadow / retired / blocked).
      const updated = await client.query<ModelArtifactRow>(
        `UPDATE model_artifacts
           SET status = $3
         WHERE model_id = $1 AND model_version = $2
           AND status <> $3
         RETURNING ${SELECT_COLUMNS}`,
        [modelId, modelVersion, payload.status],
      );

      if (updated.rowCount === 0) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Model is already in status '${currentStatus}'`,
        };
      }

      await client.query('COMMIT');
      return { ok: true, artifact: mapRowToDTO(updated.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('duplicate key')) {
        reply.code(409);
        return {
          ok: false,
          error: 'Another model is already active for this task',
        };
      }
      request.log.error({ err: error }, 'model artifact status transition failed');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    } finally {
      client.release();
    }
  });
};
