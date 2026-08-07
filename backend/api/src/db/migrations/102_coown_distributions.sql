-- 102_coown_distributions.sql
-- Co-Own Distributions (dividend / revenue-share payments)
--
-- Records per-asset distributions paid to unit holders. Each row captures
-- the amount paid (in GBP minor units), the units held at the record date,
-- and the per-unit rate. Distributions may be revenue shares, dividends,
-- or other periodic payments derived from asset performance.

CREATE TABLE IF NOT EXISTS coown_distributions (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_id             TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  recipient_user_id    TEXT NOT NULL,
  amount_gbp_minor     BIGINT NOT NULL,
  units_at_record      BIGINT NOT NULL,
  per_unit_gbp_minor   BIGINT NOT NULL,
  distribution_type    TEXT NOT NULL DEFAULT 'revenue_share',
  status               TEXT NOT NULL DEFAULT 'settled',
  reference            TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coown_distributions_recipient
  ON coown_distributions (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coown_distributions_asset
  ON coown_distributions (asset_id, created_at DESC);
