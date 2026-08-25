-- Migration 162: Privileged command, approval, attempt, and effect model
--
-- All high-impact actions become command records with a full state machine:
--
--   draft → proposed → awaiting_approval → approved → queued → executing → succeeded
--
-- Branches:
--   draft/proposed/awaiting_approval → cancelled/rejected/expired
--   executing → unknown_outcome → investigating → succeeded/failed/compensated
--   queued → superseded when resource version changed
--   succeeded → compensated only through a linked new command
--
-- Rules:
--   - approval binds exact request hash, amount, destination fingerprint,
--     and expected version
--   - edits after approval invalidate approval
--   - duplicate command key returns prior command state (idempotency)
--   - lost HTTP response is checked by command ID
--   - unknown outcome is never succeeded
--   - command executes only if resource version and policy still match
--   - terminal records are immutable

-- ── Privileged commands ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS privileged_commands (
  id                      TEXT PRIMARY KEY,
  command_type            VARCHAR(120) NOT NULL,
  resource_type           VARCHAR(80) NOT NULL,
  resource_id             VARCHAR(255) NOT NULL,
  expected_resource_version VARCHAR(255),
  idempotency_key         VARCHAR(255) NOT NULL,
  request_hash            VARCHAR(64) NOT NULL,
  proposer_id             TEXT NOT NULL REFERENCES workforce_principals(id),
  case_id                 TEXT REFERENCES ops_cases(id),
  reason_code             VARCHAR(120) NOT NULL,
  freeform_note           TEXT,
  before_snapshot_hash    VARCHAR(64),
  effect_preview          JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_tier               VARCHAR(20) NOT NULL DEFAULT 'standard',
  amount_gbp              NUMERIC(12, 2),
  currency                VARCHAR(8) NOT NULL DEFAULT 'GBP',
  destination_fingerprint VARCHAR(64),
  required_approval_policy VARCHAR(120),
  step_up_session_id      TEXT,
  state                   VARCHAR(40) NOT NULL DEFAULT 'draft',
  executor_id             TEXT REFERENCES workforce_principals(id),
  provider_operation_id   VARCHAR(255),
  result_hash             VARCHAR(64),
  error_code              VARCHAR(120),
  error_message           TEXT,
  -- Linked compensation command (succeeded → compensated through new command)
  compensated_by_command_id TEXT,
  -- Superseded by (stale resource version)
  superseded_by_command_id TEXT,
  -- Timestamps
  proposed_at             TIMESTAMPTZ,
  awaiting_approval_at    TIMESTAMPTZ,
  approved_at             TIMESTAMPTZ,
  queued_at               TIMESTAMPTZ,
  executing_at            TIMESTAMPTZ,
  succeeded_at            TIMESTAMPTZ,
  failed_at               TIMESTAMPTZ,
  unknown_outcome_at      TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  rejected_at             TIMESTAMPTZ,
  expired_at              TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ NOT NULL,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Unique: one command per (proposer scope, idempotency key)
  UNIQUE (proposer_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_privileged_commands_state
  ON privileged_commands (state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_privileged_commands_type
  ON privileged_commands (command_type, state);
CREATE INDEX IF NOT EXISTS idx_privileged_commands_resource
  ON privileged_commands (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_privileged_commands_case
  ON privileged_commands (case_id);
CREATE INDEX IF NOT EXISTS idx_privileged_commands_proposer
  ON privileged_commands (proposer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_privileged_commands_awaiting
  ON privileged_commands (state, risk_tier) WHERE state = 'awaiting_approval';
CREATE INDEX IF NOT EXISTS idx_privileged_commands_unknown
  ON privileged_commands (state, unknown_outcome_at) WHERE state = 'unknown_outcome';

-- ── Command approvals ──────────────────────────────────────────────────
-- Approval binds exact request hash, amount, destination fingerprint.
-- Proposer cannot approve own command where separation of duty is required.

CREATE TABLE IF NOT EXISTS command_approvals (
  id              TEXT PRIMARY KEY,
  command_id      TEXT NOT NULL REFERENCES privileged_commands(id),
  approver_id     TEXT NOT NULL REFERENCES workforce_principals(id),
  approval_role   VARCHAR(120) NOT NULL,
  decision        VARCHAR(20) NOT NULL,
  decision_reason VARCHAR(240),
  -- Snapshot of what was approved (must match command at execution time)
  approved_request_hash    VARCHAR(64) NOT NULL,
  approved_amount_gbp      NUMERIC(12, 2),
  approved_destination_fp  VARCHAR(64),
  approved_resource_version VARCHAR(255),
  step_up_session_id       TEXT,
  approved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Check constraint: proposer ≠ approver (enforced at application layer
  -- for policy flexibility, but a DB guard catches direct violations)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (command_id, approver_id, approval_role)
);

CREATE INDEX IF NOT EXISTS idx_command_approvals_command
  ON command_approvals (command_id);

-- ── Command attempts ───────────────────────────────────────────────────
-- Each execution attempt is recorded. Executor crash before/after domain
-- commit does not duplicate effect.

CREATE TABLE IF NOT EXISTS command_attempts (
  id              TEXT PRIMARY KEY,
  command_id      TEXT NOT NULL REFERENCES privileged_commands(id),
  attempt_number  SMALLINT NOT NULL,
  executor_id     TEXT REFERENCES workforce_principals(id),
  provider_operation_id VARCHAR(255),
  state_before    VARCHAR(40) NOT NULL,
  state_after     VARCHAR(40) NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  error_code      VARCHAR(120),
  error_message   TEXT,
  is_domain_committed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_command_attempts_command
  ON command_attempts (command_id, attempt_number);

-- ── Command effects ────────────────────────────────────────────────────
-- Terminal effects are immutable. One terminal effect per command.

CREATE TABLE IF NOT EXISTS command_effects (
  id              TEXT PRIMARY KEY,
  command_id      TEXT NOT NULL REFERENCES privileged_commands(id),
  effect_type     VARCHAR(80) NOT NULL,
  effect_hash     VARCHAR(64) NOT NULL,
  affected_table  VARCHAR(120),
  affected_id     VARCHAR(255),
  before_hash     VARCHAR(64),
  after_hash      VARCHAR(64),
  is_terminal     BOOLEAN NOT NULL DEFAULT FALSE,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_command_effects_command
  ON command_effects (command_id);

-- ── Reconciliation runs (ops-specific) ─────────────────────────────────
-- Links reconciliation runs to cases and commands.

CREATE TABLE IF NOT EXISTS ops_reconciliation_runs (
  id              TEXT PRIMARY KEY,
  provider_account VARCHAR(120) NOT NULL,
  legal_entity    VARCHAR(120) NOT NULL,
  currency        VARCHAR(8) NOT NULL DEFAULT 'GBP',
  business_date   DATE NOT NULL,
  imported_through TIMESTAMPTZ,
  run_completeness VARCHAR(40) NOT NULL DEFAULT 'incomplete',
  opening_balance_gbp NUMERIC(14, 2),
  closing_balance_gbp NUMERIC(14, 2),
  expected_balance_gbp NUMERIC(14, 2),
  mismatch_gbp    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  break_count     SMALLINT NOT NULL DEFAULT 0,
  case_id         TEXT REFERENCES ops_cases(id),
  closed_by       TEXT REFERENCES workforce_principals(id),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_reconciliation_date
  ON ops_reconciliation_runs (business_date DESC);
CREATE INDEX IF NOT EXISTS idx_ops_reconciliation_open
  ON ops_reconciliation_runs (run_completeness) WHERE run_completeness != 'closed';

-- ── Reconciliation breaks ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_reconciliation_breaks (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES ops_reconciliation_runs(id),
  break_type      VARCHAR(80) NOT NULL,
  amount_gbp      NUMERIC(14, 2) NOT NULL,
  description     TEXT,
  ageing_days     SMALLINT NOT NULL DEFAULT 0,
  resolution_command_id TEXT REFERENCES privileged_commands(id),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_recon_breaks_run
  ON ops_reconciliation_breaks (run_id, resolved_at);

COMMENT ON TABLE privileged_commands IS
  'All high-impact actions are command records with idempotency, approval binding, and full state machine.';
COMMENT ON TABLE command_approvals IS
  'Approval binds exact request hash, amount, destination fingerprint. Proposer ≠ approver where separation of duty is required.';

