-- Migration 171: Safety case graph — canonical trust & safety workflow (P0-H / TS-19)
--
-- The general ops_cases model (migration 161) is a domain-agnostic work-item
-- backbone. Trust & safety needs a purpose-built case graph that maps to the
-- EU Digital Services Act (DSA) and the UK Online Safety Act (OSA) regulatory
-- obligations: notice intake, evidence with chain of custody, policy-linked
-- decisions, DSA statements of reasons, enforcement, appeal, and an immutable
-- audit trail.
--
-- Case graph:
--   safety_notices ──> safety_cases ──> safety_decisions ──> enforcement_actions
--                                  │                       ├──> statements_of_reasons
--                                  │                       └──> safety_appeals
--                                  ├──> safety_case_evidence
--                                  └──> safety_audit_events
--
-- Reason taxonomy and policy versions are versioned reference data so that a
-- decision taken today can be reasoned about under the policy that was in
-- force at the time, even after the policy is superseded.

-- ── Reason codes (versioned taxonomy) ────────────────────────────────────
-- Maps mobile report reasons (TS-03) to DSA harmonised categories and the
-- Ofcom 18 priority offences. Superseded codes are retained, never deleted.

CREATE TABLE IF NOT EXISTS safety_reason_codes (
  code                 TEXT PRIMARY KEY,
  dsa_category         TEXT,                -- maps to DSA harmonised taxonomy
  uk_priority_offence  TEXT,                -- maps to Ofcom 18 priority offences
  severity_class       SMALLINT NOT NULL,   -- 1=low, 2=medium, 3=high, 4=critical
  user_facing_label    TEXT NOT NULL,
  is_illegal_content   BOOLEAN NOT NULL DEFAULT FALSE,
  requires_legal_review BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at        TIMESTAMPTZ
);

-- ── Policy versions ──────────────────────────────────────────────────────
-- A decision always cites the policy version in force at decision time so the
-- user-facing explanation can be reproduced exactly later.

CREATE TABLE IF NOT EXISTS policy_versions (
  id                                TEXT PRIMARY KEY,
  version                           TEXT NOT NULL UNIQUE,
  jurisdiction                      TEXT NOT NULL,
  effective_from                    TIMESTAMPTZ NOT NULL,
  effective_until                   TIMESTAMPTZ,
  user_facing_explanation_template  TEXT NOT NULL,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Safety notices (intake) ──────────────────────────────────────────────
-- The entry point: a reporter (or system) flags a subject. Idempotent on
-- (reporter_id, idempotency_key) so retries do not create duplicate notices.
-- A notice may or may not become a case (e.g. clearly unfounded reports).

CREATE TABLE IF NOT EXISTS safety_notices (
  id                    TEXT PRIMARY KEY,
  idempotency_key       TEXT NOT NULL,
  reporter_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  subject_type          TEXT NOT NULL CHECK (subject_type IN
    ('user','listing','message','conversation','media','auction','live_session')),
  subject_id            TEXT NOT NULL,
  subject_snapshot      JSONB NOT NULL,
  basis                 TEXT NOT NULL CHECK (basis IN ('terms','illegal_content','unsure')),
  reason_code           TEXT NOT NULL REFERENCES safety_reason_codes(code),
  jurisdiction          TEXT,
  urgency               TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN
    ('normal','elevated','emergency')),
  allegation            TEXT,
  reporter_status       TEXT,
  acknowledgement_state TEXT NOT NULL DEFAULT 'pending' CHECK (acknowledgement_state IN
    ('pending','sent','failed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(reporter_id, idempotency_key)
);

-- ── Safety cases ─────────────────────────────────────────────────────────
-- The work item. Severity, SLA class, minor/vulnerable markers and virality
-- drive queue ordering. Linked cases form a graph via linked_case_ids.

CREATE TABLE IF NOT EXISTS safety_cases (
  id                       TEXT PRIMARY KEY,
  notice_id                TEXT REFERENCES safety_notices(id),
  owner_team               TEXT,
  severity                 SMALLINT NOT NULL DEFAULT 2,
  involves_minor           BOOLEAN NOT NULL DEFAULT FALSE,
  involves_vulnerable_user BOOLEAN NOT NULL DEFAULT FALSE,
  virality_score           INTEGER NOT NULL DEFAULT 0,
  exposure_count           INTEGER NOT NULL DEFAULT 0,
  sla_class                TEXT NOT NULL DEFAULT 'standard' CHECK (sla_class IN
    ('standard','priority','emergency')),
  sla_deadline             TIMESTAMPTZ,
  status                   TEXT NOT NULL DEFAULT 'open' CHECK (status IN
    ('open','under_review','decision_pending','enforcement_pending',
     'closed','appealed','reopened')),
  linked_case_ids          TEXT[],
  policy_version_id        TEXT REFERENCES policy_versions(id),
  jurisdiction             TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at                TIMESTAMPTZ
);

-- ── Evidence ─────────────────────────────────────────────────────────────
-- Immutable evidence with content hash and chain of custody. Access class
-- gates who may view (e.g. CSAM-restricted material is isolated). Cascade
-- delete so a case purge removes its evidence, subject to retention policy.

CREATE TABLE IF NOT EXISTS safety_case_evidence (
  id                TEXT PRIMARY KEY,
  case_id           TEXT NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  media_asset_id    TEXT REFERENCES media_assets(id),
  evidence_hash     BYTEA NOT NULL,
  source            TEXT NOT NULL CHECK (source IN
    ('reporter','system_scan','provider','partner_notice','law_enforcement')),
  access_class      TEXT NOT NULL CHECK (access_class IN
    ('standard','sensitive','legal_hold','csam_restricted')),
  retention_class   TEXT NOT NULL,
  chain_of_custody  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Decisions ────────────────────────────────────────────────────────────
-- Policy-linked decisions. Captures whether automated means were used (DSA
-- Art. 17/22 transparency) with model provenance, plus the human reviewer.

CREATE TABLE IF NOT EXISTS safety_decisions (
  id                 TEXT PRIMARY KEY,
  case_id            TEXT NOT NULL REFERENCES safety_cases(id),
  decision           TEXT NOT NULL CHECK (decision IN
    ('no_violation','restrict','escalate','emergency_hold')),
  policy_rule_id     TEXT NOT NULL,
  policy_version_id  TEXT NOT NULL REFERENCES policy_versions(id),
  evidence_ids       TEXT[] NOT NULL,
  territorial_scope  TEXT[],
  duration_kind      TEXT NOT NULL CHECK (duration_kind IN ('permanent','temporary')),
  duration_until     TIMESTAMPTZ,
  user_reason_code   TEXT NOT NULL REFERENCES safety_reason_codes(code),
  internal_reason    TEXT NOT NULL,
  automated_means    BOOLEAN NOT NULL DEFAULT FALSE,
  model_id           TEXT,
  model_version      TEXT,
  model_confidence   REAL,
  human_reviewer_id  TEXT REFERENCES users(id),
  decided_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Enforcement actions ──────────────────────────────────────────────────
-- The concrete actions taken against a target. Reversible with audit.

CREATE TABLE IF NOT EXISTS enforcement_actions (
  id              TEXT PRIMARY KEY,
  decision_id     TEXT NOT NULL REFERENCES safety_decisions(id),
  action_type     TEXT NOT NULL CHECK (action_type IN
    ('content_removal','visibility_restriction','feature_limit','warning',
     'account_restriction','account_suspension','emergency_hold','monetary_restriction')),
  target_type     TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  scope           JSONB NOT NULL,
  executed_at     TIMESTAMPTZ,
  reversed_at     TIMESTAMPTZ,
  reversed_by     TEXT REFERENCES users(id),
  reversal_reason TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','executed','failed','reversed'))
);

-- ── Statements of reasons (DSA Art. 24) ──────────────────────────────────
-- The mandatory DSA transparency record. PUID is the public unique identifier
-- submitted to the DSA transparency database. One per decision.

CREATE TABLE IF NOT EXISTS statements_of_reasons (
  id                       TEXT PRIMARY KEY,
  decision_id              TEXT NOT NULL REFERENCES safety_decisions(id),
  affected_user_id         TEXT NOT NULL REFERENCES users(id),
  decision_visibility      BOOLEAN NOT NULL DEFAULT FALSE,
  decision_mandatory       BOOLEAN NOT NULL DEFAULT FALSE,
  decision_provision       BOOLEAN NOT NULL DEFAULT FALSE,
  decision_account         BOOLEAN NOT NULL DEFAULT FALSE,
  territorial_scope        TEXT[] NOT NULL DEFAULT '{}',
  duration                 TEXT NOT NULL,
  facts                    TEXT NOT NULL,
  automated_means          BOOLEAN NOT NULL DEFAULT FALSE,
  source                   TEXT NOT NULL,
  puid                     TEXT NOT NULL UNIQUE,
  dsa_category             TEXT NOT NULL,
  user_notification_state  TEXT NOT NULL DEFAULT 'pending',
  submitted_to_dsa_db      BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Appeals ──────────────────────────────────────────────────────────────
-- DSA Art. 20 / UK OSA appeal rights. Independent reviewer option.

CREATE TABLE IF NOT EXISTS safety_appeals (
  id                      TEXT PRIMARY KEY,
  decision_id             TEXT NOT NULL REFERENCES safety_decisions(id),
  appellant_id            TEXT NOT NULL REFERENCES users(id),
  grounds                 TEXT NOT NULL,
  new_evidence_ids        TEXT[],
  independent_reviewer_id TEXT REFERENCES users(id),
  deadline                TIMESTAMPTZ NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN
    ('submitted','under_review','upheld','overturned','withdrawn')),
  outcome_reason          TEXT,
  remedy                  TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at              TIMESTAMPTZ
);

-- ── Audit events (immutable) ─────────────────────────────────────────────
-- Append-only audit of every privileged action on a case.

CREATE TABLE IF NOT EXISTS safety_audit_events (
  id          TEXT PRIMARY KEY,
  case_id     TEXT REFERENCES safety_cases(id),
  actor_id    TEXT REFERENCES users(id),
  event_type  TEXT NOT NULL,
  event_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────
-- Queue ordering, case lookup, audit trail, and FK join paths.

CREATE INDEX IF NOT EXISTS idx_safety_cases_status_severity
  ON safety_cases (status, severity DESC);
CREATE INDEX IF NOT EXISTS idx_safety_cases_sla_deadline
  ON safety_cases (sla_deadline) WHERE status IN ('open','under_review');
CREATE INDEX IF NOT EXISTS idx_safety_notices_reporter
  ON safety_notices (reporter_id);
CREATE INDEX IF NOT EXISTS idx_safety_audit_case
  ON safety_audit_events (case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_safety_decisions_case
  ON safety_decisions (case_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_appeals_decision
  ON safety_appeals (decision_id, status);
CREATE INDEX IF NOT EXISTS idx_statements_of_reasons_decision
  ON statements_of_reasons (decision_id);
CREATE INDEX IF NOT EXISTS idx_enforcement_actions_decision
  ON enforcement_actions (decision_id, status);

-- ── Seed reason codes ────────────────────────────────────────────────────
-- Full taxonomy matching the mobile report UI (TS-03). Covers DSA harmonised
-- categories and Ofcom 18 priority offences where applicable.

INSERT INTO safety_reason_codes (code, dsa_category, uk_priority_offence, severity_class, user_facing_label, is_illegal_content, requires_legal_review) VALUES
  ('spam',          'scams_and_frauds',    NULL,                    1, 'Spam',                     FALSE, FALSE),
  ('harassment',    'cyber_violence',      'harassment',            2, 'Harassment',               FALSE, FALSE),
  ('hate_speech',   'cyber_violence',      'hate_crime',            3, 'Hate speech',              TRUE,  FALSE),
  ('counterfeit',   'scams_and_frauds',    'fraud',                 2, 'Fake item',                FALSE, FALSE),
  ('prohibited',    NULL,                  NULL,                    3, 'Prohibited item',          TRUE,  TRUE),
  ('off_platform',  'scams_and_frauds',    'fraud',                 2, 'Off-platform request',     FALSE, FALSE),
  ('scam',          'scams_and_frauds',    'fraud',                 3, 'Scam or fraud',            TRUE,  FALSE),
  ('misinformation',NULL,                  NULL,                    2, 'Misleading content',       FALSE, FALSE),
  ('privacy',       NULL,                  NULL,                    2, 'Privacy violation',        FALSE, FALSE),
  ('impersonation', 'cyber_violence',      NULL,                    2, 'Impersonation',            FALSE, FALSE),
  ('minor_safety',  'protection_of_minors','child_sexual_abuse',    4, 'Minor safety',             TRUE,  TRUE),
  ('cyberflashing', 'cyber_violence',      'cyberflashing',         4, 'Image-based sexual abuse', TRUE,  TRUE),
  ('self_harm',     NULL,                  'suicide_and_self_harm', 4, 'Suicide and self-harm',    FALSE, TRUE),
  ('inappropriate', NULL,                  NULL,                    1, 'Inappropriate',            FALSE, FALSE),
  ('unresponsive',  NULL,                  NULL,                    1, 'Unresponsive seller',      FALSE, FALSE),
  ('other',         NULL,                  NULL,                    1, 'Something else',           FALSE, FALSE)
ON CONFLICT (code) DO NOTHING;

-- ── Seed initial policy version ──────────────────────────────────────────

INSERT INTO policy_versions (id, version, jurisdiction, effective_from, user_facing_explanation_template)
VALUES ('policy_v1_uk', '1.0-uk', 'GB', NOW(), 'Content on ThryftVerse must follow our Community Standards. This action was taken under version {version} of our policies.')
ON CONFLICT (version) DO NOTHING;

-- ── Table comments ───────────────────────────────────────────────────────

COMMENT ON TABLE safety_reason_codes IS
  'Versioned trust & safety reason taxonomy mapping mobile report reasons to DSA harmonised categories and Ofcom 18 priority offences. Superseded codes are retained.';
COMMENT ON TABLE policy_versions IS
  'Versioned policy text so a decision can always be explained under the policy in force at the time it was taken.';
COMMENT ON TABLE safety_notices IS
  'Intake entry point — a reporter or system flags a subject. Idempotent on (reporter_id, idempotency_key). A notice may or may not become a case.';
COMMENT ON TABLE safety_cases IS
  'Trust & safety work item. Severity, SLA class, minor/vulnerable markers and virality drive queue ordering. Linked cases form a graph.';
COMMENT ON TABLE safety_case_evidence IS
  'Immutable evidence with content hash, access class, retention class, and chain of custody. Cascade-deleted with its case subject to retention policy.';
COMMENT ON TABLE safety_decisions IS
  'Policy-linked decision on a case. Records whether automated means were used (DSA Art. 17/22) with model provenance and the human reviewer.';
COMMENT ON TABLE enforcement_actions IS
  'Concrete actions taken against a target as a result of a decision. Reversible with audit.';
COMMENT ON TABLE statements_of_reasons IS
  'DSA Art. 24 statement of reasons — the mandatory transparency record submitted to the DSA transparency database. One per decision.';
COMMENT ON TABLE safety_appeals IS
  'Appeal of a decision (DSA Art. 20 / UK OSA). Supports independent reviewer and new evidence.';
COMMENT ON TABLE safety_audit_events IS
  'Append-only audit trail of every privileged action on a safety case.';
