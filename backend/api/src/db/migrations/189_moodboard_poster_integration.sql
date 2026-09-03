-- 189_moodboard_poster_integration.sql
-- Adds moodboard-as-poster-content support: a poster can reference a moodboard
-- as its primary content instead of a media URL. The poster viewer renders
-- the moodboard canvas interactively when content_type = 'moodboard'.
--
-- Also adds a publication_path column to moodboards to track whether a board
-- has been published as a poster and the linked poster id.

ALTER TABLE posters
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'media'
    CHECK (content_type IN ('media', 'moodboard'));

ALTER TABLE posters
  ADD COLUMN IF NOT EXISTS moodboard_id TEXT REFERENCES moodboards(id) ON DELETE SET NULL;

-- Index for looking up posters by moodboard reference
CREATE INDEX IF NOT EXISTS idx_posters_moodboard_id
  ON posters (moodboard_id)
  WHERE moodboard_id IS NOT NULL;

-- Track publication linkage from the moodboard side
ALTER TABLE moodboards
  ADD COLUMN IF NOT EXISTS published_poster_id TEXT;

-- When a moodboard is soft-deleted, clear the publication link
-- (the poster remains as a standalone content artifact)
