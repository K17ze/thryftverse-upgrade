import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type CreatorDocumentsRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

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
  pages: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        layers: z.array(z.record(z.unknown())),
        durationMs: z.number().int().min(500).max(60_000).optional(),
      })
    )
    .min(1)
    .max(10),
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
      updated_at: string;
    }>(
      `SELECT id, type, document_json, updated_at
       FROM creator_documents
       WHERE creator_id = $1
       ORDER BY updated_at DESC
       LIMIT 100`,
      [actorUserId]
    );

    const documents = result.rows.map((row) => ({
      ...JSON.parse(row.document_json),
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
      updated_at: string;
    }>(
      `SELECT id, creator_id, document_json, updated_at
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
