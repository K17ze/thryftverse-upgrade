-- 296 down: restore the migration-186 status vocabulary (without 'created').
--
-- Data remediation first: rows written with status = 'created' while the
-- widened constraint was in effect are legitimate sessions. 'created' means
-- "provider room exists, never went live" — the closest pre-296 lifecycle
-- state is 'draft'. Remapping preserves the session (and its host/title/
-- schedule data) instead of deleting it or aborting the rollback.

DO $$
BEGIN
  ALTER TABLE live_shopping_sessions
    DROP CONSTRAINT IF EXISTS chk_session_status;

  -- Remap 'created' rows into the restored vocabulary before re-narrowing
  -- the CHECK, so the constraint add can never fail on existing data.
  UPDATE live_shopping_sessions
     SET status = 'draft'
   WHERE status = 'created';

  ALTER TABLE live_shopping_sessions
    ADD CONSTRAINT chk_session_status CHECK (
      status IN ('draft', 'backstage', 'live', 'ending', 'ended', 'failed')
    );
END $$;

-- Rebuild the partial index over the restored vocabulary's
-- "is or will soon be live" states (the pre-296 equivalent of the
-- migration-113 index's intent).
DROP INDEX IF EXISTS live_shopping_sessions_status_idx;
CREATE INDEX live_shopping_sessions_status_idx
  ON live_shopping_sessions (status)
  WHERE status IN ('draft', 'backstage', 'live', 'ending');
