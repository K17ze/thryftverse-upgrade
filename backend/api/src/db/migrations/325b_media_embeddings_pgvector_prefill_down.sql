-- Rollback for 325b_media_embeddings_pgvector_prefill.
--
-- The up migration installs the CORRECTED BYTEA codec and backfills
-- embedding_vec ahead of 326. Rolling it back would either restore the
-- int4-overflowing codec or drop data that 326/330 treat as authoritative,
-- so the down file is a deliberate no-op: the 326 down migration remains
-- the path that removes the column/function/view entirely.
DO $$
BEGIN
  RAISE NOTICE '325b_media_embeddings_pgvector_prefill: down is a no-op — the corrected codec and backfilled column are owned by the 326/330 lifecycle';
END $$;
