-- Migration 170: Look carousel media — multi-image/video support per look
-- Backward compatible: looks.media_url remains the primary/first media.
-- This table stores additional carousel slides beyond the primary.

CREATE TABLE IF NOT EXISTS look_media (
  id TEXT PRIMARY KEY,
  look_id TEXT NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  position INTEGER NOT NULL DEFAULT 0,
  media_finalization_id TEXT,
  media_asset_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS look_media_look_id_idx ON look_media (look_id, position ASC);

-- Trigger: update looks.updated_at when media changes
CREATE OR REPLACE FUNCTION update_looks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
