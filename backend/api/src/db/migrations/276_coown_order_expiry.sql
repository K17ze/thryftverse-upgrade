-- Persist the time-in-force deadline advertised by the Co-Own order ticket.
-- Legacy orders remain non-expiring because their original duration was not
-- stored; all newly-created orders receive an explicit deadline from the API.
ALTER TABLE coOwn_orders
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS coOwn_orders_expiry_idx
  ON coOwn_orders (expires_at, status)
  WHERE status IN ('open', 'partially_filled') AND expires_at IS NOT NULL;

COMMENT ON COLUMN coOwn_orders.expires_at IS
  'Authoritative time-in-force deadline. NULL is legacy/no recorded deadline; new GFD/GTC90 orders must set it.';
