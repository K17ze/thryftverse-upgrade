-- 327_search_unaccent.sql
--
-- Multilingual search (audit R26): the listings FTS vector built by
-- migration 008 uses to_tsvector('simple', ...) on raw text, so "cafe"
-- never matches a listing titled "café" — the indexed lexeme keeps its
-- accent and the 'simple' dictionary does no folding. Same for the
-- pg_trgm similarity fallback (migration 298) and the POSITION()
-- substring predicates in GET /search/listings.
--
-- Fix: install unaccent, wrap it in the documented IMMUTABLE function
-- (unaccent() itself is STABLE — the dictionary can be swapped — so index
-- and trigger expressions go through an immutable wrapper), fold accents
-- in the search_vector trigger, backfill rows that contain non-ASCII
-- text, and add expression trigram indexes matching the unaccented
-- predicates the query path now emits. ASCII text passes through
-- unchanged — English queries behave identically.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Documented postgres pattern: an IMMUTABLE wrapper around the STABLE
-- unaccent() so it is legal in trigger-computed columns and expression
-- indexes. Immutability holds while the 'unaccent' dictionary is
-- unmodified — which is the supported configuration here.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text AS $$
  SELECT unaccent('unaccent', $1);
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

CREATE OR REPLACE FUNCTION listings_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', f_unaccent(COALESCE(NEW.title, ''))), 'A')
    || setweight(to_tsvector('simple', f_unaccent(COALESCE(NEW.description, ''))), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Backfill only rows whose text actually carries non-ASCII characters —
-- every other vector is byte-identical under f_unaccent.
UPDATE listings
SET search_vector =
  setweight(to_tsvector('simple', f_unaccent(COALESCE(title, ''))), 'A')
  || setweight(to_tsvector('simple', f_unaccent(COALESCE(description, ''))), 'B')
WHERE COALESCE(title, '') ~ '[^\x00-\x7F]'
   OR COALESCE(description, '') ~ '[^\x00-\x7F]';

-- Expression trigram indexes matching the unaccented predicates in
-- /search/listings so "cafe" similarity-matches "café" titles off an index
-- scan, not a seq scan. The raw-column indexes from migration 298 stay —
-- other consumers still query raw similarity.
CREATE INDEX IF NOT EXISTS listings_title_unaccent_trgm_idx
  ON listings USING GIN (f_unaccent(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS listings_brand_unaccent_trgm_idx
  ON listings USING GIN (f_unaccent(COALESCE(brand, '')) gin_trgm_ops);
