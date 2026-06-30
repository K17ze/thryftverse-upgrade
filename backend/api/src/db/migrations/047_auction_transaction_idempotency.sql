-- Dedicated auction transaction idempotency table
-- Replaces the ad-hoc auction_bids.idempotency_key approach with a
-- dedicated table that stores a request_hash (fingerprint of the full
-- request payload) to detect same-key-different-payload conflicts atomically.

CREATE TABLE IF NOT EXISTS auction_transaction_idempotency (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('bid', 'buy_now')),
  auction_id TEXT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One claim per auction + user + idempotency key — prevents cross-auction
-- and cross-user replay while allowing the same client key on different auctions.
CREATE UNIQUE INDEX IF NOT EXISTS auction_txn_idempotency_key_idx
  ON auction_transaction_idempotency (auction_id, user_id, idempotency_key);

-- Quick lookup by auction + user + operation
CREATE INDEX IF NOT EXISTS auction_txn_idempotency_lookup_idx
  ON auction_transaction_idempotency (auction_id, user_id, operation_type, created_at DESC);
