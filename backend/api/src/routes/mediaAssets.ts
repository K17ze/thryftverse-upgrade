import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import {
  assertMediaAssetTransition,
  canTransitionMediaAsset,
  resolveMediaProcessingOutcome,
  type MediaAssetStatus,
} from '../lib/mediaLifecycle.js';
import { deleteObject } from '../lib/s3.js';

type MediaAssetRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
  authorizeInternalServiceRequest: (request: FastifyRequest) => boolean;
  deleteStoredObject?: (key: string) => Promise<void>;
};

type MediaAssetRow = {
  id: string;
  upload_finalization_id: string;
  owner_id: string;
  bucket: string;
  object_key: string;
  file_name: string;
  intended_purpose: string;
  media_kind: 'image' | 'video' | 'document';
  declared_content_type: string;
  detected_content_type: string | null;
  declared_size_bytes: string;
  detected_size_bytes: string | null;
  checksum_sha256: string | null;
  original_object_url: string;
  canonical_url: string | null;
  status: MediaAssetStatus;
  scan_status: string;
  moderation_status: string;
  processing_status: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  blurhash: string | null;
  focal_x: string | null;
  focal_y: string | null;
  failure_reason: string | null;
  quarantine_reason: string | null;
  revocation_reason: string | null;
  publishable_at: string | null;
  published_at: string | null;
  quarantined_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

const assetSelect = `
  SELECT id, upload_finalization_id, owner_id, bucket, object_key, file_name,
         intended_purpose, media_kind, declared_content_type,
         detected_content_type, declared_size_bytes::text,
         detected_size_bytes::text, checksum_sha256, original_object_url,
         canonical_url, status, scan_status, moderation_status,
         processing_status, width, height, duration_ms, blurhash,
         focal_x::text, focal_y::text, failure_reason, quarantine_reason,
         revocation_reason, publishable_at::text, published_at::text,
         quarantined_at::text, revoked_at::text, created_at::text,
         updated_at::text
  FROM media_assets
`;

const assetIdSchema = z.object({
  assetId: z.string().trim().min(2).max(120),
});

const processingResultSchema = z.object({
  jobId: z.string().trim().min(2).max(120),
  detectedContentType: z.string().trim().min(3).max(120),
  detectedSizeBytes: z.number().int().positive(),
  checksumSha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional(),
  scanStatus: z.enum(['clean', 'infected', 'failed']),
  moderationStatus: z.enum(['approved', 'review', 'rejected', 'failed']),
  processingSucceeded: z.boolean(),
  processorError: z.string().trim().min(1).max(1000).optional(),
  canonicalUrl: z.string().url().max(2048).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  blurhash: z.string().trim().min(4).max(256).optional(),
  focalX: z.number().min(0).max(1).optional(),
  focalY: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).default({}),
  derivatives: z.array(z.object({
    variant: z.string().trim().min(1).max(80),
    mediaKind: z.enum(['image', 'video', 'document']),
    bucket: z.string().trim().min(1).max(128),
    objectKey: z.string().trim().min(1).max(512),
    contentType: z.string().trim().min(3).max(120),
    sizeBytes: z.number().int().positive(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    checksumSha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional(),
    canonicalUrl: z.string().url().max(2048),
  })).max(20).default([]),
});

function serializeAsset(row: MediaAssetRow) {
  return {
    id: row.id,
    finalizationId: row.upload_finalization_id,
    ownerId: row.owner_id,
    fileName: row.file_name,
    purpose: row.intended_purpose,
    mediaKind: row.media_kind,
    declaredContentType: row.declared_content_type,
    detectedContentType: row.detected_content_type,
    declaredSizeBytes: Number(row.declared_size_bytes),
    detectedSizeBytes: row.detected_size_bytes === null
      ? null
      : Number(row.detected_size_bytes),
    checksumSha256: row.checksum_sha256,
    status: row.status,
    scanStatus: row.scan_status,
    moderationStatus: row.moderation_status,
    processingStatus: row.processing_status,
    canonicalUrl: row.status === 'publishable' || row.status === 'published'
      ? row.canonical_url
      : null,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    blurhash: row.blurhash,
    focalX: row.focal_x === null ? null : Number(row.focal_x),
    focalY: row.focal_y === null ? null : Number(row.focal_y),
    failureReason: row.failure_reason,
    quarantineReason: row.quarantine_reason,
    revocationReason: row.revocation_reason,
    publishableAt: row.publishable_at,
    publishedAt: row.published_at,
    quarantinedAt: row.quarantined_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isConfiguredMediaDeliveryUrl(candidate: string): boolean {
  try {
    const allowed = new URL(config.s3CdnBaseUrl);
    const parsed = new URL(candidate);
    const allowedPath = allowed.pathname.endsWith('/')
      ? allowed.pathname
      : `${allowed.pathname}/`;
    return parsed.protocol === allowed.protocol
      && parsed.host === allowed.host
      && (
        allowed.pathname === '/'
        || parsed.pathname === allowed.pathname
        || parsed.pathname.startsWith(allowedPath)
      );
  } catch {
    return false;
  }
}

async function selectAssetForUpdate(
  client: PoolClient,
  assetId: string,
): Promise<MediaAssetRow | null> {
  const result = await client.query<MediaAssetRow>(
    `${assetSelect} WHERE id = $1 LIMIT 1 FOR UPDATE`,
    [assetId],
  );
  return result.rows[0] ?? null;
}

async function actorOwnsBindingTarget(
  client: PoolClient,
  actorUserId: string,
  targetType: 'listing' | 'auction' | 'profile' | 'creator_document',
  targetRefId: string,
): Promise<boolean> {
  if (targetType === 'profile') {
    return targetRefId === actorUserId;
  }

  const query = targetType === 'listing'
    ? 'SELECT 1 FROM listings WHERE id = $1 AND seller_id = $2'
    : targetType === 'auction'
      ? 'SELECT 1 FROM auctions WHERE id = $1 AND seller_id = $2'
      : 'SELECT 1 FROM creator_documents WHERE id = $1 AND creator_id = $2';

  const result = await client.query(query, [targetRefId, actorUserId]);
  return !!result.rowCount;
}

export const registerMediaAssetRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
  authorizeInternalServiceRequest,
  deleteStoredObject = deleteObject,
}: MediaAssetRouteDependencies) => {
  app.get('/media/assets/:assetId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { assetId } = assetIdSchema.parse(request.params);
    const result = await db.query<MediaAssetRow>(
      `${assetSelect} WHERE id = $1 LIMIT 1`,
      [assetId],
    );
    const asset = result.rows[0];
    if (!asset) {
      reply.code(404);
      return { ok: false, error: 'Media asset not found' };
    }
    if (asset.owner_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }
    return { ok: true, asset: serializeAsset(asset) };
  });

  app.post('/internal/media/processing/jobs/claim', async (request, reply) => {
    if (!authorizeInternalServiceRequest(request)) {
      reply.code(401);
      return { ok: false, error: 'Invalid internal service token' };
    }
    const payload = z.object({
      workerId: z.string().trim().min(2).max(120),
    }).parse(request.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        id: string;
        media_asset_id: string;
        job_type: string;
        attempt_count: number;
        max_attempts: number;
        bucket: string;
        object_key: string;
        declared_content_type: string;
        declared_size_bytes: string;
        intended_purpose: string;
      }>(
        `WITH claimed AS (
           SELECT id
           FROM media_processing_jobs
           WHERE status IN ('pending', 'retry')
             AND available_at <= NOW()
             AND attempt_count < max_attempts
           ORDER BY available_at, created_at
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE media_processing_jobs job
         SET status = 'processing',
             attempt_count = attempt_count + 1,
             locked_at = NOW(),
             locked_by = $1
         FROM claimed, media_assets asset
         WHERE job.id = claimed.id
           AND asset.id = job.media_asset_id
         RETURNING job.id, job.media_asset_id, job.job_type,
                   job.attempt_count, job.max_attempts,
                   asset.bucket, asset.object_key,
                   asset.declared_content_type,
                   asset.declared_size_bytes::text,
                   asset.intended_purpose`,
        [payload.workerId],
      );

      const job = result.rows[0];
      if (!job) {
        await client.query('COMMIT');
        reply.code(204);
        return;
      }

      await client.query(
        `UPDATE media_assets
         SET status = 'processing', processing_status = 'processing',
             failure_reason = NULL
         WHERE id = $1
           AND status IN ('integrity_verified', 'scan_pending', 'processing_failed')`,
        [job.media_asset_id],
      );
      await client.query('COMMIT');
      return {
        ok: true,
        job: {
          id: job.id,
          assetId: job.media_asset_id,
          type: job.job_type,
          attempt: job.attempt_count,
          maxAttempts: job.max_attempts,
          source: {
            bucket: job.bucket,
            objectKey: job.object_key,
            declaredContentType: job.declared_content_type,
            declaredSizeBytes: Number(job.declared_size_bytes),
            purpose: job.intended_purpose,
          },
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/internal/media/assets/:assetId/processing-results', async (request, reply) => {
    if (!authorizeInternalServiceRequest(request)) {
      reply.code(401);
      return { ok: false, error: 'Invalid internal service token' };
    }
    const { assetId } = assetIdSchema.parse(request.params);
    const payload = processingResultSchema.parse(request.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const asset = await selectAssetForUpdate(client, assetId);
      if (!asset) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Media asset not found' };
      }

      const jobResult = await client.query<{
        id: string;
        status: string;
        media_asset_id: string;
      }>(
        `SELECT id, status, media_asset_id
         FROM media_processing_jobs
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.jobId],
      );
      const job = jobResult.rows[0];
      if (!job || job.media_asset_id !== assetId) {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Processing job does not belong to this media asset' };
      }
      if (job.status === 'completed') {
        await client.query('COMMIT');
        return { ok: true, replayed: true, asset: serializeAsset(asset) };
      }
      if (job.status !== 'processing') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Processing job is not currently claimed' };
      }
      const deliveryUrls = [
        ...(payload.canonicalUrl ? [payload.canonicalUrl] : []),
        ...payload.derivatives.map((derivative) => derivative.canonicalUrl),
      ];
      if (
        deliveryUrls.some((url) => !isConfiguredMediaDeliveryUrl(url))
        || payload.derivatives.some((derivative) => derivative.bucket !== asset.bucket)
      ) {
        await client.query('ROLLBACK');
        reply.code(422);
        return {
          ok: false,
          error: 'Processor returned a delivery object outside the configured media boundary',
        };
      }

      let outcome = resolveMediaProcessingOutcome({
        declaredContentType: asset.declared_content_type,
        declaredSizeBytes: Number(asset.declared_size_bytes),
        detectedContentType: payload.detectedContentType,
        detectedSizeBytes: payload.detectedSizeBytes,
        scanStatus: payload.scanStatus,
        moderationStatus: payload.moderationStatus,
        processingSucceeded: payload.processingSucceeded,
        processorError: payload.processorError,
      });
      const canonicalUrl = payload.canonicalUrl
        ?? payload.derivatives.find((derivative) => derivative.variant === 'primary')?.canonicalUrl
        ?? null;
      if (outcome.status === 'publishable' && !canonicalUrl) {
        outcome = {
          ...outcome,
          status: 'processing_failed',
          processingStatus: 'failed',
          failureReason: 'Processor did not provide a canonical delivery URL',
        };
      }

      if (!canTransitionMediaAsset(asset.status, outcome.status)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Media asset state changed while this processing job was running',
          currentStatus: asset.status,
          attemptedStatus: outcome.status,
        };
      }

      if (outcome.processingStatus === 'completed') {
        for (const derivative of payload.derivatives) {
          await client.query(
            `INSERT INTO media_derivatives (
               id, media_asset_id, variant, media_kind, bucket, object_key,
               content_type, size_bytes, width, height, duration_ms,
               checksum_sha256, canonical_url
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (media_asset_id, variant)
             DO UPDATE SET
               media_kind = EXCLUDED.media_kind,
               bucket = EXCLUDED.bucket,
               object_key = EXCLUDED.object_key,
               content_type = EXCLUDED.content_type,
               size_bytes = EXCLUDED.size_bytes,
               width = EXCLUDED.width,
               height = EXCLUDED.height,
               duration_ms = EXCLUDED.duration_ms,
               checksum_sha256 = EXCLUDED.checksum_sha256,
               canonical_url = EXCLUDED.canonical_url`,
            [
              `mder_${crypto.randomUUID()}`,
              assetId,
              derivative.variant,
              derivative.mediaKind,
              derivative.bucket,
              derivative.objectKey,
              derivative.contentType,
              derivative.sizeBytes,
              derivative.width ?? null,
              derivative.height ?? null,
              derivative.durationMs ?? null,
              derivative.checksumSha256 ?? null,
              derivative.canonicalUrl,
            ],
          );
        }
      }

      const updatedResult = await client.query<MediaAssetRow>(
        `UPDATE media_assets
         SET detected_content_type = $2,
             detected_size_bytes = $3,
             checksum_sha256 = $4,
             scan_status = $5,
             moderation_status = $6,
             processing_status = $7,
             status = $8,
             canonical_url = CASE WHEN $8 = 'publishable' THEN $9 ELSE canonical_url END,
             width = $10,
             height = $11,
             duration_ms = $12,
             blurhash = $13,
             focal_x = $14,
             focal_y = $15,
             metadata = metadata || $16::jsonb,
             metadata_version = metadata_version + 1,
             failure_reason = $17,
             quarantine_reason = $18,
             publishable_at = CASE WHEN $8 = 'publishable' THEN NOW() ELSE publishable_at END,
             quarantined_at = CASE WHEN $8 = 'quarantined' THEN NOW() ELSE quarantined_at END
         WHERE id = $1
         RETURNING id, upload_finalization_id, owner_id, bucket, object_key,
                   file_name, intended_purpose, media_kind,
                   declared_content_type, detected_content_type,
                   declared_size_bytes::text, detected_size_bytes::text,
                   checksum_sha256, original_object_url, canonical_url, status,
                   scan_status, moderation_status, processing_status, width,
                   height, duration_ms, blurhash, focal_x::text, focal_y::text,
                   failure_reason, quarantine_reason, revocation_reason,
                   publishable_at::text, published_at::text,
                   quarantined_at::text, revoked_at::text, created_at::text,
                   updated_at::text`,
        [
          assetId,
          payload.detectedContentType,
          payload.detectedSizeBytes,
          payload.checksumSha256 ?? null,
          outcome.scanStatus,
          outcome.moderationStatus,
          outcome.processingStatus,
          outcome.status,
          canonicalUrl,
          payload.width ?? null,
          payload.height ?? null,
          payload.durationMs ?? null,
          payload.blurhash ?? null,
          payload.focalX ?? null,
          payload.focalY ?? null,
          JSON.stringify(payload.metadata),
          outcome.failureReason,
          outcome.quarantineReason,
        ],
      );

      await client.query(
        `UPDATE media_processing_jobs
         SET status = CASE WHEN $2 IN ('processing_failed', 'moderation_pending')
                           THEN CASE WHEN attempt_count < max_attempts THEN 'retry' ELSE 'dead' END
                           ELSE 'completed' END,
             available_at = CASE WHEN $2 IN ('processing_failed', 'moderation_pending')
                                 THEN NOW() + LEAST(INTERVAL '1 hour', INTERVAL '30 seconds' * POWER(2, attempt_count))
                                 ELSE available_at END,
             last_error = $3,
             result = $4::jsonb,
             completed_at = CASE WHEN $2 IN ('processing_failed', 'moderation_pending')
                                 THEN NULL ELSE NOW() END,
             locked_at = NULL,
             locked_by = NULL
         WHERE id = $1`,
        [
          payload.jobId,
          outcome.status,
          outcome.failureReason,
          JSON.stringify({
            status: outcome.status,
            scanStatus: outcome.scanStatus,
            moderationStatus: outcome.moderationStatus,
          }),
        ],
      );
      await client.query('COMMIT');
      return { ok: true, asset: serializeAsset(updatedResult.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/media/assets/:assetId/publish', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { assetId } = assetIdSchema.parse(request.params);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const asset = await selectAssetForUpdate(client, assetId);
      if (!asset) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Media asset not found' };
      }
      if (asset.owner_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Access denied' };
      }
      if (asset.status === 'published') {
        await client.query('COMMIT');
        return { ok: true, replayed: true, asset: serializeAsset(asset) };
      }
      if (asset.status !== 'publishable' || !asset.canonical_url) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Media must pass processing and moderation before publication',
          status: asset.status,
        };
      }
      assertMediaAssetTransition(asset.status, 'published');
      const updated = await client.query<MediaAssetRow>(
        `UPDATE media_assets
         SET status = 'published', published_at = COALESCE(published_at, NOW())
         WHERE id = $1
         RETURNING id, upload_finalization_id, owner_id, bucket, object_key,
                   file_name, intended_purpose, media_kind,
                   declared_content_type, detected_content_type,
                   declared_size_bytes::text, detected_size_bytes::text,
                   checksum_sha256, original_object_url, canonical_url, status,
                   scan_status, moderation_status, processing_status, width,
                   height, duration_ms, blurhash, focal_x::text, focal_y::text,
                   failure_reason, quarantine_reason, revocation_reason,
                   publishable_at::text, published_at::text,
                   quarantined_at::text, revoked_at::text, created_at::text,
                   updated_at::text`,
        [assetId],
      );
      await client.query('COMMIT');
      return { ok: true, asset: serializeAsset(updated.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/media/assets/:assetId/bind', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { assetId } = assetIdSchema.parse(request.params);
    const payload = z.object({
      targetType: z.enum(['listing', 'auction', 'profile', 'creator_document']),
      targetRefId: z.string().trim().min(1).max(120),
      role: z.string().trim().min(1).max(80),
      sortOrder: z.number().int().nonnegative().default(0),
    }).parse(request.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const asset = await selectAssetForUpdate(client, assetId);
      if (!asset) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Media asset not found' };
      }
      if (asset.owner_id !== actorUserId || asset.status !== 'published') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Only published media owned by the actor can be bound' };
      }
      if (!await actorOwnsBindingTarget(
        client,
        actorUserId,
        payload.targetType,
        payload.targetRefId,
      )) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Actor does not own the requested media target' };
      }
      const result = await client.query<{
        id: string;
        created_at: string;
      }>(
        `INSERT INTO media_bindings (
           id, media_asset_id, owner_id, target_type, target_ref_id, role, sort_order
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (media_asset_id, target_type, target_ref_id, role)
         DO UPDATE SET sort_order = EXCLUDED.sort_order, removed_at = NULL
         RETURNING id, created_at::text`,
        [
          `mbind_${crypto.randomUUID()}`,
          assetId,
          actorUserId,
          payload.targetType,
          payload.targetRefId,
          payload.role,
          payload.sortOrder,
        ],
      );
      await client.query('COMMIT');
      reply.code(201);
      return {
        ok: true,
        binding: {
          id: result.rows[0].id,
          assetId,
          ...payload,
          createdAt: result.rows[0].created_at,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/media/assets/:assetId/revoke', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { assetId } = assetIdSchema.parse(request.params);
    const payload = z.object({
      reason: z.string().trim().min(3).max(500),
    }).parse(request.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const asset = await selectAssetForUpdate(client, assetId);
      if (!asset) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Media asset not found' };
      }
      if (asset.owner_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Access denied' };
      }
      if (asset.status === 'revoked') {
        await client.query('COMMIT');
        return { ok: true, replayed: true, asset: serializeAsset(asset) };
      }
      if (!canTransitionMediaAsset(asset.status, 'revoked')) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Media cannot be revoked from its current terminal state',
          status: asset.status,
        };
      }
      const result = await client.query<MediaAssetRow>(
        `UPDATE media_assets
         SET status = 'revoked', revocation_reason = $2, revoked_at = NOW(),
             canonical_url = NULL
         WHERE id = $1
         RETURNING id, upload_finalization_id, owner_id, bucket, object_key,
                   file_name, intended_purpose, media_kind,
                   declared_content_type, detected_content_type,
                   declared_size_bytes::text, detected_size_bytes::text,
                   checksum_sha256, original_object_url, canonical_url, status,
                   scan_status, moderation_status, processing_status, width,
                   height, duration_ms, blurhash, focal_x::text, focal_y::text,
                   failure_reason, quarantine_reason, revocation_reason,
                   publishable_at::text, published_at::text,
                   quarantined_at::text, revoked_at::text, created_at::text,
                   updated_at::text`,
        [assetId, payload.reason],
      );
      await client.query(
        `UPDATE media_bindings SET removed_at = NOW()
         WHERE media_asset_id = $1 AND removed_at IS NULL`,
        [assetId],
      );
      await client.query(
        `UPDATE media_processing_jobs
         SET status = 'dead',
             last_error = 'Asset revoked by owner',
             completed_at = NOW(),
             locked_at = NULL,
             locked_by = NULL
         WHERE media_asset_id = $1
           AND status IN ('pending', 'processing', 'retry')`,
        [assetId],
      );
      await client.query(
        `INSERT INTO media_processing_jobs (
           id, media_asset_id, job_type, status
         )
         VALUES ($1, $2, 'purge_derivatives', 'pending')
         ON CONFLICT DO NOTHING`,
        [`mjob_${crypto.randomUUID()}`, assetId],
      );
      await client.query('COMMIT');
      return { ok: true, asset: serializeAsset(result.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/internal/media/assets/:assetId/purge-results', async (request, reply) => {
    if (!authorizeInternalServiceRequest(request)) {
      reply.code(401);
      return { ok: false, error: 'Invalid internal service token' };
    }
    const { assetId } = assetIdSchema.parse(request.params);
    const payload = z.object({
      jobId: z.string().trim().min(2).max(120),
      succeeded: z.boolean(),
      error: z.string().trim().min(1).max(1000).optional(),
    }).parse(request.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const jobResult = await client.query<{
        id: string;
        media_asset_id: string;
        job_type: string;
        status: string;
        attempt_count: number;
        max_attempts: number;
      }>(
        `SELECT id, media_asset_id, job_type, status,
                attempt_count, max_attempts
         FROM media_processing_jobs
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.jobId],
      );
      const job = jobResult.rows[0];
      if (
        !job
        || job.media_asset_id !== assetId
        || job.job_type !== 'purge_derivatives'
      ) {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Purge job does not belong to this media asset' };
      }
      if (job.status === 'completed') {
        await client.query('COMMIT');
        return { ok: true, replayed: true };
      }
      if (job.status !== 'processing') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Purge job is not currently claimed' };
      }

      if (payload.succeeded) {
        await client.query(
          'DELETE FROM media_derivatives WHERE media_asset_id = $1',
          [assetId],
        );
      }
      await client.query(
        `UPDATE media_processing_jobs
         SET status = CASE
               WHEN $2 THEN 'completed'
               WHEN attempt_count < max_attempts THEN 'retry'
               ELSE 'dead'
             END,
             available_at = CASE WHEN $2 THEN available_at
                                 ELSE NOW() + LEAST(
                                   INTERVAL '1 hour',
                                   INTERVAL '30 seconds' * POWER(2, attempt_count)
                                 ) END,
             last_error = CASE WHEN $2 THEN NULL ELSE $3 END,
             result = jsonb_build_object('purged', $2),
             completed_at = CASE WHEN $2 OR attempt_count >= max_attempts
                                 THEN NOW() ELSE NULL END,
             locked_at = NULL,
             locked_by = NULL
         WHERE id = $1`,
        [
          payload.jobId,
          payload.succeeded,
          payload.error ?? 'Derivative purge failed',
        ],
      );
      await client.query('COMMIT');
      return {
        ok: payload.succeeded,
        retryScheduled: !payload.succeeded && job.attempt_count < job.max_attempts,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/internal/media/orphans/cleanup', async (request, reply) => {
    if (!authorizeInternalServiceRequest(request)) {
      reply.code(401);
      return { ok: false, error: 'Invalid internal service token' };
    }
    const payload = z.object({
      workerId: z.string().trim().min(2).max(120),
      limit: z.number().int().min(1).max(50).default(10),
    }).parse(request.body);

    const client = await db.connect();
    let claimed: Array<{ id: string; object_key: string }> = [];
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; object_key: string }>(
        `WITH candidates AS (
           SELECT id
           FROM upload_intents
           WHERE finalized_at IS NULL
             AND expires_at <= NOW()
             AND cleanup_status IN ('not_due', 'pending', 'failed')
             AND cleanup_attempt_count < 5
           ORDER BY expires_at, created_at
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         )
         UPDATE upload_intents intent
         SET cleanup_status = 'processing',
             cleanup_attempt_count = cleanup_attempt_count + 1,
             cleanup_locked_at = NOW(),
             cleanup_locked_by = $1
         FROM candidates
         WHERE intent.id = candidates.id
         RETURNING intent.id, intent.object_key`,
        [payload.workerId, payload.limit],
      );
      claimed = result.rows;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const cleaned: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const intent of claimed) {
      try {
        await deleteStoredObject(intent.object_key);
        await db.query(
          `UPDATE upload_intents
           SET cleanup_status = 'cleaned', cleaned_at = NOW(),
               cleanup_last_error = NULL, cleanup_locked_at = NULL,
               cleanup_locked_by = NULL
           WHERE id = $1 AND cleanup_status = 'processing'`,
          [intent.id],
        );
        cleaned.push(intent.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Object deletion failed';
        await db.query(
          `UPDATE upload_intents
           SET cleanup_status = 'failed', cleanup_last_error = $2,
               cleanup_locked_at = NULL, cleanup_locked_by = NULL
           WHERE id = $1 AND cleanup_status = 'processing'`,
          [intent.id, message],
        );
        failed.push({ id: intent.id, error: message });
      }
    }

    return {
      ok: failed.length === 0,
      claimedCount: claimed.length,
      cleanedIds: cleaned,
      failures: failed,
    };
  });
};
