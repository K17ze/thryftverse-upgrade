-- Add idempotency key to payout_requests to prevent duplicate submission
ALTER TABLE payout_requests
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unique constraint: one active idempotency key per user
CREATE UNIQUE INDEX IF NOT EXISTS payout_requests_idempotency_idx
  ON payout_requests (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
