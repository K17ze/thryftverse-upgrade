-- 296: live_shopping_sessions.status must accept 'created'
--
-- Migration 186 codified the lifecycle vocabulary as
-- (draft, backstage, live, ending, ended, failed) but omitted 'created' —
-- the status the stream provider emits on room creation and persistSession
-- writes verbatim. On any database where 186 applied, POST /streaming/sessions
-- fails with a CHECK violation. 'created' is also the value the
-- live_shopping_sessions_status_idx partial index was built around (migration
-- 113), so it is a first-class lifecycle state, not an anomaly.

DO $$
BEGIN
  ALTER TABLE live_shopping_sessions
    DROP CONSTRAINT IF EXISTS chk_session_status;

  ALTER TABLE live_shopping_sessions
    ADD CONSTRAINT chk_session_status CHECK (
      status IN ('created', 'draft', 'backstage', 'live', 'ending', 'ended', 'failed')
    );
END $$;

-- The partial index was built for ('created','live') before the draft/backstage/
-- ending states existed. Rebuild it to cover every state that "session is or
-- will soon be live" queries need.
DROP INDEX IF EXISTS live_shopping_sessions_status_idx;
CREATE INDEX live_shopping_sessions_status_idx
  ON live_shopping_sessions (status)
  WHERE status IN ('created', 'draft', 'backstage', 'live', 'ending');
