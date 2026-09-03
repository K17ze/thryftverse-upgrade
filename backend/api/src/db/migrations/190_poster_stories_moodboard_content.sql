-- 190_poster_stories_moodboard_content.sql
-- Adds moodboard content type support to poster_stories so a moodboard
-- can be published as a story (the poster viewer consumes /poster-stories,
-- not the legacy /posters endpoint). When content_type = 'moodboard',
-- the story has a single frame and the viewer renders the moodboard canvas
-- via GET /posters/:posterId/moodboard (using the linked moodboard_id).

ALTER TABLE poster_stories
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'media'
    CHECK (content_type IN ('media', 'moodboard'));

ALTER TABLE poster_stories
  ADD COLUMN IF NOT EXISTS moodboard_id TEXT REFERENCES moodboards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_poster_stories_moodboard_id
  ON poster_stories (moodboard_id)
  WHERE moodboard_id IS NOT NULL;
