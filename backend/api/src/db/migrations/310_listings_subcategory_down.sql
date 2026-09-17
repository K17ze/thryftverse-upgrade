DROP INDEX IF EXISTS idx_listings_category_subcategory;
ALTER TABLE listings DROP COLUMN IF EXISTS subcategory;
