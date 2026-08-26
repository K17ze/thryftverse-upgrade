-- Migration 204: Creator schedules — server-owned scheduled publication.
--
-- The research report (23) identified that scheduling was broken: the
-- frontend sent `scheduledFor` (camelCase) while the server expected
-- `scheduled_for` (snake_case), and the schedule was attached to a
-- `creator_documents` row that the native publish flow never created.
-- The old approach also published immediately and then tried to attach
-- a schedule — making "schedule" semantically false.
--
-- This migration creates `creator_schedules` as a proper server-owned
-- queue table. The scheduled-publication worker claims due rows using
-- `FOR UPDATE SKIP LOCKED`, executes the same idempotent publication
-- command used by "Publish now", and records the terminal result.
--
-- A cancel/reschedule increments `version` so an already-leased stale
-- job cannot publish an old version.

CREATE TABLE IF NOT EXISTS creator_schedules (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES creator_documents(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The UTC instant to publish at, plus the original timezone for display.
  due_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',

  -- Version is incremented on cancel/reschedule. The worker records the
  -- version it claimed and refuses to publish if the row has moved on.
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),

  -- The publish command to execute (frozen at schedule time).
  -- This is the exact payload that will be sent to the orchestrator.
  publish_command JSONB NOT NULL,

  -- Claim state for the SKIP LOCKED queue.
  -- pending: waiting for due_at
  -- claimed: a worker has leased this row (claimed_at set)
  -- published: the publication succeeded (publication_id set)
  -- failed: the publication failed after max attempts
  -- cancelled: the user cancelled before due_at
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'claimed', 'published', 'failed', 'cancelled')),

  claimed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),

  -- Result linkage.
  publication_id TEXT REFERENCES creator_publications(id) ON DELETE SET NULL,
  failure_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for the worker sweep: find due, pending rows ordered by due_at.
CREATE INDEX IF NOT EXISTS creator_schedules_due_idx
  ON creator_schedules (due_at, state)
  WHERE state = 'pending';

-- Index for owner lookup (show the user their scheduled publications).
CREATE INDEX IF NOT EXISTS creator_schedules_creator_idx
  ON creator_schedules (creator_id, due_at DESC)
  WHERE state IN ('pending', 'claimed');

-- Trigger: update updated_at on creator_schedules
CREATE OR REPLACE FUNCTION update_creator_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS creator_schedules_updated_at_trigger ON creator_schedules;
CREATE TRIGGER creator_schedules_updated_at_trigger
  BEFORE UPDATE ON creator_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_creator_schedules_updated_at();

COMMENT ON TABLE creator_schedules IS
  'Server-owned scheduled publication queue. Workers claim due rows using FOR UPDATE SKIP LOCKED and execute the same idempotent publication command used by Publish now.';
