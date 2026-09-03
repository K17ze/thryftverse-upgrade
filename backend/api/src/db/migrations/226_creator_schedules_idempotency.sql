-- Migration 226: Add idempotency_key to creator_schedules.
--
-- Schedule creation is now atomic (single transaction with FOR UPDATE
-- lock on the document row) and supports an idempotency key so the
-- client can resolve unknown outcomes after a dropped network response.
-- The key is stored on the schedule row and looked up by the
-- reconciliation endpoint GET /creator/documents/:id/schedule/:key.

ALTER TABLE creator_schedules
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Index for idempotency-key lookup (unknown-outcome reconciliation).
CREATE INDEX IF NOT EXISTS creator_schedules_idempotency_idx
  ON creator_schedules (document_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
