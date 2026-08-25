-- 175_refund_execution.sql
-- Gate 10: Transactional/idempotent refund execution with provider
--   reconciliation and unknown-outcome recording.
-- Gate 12: Maker-checker protection for operator overrides above thresholds.

-- Refund execution ledger — one row per refund attempt (idempotent by request_hash)
CREATE TABLE IF NOT EXISTS refund_executions (
  id TEXT PRIMARY KEY DEFAULT ('rex_' || encode(gen_random_bytes(12), 'hex')),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  return_case_id TEXT REFERENCES return_cases(id) ON DELETE SET NULL,
  -- Idempotency: hash of (order_id, amount_gbp, initiator_id, reason)
  request_hash TEXT NOT NULL UNIQUE,
  -- Amount
  amount_gbp NUMERIC(10,2) NOT NULL,
  -- Initiator
  initiator_id TEXT NOT NULL,
  initiator_role TEXT NOT NULL,
  -- Provider reconciliation
  provider TEXT,
  provider_refund_id TEXT,
  provider_status TEXT,
  provider_response JSONB,
  -- Outcome
  status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'succeeded' | 'failed' | 'unknown'
  -- 'unknown' = provider call timed out or returned ambiguous result
  failure_reason TEXT,
  -- Reconciliation
  reconciled_at TIMESTAMPTZ,
  reconciliation_notes TEXT,
  -- Maker-checker (Gate 12)
  maker_id TEXT,
  checker_id TEXT,
  maker_check_status TEXT NOT NULL DEFAULT 'single_approval',
  -- 'single_approval' | 'pending_check' | 'checked' | 'rejected'
  maker_check_threshold_gbp NUMERIC(10,2) NOT NULL DEFAULT 100.00,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_executions_order ON refund_executions(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_executions_status ON refund_executions(status);
CREATE INDEX IF NOT EXISTS idx_refund_executions_provider ON refund_executions(provider, provider_status);

-- Operator override audit chain (Gate 12)
CREATE TABLE IF NOT EXISTS operator_override_audit (
  id TEXT PRIMARY KEY DEFAULT ('ooa_' || encode(gen_random_bytes(12), 'hex')),
  -- What was overridden
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  -- Who and why
  operator_id TEXT NOT NULL,
  operator_role TEXT NOT NULL,
  reason TEXT NOT NULL,
  -- Maker-checker
  maker_id TEXT,
  checker_id TEXT,
  maker_check_status TEXT NOT NULL DEFAULT 'single_approval',
  -- Threshold context
  threshold_gbp NUMERIC(10,2),
  amount_gbp NUMERIC(10,2),
  -- Result
  outcome TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_operator_override_audit_entity
  ON operator_override_audit(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_operator_override_audit_operator
  ON operator_override_audit(operator_id);
