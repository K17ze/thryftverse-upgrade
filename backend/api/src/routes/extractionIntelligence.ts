/**
 * Extraction Intelligence — REST Routes
 *
 * Thin route layer for the converged extraction domain (migration 192).
 * Replaces routes/importerExtraction.ts.
 *
 * Security & authority fixes (per flagship report §11):
 * - The client NEVER supplies modelId/modelVersion. The server selects the
 *   active model bundle from model_artifacts.
 * - Media assets are bound through catalog_import_media for the owned item.
 *   No global media_assets SELECT.
 * - Outcomes are honest: unavailable_no_model / source_missing / partial
 *   are never recorded as 'completed'.
 *
 * Anti-AI policy (per AGENTS.md):
 * - Extraction produces CANDIDATE EVIDENCE, not facts. The seller sees
 *   candidates with calibrated confidence and must accept, edit, or reject
 *   each one.
 * - No "AI-powered import" claims. This is "assisted extraction".
 * - The revision-checked field-decision command is the only bridge from
 *   candidates to normalised_fields. No field enters a listing draft
 *   without seller sign-off.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { enqueueImporterExtractionJob } from '../lib/queues.js';
import { ExtractionIntelligenceService } from '../domain/catalogImports/extractionIntelligenceService.js';
import { CatalogImportService } from '../domain/catalogImports/catalogImportService.js';
import { CatalogImportError } from '../domain/catalogImports/catalogImportTypes.js';
import type { FieldDecisionKind } from '../domain/catalogImports/extractionIntelligenceTypes.js';

type ExtractionIntelligenceRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  readDb: Pool;
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const itemIdParamSchema = z.object({
  itemId: z.string().min(1).max(120),
});

/**
 * The trigger body is intentionally minimal: the client does NOT supply
 * model identity. The server owns model selection from model_artifacts.
 * mediaAssetId is optional — when null, the item's primary verified media
 * is used.
 */
const triggerExtractionBodySchema = z.object({
  mediaAssetId: z.string().min(1).max(120).optional(),
});

const fieldDecisionBodySchema = z.object({
  runId: z.string().min(1).max(120),
  candidateId: z.string().min(1).max(120).optional(),
  fieldName: z.string().min(1).max(120),
  decision: z.enum(['accepted', 'rejected', 'edited']),
  finalValue: z.unknown().optional(),
  baseFieldRevision: z.string().min(1).max(120),
});

const bulkFieldDecisionBodySchema = z.object({
  baseFieldRevision: z.string().min(1).max(120),
  decisions: z.array(
    z.object({
      runId: z.string().min(1).max(120),
      candidateId: z.string().min(1).max(120).optional(),
      fieldName: z.string().min(1).max(120),
      decision: z.enum(['accepted', 'rejected', 'edited']),
      finalValue: z.unknown().optional(),
    }),
  ).min(1).max(50)
  .refine(
    (decisions) => {
      // Reject duplicate (fieldName, decision) pairs — they would collide
      // on the idempotency key and silently skip the second.
      const seen = new Set<string>();
      for (const d of decisions) {
        const key = `${d.fieldName}:${d.decision}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    },
    { message: 'Duplicate (fieldName, decision) pairs in bulk decisions' },
  ),
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerExtractionIntelligenceRoutes = ({
  app,
  db: _db,
  readDb: _readDb,
}: ExtractionIntelligenceRouteDependencies) => {
  const extractionService = new ExtractionIntelligenceService();
  const catalogImportService = new CatalogImportService();

  // -------------------------------------------------------------------------
  // POST /catalog-imports/items/:itemId/extraction-runs — trigger extraction
  // -------------------------------------------------------------------------

  app.post(
    '/catalog-imports/items/:itemId/extraction-runs',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { itemId } = itemIdParamSchema.parse(request.params);
        const payload = triggerExtractionBodySchema.parse(request.body ?? {});

        // Verify item ownership through the canonical import service.
        await catalogImportService.getItem(userId, itemId);

        // Queue the run. The service server-selects the model bundle and
        // binds the media asset through catalog_import_media.
        const run = await extractionService.queueRun(
          itemId,
          userId,
          payload.mediaAssetId ?? null,
        );

        // If the run is already terminal (unavailable_no_model), do not
        // enqueue a worker job — there is no model to run.
        if (run.job_state !== 'terminal') {
          await enqueueImporterExtractionJob({
            runId: run.id,
            itemId,
            mediaAssetId: run.media_asset_id,
            modelBundleId: run.model_bundle_id,
            modelBundleVersion: run.model_bundle_version,
          });
        }

        reply.code(202);
        return {
          ok: true,
          runId: run.id,
          jobState: run.job_state,
          outcome: run.outcome,
        };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'extractionIntelligence route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /catalog-imports/items/:itemId/extraction-runs/latest — get latest run
  // -------------------------------------------------------------------------

  app.get(
    '/catalog-imports/items/:itemId/extraction-runs/latest',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { itemId } = itemIdParamSchema.parse(request.params);

        // Verify item ownership.
        await catalogImportService.getItem(userId, itemId);

        const run = await extractionService.getLatestRunForItem(itemId);

        if (!run) {
          reply.code(404);
          return { ok: false, error: 'No extraction run found for this item' };
        }

        return { run };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'extractionIntelligence route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /catalog-imports/items/:itemId/field-decisions — apply one decision
  // -------------------------------------------------------------------------

  app.post(
    '/catalog-imports/items/:itemId/field-decisions',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { itemId } = itemIdParamSchema.parse(request.params);
        const payload = fieldDecisionBodySchema.parse(request.body ?? {});

        // Verify item ownership.
        await catalogImportService.getItem(userId, itemId);

        const idempotencyKey = `${itemId}:${payload.baseFieldRevision}:${payload.fieldName}:${payload.decision}`;

        const decision = await extractionService.applyFieldDecision({
          itemId,
          runId: payload.runId,
          candidateId: payload.candidateId ?? null,
          fieldName: payload.fieldName,
          actorId: userId,
          decision: payload.decision as FieldDecisionKind,
          finalValue: payload.finalValue ?? null,
          baseFieldRevision: payload.baseFieldRevision,
          idempotencyKey,
        });

        return { decision };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'extractionIntelligence route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /catalog-imports/items/:itemId/field-decisions/bulk — apply many
  // -------------------------------------------------------------------------

  app.post(
    '/catalog-imports/items/:itemId/field-decisions/bulk',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { itemId } = itemIdParamSchema.parse(request.params);
        const payload = bulkFieldDecisionBodySchema.parse(request.body ?? {});

        // Verify item ownership.
        await catalogImportService.getItem(userId, itemId);

        const result = await extractionService.applyBulkFieldDecisions(
          itemId,
          userId,
          payload.baseFieldRevision,
          payload.decisions.map((d) => ({
            runId: d.runId,
            candidateId: d.candidateId ?? null,
            fieldName: d.fieldName,
            decision: d.decision as FieldDecisionKind,
            finalValue: d.finalValue ?? null,
          })),
        );

        return { result };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'extractionIntelligence route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /catalog-imports/items/:itemId/field-decisions — decision history
  // -------------------------------------------------------------------------

  app.get(
    '/catalog-imports/items/:itemId/field-decisions',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { itemId } = itemIdParamSchema.parse(request.params);

        // Verify item ownership.
        await catalogImportService.getItem(userId, itemId);

        const decisions = await extractionService.getDecisionsForItem(itemId);

        return { decisions };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'extractionIntelligence route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );
};
