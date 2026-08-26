-- Migration 210: Flag kill audit trail
--
-- Records every feature flag kill-switch activation for compliance and
-- post-incident review. Each row captures who killed the flag, why, and
-- which guardrail breaches triggered the kill (if any).
--
-- Partitioned by created_at, following the same pattern as
-- analytics_events (migration 140).

CREATE TABLE IF NOT EXISTS flag_kill_events (
  kill_id           UUID NOT NULL DEFAULT uuid_v7(),
  flag_key          VARCHAR(60) NOT NULL,
  killed_by         TEXT NOT NULL,
  killed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason            TEXT NOT NULL,
  trigger           VARCHAR(20) NOT NULL DEFAULT 'manual',
  guardrail_breaches JSONB NOT NULL DEFAULT '[]'::jsonb,
  previous_rollout  INT,
  experiment_id     VARCHAR(60),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (kill_id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_flag_kill_events_flag_key
  ON flag_kill_events (flag_key, killed_at DESC);

CREATE INDEX IF NOT EXISTS idx_flag_kill_events_experiment
  ON flag_kill_events (experiment_id) WHERE experiment_id IS NOT NULL;

DO $$
DECLARE
  start_date DATE;
  i INT;
BEGIN
  start_date := DATE_TRUNC('month', NOW())::DATE;
  FOR i IN 0..3 LOOP
    PERFORM create_partition_if_not_exists('flag_kill_events', start_date + (i || ' month')::INTERVAL);
  END LOOP;

  CREATE TABLE IF NOT EXISTS flag_kill_events_default
    PARTITION OF flag_kill_events DEFAULT;
END;
$$;

COMMENT ON TABLE flag_kill_events IS
  'Audit trail of every feature flag kill-switch activation. Captures who, when, why, and which guardrails triggered the kill.';
