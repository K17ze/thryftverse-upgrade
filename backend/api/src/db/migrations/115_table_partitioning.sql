-- Migration 115: Table partitioning for high-volume time-series tables
--
-- Converts analytics_events, notifications and audit_logs into monthly
-- RANGE-partitioned parents on created_at. Existing data is preserved by
-- attaching the original table as the DEFAULT partition (zero data
-- movement).
--
-- All statements are idempotent. The
-- create_partition_if_not_exists() helper can be called from the
-- partitionManager.ts startup hook to roll partitions forward.
--
-- PostgreSQL does NOT support `ALTER TABLE ... PARTITION BY` on a regular
-- table. The correct conversion pattern is:
--   1. Rename the existing regular table.
--   2. Create a new partitioned parent with LIKE ... INCLUDING ALL.
--   3. Attach the old table as the DEFAULT partition.
-- See: https://www.postgresql.org/docs/current/ddl-partitioning.html

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
-- Helper: convert a regular table to a partitioned parent.
-- Renames the existing table, creates a new partitioned parent with the
-- same structure, and attaches the old table as the DEFAULT partition.
-- No-op if the table does not exist or is already partitioned.
--   table_name  — table to convert
--   partition_col — column to partition by (must be in the table)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION convert_to_partitioned(
  table_name TEXT,
  partition_col TEXT
) RETURNS VOID AS $$
DECLARE
  table_exists BOOLEAN;
  is_partitioned BOOLEAN;
  old_name TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = table_name
  ) INTO table_exists;
  IF NOT table_exists THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.relname = table_name
  ) INTO is_partitioned;
  IF is_partitioned THEN RETURN; END IF;

  old_name := table_name || '_old';

  -- Rename the existing regular table.
  EXECUTE format('ALTER TABLE %I RENAME TO %I', table_name, old_name);

  -- Create a new partitioned parent with the same columns, defaults,
  -- constraints, and storage.  INCLUDING ALL copies everything that
  -- can be copied.
  EXECUTE format(
    'CREATE TABLE %I (LIKE %I INCLUDING ALL) PARTITION BY RANGE (%I)',
    table_name, old_name, partition_col
  );

  -- Attach the old table as the DEFAULT partition (zero data movement).
  EXECUTE format(
    'ALTER TABLE %I ATTACH PARTITION %I DEFAULT',
    table_name, old_name
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
  start_date DATE;
  loop_idx INT;
BEGIN
  PERFORM convert_to_partitioned('analytics_events', 'created_at');

  -- If the table doesn't exist or is already partitioned, check and create
  -- monthly partitions.
  SELECT EXISTS (
    SELECT 1 FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.relname = 'analytics_events'
  ) INTO is_partitioned;

  IF NOT is_partitioned THEN
    RETURN;
  END IF;

  start_date := DATE_TRUNC('month', NOW())::DATE;
  FOR loop_idx IN 0..3 LOOP
    PERFORM create_partition_if_not_exists(
      'analytics_events',
      start_date + (loop_idx || ' month')::INTERVAL
    );
  END LOOP;

  -- Create a default partition only if one doesn't already exist (the
  -- converted old table may already serve as the default).
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_inherits i ON i.inhrelid = c.oid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'analytics_events'
      AND c.relname = 'analytics_events_default'
  ) THEN
    CREATE TABLE IF NOT EXISTS analytics_events_default
      PARTITION OF analytics_events DEFAULT;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- notifications — partitioned by month on created_at (if the table exists)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  is_partitioned BOOLEAN;
  start_date DATE;
  loop_idx INT;
BEGIN
  PERFORM convert_to_partitioned('notifications', 'created_at');

  SELECT EXISTS (
    SELECT 1 FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.relname = 'notifications'
  ) INTO is_partitioned;

  IF NOT is_partitioned THEN
    RETURN;
  END IF;

  start_date := DATE_TRUNC('month', NOW())::DATE;
  FOR loop_idx IN 0..3 LOOP
    PERFORM create_partition_if_not_exists(
      'notifications',
      start_date + (loop_idx || ' month')::INTERVAL
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_inherits i ON i.inhrelid = c.oid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'notifications'
      AND c.relname = 'notifications_default'
  ) THEN
    CREATE TABLE IF NOT EXISTS notifications_default
      PARTITION OF notifications DEFAULT;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_logs — partitioned by month on created_at (if the table exists)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  is_partitioned BOOLEAN;
  start_date DATE;
  loop_idx INT;
BEGIN
  PERFORM convert_to_partitioned('audit_logs', 'created_at');

  SELECT EXISTS (
    SELECT 1 FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.relname = 'audit_logs'
  ) INTO is_partitioned;

  IF NOT is_partitioned THEN
    RETURN;
  END IF;

  start_date := DATE_TRUNC('month', NOW())::DATE;
  FOR loop_idx IN 0..3 LOOP
    PERFORM create_partition_if_not_exists(
      'audit_logs',
      start_date + (loop_idx || ' month')::INTERVAL
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_inherits i ON i.inhrelid = c.oid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'audit_logs'
      AND c.relname = 'audit_logs_default'
  ) THEN
    CREATE TABLE IF NOT EXISTS audit_logs_default
      PARTITION OF audit_logs DEFAULT;
  END IF;
END;
$$;
