-- 090_coown_risk_disclosures.sql
-- Closes GAP 4: No explicit risk disclosure fields on asset contract.
--
-- The audit required "risk and jurisdiction disclosures." We had
-- jurisdiction but no explicit risk disclosure fields. This adds a
-- dedicated risk_disclosures table so risks are versioned and
-- attributable rather than buried in free text.

CREATE TABLE IF NOT EXISTS coown_risk_disclosures (
  id TEXT PRIMARY KEY DEFAULT ('crd_' || gen_random_uuid()::text),
  asset_id TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'superseded')),
  -- Structured risk categories
  market_risk TEXT
    CHECK (market_risk IS NULL OR char_length(market_risk) BETWEEN 5 AND 2000),
  liquidity_risk TEXT
    CHECK (liquidity_risk IS NULL OR char_length(liquidity_risk) BETWEEN 5 AND 2000),
  custody_risk TEXT
    CHECK (custody_risk IS NULL OR char_length(custody_risk) BETWEEN 5 AND 2000),
  regulatory_risk TEXT
    CHECK (regulatory_risk IS NULL OR char_length(regulatory_risk) BETWEEN 5 AND 2000),
  counterparty_risk TEXT
    CHECK (counterparty_risk IS NULL OR char_length(counterparty_risk) BETWEEN 5 AND 2000),
  -- Catch-all for risks not in the structured categories
  other_risks TEXT
    CHECK (other_risks IS NULL OR char_length(other_risks) BETWEEN 5 AND 2000),
  -- Attribution
  authored_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS coown_risk_disclosures_one_published_per_asset
  ON coown_risk_disclosures (asset_id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS coown_risk_disclosures_asset_idx
  ON coown_risk_disclosures (asset_id, version DESC);
