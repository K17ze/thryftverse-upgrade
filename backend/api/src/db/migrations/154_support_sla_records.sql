-- 153: Support SLA records — per-case SLA clock tracking
--
-- The SLA policies table (support_sla_policies) was introduced in migration
-- 151_support_conversations.sql with a seconds-based schema. This migration
-- adds the per-case SLA record table that tracks first-response, next-response,
-- and resolution deadlines, plus pause/resume and breach state.
--
-- Design:
--   - One SLA record per case (enforced by the unique index on case_id).
--   - Deadlines are stored as absolute TIMESTAMPTZ values computed from the
--     policy's seconds-based targets at creation time.
--   - The SLA clock can be paused (e.g. when awaiting customer input) and
--     resumed; paused_at records when the clock stopped.
--   - breached_at is set the first time a deadline is detected to have passed.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS support_sla_records (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  policy_id TEXT NOT NULL REFERENCES support_sla_policies(id),
  first_response_due_at TIMESTAMPTZ,
  next_response_due_at TIMESTAMPTZ,
  resolution_due_at TIMESTAMPTZ,
  paused_reason TEXT,
  paused_at TIMESTAMPTZ,
  breached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS support_sla_records_case_uidx
  ON support_sla_records (case_id);

CREATE INDEX IF NOT EXISTS support_sla_records_breach_idx
  ON support_sla_records (breached_at)
  WHERE breached_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_sla_records_policy_idx
  ON support_sla_records (policy_id);

COMMENT ON TABLE support_sla_records IS 'Per-case SLA clock: first-response, next-response, and resolution deadlines with pause/resume and breach tracking';
