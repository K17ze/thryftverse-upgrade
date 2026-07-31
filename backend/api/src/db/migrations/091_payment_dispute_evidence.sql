-- 091_payment_dispute_evidence.sql
-- Add evidence submission tracking to payment_disputes so the platform can
-- respond to chargebacks instead of auto-losing them.

ALTER TABLE payment_disputes
  ADD COLUMN IF NOT EXISTS evidence_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evidence_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_provider_ref TEXT;

-- Append-only audit of evidence submissions and dispute status changes.
CREATE TABLE IF NOT EXISTS payment_dispute_events (
  id BIGSERIAL PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES payment_disputes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('evidence_submitted', 'evidence_accepted', 'evidence_rejected', 'status_changed', 'deadline_warning')
  ),
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_dispute_events_dispute_idx
  ON payment_dispute_events (dispute_id, created_at DESC);

-- Index for finding disputes approaching their evidence deadline.
CREATE INDEX IF NOT EXISTS payment_disputes_evidence_due_idx
  ON payment_disputes (evidence_due_at)
  WHERE evidence_due_at IS NOT NULL AND evidence_submitted_at IS NULL;
