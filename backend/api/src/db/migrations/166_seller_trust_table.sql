-- seller_trust table — referenced by sellers.ts:325 and recommendations.ts:225,776
-- but had no migration, causing a clean-database runtime failure.
--
-- This table stores seller operational trust signals derived from order/carrier
-- data. It is NOT a public badge programme — it is a read-optimised projection
-- that the backend owns and recomputes from authoritative facts.
--
-- Phase 0 contract-truth repair: the analytics route and recommendation pipeline
-- query this table; without it, both fail on a clean database.

CREATE TABLE IF NOT EXISTS seller_trust (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  response_rate NUMERIC(5,2),        -- percentage 0-100
  ship_within_days INTEGER,           -- average dispatch time in days
  total_sales INTEGER NOT NULL DEFAULT 0,
  positive_rating_pct NUMERIC(5,2),   -- percentage of 4-5 star reviews
  -- Computed projection metadata
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The source watermark tracks the latest order/review event used to compute
  -- these values, enabling incremental recomputation.
  source_watermark TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS seller_trust_sales_idx
  ON seller_trust (total_sales DESC);
