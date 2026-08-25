-- Migration 148: Fraud scoring ledger
--
-- The rule-based fraud detector (backend/api/src/lib/fraudDetection.ts) is the
-- champion. A trained ML challenger (LightGBM binary classification) may shadow
-- it for offline comparison without affecting user-facing decisions. This
-- table logs both the rule-engine and shadow-model scores for every fraud
-- check, enabling offline agreement analysis, calibration, and eventual
-- champion promotion via the model artifact registry (migration 144).
--
-- Design (AGENTS.md §11 — Truthful, §10 — No black-box AI claims):
-- - Every row records what the rule engine decided AND what the shadow model
--   would have decided, so an auditor can reconstruct either path.
-- - `served_decision` is always 'rule_engine' until the shadow model is
--   promoted to active in model_artifacts. The shadow never affects the user.
-- - `agreement` classifies the relationship so disagreement analysis is a
--   single GROUP BY, not a re-derivation from raw scores.
-- - `shadow_unavailable` is an honest state: the shadow model was not loaded
--   or the call failed. The shadow fields are NULL in that case.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS fraud_scoring_ledger (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('signup', 'listing', 'message', 'transaction')),
  user_id TEXT,
  rule_engine_score INTEGER CHECK (rule_engine_score >= 0 AND rule_engine_score <= 100),
  rule_engine_level TEXT CHECK (rule_engine_level IN ('low', 'medium', 'high', 'unknown')),
  rule_engine_action TEXT CHECK (rule_engine_action IN ('allow', 'flag', 'block') OR rule_engine_action IS NULL),
  rule_engine_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  shadow_model_id TEXT,
  shadow_model_version TEXT,
  shadow_score NUMERIC(6,4) CHECK (shadow_score >= 0 AND shadow_score <= 1),
  shadow_decision TEXT CHECK (shadow_decision IN ('auto_approve', 'review', 'auto_block')),
  shadow_confidence NUMERIC(5,4),
  shadow_features JSONB NOT NULL DEFAULT '{}'::jsonb,
  score_delta NUMERIC(6,4),
  agreement TEXT NOT NULL CHECK (agreement IN ('agree', 'disagree_rule_higher', 'disagree_shadow_higher', 'shadow_unavailable')),
  served_decision TEXT NOT NULL CHECK (served_decision IN ('rule_engine', 'shadow_model')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Lookup by event_id (join back to the fraud audit trail).
CREATE INDEX IF NOT EXISTS fraud_scoring_ledger_event_id_idx
  ON fraud_scoring_ledger (event_id);

-- Lookup by user_id (per-user disagreement history).
CREATE INDEX IF NOT EXISTS fraud_scoring_ledger_user_id_idx
  ON fraud_scoring_ledger (user_id)
  WHERE user_id IS NOT NULL;

-- Time-ordered scan for offline comparison windows.
CREATE INDEX IF NOT EXISTS fraud_scoring_ledger_created_at_idx
  ON fraud_scoring_ledger (created_at DESC);

-- Disagreement analysis (the most common admin query).
CREATE INDEX IF NOT EXISTS fraud_scoring_ledger_agreement_idx
  ON fraud_scoring_ledger (agreement, created_at DESC)
  WHERE agreement <> 'agree';

-- Per-model telemetry (which shadow version produced which scores).
CREATE INDEX IF NOT EXISTS fraud_scoring_ledger_shadow_model_idx
  ON fraud_scoring_ledger (shadow_model_id, shadow_model_version)
  WHERE shadow_model_id IS NOT NULL;

COMMENT ON TABLE fraud_scoring_ledger IS
  'Logs both the rule-engine and shadow-model fraud scores for every fraud check, enabling offline comparison and calibration. The served decision is always the rule engine until the shadow model is promoted via model_artifacts.';
COMMENT ON COLUMN fraud_scoring_ledger.event_id IS
  'The FraudCheckResult.eventId from the rule-engine evaluation. Joins back to the Redis audit trail.';
COMMENT ON COLUMN fraud_scoring_ledger.rule_engine_score IS
  'Rule-engine risk score 0-100. NULL when the rule engine was unavailable (evaluationStatus = unavailable).';
COMMENT ON COLUMN fraud_scoring_ledger.rule_engine_level IS
  'Rule-engine risk level. unknown when the rule engine was unavailable.';
COMMENT ON COLUMN fraud_scoring_ledger.rule_engine_action IS
  'Rule-engine decision (allow/flag/block). NULL when the rule engine was unavailable.';
COMMENT ON COLUMN fraud_scoring_ledger.rule_engine_signals IS
  'JSONB array of the FraudSignal objects the rule engine produced, for full auditability.';
COMMENT ON COLUMN fraud_scoring_ledger.shadow_model_id IS
  'Shadow model identifier. NULL when no shadow model is loaded or the call failed.';
COMMENT ON COLUMN fraud_scoring_ledger.shadow_model_version IS
  'Shadow model version. NULL when no shadow model is loaded or the call failed.';
COMMENT ON COLUMN fraud_scoring_ledger.shadow_score IS
  'Shadow model calibrated probability of fraud (0.0-1.0). NULL when the shadow is unavailable.';
COMMENT ON COLUMN fraud_scoring_ledger.shadow_decision IS
  'Shadow model decision: auto_approve (low risk), review (medium), auto_block (high). NULL when unavailable.';
COMMENT ON COLUMN fraud_scoring_ledger.shadow_confidence IS
  'Shadow model confidence in its decision (0.0-1.0). NULL when unavailable.';
COMMENT ON COLUMN fraud_scoring_ledger.shadow_features IS
  'JSONB object of the features sent to the shadow model (derived from rule-engine signals), for offline feature analysis.';
COMMENT ON COLUMN fraud_scoring_ledger.score_delta IS
  'shadow_score*100 - rule_engine_score. Positive = shadow is more suspicious. NULL when the shadow is unavailable.';
COMMENT ON COLUMN fraud_scoring_ledger.agreement IS
  'agree: both paths reach the same risk band. disagree_rule_higher: rule engine is more suspicious. disagree_shadow_higher: shadow is more suspicious. shadow_unavailable: no shadow score (model not loaded or call failed).';
COMMENT ON COLUMN fraud_scoring_ledger.served_decision IS
  'Which path served the user-facing decision. Always rule_engine until the shadow model is promoted to active in model_artifacts.';
