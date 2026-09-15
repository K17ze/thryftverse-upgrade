-- 297: scheduled live shopping sessions + "remind me" holders
--
-- Scheduled shows: `live_shopping_sessions.scheduled_start_at` carries the
-- host-declared go-live time. A scheduled session keeps a normal pre-live
-- status ('created'/'draft'/'backstage') — the timestamp is the scheduling
-- signal, not a new lifecycle state. Reusing existing states keeps every
-- pre-live gate correct for free: realtime topic authorization already
-- treats non-live/non-ended sessions as host-only (realtimeAuthorization.ts),
-- and chk_session_status (migration 296) needs no widening.
--
-- `live_session_reminders` backs the "Remind me" affordance on scheduled
-- discovery cards. Rows are deduped by PRIMARY KEY and are unioned with the
-- host's followers during the go-live notification fan-out.
--
-- All DDL is idempotent (IF NOT EXISTS).

ALTER TABLE live_shopping_sessions
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;

-- Partial index for the "Coming up" rail: only pre-live sessions with a
-- scheduled start are ever scanned for it.
CREATE INDEX IF NOT EXISTS live_shopping_sessions_scheduled_start_idx
  ON live_shopping_sessions (scheduled_start_at)
  WHERE scheduled_start_at IS NOT NULL
    AND status IN ('created', 'draft', 'backstage');

CREATE TABLE IF NOT EXISTS live_session_reminders (
  session_id TEXT NOT NULL REFERENCES live_shopping_sessions(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS live_session_reminders_user_idx
  ON live_session_reminders (user_id);

COMMENT ON COLUMN live_shopping_sessions.scheduled_start_at IS
  'Host-declared go-live time for scheduled shows. NULL for ad-hoc streams.';
COMMENT ON TABLE live_session_reminders IS
  '"Remind me" opt-ins for scheduled live shopping sessions; unioned with host followers in the go-live fan-out.';
