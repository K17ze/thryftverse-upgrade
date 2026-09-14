-- Rollback for 292_live_lot_due_close_index.sql
-- Drops the partial index serving the live-lot auto-close sweep. The sweep
-- keeps working without it — it simply scans the open-lot status index.

DROP INDEX IF EXISTS idx_live_lots_due_close;
