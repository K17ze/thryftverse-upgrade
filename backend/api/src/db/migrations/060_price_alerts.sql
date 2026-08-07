-- Price-drop alerts for listings.
-- Users can enable an alert to receive a notification when a listing's
-- price drops below the threshold at which the alert was created.

CREATE TABLE IF NOT EXISTS price_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  trigger_price NUMERIC(12, 2) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_listing ON price_alerts (listing_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_enabled ON price_alerts (enabled) WHERE enabled = TRUE;
