-- 080_auction_reserve_price_and_coown_rights.sql
-- P0 closure: T07 auction reserve price + T06 Co-Own rights/dossier

-- T07: Add reserve_price_gbp to auctions table.
-- The reserve price is the minimum price the seller is willing to accept.
-- When current_bid_gbp < reserve_price_gbp, the auction is "reserve not met".
-- NULL means no reserve (auction is effectively reserve-met from the start).
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS reserve_price_gbp NUMERIC(12, 2) CHECK (
    reserve_price_gbp IS NULL OR reserve_price_gbp >= 0
  );

-- T06: Co-Own rights/dossier table.
-- Versioned, attributable rights documents attached to each Co-Own asset.
-- Each version is immutable once published; supersession is via a new row
-- referencing the previous version.
CREATE TABLE IF NOT EXISTS coown_rights (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version_id TEXT REFERENCES coown_rights(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (
    status IN ('draft', 'published', 'superseded')
  ),
  -- Structured rights summary
  rights_type TEXT NOT NULL CHECK (
    rights_type IN ('fractional_ownership', 'revenue_share', 'usage_rights', 'custody')
  ),
  -- Jurisdiction and legal framework
  jurisdiction TEXT NOT NULL,
  governing_law TEXT,
  -- Summary terms (human-readable)
  summary_terms TEXT NOT NULL CHECK (char_length(summary_terms) BETWEEN 10 AND 5000),
  -- Key constraints
  transferable BOOLEAN NOT NULL DEFAULT TRUE,
  min_holding_units INTEGER NOT NULL DEFAULT 1 CHECK (min_holding_units >= 1),
  -- Attribution
  authored_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One published version per asset at a time
  UNIQUE (asset_id, version)
);

-- Only one published (non-draft, non-superseded) version per asset
CREATE UNIQUE INDEX IF NOT EXISTS coown_rights_one_published_per_asset
  ON coown_rights (asset_id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS coown_rights_asset_idx
  ON coown_rights (asset_id, version DESC);

CREATE INDEX IF NOT EXISTS coown_rights_published_idx
  ON coown_rights (asset_id, published_at DESC)
  WHERE status = 'published';
