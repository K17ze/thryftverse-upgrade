-- Rollback for 326_media_embeddings_pgvector.
--
-- Drops the vector column, its ANN index, and the BYTEA decode function,
-- then restores the BYTEA-only serving view exactly as migration 181 left
-- it. The `vector` EXTENSION itself is intentionally left installed —
-- dropping an extension is a destructive, environment-level decision (other
-- tables or tooling may use the type) and is never part of an automated
-- rollback. On environments where the up-migration was a no-op every
-- statement below is itself a no-op (IF EXISTS / identical view body).

DROP VIEW IF EXISTS media_embeddings_serving;
DROP INDEX IF EXISTS media_embeddings_embedding_vec_hnsw_idx;
DROP INDEX IF EXISTS media_embeddings_embedding_vec_ivfflat_idx;
ALTER TABLE media_embeddings DROP COLUMN IF EXISTS embedding_vec;
DROP FUNCTION IF EXISTS _media_embeddings_bytea_le_to_float4(bytea, integer);

-- Restore the migration-181 serving view (BYTEA projection, no vector col).
CREATE OR REPLACE VIEW media_embeddings_serving AS
  SELECT
    media_asset_id, model_id, model_version, preprocessing_version,
    checksum_sha256, dimensions, embedding, generated_at, quality_flags,
    norm
  FROM media_embeddings
  WHERE status = 'ready' AND norm > 0;
