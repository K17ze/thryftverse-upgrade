-- 110_seller_performance_program.sql
-- Performance-Based Seller Program (Poshmark October 2026 equivalent).
--
-- Persists the rolling 90-day performance metrics and program tier for each
-- seller so the search ranking, trust-signal display, and discovery endpoints
-- can apply tier-based boosts without recomputing metrics on every request.
--
-- Program tiers:
--   standard       — Not yet qualified (no boost)
--   performer      — Meets all rolling 90-day criteria (1.3x boost)
--   top_performer  — Performer + 100+ lifetime orders + 1-day ship + <1% cancel (1.5x boost)
--
-- Qualification criteria (Poshmark October 2026 pattern):
--   One-time:    lifetime orders shipped >= 20
--   Rolling 90d: orders shipped >= 5 OR sales volume >= £500
--   Rolling 90d: average ship time <= 48 hours
--   Rolling 90d: cancellation rate <= 2%
--   Rolling 90d: approved return case rate <= 2%

CREATE TABLE IF NOT EXISTS seller_performance_metrics (
  id BIGSERIAL PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Rolling 90-day metrics
  orders_shipped_90d INT NOT NULL DEFAULT 0,
  sales_volume_gbp_90d NUMERIC(12, 2) NOT NULL DEFAULT 0,
  avg_ship_time_hours_90d NUMERIC(8, 2) NOT NULL DEFAULT 0,
  cancellation_rate_90d NUMERIC(5, 4) NOT NULL DEFAULT 0,
  return_case_rate_90d NUMERIC(5, 4) NOT NULL DEFAULT 0,

  -- Lifetime metrics
  lifetime_orders_shipped INT NOT NULL DEFAULT 0,

  -- Program tier and qualification
  program_tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (program_tier IN ('standard', 'performer', 'top_performer')),
  qualified BOOLEAN NOT NULL DEFAULT FALSE,
  qualified_at TIMESTAMPTZ,
  tier_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Bookkeeping
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seller_id)
);

CREATE INDEX IF NOT EXISTS seller_performance_tier_idx
  ON seller_performance_metrics (program_tier, tier_updated_at DESC);

CREATE INDEX IF NOT EXISTS seller_performance_qualified_idx
  ON seller_performance_metrics (qualified, lifetime_orders_shipped DESC)
  WHERE qualified = TRUE;
