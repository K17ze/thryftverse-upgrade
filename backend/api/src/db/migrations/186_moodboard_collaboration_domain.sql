-- 186_moodboard_collaboration_domain.sql
-- Moodboard collaboration domain: revisions, soft delete, membership,
-- operation log (idempotent, server-authoritative LWW), and version snapshots.
--
-- Research basis: .devin/reports/13-moodboards-collaborative-canvas-flagship-research-2026-08-25.md
-- Architecture: Figma-style server-authoritative last-writer-wins. The server
-- is the single source of truth; clients send optimistic operations with a
-- client operation id (idempotency key) and a base revision. The server
-- assigns the canonical applied revision, dedups retries, and returns conflict
-- detail when the base revision is stale.
--
-- This migration is additive: it extends the existing moodboards / moodboard_items
-- tables (127_galleria_moodboards.sql) and introduces the collaboration tables.
-- Existing boards are backfilled with revision 0 and an owner membership row.

-- ── moodboards: revision, soft delete, last editor ──
ALTER TABLE moodboards
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(id) ON DELETE SET NULL;

-- ── moodboard_items: per-item revision, soft delete, media lineage ──
ALTER TABLE moodboard_items
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_asset_id TEXT;

-- Index for soft-delete-aware listing (excludes trashed boards by default).
CREATE INDEX IF NOT EXISTS moodboards_active_updated_idx
  ON moodboards (visibility, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS moodboards_creator_active_idx
  ON moodboards (creator_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ── moodboard_members: board-scoped capability roles ──
-- Pinterest-tier model: owner, editor, commenter, viewer.
-- The owner row is created atomically with the board; it is the capability
-- source of truth for write authorization.
CREATE TABLE IF NOT EXISTS moodboard_members (
  board_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended', 'removed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  PRIMARY KEY (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS moodboard_members_user_idx
  ON moodboard_members (user_id, state);

-- ── moodboard_operations: idempotent, server-authoritative operation log ──
-- Each row is a canonical operation applied by the server. The
-- (board_id, client_operation_id) unique constraint is the idempotency
-- boundary: a retried request with the same client operation id returns the
-- existing row instead of re-applying. base_revision is the revision the
-- client believed it was editing against; applied_revision is the canonical
-- revision the server assigned after applying.
CREATE TABLE IF NOT EXISTS moodboard_operations (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_operation_id TEXT NOT NULL,
  base_revision BIGINT NOT NULL,
  applied_revision BIGINT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN (
    'item.add', 'item.transform', 'item.remove', 'item.reorder',
    'board.theme', 'board.rename', 'board.visibility'
  )),
  item_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, client_operation_id)
);

CREATE INDEX IF NOT EXISTS moodboard_operations_board_revision_idx
  ON moodboard_operations (board_id, applied_revision);

CREATE INDEX IF NOT EXISTS moodboard_operations_actor_idx
  ON moodboard_operations (actor_id, created_at DESC);

-- ── moodboard_versions: immutable checkpoints for history / restore ──
-- A version is a materialized snapshot at a given revision. It is never
-- mutated once created. Restore creates a new revision from a snapshot; it
-- never overwrites history.
CREATE TABLE IF NOT EXISTS moodboard_versions (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL,
  snapshot JSONB NOT NULL,
  label TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, revision)
);

CREATE INDEX IF NOT EXISTS moodboard_versions_board_idx
  ON moodboard_versions (board_id, revision DESC);

-- ── Backfill: owner membership rows for pre-existing boards ──
-- Every board that predates the membership table gets an active owner row
-- for its creator. This makes the capability check uniform for old and new
-- boards alike.
INSERT INTO moodboard_members (board_id, user_id, role, state, joined_at)
SELECT m.id, m.creator_id, 'owner', 'active', m.created_at
FROM moodboards m
WHERE NOT EXISTS (
  SELECT 1 FROM moodboard_members mm
  WHERE mm.board_id = m.id AND mm.user_id = m.creator_id
)
ON CONFLICT (board_id, user_id) DO NOTHING;
