-- Migration 318: moodboard item provenance — source type, look lineage,
-- media kind, poster and aspect ratio.
--
-- Items previously recorded only listing_id + media_url, so a listing-sourced
-- tile could not be told apart from a raw media tile and video items had no
-- poster or geometry metadata. `source_type` is the discriminant consumed by
-- the canvas renderer; `source_look_id` preserves look lineage; `media_type`,
-- `poster_url` and `aspect_ratio` describe playback/geometry for media items.
--
-- The backfill is honest: rows with a listing_id are 'listing', everything
-- else is 'media' — no source is fabricated for legacy rows.

ALTER TABLE moodboard_items
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'listing'
    CHECK (source_type IN ('listing','media','look','note')),
  ADD COLUMN IF NOT EXISTS source_look_id TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image','video')),
  ADD COLUMN IF NOT EXISTS poster_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS aspect_ratio NUMERIC NOT NULL DEFAULT 1.0;

UPDATE moodboard_items
  SET source_type = CASE WHEN listing_id IS NOT NULL THEN 'listing' ELSE 'media' END;
