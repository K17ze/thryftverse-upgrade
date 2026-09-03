-- 182_visual_search_requests_expiry.sql
-- Add an expires_at column to visual_search_requests so telemetry rows
-- have a bounded lifetime for privacy compliance. The route now stores a
-- SHA-256 hash of the image URL (not the raw URL) and sets expires_at to
-- NOW() + 30 days at insert time.

ALTER TABLE visual_search_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill existing rows with a 30-day expiry from now.
UPDATE visual_search_requests
  SET expires_at = NOW() + INTERVAL '30 days'
  WHERE expires_at IS NULL;

-- Index for efficient cleanup scans.
CREATE INDEX IF NOT EXISTS idx_visual_search_requests_expires_at
  ON visual_search_requests (expires_at);
