-- 185_user_intent_ledger.sql
-- Intent ledger: authoritative user controls for the recommendation system.
-- DSA Article 27: users must be able to modify/influence main parameters.
-- DSA Article 38: at least one non-profiling option must be available.

CREATE TABLE IF NOT EXISTS user_intent_versions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intent_version BIGINT NOT NULL DEFAULT 0,
  profile_mode TEXT NOT NULL DEFAULT 'personalized'
    CHECK (profile_mode IN ('personalized', 'non_profiled')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS user_intent_mutations (
  mutation_id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intent_version BIGINT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('topic', 'brand', 'category', 'seller', 'item', 'session')),
  target_id TEXT NOT NULL,
  target_label TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('more', 'usual', 'less', 'exclude', 'add', 'remove')),
  previous_direction TEXT CHECK (previous_direction IN ('more', 'usual', 'less', 'exclude', 'add', 'remove')),
  source TEXT NOT NULL DEFAULT 'your_algorithm' CHECK (source IN ('your_algorithm', 'feed_action', 'onboarding', 'search')),
  expires_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL,
  policy_version TEXT NOT NULL DEFAULT 'intent-v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX idx_intent_mutations_version
  ON user_intent_mutations (user_id, intent_version DESC);
CREATE INDEX idx_intent_mutations_target
  ON user_intent_mutations (user_id, scope, target_id, created_at DESC);
CREATE INDEX idx_intent_mutations_expires
  ON user_intent_mutations (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS recommendation_topic_projection (
  projection_id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  topic_label TEXT NOT NULL,
  topic_category TEXT NOT NULL DEFAULT 'Category preference',
  influence_band TEXT NOT NULL DEFAULT 'usual'
    CHECK (influence_band IN ('less', 'usual', 'more', 'excluded')),
  source_type TEXT NOT NULL DEFAULT 'inferred'
    CHECK (source_type IN ('explicit', 'implicit', 'inferred')),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  evidence_window_days INTEGER NOT NULL DEFAULT 30,
  removable BOOLEAN NOT NULL DEFAULT TRUE,
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  projection_version INTEGER NOT NULL DEFAULT 1,
  last_evidence_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, topic_id)
);

CREATE INDEX idx_topic_projection_band
  ON recommendation_topic_projection (user_id, influence_band, topic_label);
CREATE INDEX idx_topic_projection_active
  ON recommendation_topic_projection (user_id, topic_label)
  WHERE paused = FALSE;

CREATE TABLE IF NOT EXISTS recommendation_signal_ledger (
  signal_id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('save', 'view', 'search', 'follow', 'purchase', 'browse', 'offer', 'share', 'not_interested')),
  source_listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  source_seller_id TEXT,
  source_query TEXT,
  purpose TEXT NOT NULL DEFAULT 'personalization'
    CHECK (purpose IN ('personalization', 'trust_safety', 'transaction_fulfillment', 'analytics')),
  permitted_for_personalization BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signal_ledger_user
  ON recommendation_signal_ledger (user_id, created_at DESC);
CREATE INDEX idx_signal_ledger_purpose
  ON recommendation_signal_ledger (user_id, purpose, permitted_for_personalization)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_signal_ledger_expires
  ON recommendation_signal_ledger (expires_at)
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE recommendation_serves
  ADD COLUMN IF NOT EXISTS intent_version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS serve_mode TEXT NOT NULL DEFAULT 'personalized'
    CHECK (serve_mode IN ('personalized', 'cold_start', 'non_profiled', 'degraded_baseline', 'recovery_general'));

CREATE INDEX IF NOT EXISTS idx_recommendation_serves_intent
  ON recommendation_serves (user_id, intent_version DESC);
