-- Co-Own reservation idempotency table
-- P0.6 fix: the reservation endpoint accepts an idempotency key but never
-- persists it, so network retries can create duplicate reservations or race
-- with concurrent confirmations. This table stores the request fingerprint and
-- cached response so a retried reservation request returns the original result
-- instead of creating a second reservation.
--
-- Mirrors the pattern established by coown_order_idempotency (migration 051)
-- but scoped to the reservation flow.

CREATE TABLE IF NOT EXISTS coown_reservation_idempotency (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One claim per asset + user + idempotency key — prevents cross-asset and
-- cross-user replay while allowing the same client key on different assets.
CREATE UNIQUE INDEX IF NOT EXISTS coown_reservation_idempotency_key_idx
  ON coown_reservation_idempotency (asset_id, user_id, idempotency_key);

-- Quick lookup by user + created_at for periodic cleanup of stale entries.
CREATE INDEX IF NOT EXISTS coown_reservation_idempotency_lookup_idx
  ON coown_reservation_idempotency (user_id, created_at DESC);
