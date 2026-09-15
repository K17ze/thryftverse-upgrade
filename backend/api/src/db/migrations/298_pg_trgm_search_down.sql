-- 298_pg_trgm_search_down.sql
--
-- Drop the search trigram indexes only. pg_trgm itself stays installed:
-- reviewIntegrity.checkDuplicateText depends on SIMILARITY(), and other
-- consumers may rely on the extension existing.

DROP INDEX IF EXISTS listings_title_trgm_idx;
DROP INDEX IF EXISTS listings_brand_trgm_idx;
