-- 043: Notification centre persistent read state, event types, preferences
-- Adds read_at, event_type, idempotency key, and push preference table

ALTER TABLE notification_events
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS actor_user_id TEXT,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS route JSONB;

-- Index for unread count per user
CREATE INDEX IF NOT EXISTS notification_events_unread_idx
  ON notification_events (user_id, read_at)
  WHERE read_at IS NULL;

-- Index for cursor pagination (timestamp + id)
CREATE INDEX IF NOT EXISTS notification_events_cursor_idx
  ON notification_events (user_id, created_at DESC, id DESC);

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS notification_events_type_idx
  ON notification_events (user_id, event_type, created_at DESC);

-- Unique constraint for idempotency key per user
CREATE UNIQUE INDEX IF NOT EXISTS notification_events_idempotency_idx
  ON notification_events (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Push preferences table (server-persisted)
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (
    category IN ('messages', 'offers', 'wishlist', 'followers', 'orderUpdates', 'priceDrops', 'news')
  ),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, category)
);

-- Safe defaults for existing users: insert all-true preferences for users who don't have any
INSERT INTO notification_preferences (user_id, category, enabled)
SELECT u.id, c.category, TRUE
FROM users u
CROSS JOIN (VALUES
  ('messages'), ('offers'), ('wishlist'), ('followers'),
  ('orderUpdates'), ('priceDrops'), ('news')
) AS c(category)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_preferences np
  WHERE np.user_id = u.id AND np.category = c.category
)
ON CONFLICT DO NOTHING;
