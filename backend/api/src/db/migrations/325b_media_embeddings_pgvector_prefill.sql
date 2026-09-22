-- Migration 325b: pgvector prefill with the CORRECTED BYTEA->float4 codec
-- (audit Appendix D blocker 1 / section 4.3).
--
-- Why this file exists and why it is named "325b":
--   326_media_embeddings_pgvector.sql is an APPLIED migration — its committed
--   bytes are checksum-pinned by schema_migrations, so it can never be edited.
--   But its codec reconstructs the little-endian uint32 in int4 arithmetic:
--   `get_byte(...) * 16777216` overflows int32 for any high byte >= 128
--   (every negative float32), so on a populated pre-326 database with
--   pgvector installed, 326's backfill aborts mid-migration and the runner
--   never reaches the 330 fix.
--
--   The migration runner (src/db/migrate.ts) orders files lexically, and
--   '325b_' sorts strictly between '325_' and '326_':
--       '325_order_...' < '325b_media_...' < '326_media_...'
--   ('_' 0x5F < 'b' 0x62 at position 3; '5' < '6' at position 2).
--   So this file runs immediately BEFORE 326 on every pending database.
--
-- What it does (same feature-detection gate as 326):
--   1. CREATE EXTENSION IF NOT EXISTS vector — when pgvector is available.
--   2. CREATE OR REPLACE the BYTEA codec with bigint-promoted arithmetic
--      (the corrected expression shape shipped in 330).
--   3. ADD COLUMN IF NOT EXISTS embedding_vec vector(512).
--   4. Backfill with the SAME predicate as 326 but through the correct
--      codec — so when 326 runs, its own backfill finds zero matching rows
--      and never evaluates the overflowing expression. 326 then CREATE OR
--      REPLACEs the function back to the buggy version, which is harmless:
--      the function is only referenced by 326's own (now-empty) backfill,
--      and 330 re-replaces it with the fixed codec.
--
-- Databases that already applied 326: this file is still pending -> it runs
-- -> every statement is IF NOT EXISTS / IS NULL / CREATE OR REPLACE ->
-- clean no-op beyond re-asserting the corrected codec.
--
-- Known residual (documented, narrow): each migration commits in its own
-- transaction, so a media_embeddings row inserted BETWEEN this file's commit
-- and 326's backfill would still hit the buggy codec. The deployment
-- topology already prevents this — migrations run via MIGRATE_DATABASE_URL
-- as a separate step before api/worker services start, so no writer of
-- media_embeddings is live during a migration run. Do not run migrations
-- online against a deployment where the embedding worker is writing.
--
-- Everything referencing the `vector` type runs inside EXECUTE so the
-- statements are only ever parsed on servers where the type exists.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN

    EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector';

    -- Corrected codec: every get_byte term is promoted to bigint BEFORE
    -- the multiply so the uint32 reconstruction can never overflow int32.
    -- Identical arithmetic to the 330 fix.
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

    EXECUTE 'ALTER TABLE media_embeddings
               ADD COLUMN IF NOT EXISTS embedding_vec vector(512)';

    -- Backfill with the correct codec BEFORE 326's buggy expression can run.
    -- Same predicate as 326 (WHERE embedding_vec IS NULL AND dimensions = 512
    -- AND octet_length(embedding) = dimensions * 4): afterwards, 326's own
    -- backfill matches zero rows and the int4-overflow path is never reached.
    EXECUTE $backfill$
      UPDATE media_embeddings
      SET embedding_vec = _media_embeddings_bytea_le_to_float4(embedding, dimensions)::vector
      WHERE embedding_vec IS NULL
        AND dimensions = 512
        AND octet_length(embedding) = dimensions * 4
    $backfill$;

    RAISE NOTICE '325b_media_embeddings_pgvector_prefill: pgvector available — corrected codec installed, embedding_vec added and backfilled ahead of 326';
  ELSE
    -- Deterministic no-op marker, same gate as 326: pgvector is not
    -- installable on this server, so there is nothing to prefill.
    RAISE NOTICE '325b_media_embeddings_pgvector_prefill: pgvector (vector) extension not available — no-op by design (matches 326 feature detection)';
  END IF;
END $$;
