-- Product tags for posters (matching the look_tags pattern)
CREATE TABLE IF NOT EXISTS poster_tags (
  id TEXT PRIMARY KEY,
  poster_id TEXT NOT NULL REFERENCES posters(id) ON DELETE CASCADE,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  x NUMERIC(5, 4) NOT NULL CHECK (x >= 0 AND x <= 1),
  y NUMERIC(5, 4) NOT NULL CHECK (y >= 0 AND y <= 1),
  click_count INTEGER NOT NULL DEFAULT 0,
  last_clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS poster_tags_poster_idx ON poster_tags (poster_id);
CREATE INDEX IF NOT EXISTS poster_tags_listing_idx ON poster_tags (listing_id);
