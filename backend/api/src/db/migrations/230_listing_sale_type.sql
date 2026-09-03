-- P1-17: Distinguish platform sales from external (off-platform) sales.
--
-- Manually marking a listing as "sold" previously conflated an external
-- (off-platform) sale with a platform transaction, polluting revenue,
-- analytics, and order semantics. This migration adds a `sale_type` column
-- so analytics queries can filter out external sales when computing
-- platform-derived revenue and comparable pricing.
--
--   sale_type = 'platform'  → sale occurred through an order (default)
--   sale_type = 'external'  → seller manually marked sold off-platform
--
-- The column is nullable for backward compatibility; NULL is treated as
-- 'platform' by analytics queries (COALESCE(sale_type, 'platform')).

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS sale_type TEXT
  CHECK (sale_type IN ('platform', 'external'));

-- Backfill: any listing already in 'sold' status without an explicit
-- sale_type is assumed to be an external manual sale (the only way to
-- reach 'sold' without an order was the manual mark-as-sold flow).
UPDATE listings
  SET sale_type = 'external'
  WHERE status = 'sold'
    AND sale_type IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM orders o
      WHERE o.listing_id = listings.id
        AND o.status IN ('paid', 'shipped', 'delivered')
    );

-- Index for analytics queries that filter external sales out of revenue.
CREATE INDEX IF NOT EXISTS listings_sale_type_idx
  ON listings (seller_id, sale_type)
  WHERE sale_type IS NOT NULL;
