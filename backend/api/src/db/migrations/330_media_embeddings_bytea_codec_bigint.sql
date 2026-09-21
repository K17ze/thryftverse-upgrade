-- Migration 330: fix the int4 overflow in the 326 BYTEA->float4 codec
-- (audit N1).
--
-- 326_media_embeddings_pgvector.sql originally reassembled the
-- little-endian uint32 bit pattern with
--     get_byte(...) + get_byte(...) * 256 + get_byte(...) * 65536
--     + get_byte(...) * 16777216
-- evaluated in int4 arithmetic before assignment to the bigint variable.
-- Any high byte >= 128 — i.e. every negative float32 — overflows int32
-- (128 * 16777216 = 2147483648) and raises "integer out of range", aborting
-- the backfill and any manual decode.
--
-- This migration is the fix for EVERY environment. 326 keeps its
-- committed bytes untouched: schema_migrations stores a per-file
-- checksum, so editing 326 in place would abort the migration run on any
-- database that already applied it. Instead this migration CREATE OR
-- REPLACEs the decoder with per-term bigint promotion and re-runs the
-- backfill predicate for any rows still missing embedding_vec. On fresh
-- databases 326 installs the buggy codec and this migration immediately
-- replaces it; on databases where 326 is already applied it repairs the
-- existing function. Same result either way.
--
-- Feature-detected like 326: when pgvector / embedding_vec are absent the
-- migration is a deterministic no-op (the BYTEA codec function is only
-- meaningful once the vector column exists).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector')
     AND EXISTS (
       SELECT 1 FROM pg_attribute
       -- to_regclass (not '...'::regclass): returns NULL instead of
       -- raising undefined_table when media_embeddings is absent, so the
       -- documented no-op branch actually holds on such databases.
       WHERE attrelid = to_regclass('public.media_embeddings')
         AND attname = 'embedding_vec'
         AND NOT attisdropped
     )
  THEN
    -- Corrected codec: every get_byte term is promoted to bigint BEFORE
    -- the multiply so the uint32 reconstruction can never overflow int32.
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
          -- Reassemble the little-endian uint32 bit pattern in bigint
          -- arithmetic (int4 * 16777216 overflows for bytes >= 128).
          v_u := get_byte(p_embedding, v_i * 4)::bigint
               + get_byte(p_embedding, v_i * 4 + 1)::bigint * 256
               + get_byte(p_embedding, v_i * 4 + 2)::bigint * 65536
               + get_byte(p_embedding, v_i * 4 + 3)::bigint * 16777216;
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

    -- Re-run the backfill predicate so rows still missing embedding_vec
    -- (e.g. decoded under the pre-fix function on a DB where the migration
    -- ledger predates checksums) are populated by the corrected codec.
    EXECUTE $backfill$
      UPDATE media_embeddings
      SET embedding_vec = _media_embeddings_bytea_le_to_float4(embedding, dimensions)::vector
      WHERE embedding_vec IS NULL
        AND dimensions = 512
        AND octet_length(embedding) = dimensions * 4
    $backfill$;

    RAISE NOTICE '330_media_embeddings_bytea_codec_bigint: decoder replaced with bigint-safe arithmetic and backfill re-applied';
  ELSE
    RAISE NOTICE '330_media_embeddings_bytea_codec_bigint: pgvector/embedding_vec absent — no-op by design (matches 326 feature detection)';
  END IF;
END $$;
