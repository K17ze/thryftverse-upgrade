-- Migration 209: Experiment registry
--
-- The experiment registry is the process contract for A/B testing — it
-- captures the hypothesis, primary metric, guardrail metrics, variants,
-- sample size, and decision for every experiment. PostHog handles variant
-- assignment and exposure logging; this table is the human-readable
-- record that makes experiments auditable and recoverable.
--
-- The guardrail check log records every guardrail evaluation run against
-- an experiment, enabling post-incident review and audit trails.
--
-- Partitioned by checked_at on the guardrail checks table, following the
-- same pattern as analytics_events (migration 140).

CREATE TABLE IF NOT EXISTS experiments (
  experiment_id        VARCHAR(60) NOT NULL PRIMARY KEY,
  flag_key             VARCHAR(60) NOT NULL,
  name                 VARCHAR(200) NOT NULL,
  hypothesis           TEXT NOT NULL,
  primary_metric       VARCHAR(100) NOT NULL,
  guardrail_metrics    JSONB NOT NULL DEFAULT '[]'::jsonb,
  secondary_metrics    JSONB NOT NULL DEFAULT '[]'::jsonb,
  variants             JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample_size          INT,
  min_detectable_effect NUMERIC(8,4),
  start_date           TIMESTAMPTZ,
  end_date             TIMESTAMPTZ,
  status               VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  decision             VARCHAR(20),
  decision_reason      TEXT,
  decision_by          TEXT,
  decided_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_experiments_status
  ON experiments (status) WHERE status IN ('running', 'paused');

CREATE INDEX IF NOT EXISTS idx_experiments_flag_key
  ON experiments (flag_key);

CREATE TABLE IF NOT EXISTS experiment_guardrail_checks (
  check_id        UUID NOT NULL DEFAULT uuid_v7(),
  experiment_id   VARCHAR(60) NOT NULL REFERENCES experiments(experiment_id),
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_name     VARCHAR(100) NOT NULL,
  metric_value    NUMERIC(12,4),
  threshold       NUMERIC(12,4),
  breached        BOOLEAN NOT NULL DEFAULT false,
  action_taken    VARCHAR(20),
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (check_id, checked_at)
) PARTITION BY RANGE (checked_at);

CREATE INDEX IF NOT EXISTS idx_guardrail_checks_experiment
  ON experiment_guardrail_checks (experiment_id, checked_at DESC);

DO $$
DECLARE
  start_date DATE;
  i INT;
BEGIN
  start_date := DATE_TRUNC('month', NOW())::DATE;
  FOR i IN 0..3 LOOP
    PERFORM create_partition_if_not_exists('experiment_guardrail_checks', (start_date + (i || ' month')::INTERVAL)::DATE);
  END LOOP;

  CREATE TABLE IF NOT EXISTS experiment_guardrail_checks_default
    PARTITION OF experiment_guardrail_checks DEFAULT;
END;
$$;

COMMENT ON TABLE experiments IS
  'Experiment registry — the process contract for A/B testing. Captures hypothesis, metrics, variants, and decision. PostHog handles assignment; this table is the auditable record.';
COMMENT ON TABLE experiment_guardrail_checks IS
  'Log of every guardrail metric evaluation run against an experiment. Enables post-incident review and audit of auto-kill decisions.';
