-- Migration 177: Sync operation idempotency table for /sync/push
--
-- Stores the result of processed operationId values so retried pushes
-- (after network drops, app kills) return the cached result instead of
-- re-applying the mutation.

CREATE TABLE IF NOT EXISTS sync_operation_idempotency (
  operation_id   TEXT    PRIMARY KEY NOT NULL,
  entity_type    TEXT    NOT NULL,
  entity_id      TEXT    NOT NULL,
  operation      TEXT    NOT NULL,
  result_status  TEXT    NOT NULL,
  result_rev     BIGINT  NOT NULL DEFAULT 0,
  result_message TEXT,
  applied_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
