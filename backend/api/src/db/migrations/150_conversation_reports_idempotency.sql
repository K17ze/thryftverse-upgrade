ALTER TABLE conversation_reports ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS conversation_reports_idempotency_key_idx
  ON conversation_reports (idempotency_key) WHERE idempotency_key IS NOT NULL;
