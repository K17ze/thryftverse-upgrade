-- 297 down: drop the reminders table, the scheduled-start index, and the
-- scheduled_start_at column.

DROP TABLE IF EXISTS live_session_reminders;

DROP INDEX IF EXISTS live_shopping_sessions_scheduled_start_idx;

ALTER TABLE live_shopping_sessions
  DROP COLUMN IF EXISTS scheduled_start_at;
