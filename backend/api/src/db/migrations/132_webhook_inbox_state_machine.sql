-- Webhook durable inbox state machine.
--
-- Upgrades the webhook_events table from a pre-processing dedup marker
-- (which persists on rollback and discards valid settlement on retry) to
-- a durable inbox with a state machine: received → processing → succeeded
-- | failed, plus raw body / signature storage for audit and lease columns
-- for safe recovery.
--
-- Also adds lease columns to webhook_processing_outbox so the retry sweep
-- can claim items without holding a long transaction lock.

-- ── 1. webhook_events: add state machine + raw envelope + lease ─────────────
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'succeeded', 'failed', 'dead')),
  ADD COLUMN IF NOT EXISTS raw_body TEXT,
  ADD COLUMN IF NOT EXISTS signature_header TEXT,
  ADD COLUMN IF NOT EXISTS gateway_id TEXT,
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- processed_at is now nullable — it is set only AFTER processing succeeds.
-- Existing rows keep their processed_at (they were processed before this
-- migration); new rows start with processed_at = NULL.
ALTER TABLE webhook_events
  ALTER COLUMN processed_at DROP NOT NULL;

-- Index for the recovery sweep: find items eligible for retry.
CREATE INDEX IF NOT EXISTS idx_webhook_events_retry
  ON webhook_events (next_retry_at, status)
  WHERE status IN ('received', 'failed');

-- Index for lease expiry reclamation.
CREATE INDEX IF NOT EXISTS idx_webhook_events_lease
  ON webhook_events (lease_expires_at)
  WHERE status = 'processing' AND lease_expires_at IS NOT NULL;

-- ── 2. webhook_processing_outbox: add lease columns ─────────────────────────
ALTER TABLE webhook_processing_outbox
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_lease
  ON webhook_processing_outbox (lease_expires_at)
  WHERE status = 'processing' AND lease_expires_at IS NOT NULL;
