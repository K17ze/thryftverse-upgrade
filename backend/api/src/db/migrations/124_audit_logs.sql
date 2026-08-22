-- Migration 124: Admin audit logs
--
-- Records administrative actions (create, update, delete, ban, refund,
-- etc.) for compliance and security auditing. Partitioned by month on
-- created_at using the create_partition_if_not_exists() helper from
-- migration 115.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT
-- EXISTS so re-running the migration is safe.

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id             UUID NOT NULL DEFAULT gen_random_uuid(),
  admin_user_id  VARCHAR(120) NOT NULL,
  action         VARCHAR(60) NOT NULL,
  resource_type  VARCHAR(80) NOT NULL,
  resource_id    VARCHAR(120),
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address     VARCHAR(64),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_user_id
  ON admin_audit_logs (admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action
  ON admin_audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_resource_type
  ON admin_audit_logs (resource_type);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON admin_audit_logs (created_at);

DO $$
DECLARE
  start_date DATE;
  i INT;
BEGIN
  start_date := DATE_TRUNC('month', NOW())::DATE;
  FOR i IN 0..3 LOOP
    PERFORM create_partition_if_not_exists('admin_audit_logs', start_date + (i || ' month')::INTERVAL);
  END LOOP;

  CREATE TABLE IF NOT EXISTS admin_audit_logs_default
    PARTITION OF admin_audit_logs DEFAULT;
END;
$$;

COMMENT ON TABLE admin_audit_logs IS
  'Audit trail of administrative actions for compliance and security review.';
COMMENT ON COLUMN admin_audit_logs.action IS
  'The action performed: create, update, delete, ban, unban, refund, force_status, moderate, config_change.';
COMMENT ON COLUMN admin_audit_logs.metadata IS
  'Structured metadata about the action (before/after values, reasons, etc.).';
