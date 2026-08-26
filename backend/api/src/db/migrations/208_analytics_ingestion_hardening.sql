-- Migration 208: Analytics ingestion hardening
--
-- Adds impression lineage, experiment attribution, and retention policy
-- columns to the analytics_events ledger. These columns enable causal
-- attribution from impression to action and support the experimentation
-- platform's exposure tracking.
--
-- Also creates a retention policy config table so the partition-drop
-- sweep job knows how long to keep analytics data.
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS and CREATE INDEX IF NOT EXISTS
-- so re-running the migration is safe.

ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS impression_id  VARCHAR(40),
  ADD COLUMN IF NOT EXISTS experiment_id  VARCHAR(60),
  ADD COLUMN IF NOT EXISTS variant_key    VARCHAR(60);

CREATE INDEX IF NOT EXISTS idx_analytics_events_impression_id
  ON analytics_events (impression_id) WHERE impression_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_experiment_id
  ON analytics_events (experiment_id) WHERE experiment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS analytics_event_retention (
  policy_name     VARCHAR(60) NOT NULL PRIMARY KEY,
  retention_days  INT NOT NULL DEFAULT 730,
  last_swept_at   TIMESTAMPTZ,
  enabled         BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO analytics_event_retention (policy_name, retention_days, enabled)
VALUES ('analytics_events', 730, true)
ON CONFLICT (policy_name) DO NOTHING;

COMMENT ON COLUMN analytics_events.impression_id IS
  'Unique identifier for the impression that caused this event. Enables impression-to-action attribution for A/B testing and recommendation lineage.';
COMMENT ON COLUMN analytics_events.experiment_id IS
  'The experiment this exposure belongs to, when the event is a feature_flag_evaluated or action within an experiment surface.';
COMMENT ON COLUMN analytics_events.variant_key IS
  'The A/B test variant arm the user was assigned to for the linked experiment.';
COMMENT ON TABLE analytics_event_retention IS
  'Retention policy configuration for analytics data. The sweep job reads retention_days and drops partitions older than the threshold.';
