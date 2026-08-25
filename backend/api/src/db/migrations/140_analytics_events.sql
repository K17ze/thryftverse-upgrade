-- Migration 140: Durable analytics event ledger
--
-- Append-only event table for client analytics that serves as the durable
-- training-data source.  This is distinct from the Redis capped lists used
-- by POST /analytics/events, which are operational telemetry only — they
-- are trimmed to the last 1000 entries and are NOT a durable training
-- ledger.
--
-- The Redis path remains for real-time operational dashboards and cache
-- invalidation; this Postgres table is the canonical durable record that
-- downstream ML feature pipelines and batch export jobs read from.
--
-- Partitioned by month on created_at using the
-- create_partition_if_not_exists() helper from migration 115, following
-- the same pattern as admin_audit_logs (migration 124).  Time-ordered
-- UUID v7 primary keys (migration 119) improve B-tree locality on this
-- append-heavy workload.
--
-- actor_user_id is TEXT to match the users(id) column type used throughout
-- the schema (users.id is TEXT, not UUID).
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT
-- EXISTS so re-running the migration is safe.

CREATE TABLE IF NOT EXISTS analytics_events (
  event_id        UUID NOT NULL DEFAULT uuid_v7(),
  event_name      VARCHAR(100) NOT NULL,
  schema_version  VARCHAR(20) NOT NULL DEFAULT '1.0',
  event_time      TIMESTAMPTZ NOT NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id   TEXT,
  session_id      VARCHAR(100),
  request_id      VARCHAR(100),
  surface         VARCHAR(50),
  properties      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_time
  ON analytics_events (event_time);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name
  ON analytics_events (event_name);

CREATE INDEX IF NOT EXISTS idx_analytics_events_actor_user
  ON analytics_events (actor_user_id) WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events (created_at);

DO $$
DECLARE
  start_date DATE;
  i INT;
BEGIN
  start_date := DATE_TRUNC('month', NOW())::DATE;
  FOR i IN 0..3 LOOP
    PERFORM create_partition_if_not_exists('analytics_events', start_date + (i || ' month')::INTERVAL);
  END LOOP;

  CREATE TABLE IF NOT EXISTS analytics_events_default
    PARTITION OF analytics_events DEFAULT;
END;
$$;

COMMENT ON TABLE analytics_events IS
  'Durable append-only ledger of client analytics events. This is the canonical training-data source — Redis capped lists are operational telemetry only.';
COMMENT ON COLUMN analytics_events.event_name IS
  'Canonical event name (e.g. listing_view, add_to_wishlist, recommendation_click).';
COMMENT ON COLUMN analytics_events.schema_version IS
  'Version of the event envelope schema. Bumped when the envelope structure changes in a backwards-incompatible way.';
COMMENT ON COLUMN analytics_events.event_time IS
  'When the event occurred on the client, in UTC. Distinct from ingested_at (server-side receipt time).';
COMMENT ON COLUMN analytics_events.actor_user_id IS
  'The user who triggered the event. NULL for anonymous events. References users(id) but not FK-constrained to avoid write amplification on the hot path.';
COMMENT ON COLUMN analytics_events.properties IS
  'Event-specific payload as JSONB. Includes listing_id, section_key, position, reason_code, personalised, and any future event-specific fields.';
