-- Migration 032: Visual search request storage (honest placeholder for Phase 6 Discovery)

CREATE TABLE IF NOT EXISTS visual_search_requests (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS visual_search_requests_created_at_idx
  ON visual_search_requests (created_at DESC);
