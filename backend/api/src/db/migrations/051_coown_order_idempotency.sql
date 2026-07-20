-- Co-Own order idempotency table
-- Stores a request_hash (fingerprint of the full order payload) to detect
-- same-key-different-payload conflicts atomically. Prevents duplicate order
-- placement on network retry per spec 10 §1.

CREATE TABLE IF NOT EXISTS coown_order_idempotency (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One claim per asset + user + idempotency key — prevents cross-asset
-- and cross-user replay while allowing the same client key on different assets.
CREATE UNIQUE INDEX IF NOT EXISTS coown_order_idempotency_key_idx
  ON coown_order_idempotency (asset_id, user_id, idempotency_key);

-- Quick lookup by user + created_at for periodic cleanup
CREATE INDEX IF NOT EXISTS coown_order_idempotency_lookup_idx
  ON coown_order_idempotency (user_id, created_at DESC);
