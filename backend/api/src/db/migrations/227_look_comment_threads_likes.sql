-- Migration 227: Look comment threading (parent_id) + comment likes
-- Adds 2-level reply threading (Instagram-style: replies attach to root comment)
-- and per-comment likes to the look_comments system.

-- ── Threaded replies: parent_id self-reference ──────────────────────
-- parent_id is NULL for top-level comments, or points to a root comment
-- for replies. Replies-to-replies flatten back to the root (parentId = root),
-- matching Instagram's 2-level model.
ALTER TABLE look_comments ADD COLUMN IF NOT EXISTS parent_id TEXT
  REFERENCES look_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS look_comments_parent_id_created_idx
  ON look_comments (parent_id, created_at ASC)
  WHERE parent_id IS NOT NULL;

-- Index for fetching root comments ordered by creation
CREATE INDEX IF NOT EXISTS look_comments_look_id_parent_created_idx
  ON look_comments (look_id, parent_id, created_at ASC);

-- ── Comment likes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS look_comment_likes (
  comment_id TEXT NOT NULL REFERENCES look_comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS look_comment_likes_user_id_idx
  ON look_comment_likes (user_id);
