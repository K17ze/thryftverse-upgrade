-- Rollback for 330_media_embeddings_bytea_codec_bigint.
--
-- The up migration replaces a data-corrupting codec (int4 overflow on any
-- negative float32) with a corrected one. Rolling back would reintroduce
-- the overflow, so the down file is a deliberate no-op: the corrected
-- function and the backfilled embedding_vec values it produced are left
-- in place. The 326 down migration remains the path that removes the
-- column/function/view entirely.
DO $$
BEGIN
  RAISE NOTICE '330_media_embeddings_bytea_codec_bigint: down is a no-op — reverting would restore a codec that overflows on negative floats';
END $$;
