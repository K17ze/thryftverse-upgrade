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
import { mediaKindForContentType } from '../lib/mediaLifecycle.js';
import { createModerationProvider } from '../lib/moderation/index.js';
import { moderateImageAsset } from '../lib/moderation/moderationService.js';

type UploadRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
  verifyUploadedObject?: (
    key: string,
    expectedContentType: string,
    expectedSizeBytes: number,
  ) => Promise<void>;
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
  // Retained for backwards-compatible request parsing. A caller can no
  // longer bypass storage verification; only an already-finalized server
  // record avoids another HEAD request.
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
  upload_intent_id?: string | null;
  media_asset_id?: string | null;
  created_at: string;
  updated_at: string;
};

export const registerUploadRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
  verifyUploadedObject = assertObjectMatchesUploadPolicy,
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
    const upload = await createUploadUrl(key, payload.contentType, payload.sizeBytes);
    const uploadIntentId = `uint_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + upload.expiresInSeconds * 1000).toISOString();

    await db.query(
      `INSERT INTO upload_intents (
         id, object_key, bucket, owner_id, folder, file_name,
         content_type, size_bytes, public_url, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        uploadIntentId,
        upload.key,
        upload.bucket,
        actorUserId,
        payload.folder,
        safeName,
        upload.contentType,
        upload.sizeBytes,
        upload.publicUrl,
        expiresAt,
      ],
    );

    return {
      ...upload,
      uploadIntentId,
      expiresAt,
    };
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

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const intentResult = await client.query<{
        id: string;
        object_key: string;
        bucket: string;
        owner_id: string;
        folder: string;
        file_name: string;
        content_type: string;
        size_bytes: string;
        public_url: string;
        expires_at: string;
        finalized_at: string | null;
      }>(
        `SELECT id, object_key, bucket, owner_id, folder, file_name,
                content_type, size_bytes::text, public_url,
                expires_at::text, finalized_at::text
         FROM upload_intents
         WHERE object_key = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.objectKey],
      );

      if (!intentResult.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Upload intent not found or no longer valid' };
      }

      const intent = intentResult.rows[0];
      if (intent.owner_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Upload intent belongs to another user' };
      }
      if (Date.parse(intent.expires_at) <= Date.now() && !intent.finalized_at) {
        await client.query('ROLLBACK');
        reply.code(410);
        return { ok: false, error: 'Upload intent has expired' };
      }
      if (payload.bucket && payload.bucket !== intent.bucket) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Upload bucket does not match the presigned intent' };
      }

      const bucket = intent.bucket;
      const existing = await client.query<FinalizationRow>(
        `SELECT id, object_key, bucket, owner_id, folder, file_name, content_type,
                size_bytes::text, public_url, status, scope, scope_ref_id,
                head_checked_at::text, failure_reason, metadata,
                upload_intent_id, media_asset_id,
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
        !row
        || row.status !== 'finalized'
        || row.upload_intent_id !== intent.id;

      let status: 'pending' | 'finalized' | 'failed' = 'pending';
      let failureReason: string | null = null;
      let headCheckedAt: string | null = null;

      if (shouldVerify) {
        try {
          await verifyUploadedObject(
            intent.object_key,
            intent.content_type,
            Number(intent.size_bytes),
          );
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
      const created = !row;

      if (row) {
        const updateResult = await client.query<FinalizationRow>(
          `UPDATE upload_finalizations
           SET status = $2,
               failure_reason = $3,
               head_checked_at = $4,
               scope = COALESCE($5, scope),
               scope_ref_id = COALESCE($6, scope_ref_id),
               metadata = $7::jsonb,
               upload_intent_id = $8,
               folder = $9,
               file_name = $10,
               content_type = $11,
               size_bytes = $12,
               public_url = $13,
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, object_key, bucket, owner_id, folder, file_name, content_type,
                     size_bytes::text, public_url, status, scope, scope_ref_id,
                     head_checked_at::text, failure_reason, metadata,
                     upload_intent_id, media_asset_id,
                     created_at::text, updated_at::text`,
          [
            row.id,
            status,
            failureReason,
            headCheckedAt,
            payload.scope,
            payload.scopeRefId ?? null,
            JSON.stringify(payload.metadata ?? {}),
            intent.id,
            intent.folder,
            intent.file_name,
            intent.content_type,
            Number(intent.size_bytes),
            intent.public_url,
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
             , upload_intent_id
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16)
           RETURNING id, object_key, bucket, owner_id, folder, file_name, content_type,
                     size_bytes::text, public_url, status, scope, scope_ref_id,
                     head_checked_at::text, failure_reason, metadata,
                     upload_intent_id, media_asset_id,
                     created_at::text, updated_at::text`,
          [
            finalizationId,
            intent.object_key,
            bucket,
            actorUserId,
            intent.folder,
            intent.file_name,
            intent.content_type,
            Number(intent.size_bytes),
            intent.public_url,
            status,
            payload.scope,
            payload.scopeRefId ?? null,
            headCheckedAt,
            failureReason,
            JSON.stringify(payload.metadata ?? {}),
            intent.id,
          ],
        );
        row = insertResult.rows[0];
      }

      let mediaAsset: {
        id: string;
        status: string;
        mediaKind: 'image' | 'video' | 'document';
        canonicalUrl: string | null;
      } | null = null;

      if (status === 'finalized') {
        await client.query(
          `UPDATE upload_intents
           SET finalized_at = COALESCE(finalized_at, NOW())
           WHERE id = $1`,
          [intent.id],
        );

        const mediaAssetId = row.media_asset_id ?? `masset_${crypto.randomUUID()}`;
        const mediaKind = mediaKindForContentType(row.content_type);
        const assetResult = await client.query<{
          id: string;
          status: string;
          media_kind: 'image' | 'video' | 'document';
          canonical_url: string | null;
        }>(
          `INSERT INTO media_assets (
             id, upload_finalization_id, owner_id, bucket, object_key,
             file_name, intended_purpose, media_kind,
             declared_content_type, declared_size_bytes,
             original_object_url, status, scan_status,
             moderation_status, processing_status, metadata
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, 'integrity_verified', 'pending',
             'pending', 'pending', $12::jsonb
           )
           ON CONFLICT (upload_finalization_id)
           DO UPDATE SET
             intended_purpose = EXCLUDED.intended_purpose,
             metadata = media_assets.metadata || EXCLUDED.metadata
           RETURNING id, status, media_kind, canonical_url`,
          [
            mediaAssetId,
            row.id,
            actorUserId,
            row.bucket,
            row.object_key,
            row.file_name,
            row.scope,
            mediaKind,
            row.content_type,
            Number(row.size_bytes),
            row.public_url,
            JSON.stringify(row.metadata ?? {}),
          ],
        );
        const asset = assetResult.rows[0];
        await client.query(
          `UPDATE upload_finalizations
           SET media_asset_id = $2
           WHERE id = $1 AND media_asset_id IS DISTINCT FROM $2`,
          [row.id, asset.id],
        );
        row.media_asset_id = asset.id;

        await client.query(
          `INSERT INTO media_processing_jobs (
             id, media_asset_id, job_type, status
           )
           VALUES ($1, $2, 'inspect_scan_process_moderate', 'pending')
           ON CONFLICT DO NOTHING`,
          [`mjob_${crypto.randomUUID()}`, asset.id],
        );

        mediaAsset = {
          id: asset.id,
          status: asset.status,
          mediaKind: asset.media_kind,
          canonicalUrl: asset.canonical_url,
        };
      }

      await client.query('COMMIT');

      if (mediaAsset && mediaAsset.mediaKind === 'image' && createModerationProvider().name !== 'mock') {
        void moderateImageAsset(mediaAsset.id, row.public_url)
          .then((outcome) => {
            if (outcome.status === 'integrity_verified' || outcome.status === 'processing') {
              return;
            }
            db.query(
              `UPDATE media_assets
               SET moderation_status = $2,
                   status = CASE WHEN $3 IN ('publishable', 'quarantined', 'processing_failed') THEN $3 ELSE status END
               WHERE id = $1
                 AND status IN ('integrity_verified', 'processing', 'moderation_pending')`,
              [mediaAsset.id, outcome.moderationStatus, outcome.status],
            ).catch((dbError) => {
              app.log.error(
                { err: dbError, assetId: mediaAsset.id },
                'Failed to persist background moderation outcome',
              );
            });
          })
          .catch((moderationError) => {
            app.log.error(
              { err: moderationError, assetId: mediaAsset.id },
              'Background image moderation failed',
            );
          });
      }

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

      reply.code(created ? 201 : 200);
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
          deliveryStatus: 'unmoderated_source_object',
          publicationGateRequired: config.mediaPublicationGateEnabled,
          status: row.status,
          scope: row.scope,
          scopeRefId: row.scope_ref_id,
          headCheckedAt: row.head_checked_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          mediaAsset: mediaAsset
            ? {
              ...mediaAsset,
              publishable: mediaAsset.status === 'publishable'
                || mediaAsset.status === 'published',
            }
            : null,
        },
        mediaAsset: mediaAsset
          ? {
            ...mediaAsset,
            publishable: mediaAsset.status === 'publishable'
              || mediaAsset.status === 'published',
            processingRequired: mediaAsset.status === 'integrity_verified'
              || mediaAsset.status === 'processing'
              || mediaAsset.status === 'moderation_pending'
              || mediaAsset.status === 'processing_failed',
          }
          : null,
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
              head_checked_at::text, failure_reason, metadata, media_asset_id,
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
    const mediaAssetResult = row.media_asset_id
      ? await db.query<{
        id: string;
        status: string;
        media_kind: 'image' | 'video' | 'document';
        canonical_url: string | null;
      }>(
        `SELECT id, status, media_kind, canonical_url
         FROM media_assets
         WHERE id = $1
         LIMIT 1`,
        [row.media_asset_id],
      )
      : null;
    const mediaAsset = mediaAssetResult?.rows[0] ?? null;
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
        deliveryStatus: 'unmoderated_source_object',
        publicationGateRequired: config.mediaPublicationGateEnabled,
        status: row.status,
        scope: row.scope,
        scopeRefId: row.scope_ref_id,
        headCheckedAt: row.head_checked_at,
        failureReason: row.failure_reason,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        mediaAsset: mediaAsset
          ? {
            id: mediaAsset.id,
            status: mediaAsset.status,
            mediaKind: mediaAsset.media_kind,
            canonicalUrl: mediaAsset.status === 'publishable'
              || mediaAsset.status === 'published'
              ? mediaAsset.canonical_url
              : null,
            publishable: mediaAsset.status === 'publishable'
              || mediaAsset.status === 'published',
          }
          : null,
      },
      mediaAsset: mediaAsset
        ? {
          id: mediaAsset.id,
          status: mediaAsset.status,
          mediaKind: mediaAsset.media_kind,
          canonicalUrl: mediaAsset.status === 'publishable'
            || mediaAsset.status === 'published'
            ? mediaAsset.canonical_url
            : null,
          publishable: mediaAsset.status === 'publishable'
            || mediaAsset.status === 'published',
        }
        : null,
    };
  });
};
