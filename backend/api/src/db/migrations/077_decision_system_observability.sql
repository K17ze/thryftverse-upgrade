-- Versioned recommendation serving, impressions and feedback attribution.
--
-- A recommendation policy cannot be evaluated or rolled back safely unless
-- every serve is reproducible and downstream actions retain request/position
-- attribution. These tables store metadata only; raw feature vectors remain
-- inside the controlled decision-service boundary.

CREATE TABLE IF NOT EXISTS decision_policy_versions (
  policy_version TEXT PRIMARY KEY,
  capability_level TEXT NOT NULL
    CHECK (capability_level IN ('heuristic_baseline', 'trained_model')),
  feature_schema_version TEXT NOT NULL,
  trained_model BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'shadow'
    CHECK (status IN ('shadow', 'active', 'retired', 'blocked')),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  activated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status <> 'active' OR activated_at IS NOT NULL)
);

INSERT INTO decision_policy_versions (
  policy_version,
  capability_level,
  feature_schema_version,
  trained_model,
  status,
  configuration,
  activated_at
)
VALUES (
  'recommendation-heuristic-v2.0',
  'heuristic_baseline',
  'recommendation-features-v2',
  FALSE,
  'active',
  '{"explorationPolicy":"deterministic_novelty","automaticModelTraining":false}'::jsonb,
  NOW()
)
ON CONFLICT (policy_version) DO NOTHING;

INSERT INTO decision_policy_versions (
  policy_version,
  capability_level,
  feature_schema_version,
  trained_model,
  status,
  configuration
)
VALUES (
  'recommendation-fallback-v2.0',
  'heuristic_baseline',
  'recommendation-fallback-features-v2',
  FALSE,
  'shadow',
  '{"purpose":"decision_service_failure_only","automaticModelTraining":false}'::jsonb
)
ON CONFLICT (policy_version) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS decision_policy_one_active_per_schema_idx
  ON decision_policy_versions (feature_schema_version)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS recommendation_serves (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL REFERENCES decision_policy_versions(policy_version),
  feature_schema_version TEXT NOT NULL,
  capability_level TEXT NOT NULL
    CHECK (capability_level IN ('heuristic_baseline', 'trained_model', 'fallback')),
  source TEXT NOT NULL CHECK (source IN ('decision_service', 'fallback')),
  surface TEXT,
  session_id TEXT,
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0),
  eligible_count INTEGER NOT NULL CHECK (eligible_count >= 0),
  result_count INTEGER NOT NULL CHECK (result_count >= 0),
  exploration_rate NUMERIC(6, 5) NOT NULL CHECK (exploration_rate BETWEEN 0 AND 1),
  cold_start BOOLEAN NOT NULL,
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS recommendation_serves_user_created_idx
  ON recommendation_serves (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recommendation_serves_policy_created_idx
  ON recommendation_serves (policy_version, created_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_impressions (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  score NUMERIC(10, 6) NOT NULL CHECK (score BETWEEN 0 AND 1),
  policy TEXT NOT NULL CHECK (policy IN ('exploit', 'explore')),
  model TEXT NOT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  component_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (request_id, user_id)
    REFERENCES recommendation_serves(request_id, user_id)
    ON DELETE CASCADE,
  UNIQUE (request_id, listing_id),
  UNIQUE (request_id, position)
);

CREATE INDEX IF NOT EXISTS recommendation_impressions_user_created_idx
  ON recommendation_impressions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recommendation_impressions_listing_created_idx
  ON recommendation_impressions (listing_id, created_at DESC);

ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER CHECK (position IS NULL OR position > 0),
  ADD COLUMN IF NOT EXISTS policy_version TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS interactions_user_idempotency_idx
  ON interactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS interactions_request_idx
  ON interactions (request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS interactions_recent_listing_idx
  ON interactions (created_at DESC, listing_id);

ALTER TABLE recommendation_feedback
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER CHECK (position IS NULL OR position > 0),
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS policy_version TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS recommendation_feedback_user_idempotency_idx
  ON recommendation_feedback (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS recommendation_feedback_request_idx
  ON recommendation_feedback (request_id)
  WHERE request_id IS NOT NULL;
