-- Transactional domain outbox.
--
-- Consequential workflows insert an event in the same transaction as their
-- aggregate mutation. A retryable worker claims events with SKIP LOCKED and
-- records completion or bounded backoff/dead-letter state.

CREATE TABLE IF NOT EXISTS domain_outbox (
  id TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1 CHECK (event_version > 0),
  payload JSONB NOT NULL,
  actor_id TEXT,
  correlation_id TEXT,
  causation_id TEXT,
  idempotency_key TEXT,
  deduplication_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS domain_outbox_pending_idx
  ON domain_outbox (available_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS domain_outbox_aggregate_idx
  ON domain_outbox (aggregate_type, aggregate_id, created_at DESC);

COMMENT ON TABLE domain_outbox IS
  'Transactional events awaiting retryable asynchronous delivery; dead rows are retained for operator replay.';

