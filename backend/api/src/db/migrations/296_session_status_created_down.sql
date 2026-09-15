-- 296 down: restore the migration-186 status vocabulary (without 'created').
-- Note: restoring the narrow CHECK will fail if any row currently holds
-- status = 'created' — such rows were legitimate sessions created while the
-- widened constraint was in effect.

DO $$
BEGIN
  ALTER TABLE live_shopping_sessions
    DROP CONSTRAINT IF EXISTS chk_session_status;

  ALTER TABLE live_shopping_sessions
    ADD CONSTRAINT chk_session_status CHECK (
      status IN ('draft', 'backstage', 'live', 'ending', 'ended', 'failed')
    );
END $$;

DROP INDEX IF EXISTS live_shopping_sessions_status_idx;
CREATE INDEX live_shopping_sessions_status_idx
  ON live_shopping_sessions (status)
  WHERE status IN ('created', 'live');
