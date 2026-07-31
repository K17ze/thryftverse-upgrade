-- 093_per_intent_reconciliation.sql
-- Per-intent reconciliation items: catches compensating errors that net
-- to zero in the daily aggregate. Each succeeded payment_intent is matched
-- against its ledger_entries (buyer_charge credit).

CREATE TABLE IF NOT EXISTS payment_reconciliation_items (
  id TEXT PRIMARY KEY,
  run_date DATE NOT NULL,
  intent_id TEXT NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  gateway_id TEXT NOT NULL,
  intent_amount_gbp NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ledger_amount_gbp NUMERIC(18, 6) NOT NULL DEFAULT 0,
  mismatch_gbp NUMERIC(18, 6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (
    status IN ('matched', 'mismatch', 'missing_ledger', 'missing_intent')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_reconciliation_items_run_idx
  ON payment_reconciliation_items (run_date, status);

CREATE INDEX IF NOT EXISTS payment_reconciliation_items_intent_idx
  ON payment_reconciliation_items (intent_id);
