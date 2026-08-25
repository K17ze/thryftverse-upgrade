-- Migration 161: Case, queue, task, evidence, and decision model
--
-- A case is the operating backbone of the operations console. A row in
-- payout_requests is not a work item. A case supplies purpose, ownership,
-- SLA, evidence, communication, decisions and review across domains.
--
-- Case state machine:
--   new → triaged → assigned → investigating → awaiting_customer/provider/internal
--        → ready_for_decision → resolved → closed
--   Branches: any nonterminal → escalated; resolved/closed → reopened;
--             duplicate → linked_duplicate (never silently deleted)
--
-- SLA clocks pause only for approved states and retain both wall-clock
-- and business-clock time. Vulnerable-customer and financial-harm cases
-- get explicit priority policy.

-- ── Cases ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_cases (
  id                  TEXT PRIMARY KEY,
  type                VARCHAR(80) NOT NULL,
  subject             VARCHAR(240) NOT NULL,
  description         TEXT,
  legal_entity        VARCHAR(120) NOT NULL DEFAULT 'thryftverse-ltd',
  severity            VARCHAR(20) NOT NULL DEFAULT 'normal',
  consumer_harm_score SMALLINT NOT NULL DEFAULT 0,
  financial_value_gbp NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status              VARCHAR(40) NOT NULL DEFAULT 'new',
  owner_id            TEXT REFERENCES workforce_principals(id),
  team                VARCHAR(120),
  source              VARCHAR(80) NOT NULL DEFAULT 'manual',
  source_ref          VARCHAR(255),
  priority            SMALLINT NOT NULL DEFAULT 5,
  policy_version      VARCHAR(40),
  -- SLA tracking
  sla_deadline_at     TIMESTAMPTZ,
  sla_paused_at       TIMESTAMPTZ,
  sla_total_paused_ms BIGINT NOT NULL DEFAULT 0,
  sla_breach_at       TIMESTAMPTZ,
  -- Vulnerable customer marker
  is_vulnerable_customer BOOLEAN NOT NULL DEFAULT FALSE,
  -- Reopen tracking
  reopen_count        SMALLINT NOT NULL DEFAULT 0,
  last_reopen_reason  VARCHAR(240),
  -- Linked duplicate
  duplicate_of_case_id TEXT REFERENCES ops_cases(id),
  -- Incident linkage
  incident_id         TEXT,
  -- Timestamps
  acknowledged_at     TIMESTAMPTZ,
  triaged_at          TIMESTAMPTZ,
  assigned_at         TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_cases_status
  ON ops_cases (status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_ops_cases_owner
  ON ops_cases (owner_id) WHERE status NOT IN ('closed', 'resolved');
CREATE INDEX IF NOT EXISTS idx_ops_cases_team
  ON ops_cases (team) WHERE status NOT IN ('closed', 'resolved');
CREATE INDEX IF NOT EXISTS idx_ops_cases_sla
  ON ops_cases (sla_deadline_at) WHERE sla_breach_at IS NULL AND status NOT IN ('closed', 'resolved');
CREATE INDEX IF NOT EXISTS idx_ops_cases_type
  ON ops_cases (type, status);
CREATE INDEX IF NOT EXISTS idx_ops_cases_harm
  ON ops_cases (consumer_harm_score DESC, financial_value_gbp DESC) WHERE status NOT IN ('closed', 'resolved');

-- ── Case entities (links to domain objects) ────────────────────────────

CREATE TABLE IF NOT EXISTS ops_case_entities (
  id            TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL REFERENCES ops_cases(id),
  entity_type   VARCHAR(80) NOT NULL,
  entity_id     VARCHAR(255) NOT NULL,
  relationship  VARCHAR(80) NOT NULL DEFAULT 'subject',
  added_by      TEXT REFERENCES workforce_principals(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_ops_case_entities_case
  ON ops_case_entities (case_id);
CREATE INDEX IF NOT EXISTS idx_ops_case_entities_entity
  ON ops_case_entities (entity_type, entity_id);

-- ── Tasks ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_tasks (
  id                TEXT PRIMARY KEY,
  case_id           TEXT NOT NULL REFERENCES ops_cases(id),
  title             VARCHAR(240) NOT NULL,
  description       TEXT,
  assigned_to       TEXT REFERENCES workforce_principals(id),
  skill_required    VARCHAR(120),
  state             VARCHAR(40) NOT NULL DEFAULT 'open',
  due_at            TIMESTAMPTZ,
  depends_on_task_id TEXT REFERENCES ops_tasks(id),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_tasks_case
  ON ops_tasks (case_id, state);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_assignee
  ON ops_tasks (assigned_to) WHERE state = 'open';

-- ── Evidence ───────────────────────────────────────────────────────────
-- Immutable object references with hash. Retention and legal-hold aware.

CREATE TABLE IF NOT EXISTS ops_evidence (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES ops_cases(id),
  source          VARCHAR(80) NOT NULL,
  source_ref      VARCHAR(255),
  object_ref      TEXT NOT NULL,
  object_hash     VARCHAR(64),
  object_type     VARCHAR(80),
  sensitivity     VARCHAR(40) NOT NULL DEFAULT 'standard',
  is_legal_hold   BOOLEAN NOT NULL DEFAULT FALSE,
  retention_until TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  added_by        TEXT REFERENCES workforce_principals(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_evidence_case
  ON ops_evidence (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_evidence_legal_hold
  ON ops_evidence (case_id) WHERE is_legal_hold = TRUE;

-- ── Decisions ──────────────────────────────────────────────────────────
-- Policy-linked decisions with reason taxonomy and explanation.

CREATE TABLE IF NOT EXISTS ops_decisions (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES ops_cases(id),
  decision_type   VARCHAR(80) NOT NULL,
  outcome         VARCHAR(80) NOT NULL,
  reason_code     VARCHAR(120) NOT NULL,
  explanation     TEXT,
  policy_id       VARCHAR(80),
  policy_version  VARCHAR(40),
  decision_maker  TEXT NOT NULL REFERENCES workforce_principals(id),
  command_id      TEXT,
  is_automated    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_decisions_case
  ON ops_decisions (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_decisions_maker
  ON ops_decisions (decision_maker, created_at DESC);

-- ── Communications ─────────────────────────────────────────────────────
-- Channel, template/version, consent, delivery result.

CREATE TABLE IF NOT EXISTS ops_communications (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES ops_cases(id),
  channel         VARCHAR(40) NOT NULL,
  direction       VARCHAR(20) NOT NULL,
  template_id     VARCHAR(120),
  template_version VARCHAR(40),
  recipient_ref   VARCHAR(255),
  content_hash    VARCHAR(64),
  consent_ref     VARCHAR(255),
  delivery_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  delivered_at    TIMESTAMPTZ,
  sent_by         TEXT REFERENCES workforce_principals(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_communications_case
  ON ops_communications (case_id, created_at DESC);

-- ── Notes (append-only) ────────────────────────────────────────────────
-- Corrections are linked, never overwrite.

CREATE TABLE IF NOT EXISTS ops_notes (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES ops_cases(id),
  author_id       TEXT NOT NULL REFERENCES workforce_principals(id),
  body            TEXT NOT NULL,
  is_internal     BOOLEAN NOT NULL DEFAULT TRUE,
  corrects_note_id TEXT REFERENCES ops_notes(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_notes_case
  ON ops_notes (case_id, created_at DESC);

-- ── Tags (controlled taxonomy) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_tag_taxonomy (
  id          TEXT PRIMARY KEY,
  label       VARCHAR(80) NOT NULL,
  category    VARCHAR(80) NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (label)
);

CREATE TABLE IF NOT EXISTS ops_case_tags (
  case_id     TEXT NOT NULL REFERENCES ops_cases(id),
  tag_id      TEXT NOT NULL REFERENCES ops_tag_taxonomy(id),
  applied_by  TEXT REFERENCES workforce_principals(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (case_id, tag_id)
);

-- ── Case state history (immutable audit of case transitions) ───────────

CREATE TABLE IF NOT EXISTS ops_case_state_history (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES ops_cases(id),
  from_status     VARCHAR(40),
  to_status       VARCHAR(40) NOT NULL,
  actor_id        TEXT REFERENCES workforce_principals(id),
  reason          VARCHAR(240),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_case_state_history_case
  ON ops_case_state_history (case_id, created_at DESC);

-- ── Seed tag taxonomy ──────────────────────────────────────────────────

INSERT INTO ops_tag_taxonomy (id, label, category, description) VALUES
  ('tag_vulnerable_customer', 'vulnerable_customer', 'risk', 'Customer flagged as vulnerable'),
  ('tag_financial_harm', 'financial_harm', 'risk', 'Case involves financial harm to customer'),
  ('tag_fraud_suspected', 'fraud_suspected', 'risk', 'Fraud is suspected'),
  ('tag_high_value', 'high_value', 'risk', 'High financial value at stake'),
  ('tag_regulatory', 'regulatory', 'compliance', 'Regulatory or legal obligation'),
  ('tag_legal_hold', 'legal_hold', 'compliance', 'Legal hold — no deletion'),
  ('tag_repeated_complaint', 'repeated_complaint', 'pattern', 'Customer has repeated complaints'),
  ('tag_priority_escalation', 'priority_escalation', 'priority', 'Escalated priority'),
  ('tag_provider_outage', 'provider_outage', 'incident', 'Provider outage related'),
  ('tag_drip_pricing', 'drip_pricing', 'compliance', 'CMA drip-pricing concern')
ON CONFLICT (label) DO NOTHING;

COMMENT ON TABLE ops_cases IS
  'Operating backbone — every privileged action links to a case for purpose, ownership, SLA, evidence, and review.';
COMMENT ON TABLE ops_evidence IS
  'Immutable evidence with hash, sensitivity, and legal-hold. Retention-governed.';
COMMENT ON TABLE ops_notes IS
  'Append-only authored notes. Corrections are linked, never overwrite.';

