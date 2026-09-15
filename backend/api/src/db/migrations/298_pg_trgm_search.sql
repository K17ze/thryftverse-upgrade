-- 298_pg_trgm_search.sql
--
-- Typo-tolerant search fallback. GET /search/listings falls back to literal
-- POSITION() substring matching when the GIN-indexed tsvector (migration 008)
-- yields no rows, so "nikee" finds nothing even when "Nike" listings exist.
-- pg_trgm trigram similarity closes that gap; these GIN indexes keep the
-- similarity predicates off sequential scans.
--
-- This also un-breaks reviewIntegrity.checkDuplicateText, which has called
-- SIMILARITY() since it was written: pg_trgm was never installed, so the call
-- threw and was swallowed by its try/catch — duplicate-review detection has
-- silently never run. The extension existing is the entire fix there.
--
-- Plain CREATE INDEX (not CONCURRENTLY): the runner wraps each migration in
-- a transaction unless it carries `-- @noTransaction`, matching every other
-- index migration in this directory.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS listings_title_trgm_idx
  ON listings USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS listings_brand_trgm_idx
  ON listings USING GIN (brand gin_trgm_ops);
