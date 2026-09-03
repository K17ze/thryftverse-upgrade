-- Co-Own per-asset market sequence table
-- P0.3 fix: every public book mutation (new order, cancel, partial fill, expiry)
-- must advance this sequence exactly once. The sequence is recorded on coOwn_orders
-- and coOwn_trades so that snapshot/replay queries can reconstruct the book at any
-- point and detect gaps or out-of-order mutations.
--
-- A monotonically increasing per-asset sequence lets clients request
-- "all events since sequence N" and receive a consistent, gap-free delta stream,
-- which is required for correct market-data replication and audit reconciliation.

CREATE TABLE IF NOT EXISTS coown_market_sequences (
  asset_id TEXT PRIMARY KEY REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  next_sequence BIGINT NOT NULL DEFAULT 1
);

-- Record the market sequence at which an order was created or last mutated.
-- NULL is permitted for rows backfilled before this migration; new mutations
-- must always populate it.
ALTER TABLE coOwn_orders
  ADD COLUMN IF NOT EXISTS market_sequence BIGINT;

-- Record the market sequence at which a trade was executed.
ALTER TABLE coOwn_trades
  ADD COLUMN IF NOT EXISTS market_sequence BIGINT;

-- Efficient snapshot queries: "give me all orders/trades for an asset at or
-- after a given sequence" become an index-only range scan.
CREATE INDEX IF NOT EXISTS coOwn_orders_market_sequence_idx
  ON coOwn_orders (asset_id, market_sequence);

CREATE INDEX IF NOT EXISTS coOwn_trades_market_sequence_idx
  ON coOwn_trades (asset_id, market_sequence);

-- Bind a reservation to the specific book version it was created against so
-- that a stale reservation cannot be confirmed against a book that has moved
-- on (e.g. price shifted, units no longer available).
ALTER TABLE coown_order_reservations
  ADD COLUMN IF NOT EXISTS book_sequence BIGINT;
