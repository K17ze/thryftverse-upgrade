-- Migration 160: Workforce identity and authorization plane
--
-- Establishes a dedicated workforce identity model separate from consumer
-- auth. Consumer JWTs (audience "thryftverse-app") are cryptographically
-- rejected by the ops route boundary — this model uses a separate audience
-- "thryftverse-ops" and a dedicated session table.
--
-- Implements NCSC ZTNA (May 2026) design requirements:
--   - No implicit trust based on network location
--   - Per-request authorization based on identity, device, context, policy
--   - Continual verification, not one-time access decisions
--   - Signals and policy engine architecture
--
-- Implements NIST SP 800-63B-4 (July 2025 final):
--   - Phishing-resistant MFA (WebAuthn/FIDO2) required for AAL2+/AAL3
--   - Step-up authentication before high-impact actions
--   - Managed device posture for privileged access
--
-- All permission checks are deny-by-default. admin:* is prohibited in
-- human entitlements. Every grant is time-bound (JIT), not permanent.

-- ── Workforce principals ────────────────────────────────────────────────
-- A workforce principal is a verified human operator, NOT a consumer user.
-- Service identities use a separate flag and cannot log into the console.

CREATE TABLE IF NOT EXISTS workforce_principals (
  id              TEXT PRIMARY KEY,
  idp_subject     VARCHAR(255) NOT NULL,
  display_name    VARCHAR(180) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  team            VARCHAR(120) NOT NULL,
  region          VARCHAR(80)  NOT NULL DEFAULT 'global',
  legal_entity    VARCHAR(120) NOT NULL DEFAULT 'thryftverse-ltd',
  jurisdiction    VARCHAR(80),
  employment_status VARCHAR(40) NOT NULL DEFAULT 'active',
  is_service_identity BOOLEAN NOT NULL DEFAULT FALSE,
  auth_assurance_level SMALLINT NOT NULL DEFAULT 1,
  managed_device_id VARCHAR(255),
  training_flags  JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_score      SMALLINT NOT NULL DEFAULT 0,
  dormant_since   TIMESTAMPTZ,
  disabled_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idp_subject)
);

CREATE INDEX IF NOT EXISTS idx_workforce_principals_team
  ON workforce_principals (team);
CREATE INDEX IF NOT EXISTS idx_workforce_principals_email
  ON workforce_principals (email);
CREATE INDEX IF NOT EXISTS idx_workforce_principals_active
  ON workforce_principals (employment_status) WHERE employment_status = 'active';

-- ── Workforce sessions ─────────────────────────────────────────────────
-- Separate from consumer user_sessions. Shorter idle and absolute lifetimes
-- for privileged surfaces. Records device posture and network zone.

CREATE TABLE IF NOT EXISTS workforce_sessions (
  id                TEXT PRIMARY KEY,
  principal_id      TEXT NOT NULL REFERENCES workforce_principals(id),
  idp_session_ref   VARCHAR(255),
  device_id         VARCHAR(255),
  device_posture    JSONB NOT NULL DEFAULT '{}'::jsonb,
  network_zone      VARCHAR(80) NOT NULL DEFAULT 'unknown',
  source_ip         VARCHAR(64),
  user_agent_hash   VARCHAR(64),
  auth_assurance    SMALLINT NOT NULL DEFAULT 1,
  step_up_at        TIMESTAMPTZ,
  step_up_reason    VARCHAR(120),
  risk_score        SMALLINT NOT NULL DEFAULT 0,
  idle_expires_at   TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workforce_sessions_principal
  ON workforce_sessions (principal_id);
CREATE INDEX IF NOT EXISTS idx_workforce_sessions_active
  ON workforce_sessions (principal_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workforce_sessions_expires
  ON workforce_sessions (absolute_expires_at) WHERE revoked_at IS NULL;

-- ── WebAuthn/FIDO2 credentials ─────────────────────────────────────────
-- Phishing-resistant authenticator registrations bound to workforce principals.

CREATE TABLE IF NOT EXISTS workforce_webauthn_credentials (
  id                TEXT PRIMARY KEY,
  principal_id      TEXT NOT NULL REFERENCES workforce_principals(id),
  credential_id     BYTEA NOT NULL,
  public_key        BYTEA NOT NULL,
  sign_count        BIGINT NOT NULL DEFAULT 0,
  transports        JSONB NOT NULL DEFAULT '[]'::jsonb,
  device_label      VARCHAR(120),
  is_backup_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  is_backed_up      BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_at      TIMESTAMPTZ,
  disabled_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (credential_id)
);

CREATE INDEX IF NOT EXISTS idx_workforce_webauthn_principal
  ON workforce_webauthn_credentials (principal_id) WHERE disabled_at IS NULL;

-- ── Roles and permissions ──────────────────────────────────────────────
-- Resource.action grammar. No admin:* wildcard. Every permission is explicit.

CREATE TABLE IF NOT EXISTS workforce_roles (
  id          TEXT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS workforce_permissions (
  id          TEXT PRIMARY KEY,
  action      VARCHAR(120) NOT NULL,
  description TEXT,
  risk_tier   VARCHAR(20) NOT NULL DEFAULT 'standard',
  requires_step_up BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  requires_separation_of_duty BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (action)
);

CREATE TABLE IF NOT EXISTS workforce_role_permissions (
  role_id       TEXT NOT NULL REFERENCES workforce_roles(id),
  permission_id TEXT NOT NULL REFERENCES workforce_permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

-- ── Grants (JIT, time-bound) ───────────────────────────────────────────
-- Entitlements are time-bound, not permanent. Scope JSON carries legal
-- entity, region, amount limits, and resource-type constraints.

CREATE TABLE IF NOT EXISTS workforce_grants (
  id              TEXT PRIMARY KEY,
  principal_id    TEXT NOT NULL REFERENCES workforce_principals(id),
  permission_id   TEXT NOT NULL REFERENCES workforce_permissions(id),
  scope           JSONB NOT NULL DEFAULT '{}'::jsonb,
  granted_by      TEXT REFERENCES workforce_principals(id),
  grant_reason    VARCHAR(240),
  effective_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workforce_grants_principal
  ON workforce_grants (principal_id);
CREATE INDEX IF NOT EXISTS idx_workforce_grants_active
  ON workforce_grants (principal_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workforce_grants_expiry
  ON workforce_grants (expires_at) WHERE revoked_at IS NULL;

-- ── Qualifications ─────────────────────────────────────────────────────
-- Training/certification flags required for money, safety, or regulated tasks.

CREATE TABLE IF NOT EXISTS workforce_qualifications (
  id              TEXT PRIMARY KEY,
  principal_id    TEXT NOT NULL REFERENCES workforce_principals(id),
  qualification   VARCHAR(120) NOT NULL,
  status          VARCHAR(40) NOT NULL DEFAULT 'current',
  earned_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (principal_id, qualification)
);

CREATE INDEX IF NOT EXISTS idx_workforce_qualifications_principal
  ON workforce_qualifications (principal_id) WHERE revoked_at IS NULL;

-- ── Access review campaigns ─────────────────────────────────────────────
-- Quarterly for normal access; monthly for high-risk money/data permissions.

CREATE TABLE IF NOT EXISTS access_review_campaigns (
  id              TEXT PRIMARY KEY,
  name            VARCHAR(180) NOT NULL,
  scope           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          VARCHAR(40) NOT NULL DEFAULT 'open',
  deadline_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS access_review_items (
  id              TEXT PRIMARY KEY,
  campaign_id     TEXT NOT NULL REFERENCES access_review_campaigns(id),
  grant_id        TEXT NOT NULL REFERENCES workforce_grants(id),
  reviewer_id     TEXT REFERENCES workforce_principals(id),
  decision        VARCHAR(40),
  decision_reason VARCHAR(240),
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_review_items_campaign
  ON access_review_items (campaign_id);

-- ── Break-glass sessions ────────────────────────────────────────────────
-- Emergency access with narrow permission, short TTL, mandatory after-review.

CREATE TABLE IF NOT EXISTS breakglass_sessions (
  id                TEXT PRIMARY KEY,
  principal_id      TEXT NOT NULL REFERENCES workforce_principals(id),
  incident_commander TEXT REFERENCES workforce_principals(id),
  reason            TEXT NOT NULL,
  permissions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  scope             JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at        TIMESTAMPTZ NOT NULL,
  review_required_by TIMESTAMPTZ NOT NULL,
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT REFERENCES workforce_principals(id),
  review_outcome    VARCHAR(40),
  review_notes      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breakglass_principal
  ON breakglass_sessions (principal_id);
CREATE INDEX IF NOT EXISTS idx_breakglass_unreviewed
  ON breakglass_sessions (review_required_by) WHERE reviewed_at IS NULL;

-- ── Authorization decision log ──────────────────────────────────────────
-- Every authorization decision (permit or deny) is recorded for monitoring
-- and anomaly detection. This is separate from the immutable audit chain.

CREATE TABLE IF NOT EXISTS authorization_decisions (
  id              TEXT PRIMARY KEY,
  principal_id    TEXT,
  session_id      TEXT,
  permission      VARCHAR(120) NOT NULL,
  resource_type   VARCHAR(80),
  resource_id     VARCHAR(120),
  decision        VARCHAR(20) NOT NULL,
  policy_version  VARCHAR(40),
  matched_grants  JSONB NOT NULL DEFAULT '[]'::jsonb,
  denial_reason   VARCHAR(120),
  step_up_required BOOLEAN NOT NULL DEFAULT FALSE,
  incident_mode   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_authz_decisions_principal
  ON authorization_decisions (principal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_authz_decisions_deny
  ON authorization_decisions (decision, created_at DESC) WHERE decision = 'deny';

-- ── Seed system roles and core permissions ──────────────────────────────

INSERT INTO workforce_roles (id, name, description, is_system) VALUES
  ('role_payments_ops', 'Payments Operations', 'Refunds, payment intents, disputes', TRUE),
  ('role_payouts_ops', 'Payouts Operations', 'Payout review, approval, reconciliation', TRUE),
  ('role_risk_treasury', 'Risk & Treasury', 'High-value payout approval, ledger adjustment', TRUE),
  ('role_finance_ops', 'Finance Operations', 'Reconciliation, journal, sweeps', TRUE),
  ('role_finance_controller', 'Finance Controller', 'Journal adjustment approval, reconciliation close', TRUE),
  ('role_trust_safety', 'Trust & Safety', 'Moderation, enforcement, appeals', TRUE),
  ('role_market_ops', 'Market Operations', 'Auctions, 1ZE, circuit breakers', TRUE),
  ('role_support_ops', 'Support Operations', 'Case management, customer contact, order correction', TRUE),
  ('role_commerce_lead', 'Commerce Lead', 'Order correction approval with financial effect', TRUE),
  ('role_security_audit', 'Security Audit', 'Read-only audit investigation', TRUE),
  ('role_access_admin', 'Access Administrator', 'Manage workforce entitlements and reviews', TRUE),
  ('role_incident_commander', 'Incident Commander', 'Break-glass, kill switches, incident mode', TRUE),
  ('role_system_ops', 'System Operations', 'Webhooks, DLQ, jobs, provider health', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO workforce_permissions (id, action, description, risk_tier, requires_step_up, requires_approval, requires_separation_of_duty) VALUES
  -- Payments
  ('perm_payments_intent_read', 'payments.intent.read', 'Read payment intents', 'standard', FALSE, FALSE, FALSE),
  ('perm_payments_refund_propose', 'payments.refund.propose', 'Propose a refund', 'elevated', FALSE, FALSE, FALSE),
  ('perm_payments_refund_approve', 'payments.refund.approve', 'Approve a refund', 'high', TRUE, TRUE, TRUE),
  ('perm_payments_dispute_read', 'payments.dispute.read', 'Read payment disputes', 'standard', FALSE, FALSE, FALSE),
  ('perm_payments_dispute_decide', 'payments.dispute.decide', 'Decide on a dispute', 'high', TRUE, TRUE, FALSE),
  -- Payouts
  ('perm_payouts_read_masked', 'payouts.read_masked', 'Read payouts with masked destination', 'standard', FALSE, FALSE, FALSE),
  ('perm_payouts_destination_reveal', 'payouts.destination.reveal', 'Reveal payout destination', 'high', TRUE, FALSE, FALSE),
  ('perm_payouts_approve_low', 'payouts.approve.low_value', 'Approve low-value payouts', 'elevated', FALSE, FALSE, FALSE),
  ('perm_payouts_approve_high', 'payouts.approve.high_value', 'Approve high-value payouts', 'high', TRUE, TRUE, TRUE),
  ('perm_payouts_queue_read', 'payouts.queue.read', 'Read payout queue', 'standard', FALSE, FALSE, FALSE),
  -- Ledger
  ('perm_ledger_read', 'ledger.read', 'Read ledger entries', 'standard', FALSE, FALSE, FALSE),
  ('perm_ledger_adjust_propose', 'ledger.adjust.propose', 'Propose ledger adjustment', 'elevated', FALSE, FALSE, FALSE),
  ('perm_ledger_adjust_approve', 'ledger.adjust.approve', 'Approve ledger adjustment', 'high', TRUE, TRUE, TRUE),
  -- Reconciliation
  ('perm_reconciliation_read', 'reconciliation.read', 'Read reconciliation runs', 'standard', FALSE, FALSE, FALSE),
  ('perm_reconciliation_break_resolve', 'reconciliation.break.resolve', 'Resolve reconciliation breaks', 'elevated', TRUE, FALSE, FALSE),
  ('perm_reconciliation_close', 'reconciliation.close', 'Close reconciliation run', 'high', TRUE, TRUE, FALSE),
  -- Orders
  ('perm_orders_read', 'orders.read', 'Read orders', 'standard', FALSE, FALSE, FALSE),
  ('perm_orders_override_propose', 'orders.override.propose', 'Propose order correction', 'elevated', FALSE, FALSE, FALSE),
  ('perm_orders_override_approve', 'orders.override.approve', 'Approve order correction with financial effect', 'high', TRUE, TRUE, FALSE),
  -- Trust & Safety
  ('perm_safety_case_read', 'safety.case.read', 'Read trust & safety cases', 'standard', FALSE, FALSE, FALSE),
  ('perm_safety_case_decide', 'safety.case.decide', 'Decide enforcement action', 'elevated', FALSE, FALSE, FALSE),
  ('perm_seller_review', 'seller.review', 'Review seller first-sale and onboarding', 'standard', FALSE, FALSE, FALSE),
  -- Customer data
  ('perm_customer_pii_reveal', 'customer.pii.reveal', 'Reveal customer PII (email, phone, address)', 'high', TRUE, FALSE, FALSE),
  ('perm_customer_export', 'customer.export', 'Export customer data', 'high', TRUE, TRUE, FALSE),
  -- Market operations
  ('perm_auctions_admin', 'auctions.admin', 'Auction admin operations', 'elevated', FALSE, FALSE, FALSE),
  ('perm_oneze_treasury', 'oneze.treasury', '1ZE treasury/market controls', 'high', TRUE, TRUE, FALSE),
  ('perm_market_circuit_breaker', 'market.circuit_breaker', 'Trigger or override circuit breaker', 'high', TRUE, TRUE, FALSE),
  -- System operations
  ('perm_webhooks_read', 'webhooks.read', 'Read webhook inbox', 'standard', FALSE, FALSE, FALSE),
  ('perm_dlq_read', 'dlq.read', 'Read DLQ entries', 'standard', FALSE, FALSE, FALSE),
  ('perm_dlq_replay', 'dlq.replay', 'Replay DLQ job', 'elevated', FALSE, TRUE, FALSE),
  ('perm_dlq_purge', 'dlq.purge', 'Purge DLQ entries', 'high', TRUE, TRUE, FALSE),
  ('perm_jobs_read', 'jobs.read', 'Read job/worker status', 'standard', FALSE, FALSE, FALSE),
  -- Audit
  ('perm_audit_read', 'audit.read', 'Read immutable audit events', 'standard', FALSE, FALSE, FALSE),
  ('perm_access_manage', 'access.manage', 'Manage workforce entitlements and reviews', 'high', TRUE, FALSE, FALSE),
  -- Incident
  ('perm_incident_breakglass', 'incident.breakglass', 'Start break-glass session', 'high', TRUE, FALSE, FALSE),
  ('perm_incident_kill_switch', 'incident.kill_switch', 'Trigger domain kill switch', 'critical', TRUE, TRUE, FALSE),
  -- Cases
  ('perm_cases_read', 'cases.read', 'Read cases', 'standard', FALSE, FALSE, FALSE),
  ('perm_cases_assign', 'cases.assign', 'Assign/reassign cases', 'standard', FALSE, FALSE, FALSE),
  ('perm_cases_decide', 'cases.decide', 'Make case decisions', 'elevated', FALSE, FALSE, FALSE),
  ('perm_cases_create', 'cases.create', 'Create new cases', 'standard', FALSE, FALSE, FALSE)
ON CONFLICT (action) DO NOTHING;

-- ── Role → permission mappings ──────────────────────────────────────────

INSERT INTO workforce_role_permissions (role_id, permission_id) VALUES
  -- Payments Operations
  ('role_payments_ops', 'perm_payments_intent_read'),
  ('role_payments_ops', 'perm_payments_refund_propose'),
  ('role_payments_ops', 'perm_payments_dispute_read'),
  ('role_payments_ops', 'perm_cases_read'),
  ('role_payments_ops', 'perm_cases_create'),
  ('role_payments_ops', 'perm_orders_read'),
  ('role_payments_ops', 'perm_customer_pii_reveal'),
  -- Payouts Operations
  ('role_payouts_ops', 'perm_payouts_read_masked'),
  ('role_payouts_ops', 'perm_payouts_approve_low'),
  ('role_payouts_ops', 'perm_payouts_queue_read'),
  ('role_payouts_ops', 'perm_cases_read'),
  ('role_payouts_ops', 'perm_cases_create'),
  ('role_payouts_ops', 'perm_reconciliation_read'),
  -- Risk & Treasury
  ('role_risk_treasury', 'perm_payouts_approve_high'),
  ('role_risk_treasury', 'perm_payouts_destination_reveal'),
  ('role_risk_treasury', 'perm_payouts_read_masked'),
  ('role_risk_treasury', 'perm_payouts_queue_read'),
  ('role_risk_treasury', 'perm_cases_read'),
  -- Finance Operations
  ('role_finance_ops', 'perm_reconciliation_read'),
  ('role_finance_ops', 'perm_reconciliation_break_resolve'),
  ('role_finance_ops', 'perm_ledger_read'),
  ('role_finance_ops', 'perm_ledger_adjust_propose'),
  ('role_finance_ops', 'perm_cases_read'),
  ('role_finance_ops', 'perm_cases_create'),
  -- Finance Controller
  ('role_finance_controller', 'perm_ledger_adjust_approve'),
  ('role_finance_controller', 'perm_reconciliation_close'),
  ('role_finance_controller', 'perm_ledger_read'),
  ('role_finance_controller', 'perm_reconciliation_read'),
  ('role_finance_controller', 'perm_cases_read'),
  -- Trust & Safety
  ('role_trust_safety', 'perm_safety_case_read'),
  ('role_trust_safety', 'perm_safety_case_decide'),
  ('role_trust_safety', 'perm_seller_review'),
  ('role_trust_safety', 'perm_cases_read'),
  ('role_trust_safety', 'perm_cases_create'),
  ('role_trust_safety', 'perm_cases_assign'),
  ('role_trust_safety', 'perm_cases_decide'),
  ('role_trust_safety', 'perm_customer_pii_reveal'),
  -- Market Operations
  ('role_market_ops', 'perm_auctions_admin'),
  ('role_market_ops', 'perm_oneze_treasury'),
  ('role_market_ops', 'perm_market_circuit_breaker'),
  ('role_market_ops', 'perm_cases_read'),
  ('role_market_ops', 'perm_cases_create'),
  -- Support Operations
  ('role_support_ops', 'perm_cases_read'),
  ('role_support_ops', 'perm_cases_create'),
  ('role_support_ops', 'perm_cases_assign'),
  ('role_support_ops', 'perm_cases_decide'),
  ('role_support_ops', 'perm_orders_read'),
  ('role_support_ops', 'perm_orders_override_propose'),
  ('role_support_ops', 'perm_customer_pii_reveal'),
  ('role_support_ops', 'perm_payments_intent_read'),
  ('role_support_ops', 'perm_payments_dispute_read'),
  -- Commerce Lead
  ('role_commerce_lead', 'perm_orders_override_approve'),
  ('role_commerce_lead', 'perm_orders_read'),
  ('role_commerce_lead', 'perm_cases_read'),
  -- Security Audit
  ('role_security_audit', 'perm_audit_read'),
  ('role_security_audit', 'perm_cases_read'),
  -- Access Admin
  ('role_access_admin', 'perm_access_manage'),
  ('role_access_admin', 'perm_audit_read'),
  -- Incident Commander
  ('role_incident_commander', 'perm_incident_breakglass'),
  ('role_incident_commander', 'perm_incident_kill_switch'),
  ('role_incident_commander', 'perm_cases_read'),
  ('role_incident_commander', 'perm_cases_create'),
  -- System Operations
  ('role_system_ops', 'perm_webhooks_read'),
  ('role_system_ops', 'perm_dlq_read'),
  ('role_system_ops', 'perm_dlq_replay'),
  ('role_system_ops', 'perm_jobs_read'),
  ('role_system_ops', 'perm_cases_read'),
  ('role_system_ops', 'perm_cases_create')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE workforce_principals IS
  'Workforce identity plane — separate from consumer users. Every privileged action is attributable to one verified workforce principal.';
COMMENT ON TABLE workforce_grants IS
  'JIT time-bound entitlements. No permanent grants. admin:* is prohibited in human entitlements.';
COMMENT ON TABLE workforce_permissions IS
  'Resource.action permission grammar. Deny-by-default. No wildcards.';

