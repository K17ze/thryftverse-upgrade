-- 106_user_settings_privacy.sql
-- Adds columns for chat privacy sync, activity status, search visibility,
-- locale/currency preferences, and connected accounts management.
-- These columns allow settings to persist across devices and after logout,
-- closing the critical gap where chat privacy was local-only.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS read_receipts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_messages_from TEXT NOT NULL DEFAULT 'everyone'
    CHECK (allow_messages_from IN ('everyone', 'following', 'nobody')),
  ADD COLUMN IF NOT EXISTS activity_status_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS search_visibility TEXT NOT NULL DEFAULT 'visible'
    CHECK (search_visibility IN ('visible', 'hidden')),
  ADD COLUMN IF NOT EXISTS locale TEXT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'GBP'
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  ADD COLUMN IF NOT EXISTS region_code TEXT;

-- Connected accounts table — tracks linked OAuth providers
CREATE TABLE IF NOT EXISTS user_connected_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'facebook')),
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlinked_at TIMESTAMPTZ,
  metadata JSONB,
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_user ON user_connected_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_provider ON user_connected_accounts(provider, provider_user_id);

-- Email notification preferences — per-category email toggles
CREATE TABLE IF NOT EXISTS user_email_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  order_updates BOOLEAN NOT NULL DEFAULT TRUE,
  message_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  price_drop_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  new_listings_from_following BOOLEAN NOT NULL DEFAULT TRUE,
  marketing BOOLEAN NOT NULL DEFAULT FALSE,
  security_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  distribution_notices BOOLEAN NOT NULL DEFAULT TRUE,
  corporate_action_notices BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Co-Own price alerts
CREATE TABLE IF NOT EXISTS coown_price_alerts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('above', 'below')),
  target_price_gbp_minor BIGINT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coown_price_alerts_user ON coown_price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_coown_price_alerts_asset ON coown_price_alerts(asset_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coown_price_alerts_unique
  ON coown_price_alerts(user_id, asset_id, condition, target_price_gbp_minor)
  WHERE active = TRUE;

-- Co-Own DRIP enrollment
CREATE TABLE IF NOT EXISTS coown_drip_enrollments (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  enrolled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, asset_id)
);

-- Co-Own recurring orders
CREATE TABLE IF NOT EXISTS coown_recurring_orders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy')),
  units_per_execution INTEGER NOT NULL CHECK (units_per_execution > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  next_execution_at TIMESTAMPTZ NOT NULL,
  max_price_gbp_minor BIGINT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  executions_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coown_recurring_orders_user ON coown_recurring_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_coown_recurring_orders_next ON coown_recurring_orders(next_execution_at) WHERE active = TRUE;

-- Co-Own governance votes
CREATE TABLE IF NOT EXISTS coown_governance_votes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  corporate_action_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('for', 'against', 'abstain')),
  voting_power_units INTEGER NOT NULL,
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (corporate_action_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coown_governance_votes_action ON coown_governance_votes(corporate_action_id);
CREATE INDEX IF NOT EXISTS idx_coown_governance_votes_user ON coown_governance_votes(user_id);

-- Co-Own price history (OHLCV aggregation)
CREATE TABLE IF NOT EXISTS coown_price_history (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_id TEXT NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('1h', '4h', '1d', '1w')),
  bucket_start TIMESTAMPTZ NOT NULL,
  open_gbp_minor BIGINT NOT NULL,
  high_gbp_minor BIGINT NOT NULL,
  low_gbp_minor BIGINT NOT NULL,
  close_gbp_minor BIGINT NOT NULL,
  volume_units INTEGER NOT NULL DEFAULT 0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, interval, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_coown_price_history_asset ON coown_price_history(asset_id, interval, bucket_start DESC);
