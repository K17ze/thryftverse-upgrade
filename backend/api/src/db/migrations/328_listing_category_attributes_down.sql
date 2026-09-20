-- Rollback for 328_listing_category_attributes.sql.
--
-- Dropping the column discards all authored category attributes. They are
-- not recoverable from any other column — the flat columns were never a
-- superset of the attribute map.

ALTER TABLE listings
  DROP COLUMN IF EXISTS attributes;
