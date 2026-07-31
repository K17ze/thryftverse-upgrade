-- 095_webhook_outbox.sql
-- Dead-letter queue for webhook events that failed processing.
-- The webhook handler wraps post-dedup processing in try/catch; on failure,
-- the event is inserted here with exponential backoff for retry.

CREATE TABLE IF NOT EXISTS webhook_processing_outbox (
  id BIGSERIAL PRIMARY KEY,
  gateway_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  intent_id TEXT,
  raw_payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'dead')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gateway_id, provider_event_id)
);

CREATE INDEX IF NOT EXISTS webhook_outbox_retry_idx
  ON webhook_processing_outbox (next_retry_at, status)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS webhook_outbox_status_idx
  ON webhook_processing_outbox (status, updated_at DESC);
