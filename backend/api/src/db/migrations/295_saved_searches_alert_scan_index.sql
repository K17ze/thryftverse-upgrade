-- 295_saved_searches_alert_scan_index.sql
--
-- The saved-search matcher now keyset-paginates the full alert-enabled
-- subscriber set (`WHERE alerts_enabled AND id > $cursor ORDER BY id`)
-- instead of the old `ORDER BY created_at DESC LIMIT 500` slice, which
-- starved every search past the cap. The existing partial index on
-- (created_at) no longer matches the scan shape; this partial index on
-- (id) serves the keyset pages directly.

CREATE INDEX IF NOT EXISTS saved_searches_alerts_enabled_id_idx
  ON saved_searches (id)
  WHERE alerts_enabled = TRUE;
