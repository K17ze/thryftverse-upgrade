-- Migration 229: Listing batch idempotency.
--
-- The seller-hub batch-command endpoint accepts an idempotency key from the
-- client but previously never persisted it. Repeated requests with the same
-- key could re-run side effects. This table stores the keyed response so
-- replays return the cached result instead of re-processing.

CREATE TABLE IF NOT EXISTS listing_batch_idempotency (
  seller_id TEXT NOT NULL,
  command TEXT NOT NULL CHECK (command IN ('pause', 'resume', 'delete')),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (seller_id, command, idempotency_key)
);

CREATE INDEX IF NOT EXISTS listing_batch_idempotency_created_idx
  ON listing_batch_idempotency (created_at);
