-- Presence registry: persistent fallback for the Redis-backed presence
-- system. When Redis is unavailable, the realtime layer can fall back
-- to this table to determine which users are online and which topics
-- they are subscribed to. Redis remains the primary source of truth;
-- this table is updated opportunistically and is eventually consistent.

CREATE TABLE IF NOT EXISTS user_presence (
  user_id TEXT NOT NULL,
  socket_id TEXT NOT NULL,
  topics TEXT[] NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_online BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, socket_id)
);

CREATE INDEX IF NOT EXISTS user_presence_user_id_idx
  ON user_presence (user_id);

CREATE INDEX IF NOT EXISTS user_presence_is_online_idx
  ON user_presence (is_online)
  WHERE is_online = TRUE;

CREATE INDEX IF NOT EXISTS user_presence_last_seen_at_idx
  ON user_presence (last_seen_at);

COMMENT ON TABLE user_presence IS
  'Persistent fallback for the Redis-backed realtime presence registry.';
COMMENT ON COLUMN user_presence.user_id IS
  'ID of the user whose presence is being tracked.';
COMMENT ON COLUMN user_presence.socket_id IS
  'Unique identifier of the WebSocket/SSE connection.';
COMMENT ON COLUMN user_presence.topics IS
  'Array of realtime topics the user is subscribed to.';
COMMENT ON COLUMN user_presence.last_seen_at IS
  'Timestamp of the most recent heartbeat or connection event.';
COMMENT ON COLUMN user_presence.is_online IS
  'Whether the connection is considered active. Set to FALSE on disconnect.';
