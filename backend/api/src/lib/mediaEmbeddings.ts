/**
 * Media embedding serving — feature-detected pgvector path (audit R20).
 *
 * `media_embeddings.embedding` is stored as BYTEA (little-endian float32)
 * because pgvector is not guaranteed to be installed (migration 145). When
 * migration 326 detects the `vector` extension it provisions
 * `media_embeddings.embedding_vec vector(512)`, backfills it from BYTEA, and
 * builds an ANN index — this module then serves nearest-neighbour queries
 * through `ORDER BY embedding_vec <=> $1::vector`.
 *
 * Honesty contract (same rule as lib/retrievalMeta.ts — never claim a method
 * that was not used):
 *   - When `embedding_vec` exists, `method: 'pgvector_ann'` and Postgres
 *     performs the cosine-distance ordering.
 *   - When it does not, the result reports `degraded: true` +
 *     `degradedReason: 'pgvector_not_installed'` and falls back to the
 *     current documented path (migration 145 header): fetch bounded serving
 *     rows, decode BYTEA in application code, and compute exact cosine
 *     similarity. It never fabricates ANN results.
 *
 * No route consumes this module yet — visualSearch.ts ranks candidates with
 * the colour-histogram heuristic (lib/visualSimilarity.ts). This is the
 * serving seam a future visual-search / similar-items route calls; it is
 * deliberately a lib, not a route, so the capability lands without a
 * serving endpoint that doesn't exist yet.
 */

import {
  computeL2Norm,
  deserialiseEmbedding,
  dotProduct,
  embeddingToVectorLiteral,
} from '../workers/handlers/mediaEmbeddingUtils.js';
import type { Queryable } from './autoFeedback.js';

/**
 * The pgvector column provisioned by migration 326 is `vector(512)` — the
 * declared output size of the embedding pipeline (PLACEHOLDER_DIMENSIONS in
 * mediaEmbeddingHandler.ts). Embeddings with a different dimensionality
 * stay BYTEA-only; `embedding_vec` remains NULL for them rather than
 * silently truncating into a wrong-dimension vector.
 */
export const EMBEDDING_VECTOR_DIMENSIONS = 512;

/**
 * Upper bound on rows fetched for the degraded in-application scan. The
 * BYTEA path is an exact scan over a bounded candidate set — acceptable for
 * backfill evaluation and small corpora, not a production-scale ANN
 * substitute (migration 145 header).
 */
const BYTEA_SCAN_CAP = 5000;

const MIN_LIMIT = 1;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NearestMediaEmbeddingsFilter {
  /** Restrict to a single model lineage tuple. */
  modelId?: string;
  modelVersion?: string;
  preprocessingVersion?: string;
  /**
   * Restrict to a declared dimensionality. Always constrain this to the
   * query vector's length — embeddings from different dimensionalities are
   * incomparable vector spaces and must never be ranked together.
   */
  dimensions?: number;
  /** Restrict to an explicit candidate set of media assets. */
  mediaAssetIds?: string[];
}

export interface NearestMediaEmbeddingsQuery {
  /** Query vector — raw float32 values, not the BYTEA payload. */
  queryEmbedding: number[];
  /** Maximum hits returned (default 20, hard cap 500). */
  limit?: number;
  filter?: NearestMediaEmbeddingsFilter;
}

export interface NearestMediaEmbeddingHit {
  mediaAssetId: string;
  modelId: string;
  modelVersion: string;
  preprocessingVersion: string;
  checksumSha256: string;
  /** Cosine similarity in [-1, 1]; higher is more similar. */
  similarity: number;
  /** Cosine distance (pgvector `<=>` semantics): 1 - similarity. */
  distance: number;
}

export interface NearestMediaEmbeddingsResult {
  hits: NearestMediaEmbeddingHit[];
  /**
   * The method that actually produced `hits`:
   *   - 'pgvector_ann'      — `embedding_vec <=>` ordering inside Postgres
   *                         backed by an HNSW/IVFFlat index.
   *   - 'pgvector_exact'    — same `embedding_vec <=>` ordering but WITHOUT
   *                         an ANN index (migration 326 treats index
   *                         failure as a notice, so a no-index deployment
   *                         must not claim ANN — the column still answers
   *                         correct exact scans).
   *   - 'bytea_exact_scan'  — in-application cosine scan over decoded BYTEA.
   */
  method: 'pgvector_ann' | 'pgvector_exact' | 'bytea_exact_scan';
  /** true when the pgvector fast path was unavailable and the degraded scan ran. */
  degraded: boolean;
  /**
   * Why the degraded scan ran:
   *   - 'pgvector_not_installed' — no `embedding_vec` column on this deploy.
   *   - 'dimension_mismatch'     — the column exists but is vector(512) and
   *     the query vector is a different length; the BYTEA path's per-row
   *     dimensions check enforces comparability instead of letting Postgres
   *     raise a vector-dimension error.
   */
  degradedReason?: 'pgvector_not_installed' | 'dimension_mismatch';
  /** Rows examined by the degraded scan. */
  scannedRows?: number;
  /** true when BYTEA_SCAN_CAP truncated the degraded scan's candidate set. */
  scanTruncated?: boolean;
  /** Rows skipped because the BYTEA payload length did not match `dimensions`. */
  skippedRows?: number;
}

type VectorExistsRow = {
  exists: boolean;
};

type AnnRow = {
  media_asset_id: string;
  model_id: string;
  model_version: string;
  preprocessing_version: string;
  checksum_sha256: string;
  distance: number | string;
};

type ScanRow = {
  media_asset_id: string;
  model_id: string;
  model_version: string;
  preprocessing_version: string;
  checksum_sha256: string;
  dimensions: number;
  norm: number | string;
  embedding: Buffer | Uint8Array | null;
};

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

/**
 * Probe whether migration 326 provisioned `media_embeddings.embedding_vec`.
 * Feature-detected (not cached): if pgvector is installed and the migration
 * re-runs, the next call sees the column without a process restart. A failed
 * probe (missing table, permission error) is treated as "column absent" so
 * the degraded path engages rather than throwing.
 */
export async function hasMediaEmbeddingVectorColumn(
  db: Queryable,
): Promise<boolean> {
  try {
    const res = await db.query(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_attribute
         WHERE attrelid = 'public.media_embeddings'::regclass
           AND attname = 'embedding_vec'
           AND NOT attisdropped
       ) AS exists`,
    );
    const row = res.rows[0] as VectorExistsRow | undefined;
    return row?.exists === true;
  } catch {
    return false;
  }
}

/**
 * Probed pgvector capability on this deployment (audit N5). Migration 326
 * treats ANN-index creation failure as a NOTICE — not a hard failure — so
 * `embedding_vec` can exist with no HNSW/IVFFlat index behind it. Reporting
 * 'ann' in that state would be a fabricated capability claim; 'exact' is
 * the honest label for a column that serves correct-but-unindexed scans.
 * Fails closed to 'none' on any probe error.
 */
export type MediaEmbeddingVectorCapability = 'ann' | 'exact' | 'none';

export async function mediaEmbeddingVectorCapability(
  db: Queryable,
): Promise<MediaEmbeddingVectorCapability> {
  try {
    const res = await db.query(
      `SELECT
         EXISTS (
           SELECT 1
           FROM pg_attribute
           WHERE attrelid = 'public.media_embeddings'::regclass
             AND attname = 'embedding_vec'
             AND NOT attisdropped
         ) AS has_column,
         EXISTS (
           SELECT 1
           FROM pg_indexes
           WHERE schemaname = 'public'
             AND tablename = 'media_embeddings'
             AND indexdef ILIKE '%embedding_vec%'
             AND (indexdef ILIKE '%USING hnsw%' OR indexdef ILIKE '%USING ivfflat%')
         ) AS has_ann_index`,
    );
    const row = res.rows[0] as
      | { has_column: boolean; has_ann_index: boolean }
      | undefined;
    if (row?.has_column !== true) {
      return 'none';
    }
    return row.has_ann_index === true ? 'ann' : 'exact';
  } catch {
    return 'none';
  }
}

/**
 * The serving embedding lineage — the (model_id, model_version,
 * preprocessing_version, dimensions) tuple that currently holds the most
 * ready embeddings. Anchors and neighbour queries must agree on ONE lineage:
 * vectors from different model lineages or dimensionalities are points in
 * incomparable spaces, and a cross-space "similarity" is a fabricated rank.
 *
 * Dominant-by-coverage is deliberate: during a model rollover the new
 * lineage is mid-backfill, so ranking on the lineage with the most ready
 * rows keeps serving on the complete corpus until the new model's coverage
 * overtakes it. `latest_at` breaks ties toward the newest lineage.
 *
 * Promotion governance (audit: model_artifacts is the promotion registry —
 * migration 144): coverage alone must never elect the serving lineage.
 *   - A lineage whose registry row is 'blocked' or 'retired' is excluded
 *     outright — its embeddings exist on disk but the model is held or
 *     superseded, so serving it would be an unapproved capability.
 *   - A lineage backed by an 'active' registry row is the promoted
 *     champion and outranks every unapproved lineage regardless of
 *     coverage — a mid-backfill promoted model wins over a larger but
 *     never-approved one.
 *   - 'candidate'/'shadow' artifacts and lineages with no registry row
 *     are ungoverned: eligible, but strictly below a promoted champion.
 * The join includes preprocessing_version so a promotion of one
 * preprocessing pipeline cannot bless embeddings produced by another.
 */
export interface ServingEmbeddingLineage {
  modelId: string;
  modelVersion: string;
  preprocessingVersion: string;
  dimensions: number;
}

export async function resolveServingEmbeddingLineage(
  db: Queryable,
): Promise<ServingEmbeddingLineage | null> {
  try {
    const res = await db.query(
      `SELECT
         me.model_id, me.model_version, me.preprocessing_version, me.dimensions,
         COUNT(*)::int AS ready_rows,
         MAX(me.generated_at) AS latest_at
       FROM media_embeddings me
       LEFT JOIN model_artifacts ma
         ON ma.model_id = me.model_id
        AND ma.model_version = me.model_version
        AND ma.preprocessing_version = me.preprocessing_version
        -- Scope governance to the task these embeddings serve: an
        -- artifact registered for a different task (fraud_scoring etc.)
        -- under a colliding model_id must neither promote nor block a
        -- visual-search lineage.
        AND ma.task = 'visual_search'
       WHERE me.status = 'ready' AND me.norm > 0
         AND (ma.status IS NULL OR ma.status NOT IN ('blocked', 'retired'))
       GROUP BY me.model_id, me.model_version, me.preprocessing_version, me.dimensions, ma.status
       ORDER BY
         CASE WHEN ma.status = 'active' THEN 0 ELSE 1 END,
         ready_rows DESC,
         latest_at DESC
       LIMIT 1`,
    );
    const row = res.rows[0] as
      | {
          model_id: string;
          model_version: string;
          preprocessing_version: string;
          dimensions: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      modelId: row.model_id,
      modelVersion: row.model_version,
      preprocessingVersion: row.preprocessing_version,
      dimensions: Number(row.dimensions),
    };
  } catch {
    return null;
  }
}

/**
 * Map nearest-neighbour media assets back to their bound listings while
 * preserving ANN rank (audit N4). `assetDistances` carries the
 * (media_asset_id → best cosine distance) pairs produced by
 * `nearestMediaEmbeddings`; the VALUES join keeps each asset's rank and the
 * GROUP BY aggregates a listing bound to several assets down to its best
 * distance. Returns listing ids ordered by ascending best distance — the
 * order the caller must feed to `array_position` for a truthful source_rank.
 */
export async function mapNeighbourAssetsToListings(
  db: Queryable,
  assetDistances: ReadonlyMap<string, number>,
  limit?: number,
): Promise<Array<{ listingId: string; distance: number }>> {
  if (assetDistances.size === 0) {
    return [];
  }
  const assetIds = [...assetDistances.keys()];
  const distances = assetIds.map((id) => assetDistances.get(id)!);
  const cap =
    limit === undefined ? null : Math.max(1, Math.trunc(limit));
  const res = await db.query(
    `SELECT mb.target_ref_id AS listing_id,
            MIN(n.distance) AS best_distance
     FROM media_bindings mb
     JOIN unnest($1::text[], $2::float8[]) WITH ORDINALITY
       AS n(media_asset_id, distance, ann_rank)
       ON n.media_asset_id = mb.media_asset_id
     WHERE mb.target_type = 'listing'
       AND mb.removed_at IS NULL
     GROUP BY mb.target_ref_id
     ORDER BY best_distance ASC, MIN(n.ann_rank) ASC
     ${cap === null ? '' : 'LIMIT $3'}`,
    cap === null ? [assetIds, distances] : [assetIds, distances, cap],
  );
  return (res.rows as Array<{ listing_id: string; best_distance: number | string }>).map(
    (row) => ({
      listingId: row.listing_id,
      distance: Number(row.best_distance),
    }),
  );
}

// ---------------------------------------------------------------------------
// Nearest-neighbour serving
// ---------------------------------------------------------------------------

/**
 * Return the `limit` serving embeddings nearest to `queryEmbedding` by
 * cosine distance, scoped to `status = 'ready' AND norm > 0` (the same
 * predicate as the media_embeddings_serving view) and any `filter`
 * constraints.
 *
 * Uses the pgvector column when present; otherwise degrades honestly to a
 * bounded exact scan over decoded BYTEA rows. See the module header for the
 * honesty contract.
 */
export async function nearestMediaEmbeddings(
  db: Queryable,
  query: NearestMediaEmbeddingsQuery,
): Promise<NearestMediaEmbeddingsResult> {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(MIN_LIMIT, Math.trunc(query.limit ?? DEFAULT_LIMIT)),
  );
  const filter = query.filter ?? {};

  // A zero, empty, or non-finite query vector has undefined cosine
  // similarity on both paths (pgvector `<=>` returns NaN for zero-norm
  // vectors and rejects NaN/Infinity literals; the BYTEA scan would report
  // all-zero similarity). Return an honest empty result rather than a
  // meaningless ranking — `method`/`degraded` still report which path is
  // provisioned on this environment.
  const queryVectorUsable =
    query.queryEmbedding.length > 0 &&
    query.queryEmbedding.every((value) => Number.isFinite(value)) &&
    computeL2Norm(query.queryEmbedding) > 0;
  if (!queryVectorUsable) {
    const capability = await mediaEmbeddingVectorCapability(db);
    return {
      hits: [],
      method:
        capability === 'ann'
          ? 'pgvector_ann'
          : capability === 'exact'
            ? 'pgvector_exact'
            : 'bytea_exact_scan',
      degraded: capability === 'none',
      degradedReason:
        capability === 'none' ? 'pgvector_not_installed' : undefined,
      scannedRows: 0,
      skippedRows: 0,
    };
  }

  // Filter predicates occupy $1..$k; the vector literal / scan cap and the
  // LIMIT parameter are appended after them.
  const conditions: string[] = [`status = 'ready'`, `norm > 0`];
  const args: unknown[] = [];
  if (filter.modelId) {
    args.push(filter.modelId);
    conditions.push(`model_id = $${args.length}`);
  }
  if (filter.modelVersion) {
    args.push(filter.modelVersion);
    conditions.push(`model_version = $${args.length}`);
  }
  if (filter.preprocessingVersion) {
    args.push(filter.preprocessingVersion);
    conditions.push(`preprocessing_version = $${args.length}`);
  }
  if (filter.dimensions !== undefined) {
    args.push(Math.trunc(filter.dimensions));
    conditions.push(`dimensions = $${args.length}`);
  }
  if (filter.mediaAssetIds && filter.mediaAssetIds.length > 0) {
    args.push(filter.mediaAssetIds);
    conditions.push(`media_asset_id = ANY($${args.length})`);
  }

  // The vector(512) column can only serve a 512-dim query — any other
  // length is a different vector space, so route it to the BYTEA scan where
  // the per-row dimensions check enforces comparability instead of letting
  // Postgres raise a dimension-mismatch error.
  const capability = await mediaEmbeddingVectorCapability(db);
  const vectorPathUsable =
    capability !== 'none' &&
    query.queryEmbedding.length === EMBEDDING_VECTOR_DIMENSIONS;

  if (vectorPathUsable) {
    const vectorParam = args.length + 1;
    const limitParam = args.length + 2;
    const res = await db.query(
      `SELECT
         media_asset_id, model_id, model_version, preprocessing_version,
         checksum_sha256,
         (embedding_vec <=> $${vectorParam}::vector) AS distance
       FROM media_embeddings
       WHERE embedding_vec IS NOT NULL
         AND ${conditions.join(' AND ')}
       ORDER BY embedding_vec <=> $${vectorParam}::vector
       LIMIT $${limitParam}`,
      [...args, embeddingToVectorLiteral(query.queryEmbedding), limit],
    );

    const hits = (res.rows as AnnRow[]).map((row) => {
      const distance = Number(row.distance);
      return {
        mediaAssetId: row.media_asset_id,
        modelId: row.model_id,
        modelVersion: row.model_version,
        preprocessingVersion: row.preprocessing_version,
        checksumSha256: row.checksum_sha256,
        distance,
        similarity: 1 - distance,
      };
    });
    // Report the probed index capability, not just the column's presence:
    // 'pgvector_exact' when migration 326's index creation was skipped.
    return {
      hits,
      method: capability === 'ann' ? 'pgvector_ann' : 'pgvector_exact',
      degraded: false,
    };
  }

  // ── Degraded path: bounded exact scan over decoded BYTEA payloads ──────
  const capParam = args.length + 1;
  const res = await db.query(
    `SELECT
       media_asset_id, model_id, model_version, preprocessing_version,
       checksum_sha256, dimensions, norm, embedding
     FROM media_embeddings
     WHERE ${conditions.join(' AND ')}
     ORDER BY generated_at DESC
     LIMIT $${capParam}`,
    [...args, BYTEA_SCAN_CAP],
  );

  const queryNorm = computeL2Norm(query.queryEmbedding);
  let skippedRows = 0;
  const scored: NearestMediaEmbeddingHit[] = [];

  for (const row of res.rows as ScanRow[]) {
    if (!row.embedding) {
      skippedRows++;
      continue;
    }
    const buffer = Buffer.isBuffer(row.embedding)
      ? row.embedding
      : Buffer.from(row.embedding);
    // A payload that disagrees with its declared dimensions is corrupt —
    // skip it rather than decode a wrong-length vector. Rows whose declared
    // dimensionality differs from the query vector's are an incomparable
    // vector space — never score a shared-prefix dot product across spaces.
    if (
      row.dimensions !== query.queryEmbedding.length ||
      buffer.length !== row.dimensions * 4
    ) {
      skippedRows++;
      continue;
    }
    const candidate = deserialiseEmbedding(buffer);
    const candidateNorm = Number(row.norm);
    const similarity =
      queryNorm > 0 && candidateNorm > 0
        ? dotProduct(query.queryEmbedding, candidate) / (queryNorm * candidateNorm)
        : 0;
    scored.push({
      mediaAssetId: row.media_asset_id,
      modelId: row.model_id,
      modelVersion: row.model_version,
      preprocessingVersion: row.preprocessing_version,
      checksumSha256: row.checksum_sha256,
      similarity,
      distance: 1 - similarity,
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);

  return {
    hits: scored.slice(0, limit),
    method: 'bytea_exact_scan',
    degraded: true,
    degradedReason:
      capability === 'none' ? 'pgvector_not_installed' : 'dimension_mismatch',
    scannedRows: res.rows.length,
    scanTruncated: res.rows.length >= BYTEA_SCAN_CAP,
    skippedRows,
  };
}
