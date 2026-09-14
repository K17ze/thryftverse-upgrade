-- 292_live_lot_due_close_index.sql
--
-- The live-lot auto-close sweep (`sweepDueLiveLots`, migration 188 engine)
-- runs every few seconds and scans for `status = 'open' AND closes_at <=
-- NOW()`. `idx_live_lots_session_status` does not serve that predicate:
-- during a broadcast most open lots across all sessions share the status and
-- the scan degenerates into a per-tick filter over every open lot.
--
-- A partial index on the deadline itself keeps the sweep O(due lots): only
-- closable lots that carry a server-set deadline are indexed at all.

CREATE INDEX IF NOT EXISTS idx_live_lots_due_close
  ON live_lots (closes_at)
  WHERE status IN ('open', 'closing') AND closes_at IS NOT NULL;

COMMENT ON INDEX idx_live_lots_due_close IS
  'Serves the periodic auto-close sweep: open lots with a deadline, ordered by closes_at.';
