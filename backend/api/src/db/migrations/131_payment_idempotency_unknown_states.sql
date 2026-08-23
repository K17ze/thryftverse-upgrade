-- Payment idempotency hardening, unknown-outcome states, and refund safety.
--
-- This migration:
-- 1. Adds `unknown` and `reconciled` to payment_intents.status so a lost
--    provider response can be represented honestly instead of collapsing
--    to `failed`.
-- 2. Adds `unknown` to payment_attempts.status.
-- 3. Replaces the global UNIQUE(idempotency_key) on payment_intents with a
--    partial unique index on (user_id, idempotency_key) that matches the
--    lookup semantics — keys are scoped per user, not globally.
-- 4. Adds idempotency_key and request_hash columns to payment_refunds and a
--    partial unique index on (intent_id, idempotency_key) so retried refund
--    requests replay the same refund instead of creating a second one.
-- 5. Adds `unknown` to payment_refunds.status.
--
-- All ALTERs are idempotent (IF NOT EXISTS / using DO blocks).

-- ── 1. payment_intents.status: add unknown + reconciled ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_intents_status_check'
      AND conrelid = 'payment_intents'::regclass
  ) THEN RETURN; END IF;

  ALTER TABLE payment_intents DROP CONSTRAINT payment_intents_status_check;
  ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_status_check CHECK (
    status IN (
      'requires_payment_method',
      'requires_confirmation',
      'processing',
      'succeeded',
      'failed',
      'cancelled',
      'unknown',
      'reconciled'
    )
  );
END;
$$;

-- ── 2. payment_attempts.status: add unknown ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_attempts_status_check'
      AND conrelid = 'payment_attempts'::regclass
  ) THEN RETURN; END IF;

  ALTER TABLE payment_attempts DROP CONSTRAINT payment_attempts_status_check;
  ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_status_check CHECK (
    status IN ('pending', 'succeeded', 'failed', 'cancelled', 'unknown')
  );
END;
$$;

-- ── 3. payment_intents idempotency: scope to (user_id, idempotency_key) ─────
-- Drop the global unique constraint and replace with a per-user partial index.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_intents_idempotency_key_key'
      AND conrelid = 'payment_intents'::regclass
  ) THEN
    ALTER TABLE payment_intents DROP CONSTRAINT payment_intents_idempotency_key_key;
  END IF;
END;
$$;

-- Drop any existing index with the old name before creating the new one.
DROP INDEX IF EXISTS payment_intents_idempotency_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_user_idempotency_idx
  ON payment_intents (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 4. payment_refunds: add idempotency_key + request_hash + unique index ───
ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_intent_idempotency_idx
  ON payment_refunds (intent_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 5. payment_refunds.status: add unknown ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_refunds_status_check'
      AND conrelid = 'payment_refunds'::regclass
  ) THEN RETURN; END IF;

  ALTER TABLE payment_refunds DROP CONSTRAINT payment_refunds_status_check;
  ALTER TABLE payment_refunds ADD CONSTRAINT payment_refunds_status_check CHECK (
    status IN ('pending', 'succeeded', 'failed', 'cancelled', 'unknown')
  );
END;
$$;
