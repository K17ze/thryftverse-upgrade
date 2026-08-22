import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { moderateImageAsset, moderateListingText } from '../lib/moderation/moderationService.js';
import type { MediaAssetStatus } from '../lib/mediaLifecycle.js';

type ModerationRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

type MediaAssetRow = {
  id: string;
  owner_id: string;
  status: MediaAssetStatus;
  moderation_status: string;
  canonical_url: string | null;
  original_object_url: string;
  media_kind: 'image' | 'video' | 'document';
};

const assetIdSchema = z.object({
  assetId: z.string().trim().min(2).max(120),
});

const assetSelect = `
  SELECT id, owner_id, status, moderation_status, canonical_url,
         original_object_url, media_kind
  FROM media_assets
`;

const textModerationSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  context: z.string().trim().min(1).max(80).optional(),
});

const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(1).max(500).optional(),
});

/**
 * Register content moderation HTTP routes.
 *
 * Exposes endpoints for triggering image/text moderation, inspecting the
 * moderation status of an asset, and admin-only manual review overrides.
 */
export const registerModerationRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: ModerationRouteDependencies) => {
  app.post('/moderation/image/:assetId', async (request, reply) => {
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
    const isAdmin = request.authUser?.role === 'admin';
    if (asset.owner_id !== actorUserId && !isAdmin) {
      reply.code(403);
      return { ok: false, error: 'Only the asset owner or an admin can trigger moderation' };
    }
    if (asset.media_kind !== 'image') {
      reply.code(422);
      return { ok: false, error: 'Image moderation is only available for image assets' };
    }

    const imageUrl = asset.canonical_url ?? asset.original_object_url;
    const outcome = await moderateImageAsset(assetId, imageUrl);

    await db.query(
      `UPDATE media_assets
       SET moderation_status = $2,
           status = CASE
             WHEN $3 = 'publishable' THEN 'publishable'
             WHEN $3 = 'quarantined' THEN 'quarantined'
             WHEN $3 = 'processing_failed' THEN 'processing_failed'
             ELSE status
           END,
           canonical_url = CASE WHEN $3 = 'publishable' THEN canonical_url ELSE canonical_url END,
           publishable_at = CASE WHEN $3 = 'publishable' THEN COALESCE(publishable_at, NOW()) ELSE publishable_at END,
           quarantined_at = CASE WHEN $3 = 'quarantined' THEN NOW() ELSE quarantined_at END
       WHERE id = $1`,
      [assetId, outcome.moderationStatus, outcome.status],
    );

    return {
      ok: true,
      assetId,
      moderationStatus: outcome.moderationStatus,
      lifecycleStatus: outcome.status,
      provider: outcome.result.provider,
      confidence: outcome.result.confidence,
      labels: outcome.result.labels,
    };
  });

  app.post('/moderation/text', async (request, reply) => {
    resolveAuthenticatedUserId(request);
    const payload = textModerationSchema.parse(request.body);

    const result = await moderateListingText(payload.context ?? 'inline', payload.text);

    if (result.status === 'rejected') {
      reply.code(422);
      return {
        ok: false,
        error: 'Content rejected by moderation',
        moderationStatus: result.status,
        labels: result.labels,
      };
    }

    return {
      ok: true,
      moderationStatus: result.status,
      provider: result.provider,
      confidence: result.confidence,
      labels: result.labels,
    };
  });

  app.get('/moderation/status/:assetId', async (request, reply) => {
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
    const isAdmin = request.authUser?.role === 'admin';
    if (asset.owner_id !== actorUserId && !isAdmin) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    return {
      ok: true,
      assetId,
      moderationStatus: asset.moderation_status,
      lifecycleStatus: asset.status,
    };
  });

  app.post('/moderation/review/:assetId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { assetId } = assetIdSchema.parse(request.params);
    const payload = reviewSchema.parse(request.body);

    const isAdmin = request.authUser?.role === 'admin';
    if (!isAdmin) {
      reply.code(403);
      return { ok: false, error: 'Only admins can perform manual moderation review' };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const selectResult = await client.query<MediaAssetRow>(
        `${assetSelect} WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [assetId],
      );
      const asset = selectResult.rows[0];
      if (!asset) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Media asset not found' };
      }
      if (asset.moderation_status !== 'review' && asset.status !== 'moderation_pending') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Asset is not in a reviewable moderation state',
          currentStatus: asset.status,
          moderationStatus: asset.moderation_status,
        };
      }

      const newModerationStatus = payload.decision === 'approve' ? 'approved' : 'rejected';
      const newLifecycleStatus: MediaAssetStatus = payload.decision === 'approve'
        ? 'publishable'
        : 'rejected';

      const updated = await client.query<MediaAssetRow>(
        `UPDATE media_assets
         SET moderation_status = $2,
             status = $3,
             publishable_at = CASE WHEN $3 = 'publishable' THEN COALESCE(publishable_at, NOW()) ELSE publishable_at END
         WHERE id = $1
         RETURNING id, owner_id, status, moderation_status, canonical_url,
                   original_object_url, media_kind`,
        [assetId, newModerationStatus, newLifecycleStatus],
      );
      await client.query('COMMIT');

      console.info(
        `[moderation] manual_review asset=${assetId} admin=${actorUserId} decision=${payload.decision} reason=${payload.reason ?? 'none'}`,
      );

      return {
        ok: true,
        assetId,
        moderationStatus: newModerationStatus,
        lifecycleStatus: newLifecycleStatus,
        asset: {
          id: updated.rows[0].id,
          status: updated.rows[0].status,
          moderationStatus: updated.rows[0].moderation_status,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
};
