-- Migration 030: Creator tools tables — posters, looks, listing_images

-- ── Posters ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posters (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  text_overlay JSONB DEFAULT NULL,
  -- text_overlay: { text, color, position: 'top'|'center'|'bottom', fontSize, alignment }
  background_color TEXT DEFAULT NULL,
  layout TEXT DEFAULT 'single',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  expiry_hours INTEGER NOT NULL DEFAULT 24 CHECK (expiry_hours > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posters_creator_id_idx ON posters (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posters_status_created_idx ON posters (status, created_at DESC);

-- Trigger: update updated_at on posters
CREATE OR REPLACE FUNCTION update_posters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posters_updated_at_trigger ON posters;
CREATE TRIGGER posters_updated_at_trigger
  BEFORE UPDATE ON posters
  FOR EACH ROW
  EXECUTE FUNCTION update_posters_updated_at();


-- ── Looks (shoppable images) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS looks (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  media_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS looks_creator_id_idx ON looks (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS looks_status_created_idx ON looks (status, created_at DESC);

-- Trigger: update updated_at on looks
DROP TRIGGER IF EXISTS looks_updated_at_trigger ON looks;
CREATE TRIGGER looks_updated_at_trigger
  BEFORE UPDATE ON looks
  FOR EACH ROW
  EXECUTE FUNCTION update_posters_updated_at();


-- ── Look tags (product pins) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS look_tags (
  id TEXT PRIMARY KEY,
  look_id TEXT NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  x NUMERIC(5, 4) NOT NULL CHECK (x >= 0 AND x <= 1),
  y NUMERIC(5, 4) NOT NULL CHECK (y >= 0 AND y <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS look_tags_look_id_idx ON look_tags (look_id);


-- ── Listing images (multi-image support) ────────────────────────────
CREATE TABLE IF NOT EXISTS listing_images (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listing_images_listing_id_idx ON listing_images (listing_id, sort_order);
