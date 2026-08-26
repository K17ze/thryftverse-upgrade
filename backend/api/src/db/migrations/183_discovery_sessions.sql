CREATE TABLE IF NOT EXISTS discovery_sessions (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  entry_point TEXT NOT NULL DEFAULT 'home',
  mode TEXT NOT NULL DEFAULT 'explicit',
  raw_query TEXT NOT NULL DEFAULT '',
  normalized_query TEXT NOT NULL DEFAULT '',
  vertical TEXT NOT NULL DEFAULT 'all',
  serve_mode TEXT NOT NULL DEFAULT 'personalized',
  policy_version TEXT NOT NULL DEFAULT 'discovery-v1',
  consent_version TEXT NOT NULL DEFAULT '',
  intent_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS discovery_sessions_actor_idx
  ON discovery_sessions (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS discovery_sessions_expires_idx
  ON discovery_sessions (expires_at);
