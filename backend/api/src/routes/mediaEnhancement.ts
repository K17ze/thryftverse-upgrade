/**
 * Media Enhancement routes — fail-closed capability registry.
 *
 * Per report #14 (AI Photo Enhancement) and AGENTS.md §11/§37:
 *   The capability endpoint is the single source of truth for whether AI
 *   photo enhancement is available. It returns `available: false` until a
 *   provider is configured (PHOTOROOM_API_KEY or equivalent). The frontend
 *   must never claim or apply an enhancement without this server-confirmed
 *   capability — no __DEV__ inversion, no false-success no-op.
 *
 * Contract:
 *   GET  /media-enhancement/capabilities          — capability registry (fail-closed)
 *   GET  /media-enhancement/capabilities?assetId=… — per-asset eligibility
 *   POST /media-enhancement/jobs                   — submit enhancement job (idempotent)
 *   GET  /media-enhancement/jobs/:id               — job status
 *   GET  /media-enhancement/jobs/:id/result        — candidate asset URL (when candidate_ready)
 *   POST /media-enhancement/jobs/:id/cancel        — cancel a queued/processing job
 *
 * When no provider is configured:
 *   - capabilities returns `available: false` with an empty operations array
 *   - job submission returns 503 `capability_unavailable`
 *
 * When a provider IS configured (future):
 *   - capabilities returns the operation allowlist filtered by policy,
 *     category, quota, and region
 *   - job submission creates an idempotent row, dispatches to the provider
 *     adapter, and returns 202 with the domain job ID + poll interval
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  createMediaEnhancementProvider,
  type EnhancementOperationSpec,
  type MediaEnhancementProvider,
} from '../lib/mediaEnhancementProvider.js';

type MediaEnhancementRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

// ── Provider availability ─────────────────────────────────────────────────
// The capability is available only when a provider adapter reports
// isConfigured()=true. This is the fail-closed gate — no __DEV__ inversion,
// no build-mode truth. The provider adapter is the single translation
// boundary; no provider-specific type leaks into the domain layer.

const enhancementProvider: MediaEnhancementProvider | null = createMediaEnhancementProvider();

function isEnhancementProviderConfigured(): boolean {
  return enhancementProvider !== null && enhancementProvider.isConfigured();
}

// ── Operation registry ────────────────────────────────────────────────────
// The canonical operation list. Risk tiers per report §5.2.
// Tier D operations are prohibited and never exposed.

interface EnhancementOperationDef {
  id: string;
  label: string;
  description: string;
  type: string;
  riskTier: 'A' | 'B' | 'C';
}

const OPERATIONS: EnhancementOperationDef[] = [
  {
    id: 'op-exif-orientation',
    label: 'Correct Orientation',
    description: 'Fix EXIF rotation so the photo displays upright.',
    type: 'exif_orientation',
    riskTier: 'A',
  },
  {
    id: 'op-auto-crop',
    label: 'Auto Crop',
    description: 'Crop and centre the product for a consistent frame.',
    type: 'auto_crop',
    riskTier: 'A',
  },
  {
    id: 'op-compression',
    label: 'Optimise',
    description: 'Compress the image for faster loading without visible quality loss.',
    type: 'compression',
    riskTier: 'A',
  },
  {
    id: 'op-color-correction',
    label: 'Colour Correction',
    description: 'Balance white point, saturation and contrast for accurate colours.',
    type: 'color_correction',
    riskTier: 'A',
  },
  {
    id: 'op-lighting-fix',
    label: 'Lighting Fix',
    description: 'Correct uneven lighting and reduce harsh shadows.',
    type: 'lighting_fix',
    riskTier: 'A',
  },
  {
    id: 'op-background-removal',
    label: 'Neutral Background',
    description: 'Remove the background and isolate the product on a clean canvas.',
    type: 'background_removal',
    riskTier: 'B',
  },
  {
    id: 'op-ai-shadows',
    label: 'Add Shadow',
    description: 'Add a natural, realistic shadow beneath the isolated product.',
    type: 'ai_shadows',
    riskTier: 'B',
  },
  {
    id: 'op-background-replace',
    label: 'Replace Background',
    description: 'Replace the background with a studio or neutral scene.',
    type: 'background_replace',
    riskTier: 'C',
  },
];

const POLICY_VERSION = '1';

// ── Schemas ───────────────────────────────────────────────────────────────

const capabilitiesQuerySchema = z.object({
  assetId: z.string().trim().min(2).max(120).optional(),
});

const submitJobBodySchema = z.object({
  sourceMediaAssetId: z.string().trim().min(2).max(120),
  operations: z.array(z.object({
    operationId: z.string().trim().min(2).max(80),
    parameters: z.record(z.unknown()).default({}),
  })).min(1).max(6),
  idempotencyKey: z.string().trim().min(2).max(120),
});

const jobIdParamsSchema = z.object({
  jobId: z.string().trim().min(2).max(120),
});

// ── Route registration ────────────────────────────────────────────────────

export const registerMediaEnhancementRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
}: MediaEnhancementRouteDependencies): void => {
  // ── GET /media-enhancement/capabilities ───────────────────────────────
  // Fail-closed: returns available:false when no provider is configured.
  // The frontend reads this to decide whether to show the editing surface
  // or an honest "not yet available" state.
  app.get('/media-enhancement/capabilities', async (request, reply) => {
    const _userId = resolveAuthenticatedUserId(request);
    const { assetId } = capabilitiesQuerySchema.parse(request.query);
    const providerConfigured = isEnhancementProviderConfigured();

    if (!providerConfigured) {
      reply.header('Cache-Control', 'public, max-age=60');
      return {
        ok: true,
        available: false,
        reason: 'no_provider_configured',
        policyVersion: POLICY_VERSION,
        operations: [],
        generatedAt: new Date().toISOString(),
      };
    }

    // Provider is configured — return the operation allowlist.
    // Per-asset eligibility checks (category restrictions, condition-evidence
    // protection) would be applied here when the provider adapter is wired.
    const eligibleOperations = assetId
      ? await checkAssetEligibility(db, assetId, _userId)
      : OPERATIONS;

    reply.header('Cache-Control', 'public, max-age=60');
    return {
      ok: true,
      available: true,
      policyVersion: POLICY_VERSION,
      operations: eligibleOperations.map((op) => ({
        id: op.id,
        label: op.label,
        description: op.description,
        type: op.type,
        riskTier: op.riskTier,
      })),
      generatedAt: new Date().toISOString(),
    };
  });

  // ── POST /media-enhancement/jobs ──────────────────────────────────────
  // Idempotent job submission. Returns 202 with domain job ID.
  // 503 when capability is unavailable (fail-closed).
  app.post('/media-enhancement/jobs', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const providerConfigured = isEnhancementProviderConfigured();

    if (!providerConfigured) {
      reply.code(503);
      return {
        ok: false,
        error: 'capability_unavailable',
        message: 'AI photo enhancement is not available. No provider is configured.',
      };
    }

    const payload = submitJobBodySchema.parse(request.body);

    // Verify the source asset belongs to the user and resolve a fetchable URL.
    const assetCheck = await db.query<{ owner_id: string; canonical_url: string | null; original_object_url: string }>(
      'SELECT owner_id, canonical_url, original_object_url FROM media_assets WHERE id = $1 LIMIT 1',
      [payload.sourceMediaAssetId],
    );
    if (!assetCheck.rowCount) {
      reply.code(404);
      return { ok: false, error: 'asset_not_found' };
    }
    if (assetCheck.rows[0].owner_id !== userId) {
      reply.code(403);
      return { ok: false, error: 'not_authorized' };
    }
    const sourceUrl = assetCheck.rows[0].canonical_url ?? assetCheck.rows[0].original_object_url;
    if (!sourceUrl) {
      reply.code(422);
      return { ok: false, error: 'source_url_unavailable' };
    }

    // Idempotency: if a job with the same (owner, idempotency_key) exists,
    // return its current state instead of creating a duplicate.
    const existing = await db.query<{
      id: string;
      state: string;
      created_at: string;
    }>(
      `SELECT id, state, created_at::text
       FROM media_enhancement_jobs
       WHERE owner_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [userId, payload.idempotencyKey],
    );

    if (existing.rowCount) {
      reply.code(202);
      return {
        ok: true,
        jobId: existing.rows[0].id,
        state: existing.rows[0].state,
        pollIntervalMs: 2000,
        idempotent: true,
      };
    }

    // Create the domain job row in 'queued' state, then dispatch to the
    // provider adapter. The provider_job_id is persisted so the reconciler
    // can poll the provider independently of the request lifecycle.
    const jobId = `enh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const requestHash = JSON.stringify(payload.operations);
    const providerName = enhancementProvider!.name;

    const inserted = await db.query<{ id: string }>(
      `INSERT INTO media_enhancement_jobs
         (id, owner_id, source_media_asset_id, request_hash, idempotency_key, state, provider)
       VALUES ($1, $2, $3, $4, $5, 'queued', $6)
       RETURNING id`,
      [jobId, userId, payload.sourceMediaAssetId, requestHash, payload.idempotencyKey, providerName],
    );

    // Insert operation rows
    const operationSpecs: EnhancementOperationSpec[] = [];
    for (let i = 0; i < payload.operations.length; i++) {
      const op = payload.operations[i];
      const def = OPERATIONS.find((o) => o.id === op.operationId);
      if (!def) {
        reply.code(422);
        return { ok: false, error: 'unknown_operation', operationId: op.operationId };
      }
      await db.query(
        `INSERT INTO media_enhancement_operations
           (id, job_id, ordinal, operation_type, parameters_json, risk_tier)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [`op_${jobId}_${i}`, jobId, i, def.type, JSON.stringify(op.parameters), def.riskTier],
      );
      operationSpecs.push({
        operationId: op.operationId,
        operationType: def.type,
        parameters: op.parameters,
      });
    }

    // Dispatch to the provider adapter. On success, transition to
    // 'processing' and store the provider_job_id. On failure, mark the
    // job 'failed' with an error_code so the client sees an honest state.
    let providerJobId: string | null = null;
    let dispatchState = 'queued';
    let errorCode: string | null = null;
    try {
      const result = await enhancementProvider!.submitJob({
        sourceUrl,
        operations: operationSpecs,
        idempotencyKey: payload.idempotencyKey,
      });
      providerJobId = result.providerJobId;
      dispatchState = result.status === 'processing' ? 'processing' : 'queued';
    } catch (err) {
      errorCode = err instanceof Error ? err.message : String(err);
      dispatchState = 'failed';
    }

    await db.query(
      `UPDATE media_enhancement_jobs
       SET provider_job_id = $2,
           state = $3,
           error_code = $4,
           started_at = CASE WHEN $3 = 'processing' THEN now() ELSE started_at END,
           completed_at = CASE WHEN $3 = 'failed' THEN now() ELSE completed_at END
       WHERE id = $1`,
      [jobId, providerJobId, dispatchState, errorCode],
    );

    reply.code(202);
    return {
      ok: true,
      jobId: inserted.rows[0].id,
      state: dispatchState,
      pollIntervalMs: 2000,
      idempotent: false,
    };
  });

  // ── GET /media-enhancement/jobs/:jobId ────────────────────────────────
  app.get('/media-enhancement/jobs/:jobId', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { jobId } = jobIdParamsSchema.parse(request.params);

    const job = await db.query<{
      id: string;
      owner_id: string;
      state: string;
      error_code: string | null;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
    }>(
      `SELECT id, owner_id, state, error_code,
              created_at::text, started_at::text, completed_at::text
       FROM media_enhancement_jobs
       WHERE id = $1 AND owner_id = $2
       LIMIT 1`,
      [jobId, userId],
    );

    if (!job.rowCount) {
      reply.code(404);
      return { ok: false, error: 'job_not_found' };
    }

    return {
      ok: true,
      job: {
        id: job.rows[0].id,
        state: job.rows[0].state,
        errorCode: job.rows[0].error_code,
        createdAt: job.rows[0].created_at,
        startedAt: job.rows[0].started_at,
        completedAt: job.rows[0].completed_at,
      },
    };
  });

  // ── GET /media-enhancement/jobs/:jobId/result ──────────────────────────
  // Returns the candidate asset URL when the job has reached
  // 'candidate_ready'. Before that state the endpoint returns 409
  // `result_not_ready` so the frontend can keep polling the status route.
  app.get('/media-enhancement/jobs/:jobId/result', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { jobId } = jobIdParamsSchema.parse(request.params);

    const job = await db.query<{
      owner_id: string;
      state: string;
      source_media_asset_id: string;
    }>(
      `SELECT owner_id, state, source_media_asset_id
       FROM media_enhancement_jobs
       WHERE id = $1 AND owner_id = $2
       LIMIT 1`,
      [jobId, userId],
    );

    if (!job.rowCount) {
      reply.code(404);
      return { ok: false, error: 'job_not_found' };
    }

    if (job.rows[0].state !== 'candidate_ready') {
      reply.code(409);
      return {
        ok: false,
        error: 'result_not_ready',
        state: job.rows[0].state,
      };
    }

    // Resolve the candidate derivation for this job. The derived asset's
    // canonical_url is the candidate the seller reviews before applying.
    const derivation = await db.query<{
      derived_asset_id: string | null;
    }>(
      `SELECT d.derived_asset_id
       FROM media_derivations d
       WHERE d.job_id = $1
       ORDER BY d.candidate_rank ASC
       LIMIT 1`,
      [jobId],
    );

    if (!derivation.rowCount || !derivation.rows[0].derived_asset_id) {
      reply.code(409);
      return { ok: false, error: 'result_not_ready', state: job.rows[0].state };
    }

    const asset = await db.query<{ canonical_url: string | null; original_object_url: string }>(
      'SELECT canonical_url, original_object_url FROM media_assets WHERE id = $1 LIMIT 1',
      [derivation.rows[0].derived_asset_id],
    );

    if (!asset.rowCount) {
      reply.code(409);
      return { ok: false, error: 'result_not_ready', state: job.rows[0].state };
    }

    const candidateUrl = asset.rows[0].canonical_url ?? asset.rows[0].original_object_url;
    return {
      ok: true,
      jobId,
      state: 'candidate_ready',
      candidateAssetId: derivation.rows[0].derived_asset_id,
      candidateUrl,
    };
  });

  // ── POST /media-enhancement/jobs/:jobId/cancel ────────────────────────
  app.post('/media-enhancement/jobs/:jobId/cancel', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { jobId } = jobIdParamsSchema.parse(request.params);

    const job = await db.query<{ owner_id: string; state: string; provider_job_id: string | null }>(
      'SELECT owner_id, state, provider_job_id FROM media_enhancement_jobs WHERE id = $1 LIMIT 1',
      [jobId],
    );

    if (!job.rowCount) {
      reply.code(404);
      return { ok: false, error: 'job_not_found' };
    }
    if (job.rows[0].owner_id !== userId) {
      reply.code(403);
      return { ok: false, error: 'not_authorized' };
    }

    const terminalStates = ['candidate_ready', 'applied', 'reverted', 'expired', 'failed', 'cancelled', 'policy_rejected'];
    if (terminalStates.includes(job.rows[0].state)) {
      reply.code(409);
      return { ok: false, error: 'job_already_terminal', state: job.rows[0].state };
    }

    // Best-effort provider cancellation. A provider timeout or error does
    // not block the domain cancellation — the job is marked cancelled
    // locally regardless, and the reconciler cleans up the provider side.
    const providerJobId = job.rows[0].provider_job_id;
    if (providerJobId && enhancementProvider) {
      try {
        await enhancementProvider.cancelJob(providerJobId);
      } catch {
        // Swallow — the domain state is the source of truth.
      }
    }

    await db.query(
      `UPDATE media_enhancement_jobs
       SET state = 'cancelled', completed_at = now()
       WHERE id = $1 AND state IN ('queued', 'processing', 'outcome_unknown')`,
      [jobId],
    );

    return { ok: true, jobId, state: 'cancelled' };
  });
};

// ── Per-asset eligibility ─────────────────────────────────────────────────
// When a provider is configured, check whether the asset is eligible for
// enhancement. Category restrictions and condition-evidence protection would
// be applied here. For now, returns all non-prohibited operations.

async function checkAssetEligibility(
  _db: Pool,
  _assetId: string,
  _userId: string,
): Promise<EnhancementOperationDef[]> {
  // Future: check asset category, condition-evidence flags, and policy
  // restrictions. For now, return all Tier A-C operations.
  return OPERATIONS;
}
