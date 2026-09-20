-- Migration 326: pgvector upgrade path for media_embeddings (audit R20).
--
-- Migration 145 documented this upgrade path: the `embedding` BYTEA column
-- is a placeholder serialisation (little-endian float32) until pgvector is
-- available. This migration implements that path, feature-detected rather
-- than forced — pgvector is optional infrastructure and some environments
-- (dev, CI, minimal hosts) cannot install it.
--
-- Behaviour:
--   * If the `vector` extension is installable on this server
--     (pg_available_extensions), the migration:
--       1. CREATE EXTENSION IF NOT EXISTS vector;
--       2. Adds media_embeddings.embedding_vec vector(512) — 512 matches the
--          embedding pipeline output (PLACEHOLDER_DIMENSIONS in
--          mediaEmbeddingHandler.ts). Rows with a different `dimensions`
--          value are left NULL rather than truncated.
--       3. Backfills embedding_vec by decoding each BYTEA payload via a
--          purpose-built codec function (pure-SQL IEEE-754 decode).
--       4. Creates an ANN index — HNSW (pgvector >= 0.5) with an IVFFlat
--          fallback for older builds; if neither access method exists the
--          column still serves exact-neighbour scans.
--       5. Recreates media_embeddings_serving to expose embedding_vec.
--   * If `vector` is NOT available, the migration is a deterministic no-op:
--     a RAISE NOTICE marks the skip and the schema is left untouched. The
--     BYTEA column remains the only storage format and the serving layer
--     (lib/mediaEmbeddings.ts) feature-detects the missing column via
--     pg_attribute and runs its degraded BYTEA scan.
--
-- Everything referencing the `vector` type runs inside EXECUTE so the
-- statements are only ever parsed on servers where the type exists.
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE throughout; re-running after
-- installing pgvector upgrades in place.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN

    EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector';

    -- BYTEA (little-endian float32) -> float4[] codec. Kept as a named
    -- function so the decode logic is inspectable and reusable by manual
    -- backfills. Returns NULL when the payload length disagrees with the
    -- declared dimensionality (corrupt row — never decode a truncated blob).
    EXECUTE $codec$
      CREATE OR REPLACE FUNCTION _media_embeddings_bytea_le_to_float4(
        p_embedding bytea,
        p_dimensions integer
      ) RETURNS float4[]
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $fn$
      DECLARE
        v_result float4[] := '{}'::float4[];
        v_i      integer;
        v_u      bigint;
        v_sign   integer;
        v_exp    integer;
        v_mant   bigint;
        v_val    double precision;
      BEGIN
        IF octet_length(p_embedding) <> p_dimensions * 4 THEN
          RETURN NULL;
        END IF;
        FOR v_i IN 0 .. p_dimensions - 1 LOOP
          -- Reassemble the little-endian uint32 bit pattern.
          v_u := get_byte(p_embedding, v_i * 4)
               + get_byte(p_embedding, v_i * 4 + 1) * 256
               + get_byte(p_embedding, v_i * 4 + 2) * 65536
               + get_byte(p_embedding, v_i * 4 + 3) * 16777216;
          IF v_u >= 2147483648 THEN
            v_sign := -1;
            v_u := v_u - 2147483648;
          ELSE
            v_sign := 1;
          END IF;
          v_exp  := (v_u / 8388608)::integer;   -- bits 23..30
          v_mant := v_u % 8388608;              -- bits 0..22
          IF v_exp = 255 THEN
            v_val := CASE WHEN v_mant = 0
                          THEN 'Infinity'::float8
                          ELSE 'NaN'::float8 END;
          ELSIF v_exp = 0 THEN
            -- Subnormal (or signed zero): mantissa has no implicit leading 1.
            v_val := (v_mant::float8 / 8388608.0) * power(2.0::float8, -126);
          ELSE
            v_val := (1.0 + v_mant::float8 / 8388608.0)
                   * power(2.0::float8, v_exp - 127);
          END IF;
          v_result := v_result || (v_sign * v_val)::float4;
        END LOOP;
        RETURN v_result;
      END;
      $fn$;
    $codec$;

    EXECUTE 'ALTER TABLE media_embeddings
               ADD COLUMN IF NOT EXISTS embedding_vec vector(512)';

    -- Backfill: decode BYTEA -> vector for every 512-dim row whose payload
    -- is intact. Rows of other dimensionality stay NULL by design.
    EXECUTE $backfill$
      UPDATE media_embeddings
      SET embedding_vec = _media_embeddings_bytea_le_to_float4(embedding, dimensions)::vector
      WHERE embedding_vec IS NULL
        AND dimensions = 512
        AND octet_length(embedding) = dimensions * 4
    $backfill$;

    -- ANN index. HNSW needs pgvector >= 0.5; older builds fall back to
    -- IVFFlat. If neither access method exists the column still serves
    -- exact (<=>) scans, so a missing index is a notice, not a failure.
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS media_embeddings_embedding_vec_hnsw_idx
                 ON media_embeddings USING hnsw (embedding_vec vector_cosine_ops)
                 WHERE embedding_vec IS NOT NULL';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '326_media_embeddings_pgvector: hnsw unavailable (%); falling back to ivfflat', SQLERRM;
      BEGIN
        EXECUTE 'CREATE INDEX IF NOT EXISTS media_embeddings_embedding_vec_ivfflat_idx
                   ON media_embeddings USING ivfflat (embedding_vec vector_cosine_ops)
                   WITH (lists = 100)
                   WHERE embedding_vec IS NOT NULL';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '326_media_embeddings_pgvector: no ANN index could be created (%); embedding_vec still serves exact-neighbour scans', SQLERRM;
      END;
    END;

    -- Expose the vector column on the serving view (new column appended at
    -- the end, per CREATE OR REPLACE VIEW rules). BYTEA `embedding` stays in
    -- the projection so existing readers keep working.
    EXECUTE $view$
      CREATE OR REPLACE VIEW media_embeddings_serving AS
        SELECT
          media_asset_id, model_id, model_version, preprocessing_version,
          checksum_sha256, dimensions, embedding, generated_at, quality_flags,
          norm, embedding_vec
        FROM media_embeddings
        WHERE status = 'ready' AND norm > 0
    $view$;

    RAISE NOTICE '326_media_embeddings_pgvector: pgvector available — embedding_vec vector(512) added, backfilled, indexed';
  ELSE
    -- Deterministic no-op marker: pgvector is not installed/installable on
    -- this server. The migration ledger still records this file as applied;
    -- lib/mediaEmbeddings.ts feature-detects the missing column at runtime.
    RAISE NOTICE '326_media_embeddings_pgvector: pgvector (vector) extension not available — media_embeddings remains BYTEA-only (no-op by design)';
  END IF;
END $$;
