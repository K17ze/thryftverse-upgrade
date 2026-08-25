import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';

type ListingImageRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const imageIdParamsSchema = z.object({ imageId: z.string().min(2) });

const attachImageBodySchema = z.object({
  id: z.string().min(2),
  listingId: z.string().min(2),
  imageUrl: z.string().url(),
  sortOrder: z.number().int().min(0).default(0),
  mediaWidth: z.number().int().positive().optional(),
  mediaHeight: z.number().int().positive().optional(),
  mediaType: z.enum(['image', 'video']).default('image'),
  finalizationId: z.string().min(2).max(120),
  posterUrl: z.string().url().nullable().optional(),
  blurhash: z.string().min(1).max(200).nullable().optional(),
  focalX: z.number().min(0).max(1).nullable().optional(),
  focalY: z.number().min(0).max(1).nullable().optional(),
});

/**
 * Register listing-image routes on the Fastify instance:
 *   POST /listing-images                   — attach verified media to a listing
 *   POST /listing-images/:imageId/verify-poster — mark a video poster URL verified
 *
 * NOTE: The media freeze/unfreeze endpoints live under `/listings/:listingId/media/*`
 * and are registered by `registerListingRoutes` in `listings.ts`.
 */
export const registerListingImageRoutes = ({ app, db, resolveAuthenticatedUserId }: ListingImageRouteDependencies): void => {
  app.post('/listing-images', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = attachImageBodySchema.parse(request.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const listing = await client.query<{ seller_id: string; status: string }>(
        `SELECT seller_id, status
         FROM listings
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.listingId],
      );
      if (!listing.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Listing not found' };
      }
      if (listing.rows[0].seller_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Only the seller can attach listing media' };
      }
      if (!['draft', 'active'].includes(listing.rows[0].status)) {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Media cannot be changed in the current listing state' };
      }

      const finalization = await client.query<{
        public_url: string;
        content_type: string;
        status: string;
        owner_id: string;
        media_asset_id: string | null;
        media_asset_status: string | null;
        canonical_url: string | null;
      }>(
        `SELECT finalization.public_url, finalization.content_type,
                finalization.status, finalization.owner_id,
                finalization.media_asset_id,
                asset.status AS media_asset_status,
                asset.canonical_url
         FROM upload_finalizations finalization
         LEFT JOIN media_assets asset
           ON asset.id = finalization.media_asset_id
         WHERE finalization.id = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.finalizationId],
      );
      if (!finalization.rowCount) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Verified upload finalization not found' };
      }
      const verifiedUpload = finalization.rows[0];
      const mediaPrefix = payload.mediaType === 'video' ? 'video/' : 'image/';
      if (
        verifiedUpload.owner_id !== actorUserId
        || verifiedUpload.status !== 'finalized'
        || (
          verifiedUpload.public_url !== payload.imageUrl
          && verifiedUpload.canonical_url !== payload.imageUrl
        )
        || !verifiedUpload.content_type.startsWith(mediaPrefix)
      ) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Listing media does not match the verified upload' };
      }
      if (
        config.mediaPublicationGateEnabled
        && (
          verifiedUpload.media_asset_status !== 'published'
          || !verifiedUpload.canonical_url
        )
      ) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Listing media is still being processed or moderated',
          code: 'MEDIA_NOT_PUBLISHED',
          mediaStatus: verifiedUpload.media_asset_status ?? 'missing',
        };
      }
      const resolvedMediaUrl = config.mediaPublicationGateEnabled
        ? verifiedUpload.canonical_url
        : verifiedUpload.public_url;

      const attached = await client.query<{ id: string }>(
        `
          INSERT INTO listing_images (
            id, listing_id, image_url, sort_order, media_width, media_height,
            media_type, poster_url, blurhash, focal_x, focal_y
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE
          SET image_url = EXCLUDED.image_url,
              sort_order = EXCLUDED.sort_order,
              media_width = EXCLUDED.media_width,
              media_height = EXCLUDED.media_height,
              media_type = EXCLUDED.media_type,
              poster_url = EXCLUDED.poster_url,
              blurhash = EXCLUDED.blurhash,
              focal_x = EXCLUDED.focal_x,
              focal_y = EXCLUDED.focal_y
          WHERE listing_images.listing_id = EXCLUDED.listing_id
          RETURNING id
        `,
        [
          payload.id,
          payload.listingId,
          resolvedMediaUrl,
          payload.sortOrder,
          payload.mediaWidth ?? null,
          payload.mediaHeight ?? null,
          payload.mediaType,
          payload.posterUrl ?? null,
          payload.blurhash ?? null,
          payload.focalX ?? null,
          payload.focalY ?? null,
        ],
      );
      if (!attached.rowCount) {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Media attachment ID belongs to another listing' };
      }

      await client.query(
        `UPDATE upload_finalizations
         SET scope = 'listing_media',
             scope_ref_id = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [payload.finalizationId, payload.listingId],
      );
      if (
        verifiedUpload.media_asset_id
        && verifiedUpload.media_asset_status === 'published'
      ) {
        await client.query(
          `INSERT INTO media_bindings (
             id, media_asset_id, owner_id, target_type,
             target_ref_id, role, sort_order
           )
           VALUES ($1, $2, $3, 'listing', $4, $5, $6)
           ON CONFLICT (media_asset_id, target_type, target_ref_id, role)
           DO UPDATE SET removed_at = NULL, sort_order = EXCLUDED.sort_order`,
          [
            `mbind_${crypto.randomUUID()}`,
            verifiedUpload.media_asset_id,
            actorUserId,
            payload.listingId,
            payload.mediaType,
            payload.sortOrder,
          ],
        );
      }
      await client.query('COMMIT');

      reply.code(201);
      return { ok: true };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error({ err: error, listingId: payload.listingId }, 'Failed to attach listing media');
      reply.code(500);
      return { ok: false, error: 'Failed to attach listing media' };
    } finally {
      client.release();
    }
  });

  // ── M05: Poster verification ──
  // Marks a listing image's poster URL as verified. The verifier (seller
  // or admin) confirms the poster URL is accessible and represents the
  // video. This makes the poster trust backend-backed rather than
  // asserted.
  app.post('/listing-images/:imageId/verify-poster', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { imageId } = imageIdParamsSchema.parse(request.params);

    const result = await db.query<{ listing_id: string; poster_url: string | null }>(
      `SELECT listing_id, poster_url FROM listing_images WHERE id = $1`,
      [imageId]
    );
    const image = result.rows[0];
    if (!image) {
      reply.code(404);
      return { ok: false, error: 'Listing image not found' };
    }
    if (!image.poster_url) {
      reply.code(409);
      return { ok: false, error: 'No poster URL to verify', code: 'NO_POSTER' };
    }

    // Verify the listing belongs to the actor.
    const listingResult = await db.query<{ seller_id: string }>(
      'SELECT seller_id FROM listings WHERE id = $1',
      [image.listing_id]
    );
    if (listingResult.rows[0]?.seller_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Only the seller can verify poster URLs' };
    }

    await db.query(
      `UPDATE listing_images SET poster_verified_at = NOW(), poster_verified_by = $2 WHERE id = $1`,
      [imageId, actorUserId]
    );

    return { ok: true, verifiedAt: new Date().toISOString() };
  });
};
