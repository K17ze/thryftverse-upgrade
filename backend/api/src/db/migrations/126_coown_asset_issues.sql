CREATE TABLE IF NOT EXISTS coown_asset_issues (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES "coOwn_assets"(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('dispute', 'technical', 'fraud', 'other')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coown_asset_issues_asset_idx
  ON coown_asset_issues (asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coown_asset_issues_reporter_idx
  ON coown_asset_issues (reporter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coown_asset_issues_status_idx
  ON coown_asset_issues (status, updated_at DESC);
