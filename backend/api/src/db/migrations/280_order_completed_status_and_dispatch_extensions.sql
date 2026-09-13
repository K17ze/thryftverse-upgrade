-- 280_order_completed_status_and_dispatch_extensions.sql
--
-- Order dispatch/protection contract fixes:
--
-- 1. 'completed' terminal status. Buyer receipt confirmation and the escrow
--    release sweep finalise an order as 'completed' (funds released or
--    explicitly accepted). The original CHECK (migration 003) also predates
--    'refunded' and 'refunding', which the refund route already writes
--    ('refunding' when the provider refund outcome is pending/unknown) —
--    include both so the constraint matches real usage. Idempotent: drops
--    and re-adds the constraint
--    (pattern: 171_order_parcel_events_handoff_asserted.sql).
--
-- 2. order_dispatch_extensions: seller-proposed dispatch SLA extensions the
--    buyer accepts or declines. Kept outside order_seller_rights_snapshot,
--    which is immutable by design — the snapshot preserves purchase-time
--    terms while this table records the renegotiation trail.

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

CREATE TABLE IF NOT EXISTS order_dispatch_extensions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  proposed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  extension_days INT NOT NULL CHECK (extension_days BETWEEN 1 AND 30),
  proposed_ship_by TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  responded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one pending extension per order.
CREATE UNIQUE INDEX IF NOT EXISTS order_dispatch_extensions_pending_idx
  ON order_dispatch_extensions (order_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS order_dispatch_extensions_order_idx
  ON order_dispatch_extensions (order_id, created_at DESC);
