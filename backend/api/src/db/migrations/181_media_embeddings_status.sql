-- 181_media_embeddings_status.sql
-- Add a status column and L2 norm to media_embeddings so placeholder
-- (zero-vector) rows can be excluded from any serving projection without
-- decoding the embedding blob. A serving view `media_embeddings_serving`
-- exposes only rows with status = 'ready' and a non-zero norm, so downstream
-- vector search never reads a placeholder vector by accident.

ALTER TABLE media_embeddings
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'placeholder'
    CHECK (status IN ('placeholder', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS norm DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill existing rows: any row whose norm is 0 is a placeholder.
UPDATE media_embeddings
  SET status = 'placeholder', norm = 0
  WHERE norm = 0;

-- Index for fast filtering on serving queries.
CREATE INDEX IF NOT EXISTS idx_media_embeddings_status_ready
  ON media_embeddings (model_id, model_version) WHERE status = 'ready';

-- Serving view: only ready rows with a non-zero norm.
CREATE OR REPLACE VIEW media_embeddings_serving AS
  SELECT
    media_asset_id, model_id, model_version, preprocessing_version,
    checksum_sha256, dimensions, embedding, generated_at, quality_flags,
    norm
  FROM media_embeddings
  WHERE status = 'ready' AND norm > 0;
