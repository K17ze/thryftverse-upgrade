-- 108_webhook_event_dedup.sql
-- Stripe webhook event-ID deduplication table.
--
-- The 2026 Stripe Webhook Hardening Checklist requires explicit deduplication
-- of webhook event processing by Stripe Event ID. While the existing
-- payment_webhook_events table deduplicates by (gateway_id, provider_event_id),
-- this dedicated table provides a provider-agnostic, event-ID-first dedup
-- surface that can be queried independently and extended to other providers.
--
-- The migration runner wraps each file in BEGIN/COMMIT with ROLLBACK on error,
-- so the DDL below is idempotent (IF NOT EXISTS) to match the established pattern.

CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'stripe',
  payload_hash VARCHAR(64) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id
  ON webhook_events(event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_type
  ON webhook_events(provider, event_type);
