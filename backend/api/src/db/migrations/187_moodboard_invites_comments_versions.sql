-- 187_moodboard_invites_comments_versions.sql
-- Moodboard collaboration surfaces: invites, comments, and version snapshots.
--
-- Research basis: .devin/reports/13-moodboards-collaborative-canvas-flagship-research-2026-08-25.md
-- Phases 3 (collaboration) and 4 (history/publish).
--
-- Invite tokens are hashed at rest (SHA-256) — the plaintext token is shown
-- once at creation time and never stored. Tokens are single-use, TTL-bounded,
-- and bound to a recipient email/userId when accepted.

-- ── moodboard_invites: token-hashed invite lifecycle ──
CREATE TABLE IF NOT EXISTS moodboard_invites (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Hashed token (SHA-256). The plaintext is returned once at creation and
  -- never persisted. Lookup by token is via hash comparison.
  token_hash TEXT NOT NULL UNIQUE,
  -- Role the invitee will receive on acceptance.
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'commenter', 'viewer')),
  -- Optional recipient binding. If set, only this user can accept.
  recipient_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'accepted', 'revoked', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS moodboard_invites_board_idx
  ON moodboard_invites (board_id, state);

CREATE INDEX IF NOT EXISTS moodboard_invites_token_hash_idx
  ON moodboard_invites (token_hash)
  WHERE state = 'pending';

-- ── moodboard_comments: anchored threads with resolve state ──
-- Comments are anchored to a canvas item (itemId) or the board itself
-- (itemId IS NULL). Threads are flat (no nested replies) per the research
-- report's "anchored threads" model — simplicity over nesting.
CREATE TABLE IF NOT EXISTS moodboard_comments (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- NULL means the comment is anchored to the board, not a specific item.
  item_id TEXT,
  body TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moodboard_comments_board_idx
  ON moodboard_comments (board_id, created_at DESC);

CREATE INDEX IF NOT EXISTS moodboard_comments_item_idx
  ON moodboard_comments (board_id, item_id, resolved)
  WHERE item_id IS NOT NULL;

-- ── moodboard_versions: immutable checkpoints (already in 186, but add
--     label and auto-checkpoint trigger support) ──
-- The 186 migration created moodboard_versions. This migration adds an
-- auto-checkpoint flag and a source indicator (manual vs auto).
ALTER TABLE moodboard_versions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto', 'restore')),
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS moodboard_versions_pinned_idx
  ON moodboard_versions (board_id, is_pinned, revision DESC)
  WHERE is_pinned = true;
