-- 103_coown_corporate_actions.sql
-- Co-Own Corporate Actions
--
-- Records corporate actions for Co-Own assets: distributions, buybacks,
-- splits, and governance votes. Each action has a lifecycle (announced ->
-- executed -> settled) and optional record / ex / payable dates following
-- standard securities-processing conventions.

CREATE TABLE IF NOT EXISTS coown_corporate_actions (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_id                 TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  action_type              TEXT NOT NULL,
  title                    TEXT NOT NULL,
  description              TEXT,
  per_unit_value_gbp_minor BIGINT,
  total_value_gbp_minor    BIGINT,
  record_date              TIMESTAMPTZ,
  ex_date                  TIMESTAMPTZ,
  payable_date             TIMESTAMPTZ,
  status                   TEXT NOT NULL DEFAULT 'announced',
  metadata                 JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coown_corporate_actions_asset
  ON coown_corporate_actions (asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coown_corporate_actions_type
  ON coown_corporate_actions (action_type, created_at DESC);
