-- Migration 040: Poster Stories platform — story groups, stickers, views, reactions, replies, style votes, highlights

-- ── Poster Stories (story groups) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS poster_stories (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  audience TEXT NOT NULL DEFAULT 'public'
    CHECK (audience IN ('public', 'private')),

  allow_replies BOOLEAN NOT NULL DEFAULT TRUE,
  allow_reactions BOOLEAN NOT NULL DEFAULT TRUE,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'deleted')),

  expires_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS poster_stories_creator_created_idx
  ON poster_stories (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS poster_stories_status_expires_idx
  ON poster_stories (status, expires_at);

-- Trigger: update updated_at on poster_stories
CREATE OR REPLACE FUNCTION update_poster_stories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS poster_stories_updated_at_trigger ON poster_stories;
CREATE TRIGGER poster_stories_updated_at_trigger
  BEFORE UPDATE ON poster_stories
  FOR EACH ROW
  EXECUTE FUNCTION update_poster_stories_updated_at();

-- ── Extend posters table for multi-frame stories ────────────────────
ALTER TABLE posters
  ADD COLUMN IF NOT EXISTS story_id TEXT
    REFERENCES poster_stories(id) ON DELETE CASCADE,

  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video', 'text')),

  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS duration_ms INTEGER NOT NULL DEFAULT 5000,

  ADD COLUMN IF NOT EXISTS poster_caption TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS posters_story_sort_idx
  ON posters (story_id, sort_order);

-- ── Migrate existing poster rows into story groups ──────────────────
-- For each existing poster without a story_id, create a story group
-- and link it. Preserve expiry as 24h from created_at.
DO $$
DECLARE
  poster_row RECORD;
  story_id TEXT;
BEGIN
  FOR poster_row IN
    SELECT id, creator_id, created_at, expiry_hours
    FROM posters
    WHERE story_id IS NULL
  LOOP
    story_id := poster_row.id;
    INSERT INTO poster_stories (id, creator_id, audience, allow_replies, allow_reactions, status, expires_at, created_at, updated_at)
    VALUES (
      story_id,
      poster_row.creator_id,
      'public',
      TRUE,
      TRUE,
      'active',
      poster_row.created_at + (poster_row.expiry_hours || ' hours')::INTERVAL,
      poster_row.created_at,
      poster_row.created_at
    )
    ON CONFLICT (id) DO NOTHING;

    UPDATE posters SET story_id = story_id WHERE id = poster_row.id;
  END LOOP;
END $$;

-- ── Poster Stickers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poster_stickers (
  id TEXT PRIMARY KEY,
  frame_id TEXT NOT NULL REFERENCES posters(id) ON DELETE CASCADE,

  type TEXT NOT NULL CHECK (
    type IN (
      'text',
      'mention',
      'listing',
      'look',
      'style_vote'
    )
  ),

  x NUMERIC NOT NULL CHECK (x >= 0 AND x <= 1),
  y NUMERIC NOT NULL CHECK (y >= 0 AND y <= 1),

  scale NUMERIC NOT NULL DEFAULT 1
    CHECK (scale >= 0.4 AND scale <= 3),

  rotation NUMERIC NOT NULL DEFAULT 0,

  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS poster_stickers_frame_idx
  ON poster_stickers (frame_id, sort_order);

-- ── Poster Views ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poster_views (
  frame_id TEXT NOT NULL REFERENCES posters(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (frame_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS poster_views_frame_idx
  ON poster_views (frame_id);

-- ── Poster Reactions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poster_reactions (
  frame_id TEXT NOT NULL REFERENCES posters(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  reaction TEXT NOT NULL CHECK (
    reaction IN ('love', 'fire', 'style', 'want', 'wow', 'laugh')
  ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (frame_id, user_id)
);

CREATE INDEX IF NOT EXISTS poster_reactions_frame_idx
  ON poster_reactions (frame_id);

-- Trigger: update updated_at on poster_reactions
CREATE OR REPLACE FUNCTION update_poster_reactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS poster_reactions_updated_at_trigger ON poster_reactions;
CREATE TRIGGER poster_reactions_updated_at_trigger
  BEFORE UPDATE ON poster_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_poster_reactions_updated_at();

-- ── Poster Replies (private) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poster_replies (
  id TEXT PRIMARY KEY,
  frame_id TEXT NOT NULL REFERENCES posters(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL REFERENCES poster_stories(id) ON DELETE CASCADE,

  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS poster_replies_creator_created_idx
  ON poster_replies (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS poster_replies_author_created_idx
  ON poster_replies (author_id, created_at DESC);

-- ── Poster Style Votes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poster_style_votes (
  sticker_id TEXT NOT NULL
    REFERENCES poster_stickers(id) ON DELETE CASCADE,

  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (sticker_id, user_id)
);

-- ── Poster Highlights ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poster_highlights (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  cover_frame_id TEXT REFERENCES posters(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS poster_highlights_creator_sort_idx
  ON poster_highlights (creator_id, sort_order);

-- Trigger: update updated_at on poster_highlights
CREATE OR REPLACE FUNCTION update_poster_highlights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS poster_highlights_updated_at_trigger ON poster_highlights;
CREATE TRIGGER poster_highlights_updated_at_trigger
  BEFORE UPDATE ON poster_highlights
  FOR EACH ROW
  EXECUTE FUNCTION update_poster_highlights_updated_at();

-- ── Poster Highlight Items ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poster_highlight_items (
  highlight_id TEXT NOT NULL
    REFERENCES poster_highlights(id) ON DELETE CASCADE,

  frame_id TEXT NOT NULL REFERENCES posters(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (highlight_id, frame_id)
);

CREATE INDEX IF NOT EXISTS poster_highlight_items_sort_idx
  ON poster_highlight_items (highlight_id, sort_order);
