import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import {
  assertObjectMatchesUploadPolicy,
  assertUploadPolicy,
  createUploadUrl,
} from '../lib/s3.js';

type UploadRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().max(500 * 1024 * 1024),
  folder: z
    .enum([
      'uploads',
      'listings',
      'avatars',
      'covers',
      'posters',
      'looks',
      'evidence',
      'review',
      'smoke',
    ])
    .default('uploads'),
});

const finalizeScopeEnum = z.enum([
  'general',
  'chat_attachment',
  'listing_media',
  'avatar',
  'cover',
  'poster',
  'look',
  'evidence',
  'review',
]);

const finalizeRequestSchema = z.object({
  objectKey: z.string().trim().min(1).max(512),
  bucket: z.string().trim().min(1).max(128).optional(),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().max(500 * 1024 * 1024),
  publicUrl: z.string().trim().min(1).max(1024),
  folder: z
    .enum([
      'uploads',
      'listings',
      'avatars',
      'covers',
      'posters',
      'looks',
      'evidence',
      'review',
      'smoke',
    ])
    .default('uploads'),
  scope: finalizeScopeEnum.default('general'),
  scopeRefId: z.string().trim().min(1).max(120).optional(),
  metadata: z.record(z.unknown()).default({}),
  // When true (default) the server performs a HEAD request against S3 to
  // verify the object actually landed. Callers may skip the head check for
  // already-verified objects (e.g. retry after a transient head failure).
  verifyObject: z.boolean().default(true),
});

type FinalizationRow = {
  id: string;
  object_key: string;
  bucket: string;
  owner_id: string;
  folder: string;
  file_name: string;
  content_type: string;
  size_bytes: string;
  public_url: string;
  status: string;
  scope: string;
  scope_ref_id: string | null;
  head_checked_at: string | null;
  failure_reason: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export const registerUploadRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: UploadRouteDependencies) => {
  app.post('/uploads/presign', async (request) => {
    const payload = uploadRequestSchema.parse(request.body);
    const actorUserId = resolveAuthenticatedUserId(request);
    if (payload.folder === 'smoke' && config.nodeEnv === 'production') {
      throw createApiError(
        'UPLOAD_INVALID',
        'The smoke upload namespace is unavailable in production'
      );
    }

    try {
      assertUploadPolicy(payload.contentType, payload.sizeBytes);
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      if (reason === 'UPLOAD_CONTENT_TYPE_NOT_ALLOWED') {
        throw createApiError('UPLOAD_INVALID', 'This media type is not allowed');
      }
      if (reason === 'UPLOAD_SIZE_NOT_ALLOWED') {
        throw createApiError(
          'UPLOAD_INVALID',
          'This file exceeds the upload limit for its media type'
        );
      }
      throw error;
    }

    const safeName = payload.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${payload.folder}/${actorUserId}/${crypto.randomUUID()}_${safeName}`;
    return createUploadUrl(key, payload.contentType, payload.sizeBytes);
  });

  /**
   * POST /uploads/finalize — confirm that a presigned upload actually landed
   * in S3 and record durable metadata. Chat attachments, listing media and
   * creator assets should reference the returned `finalizationId` so other
   * surfaces can trust the object is durable.
   *
   * The endpoint is idempotent on (bucket, objectKey): repeated finalize calls
   * for the same object return the existing row, optionally re-running the
   * head check if `verifyObject` is true and the prior status was `failed`.
   */
  app.post('/uploads/finalize', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = finalizeRequestSchema.parse(request.body);

    if (payload.folder === 'smoke' && config.nodeEnv === 'production') {
      throw createApiError(
        'UPLOAD_INVALID',
        'The smoke upload namespace is unavailable in production'
      );
    }

    const bucket = payload.bucket ?? config.s3Bucket;
    if (!bucket) {
      throw createApiError(
        'UPLOAD_INVALID',
        'Bucket could not be resolved for finalization'
      );
    }

    // The object key must be owned by this user (folder/<userId>/...).
    const expectedOwnerSegment = `${payload.folder}/${actorUserId}/`;
    if (!payload.objectKey.startsWith(expectedOwnerSegment)) {
      reply.code(403);
      return {
        ok: false,
        error: 'Object key does not belong to the calling user',
      };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query<FinalizationRow>(
        `SELECT id, object_key, bucket, owner_id, folder, file_name, content_type,
                size_bytes::text, public_url, status, scope, scope_ref_id,
                head_checked_at::text, failure_reason, metadata,
                created_at::text, updated_at::text
         FROM upload_finalizations
         WHERE bucket = $1 AND object_key = $2
         LIMIT 1
         FOR UPDATE`,
        [bucket, payload.objectKey],
      );

      let row = existing.rows[0];
      if (row && row.owner_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Finalization belongs to another user' };
      }

      const shouldVerify =
        payload.verifyObject && (!row || row.status !== 'finalized');

      let status: 'pending' | 'finalized' | 'failed' = 'pending';
      let failureReason: string | null = null;
      let headCheckedAt: string | null = null;

      if (shouldVerify) {
        try {
          // Only head-check when S3 is configured. In dev/test without S3,
          // we mark as finalized without a head check so the flow stays
          // exercisable. The production-readiness guard already blocks
          // startup without S3 in production.
          if (config.s3Bucket) {
            await assertObjectMatchesUploadPolicy(
              payload.objectKey,
              payload.contentType,
              payload.sizeBytes,
            );
          }
          status = 'finalized';
          headCheckedAt = new Date().toISOString();
        } catch (error) {
          status = 'failed';
          failureReason = error instanceof Error ? error.message : 'HEAD_FAILED';
          headCheckedAt = new Date().toISOString();
        }
      } else if (row?.status === 'finalized') {
        status = 'finalized';
      }

      const finalizationId = row?.id ?? `fin_${crypto.randomUUID()}`;

      if (row) {
        const updateResult = await client.query<FinalizationRow>(
          `UPDATE upload_finalizations
           SET status = $2,
               failure_reason = $3,
               head_checked_at = $4,
               scope = COALESCE($5, scope),
               scope_ref_id = COALESCE($6, scope_ref_id),
               metadata = $7::jsonb,
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, object_key, bucket, owner_id, folder, file_name, content_type,
                     size_bytes::text, public_url, status, scope, scope_ref_id,
                     head_checked_at::text, failure_reason, metadata,
                     created_at::text, updated_at::text`,
          [
            row.id,
            status,
            failureReason,
            headCheckedAt,
            payload.scope,
            payload.scopeRefId ?? null,
            JSON.stringify(payload.metadata ?? {}),
          ],
        );
        row = updateResult.rows[0];
      } else {
        const insertResult = await client.query<FinalizationRow>(
          `INSERT INTO upload_finalizations (
             id, object_key, bucket, owner_id, folder,
             file_name, content_type, size_bytes, public_url,
             status, scope, scope_ref_id,
             head_checked_at, failure_reason, metadata
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
           RETURNING id, object_key, bucket, owner_id, folder, file_name, content_type,
                     size_bytes::text, public_url, status, scope, scope_ref_id,
                     head_checked_at::text, failure_reason, metadata,
                     created_at::text, updated_at::text`,
          [
            finalizationId,
            payload.objectKey,
            bucket,
            actorUserId,
            payload.folder,
            payload.fileName,
            payload.contentType,
            payload.sizeBytes,
            payload.publicUrl,
            status,
            payload.scope,
            payload.scopeRefId ?? null,
            headCheckedAt,
            failureReason,
            JSON.stringify(payload.metadata ?? {}),
          ],
        );
        row = insertResult.rows[0];
      }

      await client.query('COMMIT');

      if (status === 'failed') {
        reply.code(422);
        return {
          ok: false,
          error: 'Upload could not be verified in object storage',
          finalization: {
            id: row.id,
            status: row.status,
            failureReason: row.failure_reason,
          },
        };
      }

      reply.code(row ? 200 : 201);
      return {
        ok: true,
        finalization: {
          id: row.id,
          objectKey: row.object_key,
          bucket: row.bucket,
          folder: row.folder,
          fileName: row.file_name,
          contentType: row.content_type,
          sizeBytes: Number(row.size_bytes),
          publicUrl: row.public_url,
          status: row.status,
          scope: row.scope,
          scopeRefId: row.scope_ref_id,
          headCheckedAt: row.head_checked_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to finalize upload');
      reply.code(500);
      return { ok: false, error: 'Failed to finalize upload' };
    } finally {
      client.release();
    }
  });

  app.get('/uploads/finalizations/:id', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { id } = z.object({ id: z.string().min(2).max(120) }).parse(request.params);

    const result = await db.query<FinalizationRow>(
      `SELECT id, object_key, bucket, owner_id, folder, file_name, content_type,
              size_bytes::text, public_url, status, scope, scope_ref_id,
              head_checked_at::text, failure_reason, metadata,
              created_at::text, updated_at::text
       FROM upload_finalizations
       WHERE id = $1 LIMIT 1`,
      [id],
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Finalization not found' };
    }
    if (result.rows[0].owner_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const row = result.rows[0];
    return {
      ok: true,
      finalization: {
        id: row.id,
        objectKey: row.object_key,
        bucket: row.bucket,
        folder: row.folder,
        fileName: row.file_name,
        contentType: row.content_type,
        sizeBytes: Number(row.size_bytes),
        publicUrl: row.public_url,
        status: row.status,
        scope: row.scope,
        scopeRefId: row.scope_ref_id,
        headCheckedAt: row.head_checked_at,
        failureReason: row.failure_reason,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });
};
