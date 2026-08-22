-- Live shopping sessions: persist stream lifecycle metadata for the
-- LiveKit-backed live shopping surface. Each row tracks a single stream
-- room from creation through live to ended, including viewer counts and
-- optional recording URLs for VOD replay.

CREATE TABLE IF NOT EXISTS live_shopping_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  host_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  room_url TEXT NOT NULL DEFAULT '',
  recording_url TEXT,
  recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  max_viewers INTEGER NOT NULL DEFAULT 0,
  viewer_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS live_shopping_sessions_status_idx
  ON live_shopping_sessions (status)
  WHERE status IN ('created', 'live');

CREATE INDEX IF NOT EXISTS live_shopping_sessions_host_idx
  ON live_shopping_sessions (host_user_id);

COMMENT ON TABLE live_shopping_sessions IS
  'Live shopping stream sessions backed by LiveKit rooms.';
COMMENT ON COLUMN live_shopping_sessions.id IS
  'Unique room identifier (LiveKit room name).';
COMMENT ON COLUMN live_shopping_sessions.status IS
  'Stream lifecycle: created, live, ended, failed.';
