CREATE TABLE IF NOT EXISTS listing_qa (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  asker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL CHECK (char_length(question_text) BETWEEN 5 AND 300),
  answer_text TEXT CHECK (answer_text IS NULL OR char_length(answer_text) BETWEEN 3 AND 500),
  answered_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (answer_text IS NULL AND answered_by IS NULL AND answered_at IS NULL)
    OR (answer_text IS NOT NULL AND answered_by IS NOT NULL AND answered_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS listing_qa_listing_created_idx
  ON listing_qa (listing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS listing_qa_listing_answered_idx
  ON listing_qa (listing_id, answered_at DESC)
  WHERE answer_text IS NOT NULL;

CREATE TABLE IF NOT EXISTS listing_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'counterfeit', 'unresponsive', 'harassment', 'other')),
  details TEXT CHECK (details IS NULL OR char_length(details) <= 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'actioned', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listing_reports_listing_status_idx
  ON listing_reports (listing_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS listing_reports_reporter_idx
  ON listing_reports (reporter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS listing_price_events (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  previous_price_gbp NUMERIC(12, 2) NOT NULL CHECK (previous_price_gbp >= 0),
  new_price_gbp NUMERIC(12, 2) NOT NULL CHECK (new_price_gbp >= 0),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (previous_price_gbp <> new_price_gbp)
);

CREATE INDEX IF NOT EXISTS listing_price_events_listing_changed_idx
  ON listing_price_events (listing_id, changed_at DESC);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS auction_id TEXT REFERENCES auctions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_auction_unique_idx
  ON orders (auction_id)
  WHERE auction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS listings_sold_comparables_idx
  ON listings (category, brand, created_at DESC)
  WHERE status = 'sold';
