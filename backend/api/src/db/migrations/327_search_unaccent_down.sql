-- 327_search_unaccent_down.sql
--
-- Revert accent folding: restore the migration-008 search_vector trigger
-- verbatim, recompute the vectors that were rewritten with folded text,
-- and drop the unaccented trigram expression indexes + the f_unaccent
-- wrapper. The unaccent extension itself stays installed — other
-- consumers may rely on it existing (same convention as 298, which keeps
-- pg_trgm on rollback).

DROP INDEX IF EXISTS listings_title_unaccent_trgm_idx;
DROP INDEX IF EXISTS listings_brand_unaccent_trgm_idx;

CREATE OR REPLACE FUNCTION listings_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A')
    || setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Recompute only the rows the up-migration rewrote.
UPDATE listings
SET search_vector =
  setweight(to_tsvector('simple', COALESCE(title, '')), 'A')
  || setweight(to_tsvector('simple', COALESCE(description, '')), 'B')
WHERE COALESCE(title, '') ~ '[^\x00-\x7F]'
   OR COALESCE(description, '') ~ '[^\x00-\x7F]';

DROP FUNCTION IF EXISTS f_unaccent(text);
