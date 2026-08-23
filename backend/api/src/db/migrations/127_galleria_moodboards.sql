CREATE TABLE IF NOT EXISTS galleria_collections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  curator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  curator_name TEXT NOT NULL DEFAULT '',
  curator_avatar TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS galleria_collections_status_idx
  ON galleria_collections (status, published_at DESC);

CREATE TABLE IF NOT EXISTS galleria_collection_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES galleria_collections(id) ON DELETE CASCADE,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  media_url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  valuation NUMERIC NOT NULL DEFAULT 0,
  story TEXT NOT NULL DEFAULT '',
  aspect_ratio NUMERIC NOT NULL DEFAULT 1.0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS galleria_collection_items_idx
  ON galleria_collection_items (collection_id, sort_order);

CREATE TABLE IF NOT EXISTS moodboards (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public',
  cover_image_url TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'theme-linen',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moodboards_public_idx
  ON moodboards (visibility, updated_at DESC);

CREATE INDEX IF NOT EXISTS moodboards_creator_idx
  ON moodboards (creator_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS moodboard_items (
  id TEXT PRIMARY KEY,
  moodboard_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  listing_id TEXT,
  media_url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  price_gbp NUMERIC NOT NULL DEFAULT 0,
  caption TEXT NOT NULL DEFAULT '',
  position_x NUMERIC NOT NULL DEFAULT 0.5,
  position_y NUMERIC NOT NULL DEFAULT 0.5,
  rotation NUMERIC NOT NULL DEFAULT 0,
  scale NUMERIC NOT NULL DEFAULT 1.0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moodboard_items_idx
  ON moodboard_items (moodboard_id, sort_order);
