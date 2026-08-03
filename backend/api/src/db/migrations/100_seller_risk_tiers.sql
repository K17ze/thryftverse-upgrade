-- 100_seller_risk_tiers.sql
-- Per-seller sale velocity + risk tiering (P3.5).
-- Persists the latest computed risk tier for each seller so the escrow
-- release sweep and reserve logic can apply tier-based holds without
-- recomputing velocity on every release.
--
-- Risk tiers:
--   standard — normal velocity, no extra reserve
--   elevated — velocity above 1.5x the seller's 7-day average
--   high     — velocity above 3x the average or above absolute thresholds
--
-- The reserve_percentage column stores the tier-specific reserve that the
-- escrow release logic applies (in addition to the new-seller rolling
-- reserve, taking the higher of the two).

CREATE TABLE IF NOT EXISTS seller_risk_tiers (
  id BIGSERIAL PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  risk_tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (risk_tier IN ('standard', 'elevated', 'high')),
  sales_count_24h INT NOT NULL DEFAULT 0,
  sales_gbp_24h NUMERIC(12,2) NOT NULL DEFAULT 0,
  sales_count_7d INT NOT NULL DEFAULT 0,
  sales_gbp_7d NUMERIC(12,2) NOT NULL DEFAULT 0,
  avg_sales_per_day_7d NUMERIC(8,2) NOT NULL DEFAULT 0,
  reserve_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  flagged_at TIMESTAMPTZ,
  UNIQUE (seller_id)
);

CREATE INDEX IF NOT EXISTS seller_risk_tiers_tier_idx
  ON seller_risk_tiers (risk_tier, flagged_at DESC);
