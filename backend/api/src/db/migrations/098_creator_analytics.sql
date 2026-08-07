-- Creator analytics: raw event log + daily aggregates
CREATE TABLE IF NOT EXISTS creator_analytics_events (
  id BIGSERIAL PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('look', 'poster', 'story', 'document')),
  content_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'like', 'save', 'comment', 'share', 'product_click', 'profile_visit')),
  viewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS creator_analytics_events_idx
  ON creator_analytics_events (creator_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS creator_analytics_content_idx
  ON creator_analytics_events (content_type, content_id, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_analytics_daily (
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content_type TEXT NOT NULL,
  content_id TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  product_clicks INTEGER NOT NULL DEFAULT 0,
  profile_visits INTEGER NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(5, 4) NOT NULL DEFAULT 0,
  PRIMARY KEY (creator_id, date, content_type, content_id)
);
