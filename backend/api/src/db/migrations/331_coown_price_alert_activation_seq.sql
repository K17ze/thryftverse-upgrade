-- 331_coown_price_alert_activation_seq.sql
--
-- SEP20-FIN-12 — re-armed Co-Own price alerts could never emit a second
-- notification. PATCH /co-own/price-alerts/:id clears triggered_at on
-- re-activation, but the alert evaluator deduplicated its outbox event by
-- the lifetime alert id (`coown_price_alert:<id>`) and the notification
-- drain deduplicated by the same lifetime id — so the second trigger
-- collided with the first event and was silently swallowed.
--
-- Fix: a persistent activation sequence on the alert row, incremented each
-- time a triggered alert is re-armed. The evaluator carries the sequence
-- into the outbox deduplication key and the notification idempotency key,
-- preserving exactly-once delivery per activation while allowing a fresh
-- activation to notify again.
--
-- Existing rows default to activation_seq = 1: their first (and only)
-- activation to date. Additive and idempotent.

ALTER TABLE coown_price_alerts
  ADD COLUMN IF NOT EXISTS activation_seq INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN coown_price_alerts.activation_seq IS
  'Monotonic activation counter — incremented whenever a triggered alert is re-armed (PATCH active=true clearing triggered_at). Carried into the outbox deduplication key and notification idempotency key so exactly-once delivery is scoped per activation, not per alert lifetime.';
