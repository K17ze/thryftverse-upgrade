-- Rollback for 313_order_carrier_failure_statuses.sql.
--
-- Rows already in 'delivery_failed'/'returned' cannot be represented under
-- the old constraint — they are reverted to 'shipped' (the parcel event log
-- still records the carrier truth; only the coarse order status rolls back).

UPDATE orders
   SET status = 'shipped', updated_at = NOW()
 WHERE status IN ('delivery_failed', 'returned');

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check CHECK (
    status IN (
      'created',
      'paid',
      'shipped',
      'delivered',
      'completed',
      'cancelled',
      'refunded',
      'refunding'
    )
  );
