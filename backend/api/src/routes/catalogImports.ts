/**
 * Catalogue Import — REST Routes
 *
 * Thin route layer for the concierge catalogue importer. Every handler
 * validates auth, parses the request with zod, delegates business logic to
 * the domain service, and maps domain errors to the correct HTTP status.
 *
 * Per blueprint §6: "State transitions must be validated in the domain
 * service. Do not let route handlers write arbitrary status strings."
 */

import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import { createUploadUrl } from '../lib/s3.js';
import { connectorRegistry } from '../integrations/catalogSources/connectorRegistry.js';
import { CatalogImportService } from '../domain/catalogImports/catalogImportService.js';
import { CatalogImportError } from '../domain/catalogImports/catalogImportTypes.js';
import type {
  BatchSummaryDTO,
  CatalogImportBatchRow,
  CatalogImportConnectionRow,
  CatalogImportItemRow,
  CatalogImportMediaRow,
  CatalogSource,
  ConnectionDTO,
  ImportItemDTO,
  ImportMediaDTO,
  ItemReadiness,
  SellerDecision,
  SourceCapabilityDTO,
} from '../domain/catalogImports/catalogImportTypes.js';
import { batchPhaseFromState } from '../domain/catalogImports/catalogImportStateMachine.js';
import {
  publishBatch,
  getPublicationReceipt,
} from '../domain/catalogImports/catalogImportPublication.js';
import {
  validateAttestation,
  validatePackageUpload,
  validateBatchCreate,
  validateItemPatch,
} from '../domain/catalogImports/catalogImportValidation.js';

type CatalogImportRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  readDb: Pool;
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const sourceParamSchema = z.object({
  source: z.enum(['ebay', 'seller_package', 'depop', 'vinted']),
});

const connectionIdParamSchema = z.object({
  connectionId: z.string().min(1).max(120),
});

const batchIdParamSchema = z.object({
  batchId: z.string().min(1).max(120),
});

const itemIdParamSchema = z.object({
  itemId: z.string().min(1).max(120),
});

const authorizeBodySchema = z.object({
  redirectUri: z.string().url().max(2048),
});

const callbackQuerySchema = z.object({
  code: z.string().min(1).max(4096),
  state: z.string().min(1).max(4096),
});

const presignPackageBodySchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
});

const finalizePackageBodySchema = z.object({
  objectKey: z.string().trim().min(1).max(512),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
});

const createBatchBodySchema = z.object({
  source: z.enum(['ebay', 'seller_package', 'depop', 'vinted']),
  connectionId: z.string().min(1).max(120).optional(),
  packageId: z.string().min(1).max(120).optional(),
  consentVersion: z.string().trim().min(1).max(40),
});

const listItemsQuerySchema = z.object({
  cursor: z.string().min(1).max(4096).optional(),
  readiness: z
    .enum([
      'discovered',
      'hydrated',
      'media_pending',
      'mapping_pending',
      'ready',
      'needs_input',
      'probable_duplicate',
      'excluded',
      'source_changed',
    ])
    .optional(),
  decision: z.enum(['selected', 'excluded', 'undecided']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const patchItemBodySchema = z.object({
  fields: z.record(z.unknown()),
  sellerDecision: z.enum(['selected', 'excluded']).optional(),
});

const bulkCorrectionsBodySchema = z.object({
  itemIds: z.array(z.string().min(1).max(120)).min(1).max(500),
  fields: z.record(z.unknown()),
});

const approveBatchBodySchema = z.object({
  itemIds: z.array(z.string().min(1).max(120)).min(1).max(500),
  attestation: z.object({
    ownsRights: z.boolean(),
    accurateFacts: z.boolean(),
    noBuyerData: z.boolean(),
  }),
});

// ---------------------------------------------------------------------------
// DTO mapping helpers
// ---------------------------------------------------------------------------

function mapConnectionToDTO(row: CatalogImportConnectionRow): ConnectionDTO {
  return {
    id: row.id,
    source: row.source,
    externalAccountId: row.external_account_id,
    externalDisplayName: row.external_display_name,
    status: row.status,
    consentVersion: row.consent_version,
    consentedAt: row.consented_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapBatchToDTO(row: CatalogImportBatchRow): BatchSummaryDTO {
  return {
    id: row.id,
    source: row.source,
    mode: row.mode,
    status: row.status,
    statusReason: row.status_reason,
    discoveredCount: row.discovered_count,
    readyCount: row.ready_count,
    issueCount: row.issue_count,
    publishedCount: row.published_count,
    sourceSnapshotAt: row.source_snapshot_at
      ? row.source_snapshot_at.toISOString()
      : null,
    approvalRevision: row.approval_revision,
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

function mapMediaToDTO(row: CatalogImportMediaRow): ImportMediaDTO {
  return {
    id: row.id,
    position: row.position,
    fetchStatus: row.fetch_status,
    sha256: row.sha256,
    sniffedMimeType: row.sniffed_mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    mediaAssetId: row.media_asset_id,
    finalizationId: row.finalization_id,
    moderationStatus: row.moderation_status,
    publishability: row.publishability,
    previewUrl: null,
  };
}

function mapItemToDTO(
  row: CatalogImportItemRow,
  mediaRows?: CatalogImportMediaRow[],
): ImportItemDTO {
  return {
    id: row.id,
    batchId: row.batch_id,
    externalItemId: row.external_item_id,
    sourceUrl: row.source_url,
    sourceState: row.source_state,
    sourceUpdatedAt: row.source_updated_at
      ? row.source_updated_at.toISOString()
      : null,
    readiness: row.readiness,
    publicationStatus: row.publication_status,
    sellerDecision: row.seller_decision,
    fieldRevision: row.field_revision,
    draftListingId: row.draft_listing_id,
    duplicateOfListingId: row.duplicate_of_listing_id,
    duplicateScore: row.duplicate_score,
    blockingIssues: row.blocking_issues,
    normalisedFields: row.normalised_fields,
    media: mediaRows ? mediaRows.map(mapMediaToDTO) : [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapCapabilityToDTO(
  capability: ReturnType<typeof connectorRegistry.listCapabilities>[number],
): SourceCapabilityDTO {
  return {
    source: capability.source,
    authorization: capability.authorization,
    available: capability.enabled,
    unavailableReason: capability.unavailableReason,
    legalApprovalVersion: capability.legalApprovalVersion,
    canReadInventory: capability.canReadInventory,
    canReadMedia: capability.canReadMedia,
    canReadVariations: capability.canReadVariations,
    supportsRevocation: capability.supportsRevocation,
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerCatalogImportRoutes = ({
  app,
  db,
  readDb,
}: CatalogImportRouteDependencies) => {
  const service = new CatalogImportService();

  // -------------------------------------------------------------------------
  // Sources
  // -------------------------------------------------------------------------

  app.get('/catalog-imports/sources', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    try {
      const capabilities = connectorRegistry.listCapabilities();
      const sources = capabilities.map(mapCapabilityToDTO);
      return { sources };
    } catch (error) {
      request.log.error({ err: error }, 'catalog import route error');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------

  app.post(
    '/catalog-imports/connections/:source/authorize',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { source } = sourceParamSchema.parse(request.params);
        const { redirectUri } = authorizeBodySchema.parse(request.body);

        const capability = connectorRegistry.getCapability(source);
        if (!capability) {
          reply.code(404);
          return { ok: false, error: 'Unknown source' };
        }

        if (source === 'seller_package') {
          reply.code(422);
          return { ok: false, error: 'This source does not use OAuth' };
        }

        if (source === 'ebay') {
          reply.code(501);
          return { ok: false, error: 'eBay connector not yet available' };
        }

        // depop / vinted
        reply.code(503);
        return { ok: false, error: 'Source not yet available' };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'catalog import route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  app.get(
    '/catalog-imports/connections/:source/callback',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { source } = sourceParamSchema.parse(request.params);
        const { code, state } = callbackQuerySchema.parse(request.query);

        const capability = connectorRegistry.getCapability(source);
        if (!capability) {
          reply.code(404);
          return { ok: false, error: 'Unknown source' };
        }

        if (source === 'seller_package') {
          reply.code(422);
          return { ok: false, error: 'This source does not use OAuth' };
        }

        if (source === 'ebay') {
          reply.code(501);
          return { ok: false, error: 'eBay connector not yet available' };
        }

        reply.code(503);
        return { ok: false, error: 'Source not yet available' };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'catalog import route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  app.get('/catalog-imports/connections', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const userId = request.authUser.userId;

    try {
      const rows = await service.listConnections(userId);
      const connections = rows.map(mapConnectionToDTO);
      return { connections };
    } catch (error) {
      if (error instanceof CatalogImportError) {
        reply.code(error.statusCode);
        return { ok: false, error: error.message, code: error.code };
      }
      request.log.error({ err: error }, 'catalog import route error');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  app.delete(
    '/catalog-imports/connections/:connectionId',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { connectionId } = connectionIdParamSchema.parse(request.params);
        await service.revokeConnection(userId, connectionId);
        return { ok: true };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'catalog import route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  // -------------------------------------------------------------------------
  // Seller packages
  // -------------------------------------------------------------------------

  app.post('/catalog-imports/packages/presign', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const userId = request.authUser.userId;

    try {
      const payload = presignPackageBodySchema.parse(request.body);

      const validation = validatePackageUpload({
        fileName: payload.fileName,
        contentType: payload.contentType,
        sizeBytes: payload.sizeBytes,
      });
      if (!validation.valid) {
        reply.code(422);
        return { ok: false, error: validation.error ?? 'Invalid package upload' };
      }

      const packageId = `pkg_${crypto.randomUUID()}`;
      const objectKey = `catalog-imports/${userId}/${packageId}/${payload.fileName}`;
      const upload = await createUploadUrl(
        objectKey,
        payload.contentType,
        payload.sizeBytes,
      );

      return {
        packageId,
        uploadUrl: upload.url,
        objectKey: upload.key,
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
      request.log.error({ err: error }, 'catalog import route error');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  app.post(
    '/catalog-imports/packages/:packageId/finalize',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { packageId } = z
          .object({ packageId: z.string().min(1).max(120) })
          .parse(request.params);
        const payload = finalizePackageBodySchema.parse(request.body);

        const publicUrl = `${config.s3CdnBaseUrl.replace(/\/$/, '')}/${config.s3Bucket}/${payload.objectKey}`;

        await db.query(
          `INSERT INTO upload_finalizations
             (id, object_key, bucket, owner_id, folder,
              file_name, content_type, size_bytes, public_url,
              scope, status)
           VALUES ($1, $2, $3, $4, 'catalog-import',
                   $5, $6, $7, $8,
                   'listing_media', 'pending')`,
          [
            packageId,
            payload.objectKey,
            config.s3Bucket,
            userId,
            payload.fileName,
            payload.contentType,
            payload.sizeBytes,
            publicUrl,
          ],
        );

        return { packageId, status: 'finalized' };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'catalog import route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  // -------------------------------------------------------------------------
  // Batches
  // -------------------------------------------------------------------------

  app.post('/catalog-imports/batches', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const userId = request.authUser.userId;

    try {
      const payload = createBatchBodySchema.parse(request.body);

      const validation = validateBatchCreate({
        source: payload.source,
        connectionId: payload.connectionId ?? null,
        packageId: payload.packageId ?? null,
        consentVersion: payload.consentVersion,
      });
      if (!validation.valid) {
        reply.code(422);
        return { ok: false, error: validation.error ?? 'Invalid batch request' };
      }

      const batchRow = await service.createBatch({
        userId,
        source: payload.source,
        connectionId: payload.connectionId ?? null,
        packageId: payload.packageId ?? null,
        consentVersion: payload.consentVersion,
      });
      return { batch: mapBatchToDTO(batchRow) };
    } catch (error) {
      if (error instanceof CatalogImportError) {
        reply.code(error.statusCode);
        return { ok: false, error: error.message, code: error.code };
      }
      if (error instanceof z.ZodError) {
        reply.code(422);
        return { ok: false, error: 'Validation failed', details: error.issues };
      }
      request.log.error({ err: error }, 'catalog import route error');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  app.get('/catalog-imports/batches', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const userId = request.authUser.userId;

    try {
      const rows = await service.listBatches(userId);
      return { batches: rows.map(mapBatchToDTO) };
    } catch (error) {
      if (error instanceof CatalogImportError) {
        reply.code(error.statusCode);
        return { ok: false, error: error.message, code: error.code };
      }
      request.log.error({ err: error }, 'catalog import route error');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  app.get('/catalog-imports/batches/:batchId', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const userId = request.authUser.userId;

    try {
      const { batchId } = batchIdParamSchema.parse(request.params);
      const batchRow = await service.getBatch(userId, batchId);
      const phase = batchPhaseFromState(batchRow.status);
      return { batch: mapBatchToDTO(batchRow), phase };
    } catch (error) {
      if (error instanceof CatalogImportError) {
        reply.code(error.statusCode);
        return { ok: false, error: error.message, code: error.code };
      }
      if (error instanceof z.ZodError) {
        reply.code(422);
        return { ok: false, error: 'Validation failed', details: error.issues };
      }
      request.log.error({ err: error }, 'catalog import route error');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  app.post('/catalog-imports/batches/:batchId/start', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const userId = request.authUser.userId;

    try {
      const { batchId } = batchIdParamSchema.parse(request.params);
      await service.startBatch(userId, batchId);
      return { ok: true };
    } catch (error) {
      if (error instanceof CatalogImportError) {
        reply.code(error.statusCode);
        return { ok: false, error: error.message, code: error.code };
      }
      if (error instanceof z.ZodError) {
        reply.code(422);
        return { ok: false, error: 'Validation failed', details: error.issues };
      }
      request.log.error({ err: error }, 'catalog import route error');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  app.post(
    '/catalog-imports/batches/:batchId/cancel',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { batchId } = batchIdParamSchema.parse(request.params);
        await service.cancelBatch(userId, batchId);
        return { ok: true };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'catalog import route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  app.post('/catalog-imports/batches/:batchId/retry', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const userId = request.authUser.userId;

    try {
      const { batchId } = batchIdParamSchema.parse(request.params);
      await service.retryBatch(userId, batchId);
      return { ok: true };
    } catch (error) {
      if (error instanceof CatalogImportError) {
        reply.code(error.statusCode);
        return { ok: false, error: error.message, code: error.code };
      }
      if (error instanceof z.ZodError) {
        reply.code(422);
        return { ok: false, error: 'Validation failed', details: error.issues };
      }
      request.log.error({ err: error }, 'catalog import route error');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  app.delete(
    '/catalog-imports/batches/:batchId/raw-data',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { batchId } = batchIdParamSchema.parse(request.params);
        await service.deleteBatchRawData(userId, batchId);
        return { ok: true };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'catalog import route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  // -------------------------------------------------------------------------
  // Items
  // -------------------------------------------------------------------------

  app.get(
    '/catalog-imports/batches/:batchId/items',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { batchId } = batchIdParamSchema.parse(request.params);
        const query = listItemsQuerySchema.parse(request.query);

        const { items: itemRows, nextCursor } = await service.getBatchItems(
          batchId,
          {
            cursor: query.cursor,
            readiness: query.readiness as ItemReadiness | undefined,
            decision: query.decision as SellerDecision | undefined,
            limit: query.limit,
          },
        );

        const summary = await service.getBatchItemSummary(batchId);

        const items = itemRows.map((row) => mapItemToDTO(row));

        return { items, nextCursor: nextCursor ?? null, summary };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'catalog import route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  app.get('/catalog-imports/items/:itemId', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const userId = request.authUser.userId;

    try {
      const { itemId } = itemIdParamSchema.parse(request.params);
      const itemRow = await service.getItem(userId, itemId);
      return { item: mapItemToDTO(itemRow) };
    } catch (error) {
      if (error instanceof CatalogImportError) {
        reply.code(error.statusCode);
        return { ok: false, error: error.message, code: error.code };
      }
      if (error instanceof z.ZodError) {
        reply.code(422);
        return { ok: false, error: 'Validation failed', details: error.issues };
      }
      request.log.error({ err: error }, 'catalog import route error');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  app.patch('/catalog-imports/items/:itemId', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const userId = request.authUser.userId;

    try {
      const { itemId } = itemIdParamSchema.parse(request.params);
      const payload = patchItemBodySchema.parse(request.body);

      const ifMatch = request.headers['if-match'];
      if (!ifMatch || typeof ifMatch !== 'string' || ifMatch.trim().length === 0) {
        reply.code(428);
        return { ok: false, error: 'If-Match header is required for optimistic concurrency' };
      }

      const validation = validateItemPatch({
        fieldRevision: ifMatch,
        fields: payload.fields,
      });
      if (!validation.valid) {
        reply.code(422);
        return { ok: false, error: validation.error ?? 'Invalid item patch' };
      }

      const itemRow = await service.updateItemFields(
        userId,
        itemId,
        ifMatch,
        payload.fields,
        payload.sellerDecision,
      );
      return { item: mapItemToDTO(itemRow) };
    } catch (error) {
      if (error instanceof CatalogImportError) {
        reply.code(error.statusCode);
        return { ok: false, error: error.message, code: error.code };
      }
      if (error instanceof z.ZodError) {
        reply.code(422);
        return { ok: false, error: 'Validation failed', details: error.issues };
      }
      request.log.error({ err: error }, 'catalog import route error');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  app.post(
    '/catalog-imports/batches/:batchId/bulk-corrections',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { batchId } = batchIdParamSchema.parse(request.params);
        const payload = bulkCorrectionsBodySchema.parse(request.body);

        const updated = await service.bulkUpdateItems(
          batchId,
          payload.itemIds,
          payload.fields,
        );
        return { updated };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'catalog import route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  app.post(
    '/catalog-imports/batches/:batchId/approve',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { batchId } = batchIdParamSchema.parse(request.params);
        const payload = approveBatchBodySchema.parse(request.body);

        const attestationValidation = validateAttestation(payload.attestation);
        if (!attestationValidation.valid) {
          reply.code(422);
          return {
            ok: false,
            error: 'Attestation incomplete',
            missing: attestationValidation.missing,
          };
        }

        const { approvalRevision } = await service.approveBatch(
          userId,
          batchId,
          payload.itemIds,
          payload.attestation,
        );
        const batchRow = await service.getBatch(userId, batchId);
        return { batch: mapBatchToDTO(batchRow), approvalRevision };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'catalog import route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  app.post(
    '/catalog-imports/batches/:batchId/publish',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { batchId } = batchIdParamSchema.parse(request.params);
        const receipt = await publishBatch(userId, batchId);
        return { receipt };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'catalog import route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );

  app.get(
    '/catalog-imports/batches/:batchId/publication-receipt',
    async (request, reply) => {
      if (!request.authUser) {
        reply.code(401);
        return { ok: false, error: 'Unauthorized' };
      }
      const userId = request.authUser.userId;

      try {
        const { batchId } = batchIdParamSchema.parse(request.params);
        const receipt = await getPublicationReceipt(userId, batchId);
        if (!receipt) {
          reply.code(404);
          return { ok: false, error: 'No publication receipt found for this batch' };
        }
        return { receipt };
      } catch (error) {
        if (error instanceof CatalogImportError) {
          reply.code(error.statusCode);
          return { ok: false, error: error.message, code: error.code };
        }
        if (error instanceof z.ZodError) {
          reply.code(422);
          return { ok: false, error: 'Validation failed', details: error.issues };
        }
        request.log.error({ err: error }, 'catalog import route error');
        reply.code(500);
        return { ok: false, error: 'Internal server error' };
      }
    },
  );
};
