-- Migration 115: Table partitioning for high-volume time-series tables
--
-- Converts analytics_events, notifications and audit_logs into monthly
-- RANGE-partitioned parents on created_at. Existing data is preserved by
-- creating a default partition that catches any row whose created_at does
-- not match a named monthly partition.
--
-- All statements are idempotent (IF NOT EXISTS). The
-- create_partition_if_not_exists() helper can be called from the
-- partitionManager.ts startup hook to roll partitions forward.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: create a monthly partition for a partitioned table if it does
-- not already exist. Safe to call repeatedly.
--   table_name  — partitioned parent table
--   start_date  — inclusive lower bound (first day of the month)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_partition_if_not_exists(
  table_name TEXT,
  start_date DATE
) RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  end_date DATE;
BEGIN
  partition_name := table_name || '_' || to_char(start_date, 'YYYYMM');
  end_date := start_date + INTERVAL '1 month';

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
    partition_name, table_name, start_date, end_date
  );
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- analytics_events — partitioned by month on created_at
-- Only converts the table if it exists and is not already partitioned.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  is_partitioned BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'analytics_events'
  ) INTO is_partitioned;

  IF is_partitioned THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_partitioned_table pt
      JOIN pg_class c ON c.oid = pt.partrelid
      WHERE c.relname = 'analytics_events'
    ) INTO is_partitioned;

    IF NOT is_partitioned THEN
      ALTER TABLE analytics_events
        PARTITION BY RANGE (created_at);
    END IF;
  END IF;
END;
$$;

DO $$
DECLARE
  start_date DATE;
  i INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_partitioned_table pt ON pt.partrelid = c.oid
    WHERE c.relname = 'analytics_events'
  ) INTO i;
  IF i = 0 THEN
    RETURN;
  END IF;

  start_date := DATE_TRUNC('month', NOW())::DATE;
  FOR i IN 0..3 LOOP
    PERFORM create_partition_if_not_exists('analytics_events', start_date + (i || ' month')::INTERVAL);
  END LOOP;

  CREATE TABLE IF NOT EXISTS analytics_events_default
    PARTITION OF analytics_events DEFAULT;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- notifications — partitioned by month on created_at (if the table exists)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  is_partitioned BOOLEAN;
  start_date DATE;
  i INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'notifications'
  ) INTO is_partitioned;

  IF NOT is_partitioned THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.relname = 'notifications'
  ) INTO is_partitioned;

  IF NOT is_partitioned THEN
    ALTER TABLE notifications
      PARTITION BY RANGE (created_at);
  END IF;

  start_date := DATE_TRUNC('month', NOW())::DATE;
  FOR i IN 0..3 LOOP
    PERFORM create_partition_if_not_exists('notifications', start_date + (i || ' month')::INTERVAL);
  END LOOP;

  CREATE TABLE IF NOT EXISTS notifications_default
    PARTITION OF notifications DEFAULT;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_logs — partitioned by month on created_at (if the table exists)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  is_partitioned BOOLEAN;
  start_date DATE;
  i INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'audit_logs'
  ) INTO is_partitioned;

  IF NOT is_partitioned THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.relname = 'audit_logs'
  ) INTO is_partitioned;

  IF NOT is_partitioned THEN
    ALTER TABLE audit_logs
      PARTITION BY RANGE (created_at);
  END IF;

  start_date := DATE_TRUNC('month', NOW())::DATE;
  FOR i IN 0..3 LOOP
    PERFORM create_partition_if_not_exists('audit_logs', start_date + (i || ' month')::INTERVAL);
  END LOOP;

  CREATE TABLE IF NOT EXISTS audit_logs_default
    PARTITION OF audit_logs DEFAULT;
END;
$$;
