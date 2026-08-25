-- Migration 155: Risk decision system — durable events, decisions, cases and ATO recovery
--
-- Implements the authoritative decision contract from the fraud/scams/ATO
-- flagship analysis (2026-08-25). Replaces the Redis-only fraud reports
-- (FR-10) with durable PostgreSQL cases that have append-only event history,
-- evidence bindings and legal-hold support.
--
-- The core invariant (AGENTS.md §11 — Truthful, anti-AI design policy):
--   The risk service produces evidence and a recommendation.
--   The domain owner converts it into an enforceable decision under a
--   versioned policy and records execution. The shared service must not
--   directly write accounts, listings or balances.
--
-- This migration introduces the separation of concerns that FR-13 identified
-- as the principal defect: recommendation, owner decision and execution
-- status are now distinct columns, never conflated.
--
-- Tables:
--   risk_events              — immutable domain event log (FR-07 expansion)
--   risk_decisions           — versioned decision with rec/owner/exec split (FR-13)
--   risk_executions          — execution status and reconciliation (FR-13)
--   risk_cases               — durable case management replacing Redis (FR-10)
--   risk_case_events         — append-only case history with actor/reason
--   risk_evidence_bindings   — case/event to evidence object with checksum
--   entity_links             — tokenised node pair graph (FR-06)
--   risk_labels              — confirmed outcomes with maturity and reversal
--   risk_overrides           — scoped, expiring, audited overrides
--   account_compromise_cases — ATO state machine (FR-07/ATO blocker)
--   protected_change_history — reversible protected-field changes
--
-- Users table additions:
--   account_risk_state       — NORMAL | SUSPECTED | CONTAINED | RECOVERY_IN_PROGRESS
--                              | RESTORED_MONITORED | CLOSED_GENUINE | CLOSED_COMPROMISED
--   compromise_case_id       — link to the active account_compromise_cases row
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

-- ── Users table additions ──────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_risk_state TEXT NOT NULL DEFAULT 'normal'
    CHECK (account_risk_state IN (
      'normal', 'suspected', 'contained',
      'recovery_in_progress', 'restored_monitored',
      'closed_genuine', 'closed_compromised'
    ));
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS compromise_case_id TEXT;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS payout_change_cooldown_until TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS withdrawal_hold_until TIMESTAMPTZ;

-- ── risk_events ────────────────────────────────────────────────────────
-- Immutable record of a domain event that triggered a risk evaluation.
-- The expanded event taxonomy (FR-07) covers every risky mutation surface.

CREATE TABLE IF NOT EXISTS risk_events (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  event_id TEXT NOT NULL UNIQUE,          -- stable external id (fraud_xxx or risk_xxx)
  event_type TEXT NOT NULL,               -- see taxonomy below
  owner_service TEXT NOT NULL,            -- 'auth' | 'listings' | 'messaging' | 'payments' | 'payouts' | 'orders' | 'auctions' | 'coown' | 'admin'
  subject_ref TEXT NOT NULL,              -- tokenised subject (user_id, listing_id, etc.)
  action_ref TEXT,                        -- idempotent mutation attempt id
  amount_minor BIGINT,                    -- monetary amount in minor units (pence)
  currency TEXT CHECK (currency IS NULL OR currency IN ('GBP', 'USD', 'EUR', 'INR')),
  jurisdiction TEXT,                      -- ISO-3166-1 alpha-2
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schema_version TEXT NOT NULL DEFAULT 'risk_events.v1',
  dedupe_key TEXT,                        -- idempotency: same key + payload = same event
  context JSONB NOT NULL DEFAULT '{}'::jsonb,  -- non-sensitive context (no PAN/secrets)
  PRIMARY KEY (id),
  CHECK (event_type IN (
    'auth.signup.attempted', 'auth.login.attempted', 'auth.recovery.completed',
    'auth.protected_field.change', 'auth.session.created',
    'listing.publish.requested', 'listing.edit.requested',
    'chat.message.send', 'chat.link.shared',
    'payment.intent.create', 'payment.intent.confirm',
    'payout.destination.change', 'payout.release.requested',
    'withdrawal.requested',
    'return.requested', 'refund.requested',
    'auction.bid', 'auction.buy_now',
    'coown.order', 'coown.transfer',
    'operator.privileged_action',
    'fraud.report.submitted'
  ))
);

CREATE INDEX IF NOT EXISTS risk_events_event_type_idx
  ON risk_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS risk_events_subject_ref_idx
  ON risk_events (subject_ref, occurred_at DESC);
CREATE INDEX IF NOT EXISTS risk_events_dedupe_key_idx
  ON risk_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS risk_events_owner_service_idx
  ON risk_events (owner_service, occurred_at DESC);

COMMENT ON TABLE risk_events IS
  'Immutable record of a domain event that triggered a risk evaluation. The expanded taxonomy covers every risky mutation surface: auth, listings, messaging, payments, payouts, returns, auctions, co-own and operator actions.';
COMMENT ON COLUMN risk_events.subject_ref IS
  'Tokenised subject identifier (user_id, listing_id, etc.). Never contains PAN, bank credentials or identity documents.';
COMMENT ON COLUMN risk_events.dedupe_key IS
  'Idempotency key. A retry with the same key and payload returns the same event or an explicit superseding event.';

-- ── risk_decisions ─────────────────────────────────────────────────────
-- The authoritative decision contract (FR-13). Separates recommendation
-- (what the risk engine suggests), owner_decision (what the domain owner
-- decided under a versioned policy) and execution_status (what actually
-- happened). These are NEVER conflated.

CREATE TABLE IF NOT EXISTS risk_decisions (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  decision_id TEXT NOT NULL UNIQUE,       -- stable external id
  event_id TEXT NOT NULL REFERENCES risk_events(event_id) ON DELETE CASCADE,
  -- Recommendation from the risk engine
  recommended_action TEXT NOT NULL CHECK (recommended_action IN (
    'allow', 'allow_with_limits', 'step_up', 'delay',
    'quarantine', 'manual_review', 'deny'
  )),
  recommended_reason_codes TEXT[] NOT NULL DEFAULT '{}',  -- stable internal taxonomy
  risk_score INTEGER CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)),
  risk_level TEXT CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high', 'unknown')),
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,             -- FraudSignal[] from rule engine
  -- Owner decision under a versioned policy
  owner_decision TEXT NOT NULL CHECK (owner_decision IN (
    'allow', 'allow_with_limits', 'step_up', 'delay',
    'quarantine', 'manual_review', 'deny'
  )),
  owner_reason_codes TEXT[] NOT NULL DEFAULT '{}',
  policy_version TEXT NOT NULL,
  ruleset_version TEXT NOT NULL,
  model_version TEXT,                     -- NULL when rules-only
  -- Evaluation metadata
  evaluation_status TEXT NOT NULL CHECK (evaluation_status IN (
    'complete', 'degraded', 'unavailable'
  )),
  valid_until TIMESTAMPTZ NOT NULL,
  obligations JSONB NOT NULL DEFAULT '[]'::jsonb,  -- require_factor, cooldown, amount_cap, case
  evidence_digest TEXT NOT NULL,          -- SHA-256 of the evidence bundle
  -- Supersession chain (idempotent retries)
  superseded_by_decision_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  CHECK (evaluation_status <> 'unavailable' OR owner_decision IN ('step_up', 'manual_review', 'delay'))
);

CREATE INDEX IF NOT EXISTS risk_decisions_event_id_idx
  ON risk_decisions (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS risk_decisions_owner_decision_idx
  ON risk_decisions (owner_decision, created_at DESC);
CREATE INDEX IF NOT EXISTS risk_decisions_evaluation_status_idx
  ON risk_decisions (evaluation_status, created_at DESC)
  WHERE evaluation_status <> 'complete';

COMMENT ON TABLE risk_decisions IS
  'Authoritative risk decision with separated recommendation, owner decision and execution status. The risk engine recommends; the domain owner decides under a versioned policy; execution is recorded separately. These are never conflated (FR-13).';
COMMENT ON COLUMN risk_decisions.recommended_action IS
  'What the risk engine suggests. Advisory only — the domain owner may accept, escalate or de-escalate under policy.';
COMMENT ON COLUMN risk_decisions.owner_decision IS
  'What the domain owner decided under the versioned policy. This is the authoritative action that execution must follow.';
COMMENT ON COLUMN risk_decisions.evaluation_status IS
  'complete: rules evaluated. degraded: partial evaluation. unavailable: risk service down — owner_decision must be step_up, manual_review or delay (never allow).';
COMMENT ON COLUMN risk_decisions.obligations IS
  'JSONB array of obligation objects: {type:"require_factor",factor:"passkey"}, {type:"cooldown",until:"..."}, {type:"amount_cap",amountMinor:...}, {type:"case",queue:"..."}';
COMMENT ON COLUMN risk_decisions.superseded_by_decision_id IS
  'Idempotent retry chain. A retry returns the same valid decision or an explicit superseding decision.';

-- ── risk_executions ────────────────────────────────────────────────────
-- What actually happened when the owner tried to enforce the decision.
-- Reconciliation for unknown outcomes (lost responses, provider timeouts).

CREATE TABLE IF NOT EXISTS risk_executions (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  decision_id TEXT NOT NULL REFERENCES risk_decisions(decision_id) ON DELETE CASCADE,
  owner_service TEXT NOT NULL,
  execution_status TEXT NOT NULL CHECK (execution_status IN (
    'executed', 'not_executed', 'superseded', 'outcome_unknown'
  )),
  domain_entity_type TEXT,                -- 'listing' | 'payment_intent' | 'payout' | etc.
  domain_entity_id TEXT,
  domain_entity_version TEXT,             -- optimistic concurrency version
  executed_at TIMESTAMPTZ,
  reconciliation_ref TEXT,                -- idempotency key for provider reconciliation
  reconciliation_status TEXT CHECK (reconciliation_status IS NULL OR reconciliation_status IN (
    'pending', 'confirmed', 'failed', 'not_required'
  )),
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS risk_executions_decision_id_idx
  ON risk_executions (decision_id);
CREATE INDEX IF NOT EXISTS risk_executions_outcome_unknown_idx
  ON risk_executions (created_at ASC)
  WHERE execution_status = 'outcome_unknown' AND reconciliation_status = 'pending';

COMMENT ON TABLE risk_executions IS
  'Execution status for each risk decision. outcome_unknown triggers idempotent reconciliation — the client receives Check result, not fabricated success or blind retry.';

-- ── risk_cases ─────────────────────────────────────────────────────────
-- Durable case management replacing Redis-backed fraud reports (FR-10).
-- One case may be linked across queues but has one accountable owner.

CREATE TABLE IF NOT EXISTS risk_cases (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  case_id TEXT NOT NULL UNIQUE,           -- stable external id (risk_case_xxx)
  case_type TEXT NOT NULL CHECK (case_type IN (
    'account_takeover', 'live_scam_phishing', 'payout_withdrawal',
    'payment_card', 'seller_listing_integrity', 'auction_collusion',
    'returns_refunds', 'operator_abuse', 'user_fraud_report'
  )),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_review', 'on_hold', 'resolved', 'closed', 'escalated'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN (
    'low', 'normal', 'high', 'critical'
  )),
  priority_score NUMERIC(10,2) NOT NULL DEFAULT 0,  -- expected_loss + vulnerability + propagation + irreversibility + age
  loss_exposure_minor BIGINT NOT NULL DEFAULT 0,
  loss_exposure_currency TEXT CHECK (loss_exposure_currency IS NULL OR loss_exposure_currency IN ('GBP', 'USD', 'EUR', 'INR')),
  owner_team TEXT,                        -- accountable team
  assigned_to TEXT,                       -- assigned operator id
  subject_refs TEXT[] NOT NULL DEFAULT '{}',  -- tokenised user/account/listing refs
  sla_policy_ref TEXT,
  sla_due_at TIMESTAMPTZ,
  sla_breach_at TIMESTAMPTZ,
  linked_case_ids TEXT[] NOT NULL DEFAULT '{}',
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  retention_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS risk_cases_status_priority_idx
  ON risk_cases (status, priority DESC, created_at ASC)
  WHERE status IN ('open', 'in_review', 'on_hold');
CREATE INDEX IF NOT EXISTS risk_cases_case_type_idx
  ON risk_cases (case_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS risk_cases_assigned_to_idx
  ON risk_cases (assigned_to, status)
  WHERE assigned_to IS NOT NULL AND status IN ('open', 'in_review', 'on_hold');
CREATE INDEX IF NOT EXISTS risk_cases_subject_refs_idx
  ON risk_cases USING GIN (subject_refs);
CREATE INDEX IF NOT EXISTS risk_cases_sla_breach_idx
  ON risk_cases (sla_breach_at ASC)
  WHERE sla_breach_at IS NOT NULL AND status IN ('open', 'in_review', 'on_hold');
CREATE INDEX IF NOT EXISTS risk_cases_legal_hold_idx
  ON risk_cases (case_id)
  WHERE legal_hold = TRUE;

COMMENT ON TABLE risk_cases IS
  'Durable fraud/risk case management. Replaces the Redis-backed fraud reports (FR-10) with PostgreSQL cases that have append-only event history, evidence bindings, SLA tracking and legal-hold support. One case may be linked across queues but has one accountable owner.';

-- ── risk_case_events ───────────────────────────────────────────────────
-- Append-only case history. Every status change, assignment, evidence
-- addition, action and outcome is recorded with actor and reason.

CREATE TABLE IF NOT EXISTS risk_case_events (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  case_id TEXT NOT NULL REFERENCES risk_cases(case_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'status_changed', 'assigned', 'evidence_added',
    'action_taken', 'note_added', 'escalated', 'resolved',
    'closed', 'reopened', 'sla_breached', 'legal_hold_toggled'
  )),
  actor_id TEXT NOT NULL,                 -- operator or system
  actor_type TEXT NOT NULL CHECK (actor_type IN ('operator', 'system', 'user', 'provider')),
  reason_code TEXT,                       -- stable taxonomy
  reason_text TEXT,
  from_status TEXT,
  to_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS risk_case_events_case_id_idx
  ON risk_case_events (case_id, created_at ASC);

COMMENT ON TABLE risk_case_events IS
  'Append-only case event history. Every status change, assignment, evidence addition, action and outcome is recorded with actor and reason. Immutable.';

-- ── risk_evidence_bindings ─────────────────────────────────────────────
-- Links cases/events to evidence objects (screenshots, logs, provider
-- records). Checksummed with retention and legal-hold state.

CREATE TABLE IF NOT EXISTS risk_evidence_bindings (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  case_id TEXT NOT NULL REFERENCES risk_cases(case_id) ON DELETE CASCADE,
  event_id TEXT,                          -- optional link to a specific risk_event
  evidence_type TEXT NOT NULL CHECK (evidence_type IN (
    'screenshot', 'log_entry', 'provider_record', 'message_content',
    'transaction_record', 'session_record', 'device_record',
    'user_statement', 'external_report'
  )),
  storage_ref TEXT NOT NULL,              -- object store key (S3/GCS)
  checksum_sha256 TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user', 'operator', 'system', 'provider', 'law_enforcement')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ,
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS risk_evidence_bindings_case_id_idx
  ON risk_evidence_bindings (case_id, captured_at DESC);

COMMENT ON TABLE risk_evidence_bindings IS
  'Evidence bindings linking cases and events to stored evidence objects. Checksummed for integrity, with retention and legal-hold state. No PAN, bank credentials or identity documents stored — only references.';

-- ── entity_links ───────────────────────────────────────────────────────
-- Tokenised node-pair graph connecting accounts, devices, payment
-- instruments, payout destinations, addresses, media, listings and
-- counterparties (FR-06). No PAN/bank secrets.

CREATE TABLE IF NOT EXISTS entity_links (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  node_a_type TEXT NOT NULL CHECK (node_a_type IN (
    'account', 'device', 'payment_instrument', 'payout_destination',
    'address', 'media', 'listing', 'session', 'passkey'
  )),
  node_a_ref TEXT NOT NULL,               -- tokenised reference
  node_b_type TEXT NOT NULL CHECK (node_b_type IN (
    'account', 'device', 'payment_instrument', 'payout_destination',
    'address', 'media', 'listing', 'session', 'passkey'
  )),
  node_b_ref TEXT NOT NULL,               -- tokenised reference
  link_type TEXT NOT NULL CHECK (link_type IN (
    'owns', 'used_by', 'shares_device', 'shares_ip',
    'shares_payment_instrument', 'shares_payout_destination',
    'shares_address', 'linked_listing', 'counterparty',
    'recovered_from', 'superseded_by'
  )),
  link_source TEXT NOT NULL CHECK (link_source IN (
    'signup', 'login', 'transaction', 'payout', 'listing',
    'message', 'recovery', 'operator_link', 'graph_inference'
  )),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  review_state TEXT NOT NULL DEFAULT 'active' CHECK (review_state IN (
    'active', 'under_review', 'confirmed_bad', 'confirmed_benign', 'expired'
  )),
  legal_basis TEXT,                       -- DPIA / legitimate-interest reference
  PRIMARY KEY (id),
  CHECK (node_a_type <> node_b_type OR node_a_ref <> node_b_ref)
);

CREATE INDEX IF NOT EXISTS entity_links_node_a_idx
  ON entity_links (node_a_type, node_a_ref, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS entity_links_node_b_idx
  ON entity_links (node_b_type, node_b_ref, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS entity_links_link_type_idx
  ON entity_links (link_type, review_state, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS entity_links_review_state_idx
  ON entity_links (review_state, last_seen_at DESC)
  WHERE review_state IN ('active', 'under_review');

COMMENT ON TABLE entity_links IS
  'Tokenised entity graph connecting accounts, devices, payment instruments, payout destinations, addresses, media, listings and counterparties (FR-06). No PAN, bank credentials or identity documents — only tokenised references.';

-- ── risk_labels ────────────────────────────────────────────────────────
-- Confirmed outcomes for model calibration. Never train on unresolved
-- cases — unresolved queue state is never a negative training label.

CREATE TABLE IF NOT EXISTS risk_labels (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  event_id TEXT REFERENCES risk_events(event_id) ON DELETE SET NULL,
  decision_id TEXT REFERENCES risk_decisions(decision_id) ON DELETE SET NULL,
  case_id TEXT REFERENCES risk_cases(case_id) ON DELETE SET NULL,
  label TEXT NOT NULL CHECK (label IN (
    'confirmed_fraud', 'confirmed_ato', 'confirmed_scam_victim', 'policy_abuse',
    'legitimate', 'false_positive', 'user_cancelled',
    'insufficient_evidence', 'provider_pending', 'dispute_pending', 'appeal_pending',
    'reversed_on_appeal'
  )),
  label_source TEXT NOT NULL CHECK (label_source IN (
    'provider_chargeback', 'case_review', 'user_confirmation',
    'law_enforcement', 'rule_proxy', 'operator_review'
  )),
  maturity_date TIMESTAMPTZ NOT NULL,     -- when the label became reliable
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  reversal_of_label_id TEXT REFERENCES risk_labels(id) ON DELETE SET NULL,
  reviewer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS risk_labels_event_id_idx
  ON risk_labels (event_id)
  WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS risk_labels_label_idx
  ON risk_labels (label, created_at DESC);
CREATE INDEX IF NOT EXISTS risk_labels_maturity_idx
  ON risk_labels (maturity_date DESC);

COMMENT ON TABLE risk_labels IS
  'Confirmed outcomes for model calibration. Unresolved queue state is never a negative training label. Every label records its source, maturity date, confidence and reversal chain.';

-- ── risk_overrides ─────────────────────────────────────────────────────
-- Scoped, expiring, audited overrides — never permanent allowlists.

CREATE TABLE IF NOT EXISTS risk_overrides (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  override_id TEXT NOT NULL UNIQUE,
  scope_type TEXT NOT NULL CHECK (scope_type IN (
    'user', 'device', 'ip_range', 'listing', 'payment_instrument',
    'payout_destination', 'event_type'
  )),
  scope_ref TEXT NOT NULL,
  action_override TEXT NOT NULL CHECK (action_override IN (
    'allow', 'allow_with_limits', 'step_up', 'manual_review', 'deny'
  )),
  reason TEXT NOT NULL,
  approver_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_reason TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  PRIMARY KEY (id),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS risk_overrides_scope_idx
  ON risk_overrides (scope_type, scope_ref, expires_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS risk_overrides_expires_at_idx
  ON risk_overrides (expires_at ASC)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE risk_overrides IS
  'Scoped, expiring, audited risk overrides. Never permanent allowlists — every override has a reason, approver, expiry and usage tracking. Expired or revoked overrides are inert.';

-- ── account_compromise_cases ───────────────────────────────────────────
-- Account-takeover state machine (FR-07/ATO blocker). Tracks detection,
-- containment, recovery proof, protected-change rollback and restoration.
--
-- State machine:
--   NORMAL -> SUSPECTED -> CONTAINED -> RECOVERY_IN_PROGRESS
--          -> RESTORED_MONITORED -> CLOSED_GENUINE | CLOSED_COMPROMISED
--   Any state -> ESCALATED when money/order loss, identity conflict or operator risk.

CREATE TABLE IF NOT EXISTS account_compromise_cases (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  case_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  risk_case_id TEXT REFERENCES risk_cases(case_id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'suspected' CHECK (state IN (
    'suspected', 'contained', 'recovery_in_progress',
    'restored_monitored', 'closed_genuine', 'closed_compromised',
    'escalated'
  )),
  -- Detection context
  detected_by TEXT NOT NULL CHECK (detected_by IN (
    'unusual_session', 'unusual_recovery', 'protected_field_change',
    'payout_destination_change', 'user_report', 'operator_review',
    'provider_alert', 'graph_link'
  )),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detection_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Containment actions
  sessions_revoked_at TIMESTAMPTZ,
  sessions_revoked_count INTEGER,
  preserved_session_id TEXT,              -- known-good session preserved where safe
  payout_hold_active BOOLEAN NOT NULL DEFAULT FALSE,
  withdrawal_hold_active BOOLEAN NOT NULL DEFAULT FALSE,
  protected_change_hold_active BOOLEAN NOT NULL DEFAULT FALSE,
  -- Recovery
  recovery_method TEXT CHECK (recovery_method IS NULL OR recovery_method IN (
    'trusted_channel', 'identity_reproof', 'manual_recovery', 'passkey_reauth'
  )),
  recovery_started_at TIMESTAMPTZ,
  recovery_completed_at TIMESTAMPTZ,
  recovery_proof JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Post-recovery monitoring
  cooldown_until TIMESTAMPTZ,             -- protected changes blocked until this time
  monitored_until TIMESTAMPTZ,
  -- Outcome
  outcome_label TEXT CHECK (outcome_label IS NULL OR outcome_label IN (
    'confirmed_ato', 'false_positive', 'insufficient_evidence'
  )),
  loss_exposure_minor BIGINT NOT NULL DEFAULT 0,
  loss_exposure_currency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS account_compromise_cases_user_id_idx
  ON account_compromise_cases (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_compromise_cases_state_idx
  ON account_compromise_cases (state, detected_at DESC)
  WHERE state NOT IN ('closed_genuine', 'closed_compromised');
CREATE INDEX IF NOT EXISTS account_compromise_cases_active_user_idx
  ON account_compromise_cases (user_id)
  WHERE state NOT IN ('closed_genuine', 'closed_compromised');

COMMENT ON TABLE account_compromise_cases IS
  'Account-takeover state machine. Tracks detection, containment (selective session revocation, money holds), recovery (trusted-channel or identity reproof), restoration with cooldown, and outcome labeling. Containment is selective and reversible — freeze payout/withdrawal, not browsing or support access.';

-- ── protected_change_history ───────────────────────────────────────────
-- Reversible protected-field changes. Preserves old values so that
-- unauthorized changes can be rolled back transactionally.

CREATE TABLE IF NOT EXISTS protected_change_history (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL CHECK (field_name IN (
    'email', 'phone', 'password', 'payout_destination',
    'recovery_email', 'recovery_phone', 'mfa_method', 'passkey'
  )),
  old_value_hash TEXT NOT NULL,           -- SHA-256 of old value (never store raw)
  new_value_hash TEXT NOT NULL,           -- SHA-256 of new value
  old_value_encrypted TEXT,               -- encrypted old value for rollback
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by_session_id TEXT,
  changed_by_ip TEXT,
  risk_decision_id TEXT REFERENCES risk_decisions(decision_id) ON DELETE SET NULL,
  compromise_case_id TEXT REFERENCES account_compromise_cases(case_id) ON DELETE SET NULL,
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by TEXT,
  rollback_reason TEXT,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS protected_change_history_user_id_idx
  ON protected_change_history (user_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS protected_change_history_not_rolled_back_idx
  ON protected_change_history (changed_at DESC)
  WHERE rolled_back_at IS NULL;

COMMENT ON TABLE protected_change_history IS
  'Reversible protected-field changes. Preserves old values (encrypted) so unauthorized changes can be rolled back transactionally. Every change links to its risk decision and, if applicable, the compromise case.';

-- ── updated_at trigger for risk_cases and account_compromise_cases ─────

CREATE OR REPLACE FUNCTION risk_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS risk_cases_updated_at_trigger ON risk_cases;
CREATE TRIGGER risk_cases_updated_at_trigger
  BEFORE UPDATE ON risk_cases
  FOR EACH ROW EXECUTE FUNCTION risk_touch_updated_at();

DROP TRIGGER IF EXISTS account_compromise_cases_updated_at_trigger ON account_compromise_cases;
CREATE TRIGGER account_compromise_cases_updated_at_trigger
  BEFORE UPDATE ON account_compromise_cases
  FOR EACH ROW EXECUTE FUNCTION risk_touch_updated_at();
