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
   *   - 'pgvector_ann'     — `embedding_vec <=>` ordering inside Postgres.
   *   - 'bytea_exact_scan' — in-application cosine scan over decoded BYTEA.
   */
  method: 'pgvector_ann' | 'bytea_exact_scan';
  /** true when the pgvector fast path was unavailable and the degraded scan ran. */
  degraded: boolean;
  degradedReason?: 'pgvector_not_installed';
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

  // A zero or empty query vector has undefined cosine similarity on both
  // paths (pgvector `<=>` returns NaN for zero-norm vectors; the BYTEA scan
  // would report all-zero similarity). Return an honest empty result rather
  // than a meaningless ranking — `method`/`degraded` still report which
  // path is provisioned on this environment.
  if (
    query.queryEmbedding.length === 0 ||
    computeL2Norm(query.queryEmbedding) === 0
  ) {
    const vectorColumn = await hasMediaEmbeddingVectorColumn(db);
    return {
      hits: [],
      method: vectorColumn ? 'pgvector_ann' : 'bytea_exact_scan',
      degraded: !vectorColumn,
      degradedReason: vectorColumn ? undefined : 'pgvector_not_installed',
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
  if (filter.mediaAssetIds && filter.mediaAssetIds.length > 0) {
    args.push(filter.mediaAssetIds);
    conditions.push(`media_asset_id = ANY($${args.length})`);
  }

  if (await hasMediaEmbeddingVectorColumn(db)) {
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
    return { hits, method: 'pgvector_ann', degraded: false };
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
    // skip it rather than decode a wrong-length vector.
    if (buffer.length !== row.dimensions * 4) {
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
    degradedReason: 'pgvector_not_installed',
    scannedRows: res.rows.length,
    scanTruncated: res.rows.length >= BYTEA_SCAN_CAP,
    skippedRows,
  };
}
