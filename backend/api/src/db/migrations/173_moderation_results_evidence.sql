-- Migration 173: Moderation results and evidence tables
--
-- Stores structured moderation scan results from the provider gateway.
-- moderation_triage (migration 147) handles the asset triage queue; these
-- tables store the full provenance-attached result for text-based scans
-- (message_scan, listing_scan, profile_scan, review_scan) and the
-- access-restricted evidence hashes for all scan types.

CREATE TABLE IF NOT EXISTS moderation_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  request_id TEXT,
  content_ref TEXT NOT NULL,
  content_hash TEXT,
  purpose TEXT NOT NULL,
  modality TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_version TEXT,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'rejected', 'unavailable', 'failed')),
  confidence REAL NOT NULL DEFAULT 0,
  normalized_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_provider_response_hash TEXT,
  is_shadow BOOLEAN NOT NULL DEFAULT false,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_results_content ON moderation_results(content_ref);
CREATE INDEX IF NOT EXISTS idx_moderation_results_purpose ON moderation_results(purpose, status);
CREATE INDEX IF NOT EXISTS idx_moderation_results_created ON moderation_results(created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_evidence (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  result_id TEXT NOT NULL REFERENCES moderation_results(id) ON DELETE CASCADE,
  content_hash TEXT,
  raw_response_hash TEXT,
  provider TEXT,
  model_id TEXT,
  model_version TEXT,
  is_shadow BOOLEAN NOT NULL DEFAULT false,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_evidence_result ON moderation_evidence(result_id);
