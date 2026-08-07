-- 092_buyer_protection_hold.sql
-- Add buyer-protection hold window: escrow release is scheduled for
-- delivered_at + hold_hours instead of firing immediately on delivery.
-- This gives buyers time to raise a SNAD claim before the seller is paid,
-- matching Vinted (2 days) and Depop (2 days after delivered tracking).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS escrow_release_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escrow_released_at TIMESTAMPTZ;

-- Index for the release sweep: find orders whose hold has expired but
-- escrow has not yet been released.
CREATE INDEX IF NOT EXISTS orders_escrow_release_due_idx
  ON orders (escrow_release_scheduled_at)
  WHERE escrow_release_scheduled_at IS NOT NULL
    AND escrow_released_at IS NULL;
