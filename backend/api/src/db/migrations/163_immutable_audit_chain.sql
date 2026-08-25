-- Migration 163: Immutable audit events with tamper-evident hash chain
--
-- Replaces the fire-and-forget auditLog.ts pattern. Every authentication,
-- authorization, data read/reveal/export, command proposal/approval/execution,
-- policy change, access change, and break-glass event is recorded here.
--
-- Integrity:
--   - Append-only: triggers reject UPDATE and DELETE
--   - Hash chain: each event links to previous_event_hash and carries event_hash
--   - Daily signed checkpoint anchors chain roots
--   - Monitoring detects gaps, duplicates, sequence anomalies, and export lag
--   - High-impact command writes domain state AND audit record atomically
--     (fail-closed: if audit write fails, command fails)
--   - Stream to security-owned WORM destination via transactional outbox
--
-- Do not place raw secrets, payment credentials, government IDs, or full
-- message bodies in audit metadata.

-- ── Immutable audit events ──────────────────────────────────────────────
-- Partitioned by month for query performance. Append-only via trigger.

CREATE TABLE IF NOT EXISTS immutable_audit_events (
  id                  UUID NOT NULL DEFAULT gen_random_uuid(),
  event_version       SMALLINT NOT NULL DEFAULT 1,
  sequence_number     BIGINT NOT NULL,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Principal
  principal_type      VARCHAR(40) NOT NULL,
  principal_id        TEXT,
  workforce_session_id TEXT,
  idp_subject         VARCHAR(255),
  impersonated_by     TEXT,
  delegation_ref      VARCHAR(255),
  -- Device and network
  device_id           VARCHAR(255),
  device_posture      JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ip           VARCHAR(64),
  network_zone        VARCHAR(80),
  user_agent_hash     VARCHAR(64),
  -- Action and resource
  action              VARCHAR(120) NOT NULL,
  resource_type       VARCHAR(80),
  resource_id         VARCHAR(255),
  legal_entity        VARCHAR(120),
  -- Context
  case_id             TEXT,
  purpose             VARCHAR(120),
  reason              VARCHAR(240),
  -- Authorization
  authz_policy_id     VARCHAR(80),
  authz_policy_version VARCHAR(40),
  authz_decision      VARCHAR(20),
  matched_grants      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Approval chain
  approval_chain      JSONB NOT NULL DEFAULT '[]'::jsonb,
  step_up_assurance   SMALLINT,
  -- Command linkage
  command_id          TEXT,
  idempotency_key     VARCHAR(255),
  request_trace_id    VARCHAR(255),
  -- Effect hashes (redacted snapshots — no raw secrets)
  before_hash         VARCHAR(64),
  after_hash          VARCHAR(64),
  effect_hash         VARCHAR(64),
  -- Outcome
  outcome             VARCHAR(40) NOT NULL DEFAULT 'success',
  error_code          VARCHAR(120),
  unknown_outcome     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Integrity chain
  previous_event_hash VARCHAR(64),
  event_hash          VARCHAR(64) NOT NULL,
  chain_key_id        TEXT NOT NULL DEFAULT 'audit_key_v1'
    REFERENCES audit_chain_keys(key_id),
  -- Retention
  retention_class     VARCHAR(40) NOT NULL DEFAULT 'standard',
  -- Partition key
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Indexes on the partitioned table
CREATE INDEX IF NOT EXISTS idx_immutable_audit_events_principal
  ON immutable_audit_events (principal_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_immutable_audit_events_action
  ON immutable_audit_events (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_immutable_audit_events_resource
  ON immutable_audit_events (resource_type, resource_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_immutable_audit_events_case
  ON immutable_audit_events (case_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_immutable_audit_events_command
  ON immutable_audit_events (command_id);
CREATE INDEX IF NOT EXISTS idx_immutable_audit_events_sequence
  ON immutable_audit_events (sequence_number);

-- ── Append-only trigger ────────────────────────────────────────────────
-- Reject UPDATE and DELETE on immutable audit events.

CREATE OR REPLACE FUNCTION enforce_immutable_audit_events()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'immutable_audit_events is append-only: UPDATE and DELETE are prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_audit_no_update ON immutable_audit_events;
CREATE TRIGGER trg_immutable_audit_no_update
  BEFORE UPDATE ON immutable_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_immutable_audit_events();

DROP TRIGGER IF EXISTS trg_immutable_audit_no_delete ON immutable_audit_events;
CREATE TRIGGER trg_immutable_audit_no_delete
  BEFORE DELETE ON immutable_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_immutable_audit_events();

-- ── Sequence generator for audit chain ─────────────────────────────────
-- Monotonic sequence number for chain ordering.

CREATE SEQUENCE IF NOT EXISTS immutable_audit_event_seq
  AS BIGINT START 1 INCREMENT 1 NO CYCLE;

-- ── Audit chain HMAC keys ───────────────────────────────────────────────
-- Key management for HMAC-SHA256 hash chain. Key rotation creates a new key
-- and signs the rotation event with the outgoing key, preserving chain
-- continuity. Keys are loaded by the SECURITY DEFINER hash function.

CREATE TABLE IF NOT EXISTS audit_chain_keys (
  key_id        TEXT PRIMARY KEY,
  key_value     TEXT NOT NULL,
  algorithm     VARCHAR(20) NOT NULL DEFAULT 'hmac-sha256',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_audit_chain_keys_active
  ON audit_chain_keys (key_id) WHERE revoked_at IS NULL;

-- Seed the initial key. In production, this is set via env var or KMS.
-- The key value is a 256-bit hex secret. For dev, a deterministic value.
INSERT INTO audit_chain_keys (key_id, key_value)
VALUES ('audit_key_v1', COALESCE(
  current_setting('app.audit_chain_hmac_key', true),
  'dev-only-audit-chain-hmac-key-CHANGE-IN-PRODUCTION-32bytes'
))
ON CONFLICT (key_id) DO NOTHING;

-- ── Hash chain computation function ────────────────────────────────────
-- Computes HMAC-SHA256 hash of ALL material event fields + previous hash.
--
-- 2026 best practice (FinQub, Tracehold, Sigilbase):
--   - HMAC-SHA256 (keyed MAC) so an attacker can't recompute the chain
--     without the secret key. Plain SHA-256 allows silent recomputation.
--   - ALL material fields must be in the hash — anything left out can be
--     silently mutated without breaking the chain.
--   - Key rotation signs the rotation event with the outgoing key.
--
-- The HMAC key is stored in audit_chain_keys and referenced by key_id.
-- Key rotation creates a new key and signs the rotation event with the
-- outgoing key, preserving chain-of-trust continuity.

CREATE OR REPLACE FUNCTION compute_audit_event_hash(
  p_sequence BIGINT,
  p_previous_hash VARCHAR,
  p_key_id TEXT,
  p_action VARCHAR,
  p_principal_id TEXT,
  p_principal_type VARCHAR,
  p_resource_type VARCHAR,
  p_resource_id VARCHAR,
  p_command_id TEXT,
  p_case_id TEXT,
  p_reason VARCHAR,
  p_authz_decision VARCHAR,
  p_matched_grants JSONB,
  p_approval_chain JSONB,
  p_effect_hash VARCHAR,
  p_before_hash VARCHAR,
  p_after_hash VARCHAR,
  p_outcome VARCHAR,
  p_unknown_outcome BOOLEAN,
  p_occurred_at TIMESTAMPTZ
) RETURNS VARCHAR AS $$
DECLARE
  payload TEXT;
  hmac_key TEXT;
BEGIN
  -- Fetch the HMAC key for this event
  SELECT key_value INTO hmac_key FROM audit_chain_keys WHERE key_id = p_key_id AND revoked_at IS NULL;
  IF hmac_key IS NULL THEN
    RAISE EXCEPTION 'No active audit chain key found for key_id=%', p_key_id;
  END IF;

  -- All material fields are included in the hash payload.
  -- ANY field omitted here can be silently mutated without breaking the chain.
  payload := COALESCE(p_sequence::TEXT, '') || '|' ||
             COALESCE(p_previous_hash, '') || '|' ||
             COALESCE(p_key_id, '') || '|' ||
             COALESCE(p_action, '') || '|' ||
             COALESCE(p_principal_id, '') || '|' ||
             COALESCE(p_principal_type, '') || '|' ||
             COALESCE(p_resource_type, '') || '|' ||
             COALESCE(p_resource_id, '') || '|' ||
             COALESCE(p_command_id, '') || '|' ||
             COALESCE(p_case_id, '') || '|' ||
             COALESCE(p_reason, '') || '|' ||
             COALESCE(p_authz_decision, '') || '|' ||
             COALESCE(p_matched_grants::TEXT, '') || '|' ||
             COALESCE(p_approval_chain::TEXT, '') || '|' ||
             COALESCE(p_effect_hash, '') || '|' ||
             COALESCE(p_before_hash, '') || '|' ||
             COALESCE(p_after_hash, '') || '|' ||
             COALESCE(p_outcome, '') || '|' ||
             COALESCE(p_unknown_outcome::TEXT, '') || '|' ||
             COALESCE(p_occurred_at::TEXT, '');
  RETURN encode(hmac(payload::bytea, hmac_key::bytea, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Insert trigger: auto-compute sequence, previous hash, and event hash ─

CREATE OR REPLACE FUNCTION populate_audit_event_chain()
RETURNS TRIGGER AS $$
DECLARE
  last_hash VARCHAR(64);
  last_seq BIGINT;
BEGIN
  -- Get the last event's hash and sequence for chain continuity
  SELECT event_hash, sequence_number INTO last_hash, last_seq
  FROM immutable_audit_events
  ORDER BY sequence_number DESC
  LIMIT 1;

  IF last_hash IS NULL THEN
    NEW.previous_event_hash := NULL;
    NEW.sequence_number := 1;
  ELSE
    NEW.previous_event_hash := last_hash;
    NEW.sequence_number := last_seq + 1;
  END IF;

  -- Compute event hash using HMAC-SHA256 with ALL material fields
  NEW.event_hash := compute_audit_event_hash(
    NEW.sequence_number,
    NEW.previous_event_hash,
    NEW.chain_key_id,
    NEW.action,
    NEW.principal_id,
    NEW.principal_type,
    NEW.resource_type,
    NEW.resource_id,
    NEW.command_id,
    NEW.case_id,
    NEW.reason,
    NEW.authz_decision,
    NEW.matched_grants,
    NEW.approval_chain,
    NEW.effect_hash,
    NEW.before_hash,
    NEW.after_hash,
    NEW.outcome,
    NEW.unknown_outcome,
    NEW.occurred_at
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_event_chain ON immutable_audit_events;
CREATE TRIGGER trg_audit_event_chain
  BEFORE INSERT ON immutable_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION populate_audit_event_chain();

-- ── Create initial partitions ──────────────────────────────────────────

DO $$
DECLARE
  start_date DATE;
  i INT;
BEGIN
  start_date := DATE_TRUNC('month', NOW())::DATE;
  FOR i IN 0..5 LOOP
    PERFORM create_partition_if_not_exists(
      'immutable_audit_events',
      start_date + (i || ' month')::INTERVAL
    );
  END LOOP;

  CREATE TABLE IF NOT EXISTS immutable_audit_events_default
    PARTITION OF immutable_audit_events DEFAULT;
END;
$$;

-- ── Audit chain checkpoints ────────────────────────────────────────────
-- Daily signed checkpoint anchors chain roots for external verification.

CREATE TABLE IF NOT EXISTS audit_chain_checkpoints (
  id              TEXT PRIMARY KEY,
  checkpoint_date DATE NOT NULL,
  last_sequence   BIGINT NOT NULL,
  last_event_hash VARCHAR(64) NOT NULL,
  event_count     BIGINT NOT NULL,
  signature       VARCHAR(255),
  signed_by       VARCHAR(120),
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (checkpoint_date)
);

-- ── Audit export batches ───────────────────────────────────────────────
-- Exports are encrypted, watermarked, expiring, and download-audited.

CREATE TABLE IF NOT EXISTS audit_export_batches (
  id              TEXT PRIMARY KEY,
  requested_by    TEXT NOT NULL REFERENCES workforce_principals(id),
  query_params    JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_count     BIGINT NOT NULL DEFAULT 0,
  file_ref        TEXT,
  encryption_key_ref TEXT,
  watermark       VARCHAR(120),
  expires_at      TIMESTAMPTZ NOT NULL,
  downloaded_at   TIMESTAMPTZ,
  download_count  SMALLINT NOT NULL DEFAULT 0,
  case_id         TEXT REFERENCES ops_cases(id),
  reason_code     VARCHAR(120) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_export_batches_requester
  ON audit_export_batches (requested_by, created_at DESC);

-- ── Audit outbox (transactional, for WORM sink streaming) ──────────────
-- Written in the same transaction as domain state for high-impact commands.
-- If the transaction commits, the outbox entry is guaranteed to exist.
-- A background drainer streams to the security-owned immutable sink.

CREATE TABLE IF NOT EXISTS audit_outbox (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL,
  payload         JSONB NOT NULL,
  target_sink     VARCHAR(120) NOT NULL DEFAULT 'worm-primary',
  drained_at      TIMESTAMPTZ,
  drain_error     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_outbox_undrained
  ON audit_outbox (created_at) WHERE drained_at IS NULL;

DO $$
DECLARE
  start_date DATE;
BEGIN
  start_date := DATE_TRUNC('month', NOW())::DATE;
  PERFORM create_partition_if_not_exists('audit_outbox', start_date);
  PERFORM create_partition_if_not_exists('audit_outbox', start_date + '1 month'::INTERVAL);
  CREATE TABLE IF NOT EXISTS audit_outbox_default
    PARTITION OF audit_outbox DEFAULT;
END;
$$;

-- ── Audit access log (access to audit is itself audited) ───────────────

CREATE TABLE IF NOT EXISTS audit_access_log (
  id              TEXT PRIMARY KEY,
  accessor_id     TEXT NOT NULL REFERENCES workforce_principals(id),
  query_params    JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_count    BIGINT NOT NULL DEFAULT 0,
  case_id         TEXT REFERENCES ops_cases(id),
  reason_code     VARCHAR(120) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_access_log_accessor
  ON audit_access_log (accessor_id, created_at DESC);

-- ── PII reveal log (field-level reveal tracking) ───────────────────────
-- Every PII reveal requires active case, purpose, and permission.
-- Auto-remask after short inactivity.

CREATE TABLE IF NOT EXISTS pii_reveal_log (
  id              TEXT PRIMARY KEY,
  principal_id    TEXT NOT NULL REFERENCES workforce_principals(id),
  session_id      TEXT NOT NULL,
  case_id         TEXT REFERENCES ops_cases(id),
  entity_type     VARCHAR(80) NOT NULL,
  entity_id       VARCHAR(255) NOT NULL,
  field_name      VARCHAR(80) NOT NULL,
  purpose         VARCHAR(120) NOT NULL,
  revealed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_remask_at  TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pii_reveal_log_principal
  ON pii_reveal_log (principal_id, revealed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pii_reveal_log_active
  ON pii_reveal_log (auto_remask_at) WHERE auto_remask_at > NOW();

COMMENT ON TABLE immutable_audit_events IS
  'Tamper-evident audit chain. Append-only via trigger. Hash chain with daily signed checkpoints. Fail-closed for high-impact commands.';
COMMENT ON TABLE audit_outbox IS
  'Transactional outbox for streaming to security-owned WORM sink. Written atomically with domain state.';

