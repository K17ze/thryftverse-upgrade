-- Migration 167: ML promotion governance — immutable audit trail for model promotion decisions
--
-- Implements the governed promotion gate for the ThryftVerse fraud detection
-- system. The rule-based engine is the champion; a shadow ML model scores in
-- parallel via fraud_scoring_ledger. This table records every promotion gate
-- evaluation and the human operator's decision, creating an immutable audit
-- trail for ML governance.
--
-- Design (AGENTS.md §11 — Truthful, anti-AI design policy):
-- - The ML model is NEVER auto-promoted. A human operator must review the
--   metrics and explicitly approve. This table records that approval.
-- - All rows are append-only — never updated or deleted. This is the
--   immutable audit trail required for ML governance and regulatory review.
-- - The metrics and gate result are stored as JSONB snapshots so that the
--   decision can be reconstructed exactly as it was at evaluation time,
--   even if the gate thresholds or computation logic change later.
--
-- Note: Migration 165 was already allocated to review_media_and_responses,
-- so this governance migration uses 167 (166 is seller_trust_table).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS ml_promotion_decisions (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  decision_id TEXT NOT NULL UNIQUE,          -- stable external id (ml_promo_xxx)
  metrics_json JSONB NOT NULL,               -- PromotionMetrics snapshot at evaluation time
  gate_result_json JSONB NOT NULL,           -- PromotionGateResult snapshot at evaluation time
  decision TEXT NOT NULL CHECK (decision IN ('promote', 'hold', 'reject')),
  operator_id TEXT NOT NULL,                 -- the admin who made the decision
  justification TEXT NOT NULL,               -- human-readable rationale for the decision
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Latest-decision query (ORDER BY created_at DESC LIMIT 1).
CREATE INDEX IF NOT EXISTS ml_promotion_decisions_created_at_idx
  ON ml_promotion_decisions (created_at DESC);

-- Operator audit trail (who promoted/held/rejected and when).
CREATE INDEX IF NOT EXISTS ml_promotion_decisions_operator_idx
  ON ml_promotion_decisions (operator_id, created_at DESC);

COMMENT ON TABLE ml_promotion_decisions IS
  'Immutable audit trail for ML model promotion governance. Records every promotion gate evaluation and the human operator decision. The ML model is never auto-promoted — an operator must explicitly choose promote/hold/reject after reviewing the metrics. Append-only: rows are never updated or deleted.';
COMMENT ON COLUMN ml_promotion_decisions.metrics_json IS
  'JSONB snapshot of the PromotionMetrics at evaluation time: totalShadowDecisions, agreementRate, falsePositiveRate, falseNegativeRate, precision, recall, calibrationError, evaluatedAt.';
COMMENT ON COLUMN ml_promotion_decisions.gate_result_json IS
  'JSONB snapshot of the PromotionGateResult at evaluation time: canPromote, blockingReasons, warnings, metrics, evaluatedAt.';
COMMENT ON COLUMN ml_promotion_decisions.decision IS
  'promote: operator approved promoting the shadow ML model to primary. hold: operator deferred the decision (collect more data). reject: operator rejected promotion (metrics insufficient or model unsuitable).';
COMMENT ON COLUMN ml_promotion_decisions.justification IS
  'Human-readable rationale for the decision. Required — an operator must justify every promotion, hold or rejection for the audit trail.';
