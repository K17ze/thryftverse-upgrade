-- Co-Own order reservation table
-- Tracks funds/units reserved for pending orders with a TTL. When a user
-- previews an order and proceeds to confirm, the reservation holds the
-- funds so a concurrent order cannot overspend. Reservations expire
-- automatically after the TTL (default 60s) and are released on order
-- placement, cancellation, or expiry.

CREATE TABLE IF NOT EXISTS coown_order_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  -- For buys: 1ZE amount reserved (in mg, the canonical 1ZE unit)
  -- For sells: Co-Own units reserved (integer)
  reserved_1ze_mg BIGINT NOT NULL DEFAULT 0 CHECK (reserved_1ze_mg >= 0),
  reserved_units INT NOT NULL DEFAULT 0 CHECK (reserved_units >= 0),
  -- The preview snapshot at reservation time (non-binding)
  reference_price_gbp NUMERIC(18, 4) NOT NULL,
  estimated_total_gbp NUMERIC(18, 4) NOT NULL,
  estimated_fee_gbp NUMERIC(18, 4) NOT NULL,
  -- TTL: reservation expires after this timestamp
  expires_at TIMESTAMPTZ NOT NULL,
  -- Lifecycle: active → (placed | cancelled | expired)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'placed', 'cancelled', 'expired')),
  -- Link to the order once placed
  placed_order_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active reservation per user + asset (a new reservation replaces prior)
CREATE UNIQUE INDEX IF NOT EXISTS coown_reservation_active_idx
  ON coown_order_reservations (user_id, asset_id)
  WHERE status = 'active';

-- Lookup by user for balance computation
CREATE INDEX IF NOT EXISTS coown_reservation_user_idx
  ON coown_order_reservations (user_id, status, expires_at DESC);

-- Cleanup: expire stale reservations (called periodically)
CREATE INDEX IF NOT EXISTS coown_reservation_expiry_idx
  ON coown_order_reservations (expires_at)
  WHERE status = 'active';
