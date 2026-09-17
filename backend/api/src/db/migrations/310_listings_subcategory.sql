-- listings.subcategory — the taxonomy leaf chosen at sell time.
-- Without this column the API returned subcategory: null for every row,
-- so subcategory-scoped browse pages could never match real data.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS subcategory TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_category_subcategory
  ON listings (category, subcategory)
  WHERE status = 'active';
