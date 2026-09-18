-- Rollback for migration 318.

ALTER TABLE moodboard_items
  DROP COLUMN IF EXISTS source_type,
  DROP COLUMN IF EXISTS source_look_id,
  DROP COLUMN IF EXISTS media_type,
  DROP COLUMN IF EXISTS poster_url,
  DROP COLUMN IF EXISTS aspect_ratio;
