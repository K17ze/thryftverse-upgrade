-- Migration 145: Media embeddings table
--
-- Offline, versioned embedding generation for approved media assets.
--
-- The current visual search (visualSimilarity.ts) computes colour histograms
-- at request time — an honest heuristic that cannot understand object
-- identity, style, or silhouette. The upgrade path (ML flagship report §6.3,
-- §6.4) is offline embedding generation with model-version lineage: each
-- approved media asset gets a dense vector produced by a versioned model,
-- stored alongside the checksum of the exact bytes that were embedded, so an
-- auditor can answer "what model produced this vector, from what bytes, and
-- is it still current?"
--
-- pgvector is NOT installed in this environment. The embedding column is
-- BYTEA — a serialised float32 array — so the table can be created and
-- populated today without an extension dependency. When pgvector is
-- available, a follow-up migration should:
--   1. CREATE EXTENSION IF NOT EXISTS vector;
--   2. ALTER TABLE media_embeddings ADD COLUMN embedding_vec vector(512)
--      USING ... (convert existing BYTEA rows);
--   3. Create an HNSW index on embedding_vec for approximate nearest
--      neighbour search.
-- Until then, vector similarity is computed in application code after
-- fetching candidate embeddings. This is acceptable for offline backfill and
-- low-volume evaluation but will not scale to production search.
--
-- Schema follows the report §6.3 specification:
--   PRIMARY KEY(media_asset_id, model_id, model_version, preprocessing_version)
-- This means the same asset can carry embeddings from multiple models or
-- preprocessing pipelines, and a new model version produces a new row rather
-- than mutating the old one — preserving lineage.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS media_embeddings (
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  preprocessing_version TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  dimensions INTEGER NOT NULL CHECK (dimensions > 0),
  -- BYTEA: serialised little-endian float32 array. See header comment for
  -- the pgvector upgrade path.
  embedding BYTEA NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Quality flags from the preprocessing stage: blur, exposure, resolution,
  -- occlusion, etc. Stored as JSONB so the schema can evolve without a
  -- migration. Example:
  --   {"blur_score": 0.82, "exposure": "normal", "min_resolution_met": true}
  quality_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (media_asset_id, model_id, model_version, preprocessing_version)
);

-- Lookup by model (dashboard / "how many assets have model X embeddings").
CREATE INDEX IF NOT EXISTS media_embeddings_model_idx
  ON media_embeddings (model_id, model_version);

-- Integrity / dedup lookup by content hash (detect when the same bytes were
-- embedded under a different asset id).
CREATE INDEX IF NOT EXISTS media_embeddings_checksum_idx
  ON media_embeddings (checksum_sha256);

-- Recency scan (backfill progress / "what was generated recently").
CREATE INDEX IF NOT EXISTS media_embeddings_generated_at_idx
  ON media_embeddings (generated_at DESC);

COMMENT ON TABLE media_embeddings IS
  'Offline, versioned media embeddings. Each row is the immutable product of a (model, model_version, preprocessing_version) tuple applied to a specific media asset whose bytes hash to checksum_sha256. BYTEA embedding column is a placeholder until pgvector is installed.';
COMMENT ON COLUMN media_embeddings.media_asset_id IS
  'FK to media_assets(id). The asset whose canonical bytes were embedded.';
COMMENT ON COLUMN media_embeddings.model_id IS
  'Stable model identifier across versions (e.g. siglip2-so400m). Paired with model_version it identifies the exact model that produced the vector.';
COMMENT ON COLUMN media_embeddings.model_version IS
  'Immutable version tag for the model (e.g. v1.0.0). Combined with model_id and preprocessing_version it is part of the primary key.';
COMMENT ON COLUMN media_embeddings.preprocessing_version IS
  'Version of the preprocessing / feature-extraction pipeline (resize, normalisation, padding). Distinct from model_version so pipeline-only changes are tracked independently.';
COMMENT ON COLUMN media_embeddings.checksum_sha256 IS
  'SHA-256 of the exact image bytes that were embedded. If the asset is re-encoded or re-uploaded, the checksum changes and a new embedding row is produced — the old row is preserved for lineage.';
COMMENT ON COLUMN media_embeddings.dimensions IS
  'Dimensionality of the embedding vector. Must match the model output size. Stored explicitly so callers can validate before deserialising the BYTEA payload.';
COMMENT ON COLUMN media_embeddings.embedding IS
  'Serialised embedding vector (little-endian float32 array, length = dimensions). BYTEA is used because pgvector is not installed; see migration header for the upgrade path to a vector(512) column.';
COMMENT ON COLUMN media_embeddings.generated_at IS
  'Timestamp the embedding was generated and stored. Used for backfill progress tracking.';
COMMENT ON COLUMN media_embeddings.quality_flags IS
  'JSONB quality checks from preprocessing: blur_score, exposure, min_resolution_met, occlusion_detected, etc. Schema is intentionally open so the pipeline can add checks without a migration.';
