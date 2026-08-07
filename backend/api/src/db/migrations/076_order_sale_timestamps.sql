-- Authoritative order sale timestamps.
--
-- Order creation time is not the sale time. Persist the first paid transition
-- so sold comparables and downstream accounting use the completed commercial
-- event rather than a mutable listing timestamp or checkout start time.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

UPDATE orders
SET paid_at = COALESCE(paid_at, updated_at, created_at)
WHERE paid_at IS NULL
  AND status IN ('paid', 'shipped', 'delivered');

CREATE OR REPLACE FUNCTION maintain_order_lifecycle_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('paid', 'shipped', 'delivered')
     AND NEW.paid_at IS NULL THEN
    NEW.paid_at = NOW();
  END IF;

  IF NEW.status IN ('shipped', 'delivered')
     AND NEW.shipped_at IS NULL THEN
    NEW.shipped_at = NOW();
  END IF;

  IF NEW.status = 'delivered'
     AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_lifecycle_timestamps_trigger ON orders;
CREATE TRIGGER orders_lifecycle_timestamps_trigger
  BEFORE INSERT OR UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION maintain_order_lifecycle_timestamps();

CREATE INDEX IF NOT EXISTS orders_paid_at_idx
  ON orders (paid_at DESC)
  WHERE paid_at IS NOT NULL;

