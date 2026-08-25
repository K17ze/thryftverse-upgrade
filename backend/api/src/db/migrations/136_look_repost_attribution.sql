-- Migration 136: Look repost attribution — tracks when a look is reposted
-- from another look, preserving creator credit and enabling attribution UI.

ALTER TABLE looks
  ADD COLUMN IF NOT EXISTS source_look_id TEXT REFERENCES looks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reposted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS looks_source_look_idx
  ON looks (source_look_id)
  WHERE source_look_id IS NOT NULL;

COMMENT ON COLUMN looks.source_look_id IS
  'When non-null, this look is a repost of the referenced source look. Attribution is preserved.';
COMMENT ON COLUMN looks.reposted_at IS
  'Timestamp when the repost was created. NULL for original looks.';
