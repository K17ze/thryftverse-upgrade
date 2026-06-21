-- Migration 039: Looks social features — caption, visibility, likes, saves, comments

-- Add caption and visibility to looks
ALTER TABLE looks ADD COLUMN IF NOT EXISTS caption TEXT NOT NULL DEFAULT '';
ALTER TABLE looks ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'followers', 'private'));

-- ── Look likes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS look_likes (
  look_id TEXT NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (look_id, user_id)
);

CREATE INDEX IF NOT EXISTS look_likes_user_id_idx ON look_likes (user_id);

-- ── Look saves ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS look_saves (
  look_id TEXT NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (look_id, user_id)
);

CREATE INDEX IF NOT EXISTS look_saves_user_id_idx ON look_saves (user_id);

-- ── Look comments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS look_comments (
  id TEXT PRIMARY KEY,
  look_id TEXT NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS look_comments_look_id_created_idx
  ON look_comments (look_id, created_at DESC);

-- Trigger: update updated_at on look_comments
CREATE OR REPLACE FUNCTION update_look_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS look_comments_updated_at_trigger ON look_comments;
CREATE TRIGGER look_comments_updated_at_trigger
  BEFORE UPDATE ON look_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_look_comments_updated_at();
