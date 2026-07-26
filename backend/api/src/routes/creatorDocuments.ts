import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type CreatorDocumentsRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

// ── Layer payload schemas (parity with frontend composition.ts) ──────

const TextLayerPayloadSchema = z.object({
  text: z.string().min(1).max(500),
  textStyle: z.enum(['headline', 'editorial', 'clean', 'compact', 'handwritten']).default('clean'),
  textColor: z.string().default('#ffffff'),
  backgroundColor: z.string().optional(),
  alignment: z.enum(['left', 'center', 'right']).default('center'),
  lineHeight: z.number().min(0.8).max(3).optional(),
  opacity: z.number().min(0).max(1).default(1),
});

const MediaLayerPayloadSchema = z.object({
  mediaUri: z.string(),
  mediaType: z.enum(['image', 'video']).default('image'),
  contentFit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  thumbnailUri: z.string().optional(),
  videoDurationMs: z.number().nullable().optional(),
  opacity: z.number().min(0).max(1).default(1),
});

const ProductLayerPayloadSchema = z.object({
  listingId: z.string().min(1),
  snapshotTitle: z.string().default(''),
  snapshotImageUrl: z.string().optional(),
  snapshotPriceGbp: z.number().optional(),
  availability: z.enum(['active', 'sold', 'deleted']).default('active'),
  hotspotLabel: z.string().optional(),
});

const MentionLayerPayloadSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
});

const LookLayerPayloadSchema = z.object({
  lookId: z.string().min(1),
  snapshotCaption: z.string().default(''),
  snapshotImageUrl: z.string().optional(),
});

const VoteLayerPayloadSchema = z.object({
  question: z.string().min(1).max(100),
  options: z.array(z.object({ id: z.string(), label: z.string().min(1).max(50) })).length(2),
});

const DecorativeLayerPayloadSchema = z.object({
  shape: z.enum(['circle', 'square', 'line', 'arrow', 'star', 'heart']),
  color: z.string().default('#ffffff'),
  opacity: z.number().min(0).max(1).default(1),
});

const BaseLayerSchema = z.object({
  id: z.string().min(1),
  x: z.number().min(-0.5).max(1.5).default(0.5),
  y: z.number().min(-0.5).max(1.5).default(0.5),
  width: z.number().min(0.05).max(2).default(0.4),
  height: z.number().min(0.05).max(2).default(0.4),
  scale: z.number().min(0.2).max(5).default(1),
  rotation: z.number().min(-360).max(360).default(0),
  zIndex: z.number().int().default(0),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
});

const CreatorLayerSchema = z.discriminatedUnion('type', [
  BaseLayerSchema.extend({ type: z.literal('media'), payload: MediaLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('text'), payload: TextLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('product'), payload: ProductLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('mention'), payload: MentionLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('look'), payload: LookLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('vote'), payload: VoteLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('decorative'), payload: DecorativeLayerPayloadSchema }),
]);

const CreatorPageSchema = z.object({
  id: z.string().min(1).max(120),
  durationMs: z.number().int().min(500).max(60_000).optional(),
  layers: z.array(CreatorLayerSchema).default([]),
});

const creatorDocumentBodySchema = z.object({
  id: z.string().min(2).max(120),
  type: z.enum(['look', 'poster']),
  version: z.number().int().min(1).max(10),
  canvas: z.object({
    aspectRatio: z.number().min(0.3).max(3),
    background: z.object({
      type: z.enum(['color', 'gradient', 'image']),
      value: z.string().max(500),
    }),
  }),
  pages: z.array(CreatorPageSchema).min(1).max(10),
  metadata: z.object({
    title: z.string().max(120).default(''),
    caption: z.string().max(500).default(''),
    visibility: z.enum(['public', 'private']).default('public'),
    allowReplies: z.boolean().default(true),
    allowReactions: z.boolean().default(true),
    expiresInHours: z.number().int().min(1).max(168).optional(),
    accessibilityDescription: z.string().max(300).optional(),
    allowRemix: z.boolean().default(false),
    sourceDocumentId: z.string().max(120).optional(),
    sourceCreatorId: z.string().max(120).optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const documentIdParamsSchema = z.object({
  documentId: z.string().min(2).max(120),
});

const remixBodySchema = z.object({
  newDocumentId: z.string().min(2).max(120),
});

const LOCAL_URI_PREFIXES = ['file://', 'ph://', 'asset://', 'data:', 'content://', 'assets-library://'];

function isLocalUri(uri: string): boolean {
  return LOCAL_URI_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

function validateForPublish(doc: z.infer<typeof creatorDocumentBodySchema>): string[] {
  const errors: string[] = [];

  if (doc.pages.length === 0) {
    errors.push('Document must have at least one page');
  }

  if (doc.type === 'look' && doc.pages.length !== 1) {
    errors.push('Look documents must have exactly one page');
  }

  if (doc.pages.length > 10) {
    errors.push('Documents cannot have more than 10 pages');
  }

  for (const page of doc.pages) {
    for (const layer of page.layers) {
      if (layer.type === 'media') {
        if (isLocalUri(layer.payload.mediaUri)) {
          errors.push(`Layer ${layer.id}: mediaUri is a local URI — must be uploaded before publish`);
        }
        if (layer.payload.thumbnailUri && isLocalUri(layer.payload.thumbnailUri)) {
          errors.push(`Layer ${layer.id}: thumbnailUri is a local URI — must be uploaded before publish`);
        }
      }
      if (layer.type === 'product' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          errors.push(`Layer ${layer.id}: product snapshotImageUrl is a local URI`);
        }
      }
      if (layer.type === 'look' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          errors.push(`Layer ${layer.id}: look snapshotImageUrl is a local URI`);
        }
      }
    }
  }

  if (doc.type === 'look') {
    const hasMedia = doc.pages[0]?.layers.some((l) => l.type === 'media') ?? false;
    if (!hasMedia) {
      errors.push('Look documents must contain at least one media layer');
    }
  }

  if (doc.type === 'poster') {
    for (const page of doc.pages) {
      const hasContent = page.layers.some((l) => l.type === 'media' || l.type === 'text');
      if (!hasContent) {
        errors.push(`Page ${page.id}: must contain at least one media or text layer`);
      }
    }
  }

  return errors;
}

export const registerCreatorDocumentRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
}: CreatorDocumentsRouteDependencies) => {
  app.post('/creator/documents', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = creatorDocumentBodySchema.parse(request.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query<{ creator_id: string }>(
        `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
        [payload.id]
      );

      if (existing.rowCount && existing.rows[0].creator_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Document belongs to another user' };
      }

      await client.query(
        `INSERT INTO creator_documents (id, creator_id, type, version, document_json, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO UPDATE
         SET type = EXCLUDED.type,
             version = EXCLUDED.version,
             document_json = EXCLUDED.document_json,
             updated_at = NOW()
         WHERE creator_documents.creator_id = $2`,
        [payload.id, actorUserId, payload.type, payload.version, JSON.stringify(payload)]
      );

      await client.query('COMMIT');
      return { ok: true, documentId: payload.id };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to save creator document');
      reply.code(500);
      return { ok: false, error: 'Failed to save document' };
    } finally {
      client.release();
    }
  });

  app.get('/creator/documents', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);

    const result = await db.query<{
      id: string;
      type: string;
      document_json: string;
      status: string;
      updated_at: string;
    }>(
      `SELECT id, type, document_json, status, updated_at
       FROM creator_documents
       WHERE creator_id = $1
       ORDER BY updated_at DESC
       LIMIT 100`,
      [actorUserId]
    );

    const documents = result.rows.map((row) => ({
      ...JSON.parse(row.document_json),
      status: row.status,
      serverUpdatedAt: row.updated_at,
    }));

    return { ok: true, documents };
  });

  app.get('/creator/documents/:documentId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const result = await db.query<{
      id: string;
      creator_id: string;
      document_json: string;
      status: string;
      updated_at: string;
    }>(
      `SELECT id, creator_id, document_json, status, updated_at
       FROM creator_documents
       WHERE id = $1 LIMIT 1`,
      [documentId]
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }

    if (result.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    return {
      ok: true,
      document: {
        ...JSON.parse(result.rows[0].document_json),
        status: result.rows[0].status,
        serverUpdatedAt: result.rows[0].updated_at,
      },
    };
  });

  app.delete('/creator/documents/:documentId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const result = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId]
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }

    if (result.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    await db.query(`DELETE FROM creator_documents WHERE id = $1`, [documentId]);
    return { ok: true };
  });

  app.post('/creator/documents/:documentId/publish', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const result = await db.query<{
      creator_id: string;
      document_json: string;
      status: string;
    }>(
      `SELECT creator_id, document_json, status FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId]
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }

    if (result.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const doc = creatorDocumentBodySchema.parse(JSON.parse(result.rows[0].document_json));
    const publishErrors = validateForPublish(doc);

    if (publishErrors.length > 0) {
      reply.code(422);
      return { ok: false, error: 'Publish validation failed', details: publishErrors };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const revisionCount = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM creator_document_revisions WHERE document_id = $1`,
        [documentId]
      );
      const nextRevision = parseInt(revisionCount.rows[0].count, 10) + 1;
      const revisionId = `rev_${crypto.randomUUID()}`;

      await client.query(
        `INSERT INTO creator_document_revisions (id, document_id, creator_id, revision_number, document_json)
         VALUES ($1, $2, $3, $4, $5)`,
        [revisionId, documentId, actorUserId, nextRevision, JSON.stringify(doc)]
      );

      await client.query(
        `UPDATE creator_documents SET status = 'published', published_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [documentId]
      );

      await client.query('COMMIT');

      return {
        ok: true,
        documentId,
        status: 'published',
        revisionNumber: nextRevision,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to publish creator document');
      reply.code(500);
      return { ok: false, error: 'Failed to publish document' };
    } finally {
      client.release();
    }
  });

  app.get('/creator/documents/:documentId/revisions', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const docResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId]
    );

    if (!docResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }

    if (docResult.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{
      id: string;
      revision_number: string;
      published_at: string;
    }>(
      `SELECT id, revision_number::text, published_at
       FROM creator_document_revisions
       WHERE document_id = $1
       ORDER BY revision_number DESC`,
      [documentId]
    );

    return {
      ok: true,
      revisions: result.rows.map((row) => ({
        id: row.id,
        revisionNumber: parseInt(row.revision_number, 10),
        publishedAt: row.published_at,
      })),
    };
  });

  app.post('/creator/documents/:documentId/remix', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const { newDocumentId } = remixBodySchema.parse(request.body);

    const result = await db.query<{
      creator_id: string;
      document_json: string;
    }>(
      `SELECT creator_id, document_json FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId]
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Source document not found' };
    }

    const sourceDoc = JSON.parse(result.rows[0].document_json);
    if (!sourceDoc.metadata?.allowRemix) {
      reply.code(403);
      return { ok: false, error: 'Remix not allowed for this document' };
    }

    const remixedDoc = {
      ...sourceDoc,
      id: newDocumentId,
      metadata: {
        ...sourceDoc.metadata,
        sourceDocumentId: documentId,
        sourceCreatorId: result.rows[0].creator_id,
        allowRemix: false,
        title: `Remix of ${sourceDoc.metadata?.title || 'Untitled'}`,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO creator_documents (id, creator_id, type, version, document_json, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          newDocumentId,
          actorUserId,
          remixedDoc.type,
          remixedDoc.version,
          JSON.stringify(remixedDoc),
        ]
      );
      await client.query('COMMIT');
      return { ok: true, document: remixedDoc };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to create remix');
      reply.code(500);
      return { ok: false, error: 'Failed to create remix' };
    } finally {
      client.release();
    }
  });
};
