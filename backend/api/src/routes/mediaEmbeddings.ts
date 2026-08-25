/**
 * Media Embeddings — Admin REST Routes
 *
 * Admin-only endpoints for the offline embedding pipeline:
 *   POST /admin/media-embeddings/queue  — queue embedding jobs for media
 *                                          assets that don't have embeddings
 *                                          yet.
 *   GET  /admin/media-embeddings/status — report how many media assets have
 *                                          embeddings, by model version.
 *
 * These are infrastructure endpoints. They do not expose any user-facing
 * "AI visual search" capability. The existing colour-histogram heuristic
 * (visualSimilarity.ts) remains the user-facing visual search method until
 * a real model is benchmarked and promoted via the model artifact registry.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { enqueueMediaEmbeddingJob } from '../lib/queues.js';

type MediaEmbeddingRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const queueBodySchema = z.object({
  modelId: z.string().trim().min(2).max(120),
  modelVersion: z.string().trim().min(1).max(120),
  preprocessingVersion: z.string().trim().min(1).max(120).default('v1'),
  /** Maximum number of assets to queue in a single call. */
  limit: z.coerce.number().int().min(1).max(5000).default(500),
});

const statusQuerySchema = z.object({
  modelId: z.string().trim().min(2).max(120).optional(),
});

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

type MediaAssetRow = {
  id: string;
  canonical_url: string;
};

type EmbeddingStatusRow = {
  model_id: string;
  model_version: string;
  preprocessing_version: string;
  embedding_count: string;
  placeholder_count: string;
};

type TotalAssetsRow = {
  total_assets: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureAdmin(
  request: FastifyRequest,
  createApiError: MediaEmbeddingRouteDependencies['createApiError'],
): void {
  if (!request.authUser || request.authUser.role !== 'admin') {
    throw createApiError('FORBIDDEN', 'Admin access required');
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerMediaEmbeddingRoutes = ({
  app,
  db,
  createApiError,
}: MediaEmbeddingRouteDependencies) => {
  // POST /admin/media-embeddings/queue
  //
  // Queues embedding jobs for published image media assets that do not yet
  // have an embedding for the specified (model_id, model_version,
  // preprocessing_version). This is the backfill trigger — call it after
  // registering a new model in model_artifacts to start generating
  // embeddings for the existing asset corpus.
  app.post('/admin/media-embeddings/queue', async (request, reply) => {
    ensureAdmin(request, createApiError);

    const payload = queueBodySchema.parse(request.body ?? {});

    // Select published image assets that do not yet have an embedding for
    // this (model_id, model_version, preprocessing_version) tuple.
    const assetsResult = await db.query<MediaAssetRow>(
      `SELECT ma.id, ma.canonical_url
       FROM media_assets ma
       WHERE ma.media_kind = 'image'
         AND ma.status = 'published'
         AND ma.canonical_url IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM media_embeddings me
           WHERE me.media_asset_id = ma.id
             AND me.model_id = $1
             AND me.model_version = $2
             AND me.preprocessing_version = $3
         )
       ORDER BY ma.created_at DESC
       LIMIT $4`,
      [payload.modelId, payload.modelVersion, payload.preprocessingVersion, payload.limit],
    );

    const assets = assetsResult.rows;
    let enqueued = 0;

    for (const asset of assets) {
      if (!asset.canonical_url) continue;
      await enqueueMediaEmbeddingJob({
        mediaAssetId: asset.id,
        imageUrl: asset.canonical_url,
        modelId: payload.modelId,
        modelVersion: payload.modelVersion,
        preprocessingVersion: payload.preprocessingVersion,
      });
      enqueued++;
    }

    reply.code(202);
    return {
      ok: true,
      modelId: payload.modelId,
      modelVersion: payload.modelVersion,
      preprocessingVersion: payload.preprocessingVersion,
      candidatesFound: assets.length,
      enqueued,
    };
  });

  // GET /admin/media-embeddings/status
  //
  // Reports how many media assets have embeddings, grouped by
  // (model_id, model_version, preprocessing_version). Also reports the
  // total number of published image assets so the coverage ratio is
  // visible. Optionally filter by model_id.
  app.get('/admin/media-embeddings/status', async (request, reply) => {
    ensureAdmin(request, createApiError);

    const query = statusQuerySchema.parse(request.query ?? {});

    const statusResult = await db.query<EmbeddingStatusRow>(
      `SELECT
         me.model_id,
         me.model_version,
         me.preprocessing_version,
         COUNT(*)::TEXT AS embedding_count,
         COUNT(*) FILTER (
           WHERE (me.quality_flags ->> 'placeholder')::boolean = true
         )::TEXT AS placeholder_count
       FROM media_embeddings me
       ${query.modelId ? 'WHERE me.model_id = $1' : ''}
       GROUP BY me.model_id, me.model_version, me.preprocessing_version
       ORDER BY me.model_id, me.model_version, me.preprocessing_version`,
      query.modelId ? [query.modelId] : [],
    );

    const totalResult = await db.query<TotalAssetsRow>(
      `SELECT COUNT(*)::TEXT AS total_assets
       FROM media_assets
       WHERE media_kind = 'image'
         AND status = 'published'`,
    );

    const totalAssets = parseInt(totalResult.rows[0]?.total_assets ?? '0', 10);

    const byModel = statusResult.rows.map((row) => ({
      modelId: row.model_id,
      modelVersion: row.model_version,
      preprocessingVersion: row.preprocessing_version,
      embeddingCount: parseInt(row.embedding_count, 10),
      placeholderCount: parseInt(row.placeholder_count, 10),
      coverage: totalAssets > 0
        ? parseFloat((parseInt(row.embedding_count, 10) / totalAssets).toFixed(4))
        : 0,
    }));

    reply.code(200);
    return {
      ok: true,
      totalPublishedImageAssets: totalAssets,
      models: byModel,
    };
  });
};
