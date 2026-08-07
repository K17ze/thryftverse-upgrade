-- 104_coown_watchlist.sql
-- Co-Own Watchlist
--
-- Allows users to bookmark Co-Own assets for tracking. The composite
-- primary key (user_id, asset_id) ensures a user can watch an asset only
-- once. ON CONFLICT DO NOTHING on inserts makes add-to-watchlist idempotent.

CREATE TABLE IF NOT EXISTS coown_watchlist (
  user_id    TEXT NOT NULL,
  asset_id   TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_coown_watchlist_user
  ON coown_watchlist (user_id, created_at DESC);
