-- Migration 228: Look comment soft-delete tombstones
-- X/Threads model: deleting a comment that has live replies keeps a tombstone
-- row so the reply thread survives ("Deleted comment" placeholder). Leaf
-- comments are hard-deleted.

ALTER TABLE look_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS look_comments_live_reply_idx
  ON look_comments (parent_id)
  WHERE parent_id IS NOT NULL AND deleted_at IS NULL;
