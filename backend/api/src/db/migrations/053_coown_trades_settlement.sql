-- Add settlement status to coOwn_trades for explicit DvP tracking.
-- The atomic DvP settlement (added in the same release) means every trade
-- is settled at insert time, but the column allows for future async
-- settlement flows and provides a queryable status for the frontend.

ALTER TABLE coOwn_trades
  ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'settled'
  CHECK (settlement_status IN ('pending', 'settled', 'failed', 'reversed'));

ALTER TABLE coOwn_trades
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Backfill: all existing trades are settled (atomic DvP was always implicit)
UPDATE coOwn_trades SET settled_at = created_at WHERE settled_at IS NULL;

-- Index for settlement status queries
CREATE INDEX IF NOT EXISTS coOwn_trades_settlement_idx
  ON coOwn_trades (buyer_id, settlement_status, created_at DESC);

CREATE INDEX IF NOT EXISTS coOwn_trades_seller_settlement_idx
  ON coOwn_trades (seller_id, settlement_status, created_at DESC);
