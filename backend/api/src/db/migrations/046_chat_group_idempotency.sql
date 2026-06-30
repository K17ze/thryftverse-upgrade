-- Idempotency table for chat group creation
CREATE TABLE IF NOT EXISTS chat_group_idempotency_keys (
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (creator_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS chat_group_idempotency_created_idx
  ON chat_group_idempotency_keys (created_at DESC);
