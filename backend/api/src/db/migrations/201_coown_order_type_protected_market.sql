-- Co-Own protected_market order type
-- P0 fix: the order book needs a 'protected_market' order type for live trading.
-- A protected market order behaves like a market order but is capped at
-- protection_price_gbp so it cannot fill beyond a worst-case price. This
-- protects users from slippage during thin liquidity or volatile periods.
--
-- The existing order_type CHECK (added in migration 026 / 007) only allows
-- ('market', 'limit'). We extend it to include 'protected_market' and relax the
-- limit_price_required CHECK so that:
--   - market orders:            limit_price_gbp IS NULL
--   - limit orders:             limit_price_gbp IS NOT NULL AND > 0
--   - protected_market orders:  limit_price_gbp IS NULL
--                               (the cap lives in protection_price_gbp)
--
-- All ALTERs are guarded with IF NOT EXISTS / DO blocks so the migration is
-- idempotent and safe to re-run.

-- 1. Add the protection cap price column.
ALTER TABLE coOwn_orders
  ADD COLUMN IF NOT EXISTS protection_price_gbp NUMERIC(18, 4);

-- 2. Extend the order_type CHECK to include 'protected_market'.
ALTER TABLE coOwn_orders
  DROP CONSTRAINT IF EXISTS coOwn_orders_order_type_check;

ALTER TABLE coOwn_orders
  ADD CONSTRAINT coOwn_orders_order_type_check CHECK (
    order_type IN ('market', 'limit', 'protected_market')
  );

-- 3. Relax the limit_price_required CHECK to account for protected_market.
ALTER TABLE coOwn_orders
  DROP CONSTRAINT IF EXISTS coOwn_orders_limit_price_required_check;

ALTER TABLE coOwn_orders
  ADD CONSTRAINT coOwn_orders_limit_price_required_check CHECK (
    (order_type = 'market' AND limit_price_gbp IS NULL)
    OR (order_type = 'limit' AND limit_price_gbp IS NOT NULL AND limit_price_gbp > 0)
    OR (order_type = 'protected_market' AND limit_price_gbp IS NULL)
  );

-- 4. Add a CHECK so that a protected_market order always carries a positive
--    protection price (the cap). Guarded in a DO block because we cannot use
--    IF NOT EXISTS directly on a table-level CHECK constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coown_orders_protection_price_required_check'
      AND conrelid = 'coown_orders'::regclass
  ) THEN
    ALTER TABLE coOwn_orders
      ADD CONSTRAINT coown_orders_protection_price_required_check CHECK (
        (order_type = 'protected_market' AND protection_price_gbp IS NOT NULL AND protection_price_gbp > 0)
        OR (order_type <> 'protected_market')
      );
  END IF;
END $$;
