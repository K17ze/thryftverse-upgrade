-- Auto-update triggers for updated_at columns.
--
-- Creates a generic BEFORE UPDATE trigger function and attaches it to every
-- table that has an `updated_at` column but does not already have a matching
-- trigger. This keeps `updated_at` in sync automatically without application
-- code having to set it on every UPDATE.
--
-- Idempotent: the function uses CREATE OR REPLACE, and the DO block checks
-- for the existence of each trigger before creating it.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  rec RECORD;
  trg_name text;
BEGIN
  FOR rec IN
    SELECT t.table_schema, t.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_name = c.table_name
     AND t.table_schema = c.table_schema
    WHERE c.column_name = 'updated_at'
      AND t.table_type = 'BASE TABLE'
      AND t.table_schema NOT IN ('information_schema', 'pg_catalog')
  LOOP
    trg_name := 'trg_' || rec.table_name || '_updated_at';

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.triggers tr
      WHERE tr.event_object_schema = rec.table_schema
        AND tr.event_object_table = rec.table_name
        AND tr.trigger_name = trg_name
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I.%I '
        'FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
        trg_name, rec.table_schema, rec.table_name
      );
    END IF;
  END LOOP;
END;
$$;
