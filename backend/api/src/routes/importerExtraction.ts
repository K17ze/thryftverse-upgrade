/**
 * Importer Assisted Extraction — REST Routes
 *
 * Thin route layer for ML-assisted structured extraction from catalogue
 * photos. Every handler validates auth, parses the request with zod,
 * delegates business logic to the extraction domain service, and maps
 * domain errors to the correct HTTP status.
 *
 * Anti-AI policy (per AGENTS.md):
 * - The extraction is advisory — the seller sees extracted fields with
 *   confidence scores and must confirm each one.
 * - No "AI-powered import" claims — this is "assisted extraction".
 * - The human confirmation gate is non-negotiable — no field enters the
 *   listing draft without seller sign-off. The publish endpoint refuses
 *   unless every required field is confirmed or edited.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { enqueueImporterExtractionJob } from '../lib/queues.js';
import { ImporterExtractionService } from '../domain/catalogImports/importerExtractionService.js';
import { CatalogImportService } from '../domain/catalogImports/catalogImportService.js';
import { CatalogImportError } from '../domain/catalogImports/catalogImportTypes.js';
import type { ExtractionSummaryDTO } from '../domain/catalogImports/importerExtractionService.js';

type ImporterExtractionRouteDependencies = {
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

const triggerExtractionBodySchema = z.object({
  mediaAssetId: z.string().min(1).max(120).optional(),
  modelId: z.string().trim().min(2).max(120).default('placeholder-extractor'),
  modelVersion: z.string().trim().min(1).max(120).default('v0'),
});

const confirmFieldsBodySchema = z.object({
  /** Fields to confirm as correct. */
  confirm: z.array(z.string().min(1).max(120)).optional(),
  /** Fields to reject (will not enter the listing draft). */
  reject: z.array(z.string().min(1).max(120)).optional(),
  /** Fields to edit: { fieldName: newValue }. */
  edit: z.record(z.unknown()).optional(),
});

const publishBodySchema = z.object({
  /** Optional attestation that the seller owns the rights to the listing. */
  attestation: z
    .object({
      ownsRights: z.boolean(),
      accurateFacts: z.boolean(),
      noBuyerData: z.boolean(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerImporterExtractionRoutes = ({
  app,
  db: _db,
  readDb: _readDb,
}: ImporterExtractionRouteDependencies) => {
  const extractionService = new ImporterExtractionService();
  const catalogImportService = new CatalogImportService();

  // Deprecation: these routes are superseded by the extraction intelligence
  // routes (routes/extractionIntelligence.ts). They are retained for backward
  // compatibility but should not be used by new clients. The new routes fix
  // three P0 defects: client-supplied model identity, global media asset
  // resolution, and false completion semantics.
  const DEPRECATION_HEADER = 'true';
  const SUNSET_DATE = '2026-12-31';
  const DEPRECATION_LINK = '/catalog-imports/items/:itemId/extraction-runs';

  // Add deprecation headers to all responses from these routes.
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Deprecation', DEPRECATION_HEADER);
    reply.header('Sunset', SUNSET_DATE);
    reply.header('Link', `<${DEPRECATION_LINK}>; rel="successor-version"`);
    return payload;
  });

  // -------------------------------------------------------------------------
  // POST /catalog-imports/items/:itemId/extraction — trigger extraction
  // -------------------------------------------------------------------------

  app.post(
    '/catalog-imports/items/:itemId/extraction',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { itemId } = itemIdParamSchema.parse(request.params);
        const payload = triggerExtractionBodySchema.parse(request.body ?? {});

        // Verify item ownership through the catalog import service.
        await catalogImportService.getItem(userId, itemId);

        // Create the extraction row (supersedes any prior active extraction).
        const extraction = await extractionService.queueExtraction(
          itemId,
          payload.mediaAssetId ?? null,
          payload.modelId,
          payload.modelVersion,
          userId,
        );

        // Enqueue the extraction job (converged queue shape: runId/modelBundle).
        await enqueueImporterExtractionJob({
          runId: extraction.id,
          itemId,
          mediaAssetId: payload.mediaAssetId ?? null,
          modelBundleId: payload.modelId,
          modelBundleVersion: payload.modelVersion,
        });

        reply.code(202);
        return {
          ok: true,
          extractionId: extraction.id,
          extractionStatus: extraction.extraction_status,
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
        request.log.error({ err: error }, 'importer extraction route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /catalog-imports/items/:itemId/extraction — get extraction results
  // -------------------------------------------------------------------------

  app.get(
    '/catalog-imports/items/:itemId/extraction',
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

        const extraction =
          await extractionService.getLatestExtractionForItem(itemId);

        if (!extraction) {
          reply.code(404);
          return {
            ok: false,
            error: 'No extraction found for this item',
          };
        }

        const summary = await extractionService.getExtractionSummary(
          extraction.id,
        );

        return { extraction: summary };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'importer extraction route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /catalog-imports/items/:itemId/extraction/confirm — confirm/reject/edit
  // -------------------------------------------------------------------------

  app.post(
    '/catalog-imports/items/:itemId/extraction/confirm',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { itemId } = itemIdParamSchema.parse(request.params);
        const payload = confirmFieldsBodySchema.parse(request.body ?? {});

        // Verify item ownership.
        await catalogImportService.getItem(userId, itemId);

        const extraction =
          await extractionService.getLatestExtractionForItem(itemId);

        if (!extraction) {
          reply.code(404);
          return {
            ok: false,
            error: 'No extraction found for this item',
          };
        }

        let updated: ExtractionSummaryDTO | null = null;

        // Apply confirmations.
        if (payload.confirm) {
          for (const fieldName of payload.confirm) {
            await extractionService.confirmField(
              extraction.id,
              fieldName,
              userId,
            );
          }
        }

        // Apply rejections.
        if (payload.reject) {
          for (const fieldName of payload.reject) {
            await extractionService.rejectField(
              extraction.id,
              fieldName,
              userId,
            );
          }
        }

        // Apply edits.
        if (payload.edit) {
          for (const [fieldName, newValue] of Object.entries(payload.edit)) {
            await extractionService.editField(
              extraction.id,
              fieldName,
              newValue,
              userId,
            );
          }
        }

        updated = await extractionService.getExtractionSummary(extraction.id);

        return { extraction: updated };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'importer extraction route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /catalog-imports/items/:itemId/extraction/publish — publish to draft
  // -------------------------------------------------------------------------

  app.post(
    '/catalog-imports/items/:itemId/extraction/publish',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { itemId } = itemIdParamSchema.parse(request.params);
        const _payload = publishBodySchema.parse(request.body ?? {});

        // Verify item ownership.
        await catalogImportService.getItem(userId, itemId);

        const extraction =
          await extractionService.getLatestExtractionForItem(itemId);

        if (!extraction) {
          reply.code(404);
          return {
            ok: false,
            error: 'No extraction found for this item',
          };
        }

        // The non-negotiable human confirmation gate: refuse to publish
        // unless every required field is seller-confirmed or seller-edited.
        const ready = await extractionService.isReadyForPublication(
          extraction.id,
        );

        if (!ready) {
          const summary = await extractionService.getExtractionSummary(
            extraction.id,
          );
          reply.code(422);
          return {
            ok: false,
            error:
              'Cannot publish: not all required fields are seller-confirmed or edited',
            code: 'blocking_issues_unresolved',
            pendingRequiredFields: summary.pendingRequiredFields,
          };
        }

        // Return the confirmed fields that may enter the listing draft.
        // The actual listing draft creation is handled by the existing
        // publication saga (catalogImportPublication.ts) once the seller
        // merges these fields into the item's normalised_fields and approves
        // the batch. This endpoint is the gate that proves every field was
        // seller-approved before that merge.
        const confirmedFields =
          await extractionService.getConfirmedFields(extraction.id);

        const summary = await extractionService.getExtractionSummary(
          extraction.id,
        );

        return {
          ok: true,
          extractionId: extraction.id,
          confirmedFields,
          readyForPublication: true,
          summary,
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
        request.log.error({ err: error }, 'importer extraction route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );
};
