-- Co-Own order command receipt table
-- P0.7 fix: the order command receipt was being saved AFTER the order commit,
-- so a crash between commit and receipt insert left an orphaned order with no
-- auditable command trail. This table is the durable command ledger and must be
-- written atomically in the same transaction as the order commit.
--
-- Lifecycle: pending → (acknowledged | rejected)
--   pending     — command received, order not yet committed
--   acknowledged — order committed, order_id populated
--   rejected    — command rejected (validation/risk), response_body holds reason
--
-- The unique index on (asset_id, actor_id, idempotency_key) enforces exactly-once
-- command processing per actor+asset+key, matching the order idempotency scope.

CREATE TABLE IF NOT EXISTS coown_order_commands (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'rejected')),
  order_id BIGINT,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Exactly-once command processing per actor + asset + idempotency key.
CREATE UNIQUE INDEX IF NOT EXISTS coown_order_commands_key_idx
  ON coown_order_commands (asset_id, actor_id, idempotency_key);

-- Lookup by actor for command history and reconciliation.
CREATE INDEX IF NOT EXISTS coown_order_commands_actor_idx
  ON coown_order_commands (actor_id, created_at DESC);

-- Lookup by pending status for crash-recovery sweeps.
CREATE INDEX IF NOT EXISTS coown_order_commands_pending_idx
  ON coown_order_commands (created_at)
  WHERE status = 'pending';
