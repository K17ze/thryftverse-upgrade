-- Migration 203: Creator publications — the missing owner layer.
--
-- The research report (23-publishing-lifecycle) identified a P0 architectural
-- disconnect: `/creator/documents/:id/publish` flipped a status flag and wrote
-- an internal revision, but created NO public Look or Poster projection. The
-- native publisher bypassed it entirely, calling the Look/Poster APIs directly.
-- There was no authoritative row linking a document revision to the public
-- object it produced.
--
-- This migration establishes `creator_publications` as that linkage: one row
-- per accepted publish command, binding a document + revision to a typed public
-- projection (look / poster / moodboard) with an idempotency key and payload
-- hash. The publication orchestrator writes this row inside the same
-- transaction that creates the public projection, so the two cannot diverge.
--
-- Lifecycle states on creator_documents are also expanded to the full machine:
--   draft → ready → publishing → published | blocked | failed
--   draft → deleted
--   published → archived
--   published → draft (new revision; old publication immutable)

-- ── Expand creator_documents lifecycle ─────────────────────────────────
-- The existing CHECK allowed ('draft','published','archived'). We widen to the
-- full state machine so the orchestrator can record honest intermediate and
-- terminal states. Old rows are unaffected (existing values remain valid).

ALTER TABLE creator_documents
  DROP CONSTRAINT IF EXISTS creator_documents_status_check;

ALTER TABLE creator_documents
  ADD CONSTRAINT creator_documents_status_check
  CHECK (status IN (
    'draft', 'ready', 'scheduled', 'publishing',
    'published', 'blocked', 'failed', 'archived', 'deleted'
  ));

-- head_revision tracks the latest revision number on the document (draft or
-- published). published_revision records which revision is publicly live.
-- publication_id binds the document to its current publication row.
ALTER TABLE creator_documents
  ADD COLUMN IF NOT EXISTS head_revision INTEGER NOT NULL DEFAULT 0
    CHECK (head_revision >= 0),
  ADD COLUMN IF NOT EXISTS published_revision INTEGER,
  ADD COLUMN IF NOT EXISTS publication_id TEXT;

-- ── creator_publications ───────────────────────────────────────────────
-- One row per accepted publish command. This is the source-of-truth for
-- "which public object did this revision produce, and under what policy?"

CREATE TABLE IF NOT EXISTS creator_publications (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES creator_documents(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,

  -- The typed public projection this publication created.
  destination TEXT NOT NULL CHECK (destination IN ('look', 'poster', 'moodboard')),
  target_id TEXT NOT NULL,

  -- Idempotency: same key + same hash replays the original result.
  -- Same key + different hash is a conflict (fails closed).
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,

  -- Publication state machine.
  state TEXT NOT NULL DEFAULT 'published'
    CHECK (state IN ('publishing', 'published', 'blocked', 'failed', 'revoked')),

  -- Policy / moderation decision recorded at publish time.
  policy_version TEXT,
  policy_decision TEXT,

  -- Rights snapshot reference (P1 — nullable until rights domain is live).
  rights_snapshot_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One publication per idempotency key per document.
  UNIQUE (document_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS creator_publications_document_idx
  ON creator_publications (document_id, revision_number DESC);

CREATE INDEX IF NOT EXISTS creator_publications_creator_idx
  ON creator_publications (creator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS creator_publications_target_idx
  ON creator_publications (destination, target_id);

-- Lookup by idempotency key alone supports unknown-outcome recovery when
-- the client lost the response but remembers the key it sent.
CREATE INDEX IF NOT EXISTS creator_publications_key_idx
  ON creator_publications (idempotency_key);

-- Trigger: update updated_at on creator_publications
CREATE OR REPLACE FUNCTION update_creator_publications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS creator_publications_updated_at_trigger ON creator_publications;
CREATE TRIGGER creator_publications_updated_at_trigger
  BEFORE UPDATE ON creator_publications
  FOR EACH ROW
  EXECUTE FUNCTION update_creator_publications_updated_at();

-- ── Backfill head_revision from existing revision data ─────────────────
-- Existing published documents have revisions in creator_document_revisions.
-- Set head_revision and published_revision so the orchestrator can detect
-- "edit published work → new draft revision" correctly.

UPDATE creator_documents d
SET head_revision = COALESCE(
  (SELECT MAX(revision_number) FROM creator_document_revisions r WHERE r.document_id = d.id),
  d.next_revision_number - 1
),
published_revision = CASE
  WHEN d.status = 'published' THEN (
    SELECT MAX(revision_number) FROM creator_document_revisions r WHERE r.document_id = d.id
  )
  ELSE NULL
END
WHERE d.head_revision = 0;

COMMENT ON TABLE creator_publications IS
  'Authoritative linkage between a creator document revision and the public projection it produced. One row per accepted publish command.';
