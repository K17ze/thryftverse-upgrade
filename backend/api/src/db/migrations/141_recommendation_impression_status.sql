-- Distinguish served, rendered and viewable recommendation rows.
--
-- A row written at response time only proves the candidate was returned to the
-- client, not that it was visible. Training must not treat unseen lower-ranked
-- rows as rejected. Rather than split attribution across a new table (which
-- would duplicate the request_id/listing_id joins already used by interaction
-- attribution), add a status lifecycle to the existing impressions table:
--
--   served   — server returned the candidate (default, response time)
--   rendered — client mounted the cell in the viewport
--   viewable — client confirmed a viewability threshold (dwell + exposure)
--
-- Status only advances forward; rendered_at/viewable_at preserve timing without
-- losing the original serve row.

ALTER TABLE recommendation_impressions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'served'
    CHECK (status IN ('served', 'rendered', 'viewable')),
  ADD COLUMN IF NOT EXISTS rendered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS viewable_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS viewability JSONB;

-- Backfill existing rows so the new column is honest about historical serves.
UPDATE recommendation_impressions
  SET status = 'served'
  WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS recommendation_impressions_status_created_idx
  ON recommendation_impressions (status, created_at DESC);
