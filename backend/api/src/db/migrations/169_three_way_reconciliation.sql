-- 169: Three-way reconciliation (provider / internal / bank) + FCA PS25/12 safeguarding.
--
-- Fixes PAY-10: the legacy daily reconciliation compared internal payment_intents
-- against internal ledger_entries and never ingested external provider reports or
-- bank statements. These tables hold the three independent fact planes so the
-- reconciler can detect transactions absent from one or more planes, provider
-- fees/refunds/disputes/payouts omitted locally, unfunded local success,
-- settlement timing differences, reserves, FX and bank mismatches.
--
-- Fixes PAY-11: per-intent reconciliation previously LEFT JOINed from intents and
-- could never surface ledger-only entries. The break store below is populated by
-- a FULL OUTER JOIN across planes so ledger-/bank-only populations are visible.
--
-- Additive and idempotent (IF NOT EXISTS). No destructive changes.

-- ── 1. reconciliation_runs ──────────────────────────────────────────────
-- Header record for a three-way reconciliation run. Links to reconciliation_breaks.
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id                     TEXT PRIMARY KEY,
  run_date               DATE NOT NULL,
  reason                 VARCHAR(40) NOT NULL DEFAULT 'scheduled'
    CHECK (reason IN ('scheduled', 'manual', 'backfill')),
  completeness           VARCHAR(40) NOT NULL DEFAULT 'incomplete'
    CHECK (completeness IN ('complete', 'partial', 'incomplete')),
  -- Plane availability flags — a plane is "available" when its fact table exists
  -- and at least one row was ingested for the run date.
  provider_plane_available BOOLEAN NOT NULL DEFAULT FALSE,
  internal_plane_available BOOLEAN NOT NULL DEFAULT FALSE,
  bank_plane_available     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Source-of-truth for the internal plane actually used.
  internal_source        VARCHAR(40) NOT NULL DEFAULT 'ledger_entries'
    CHECK (internal_source IN ('money_journals', 'ledger_entries')),
  provider_facts_count   INTEGER NOT NULL DEFAULT 0,
  internal_facts_count   INTEGER NOT NULL DEFAULT 0,
  bank_facts_count       INTEGER NOT NULL DEFAULT 0,
  -- Provider balance roll-forward (close invariant).
  opening_balance_gbp    NUMERIC(14, 2),
  inflows_gbp            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  outflows_gbp           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  adjustments_gbp        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  closing_balance_gbp    NUMERIC(14, 2),
  expected_balance_gbp   NUMERIC(14, 2),
  balance_mismatch_gbp   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  mismatch_gbp           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  break_count            INTEGER NOT NULL DEFAULT 0,
  status                 VARCHAR(40) NOT NULL DEFAULT 'incomplete'
    CHECK (status IN ('ok', 'mismatch', 'critical', 'incomplete')),
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_date, reason)
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_date
  ON reconciliation_runs (run_date DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_status
  ON reconciliation_runs (status) WHERE status != 'ok';

-- ── 2. reconciliation_provider_facts ────────────────────────────────────
-- External provider report facts: balance transactions, charges, captures,
-- refunds, disputes, transfers, payouts, fees. Ingested from provider reports
-- (Stripe / Wise) before a reconciliation run. One row per external transaction.
CREATE TABLE IF NOT EXISTS reconciliation_provider_facts (
  id              TEXT PRIMARY KEY,
  run_date        DATE NOT NULL,
  provider_account VARCHAR(120) NOT NULL,
  fact_type       VARCHAR(40) NOT NULL
    CHECK (fact_type IN ('charge', 'capture', 'refund', 'dispute', 'transfer',
                         'payout', 'fee', 'balance_transaction', 'adjustment')),
  provider_ref    VARCHAR(255) NOT NULL,
  -- correlation_key links the external fact to an internal entity
  -- (payment_intent id, payout_request id, order id, etc.).
  correlation_key VARCHAR(255),
  -- Signed amount in GBP: +charge/capture, -refund, -fee, -payout, -dispute.
  amount_gbp      NUMERIC(14, 2) NOT NULL,
  currency        VARCHAR(8) NOT NULL DEFAULT 'GBP',
  status          VARCHAR(40) NOT NULL,
  occurred_at     TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_account, provider_ref)
);

CREATE INDEX IF NOT EXISTS idx_recon_provider_facts_date
  ON reconciliation_provider_facts (run_date, fact_type);
CREATE INDEX IF NOT EXISTS idx_recon_provider_facts_corr
  ON reconciliation_provider_facts (correlation_key)
  WHERE correlation_key IS NOT NULL;

-- ── 3. reconciliation_bank_facts ────────────────────────────────────────
-- Bank / safeguarding account facts: settlement deposits, payout debits,
-- returns, bank fees, and end-of-day safeguarded balance snapshots.
CREATE TABLE IF NOT EXISTS reconciliation_bank_facts (
  id              TEXT PRIMARY KEY,
  run_date        DATE NOT NULL,
  bank_account    VARCHAR(120) NOT NULL,
  fact_type       VARCHAR(40) NOT NULL
    CHECK (fact_type IN ('settlement_deposit', 'payout_debit', 'return',
                         'bank_fee', 'adjustment', 'safeguarded_balance')),
  bank_ref        VARCHAR(255) NOT NULL,
  -- correlation_key links the bank movement to a provider payout / settlement.
  correlation_key VARCHAR(255),
  amount_gbp      NUMERIC(14, 2) NOT NULL,
  currency        VARCHAR(8) NOT NULL DEFAULT 'GBP',
  -- For safeguarded_balance rows: the closing balance after this entry.
  balance_after_gbp NUMERIC(14, 2),
  occurred_at     TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bank_account, bank_ref)
);

CREATE INDEX IF NOT EXISTS idx_recon_bank_facts_date
  ON reconciliation_bank_facts (run_date, fact_type);
CREATE INDEX IF NOT EXISTS idx_recon_bank_facts_corr
  ON reconciliation_bank_facts (correlation_key)
  WHERE correlation_key IS NOT NULL;

-- ── 4. reconciliation_breaks ────────────────────────────────────────────
-- Break cases produced by the three-way FULL OUTER JOIN. Each break references
-- its run and records which planes disagree, the correlation key, and the
-- expected vs actual amounts. Breaks are resolved via privileged_commands.
CREATE TABLE IF NOT EXISTS reconciliation_breaks (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  break_type      VARCHAR(80) NOT NULL
    CHECK (break_type IN (
      'missing_internal', 'missing_provider', 'amount_mismatch',
      'currency_mismatch', 'status_mismatch', 'fee_mismatch',
      'duplicate_internal', 'duplicate_provider', 'timing_expected',
      'payout_batch_mismatch', 'bank_missing', 'safeguarding_shortfall',
      'stale_unknown'
    )),
  severity        VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  plane_a         VARCHAR(40)
    CHECK (plane_a IS NULL OR plane_a IN ('provider', 'internal', 'bank')),
  plane_b         VARCHAR(40)
    CHECK (plane_b IS NULL OR plane_b IN ('provider', 'internal', 'bank')),
  correlation_key VARCHAR(255),
  provider_ref    VARCHAR(255),
  internal_ref    VARCHAR(255),
  bank_ref        VARCHAR(255),
  amount_gbp      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expected_amount_gbp NUMERIC(14, 2),
  actual_amount_gbp   NUMERIC(14, 2),
  currency        VARCHAR(8) NOT NULL DEFAULT 'GBP',
  description     TEXT,
  ageing_days     SMALLINT NOT NULL DEFAULT 0,
  status          VARCHAR(40) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'wont_resolve')),
  resolution_command_id TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_breaks_run
  ON reconciliation_breaks (run_id, status, break_type);
CREATE INDEX IF NOT EXISTS idx_reconciliation_breaks_type
  ON reconciliation_breaks (break_type, severity) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_reconciliation_breaks_corr
  ON reconciliation_breaks (correlation_key)
  WHERE correlation_key IS NOT NULL;

-- ── 5. safeguarding_daily_checks ────────────────────────────────────────
-- FCA PS25/12 daily safeguarding check: internal liabilities (buyer order
-- liability, seller payables, seller reserve liability, payout-pending
-- liability) must be covered by the safeguarded balance from the bank plane.
CREATE TABLE IF NOT EXISTS safeguarding_daily_checks (
  id                          TEXT PRIMARY KEY,
  run_date                    DATE NOT NULL UNIQUE,
  buyer_order_liability_gbp   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  seller_payable_gbp          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  seller_reserve_liability_gbp NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payout_pending_liability_gbp NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_liability_gbp         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  safeguarded_balance_gbp     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- shortfall = total_liability - safeguarded_balance (positive = shortfall).
  shortfall_gbp               NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status                      VARCHAR(40) NOT NULL DEFAULT 'incomplete'
    CHECK (status IN ('balanced', 'shortfall', 'surplus', 'incomplete')),
  metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safeguarding_daily_checks_date
  ON safeguarding_daily_checks (run_date DESC);
CREATE INDEX IF NOT EXISTS idx_safeguarding_daily_checks_status
  ON safeguarding_daily_checks (status) WHERE status != 'balanced';

COMMENT ON TABLE reconciliation_runs IS
  'Three-way reconciliation run header. A run is never "ok" when any plane is missing or ingestion failed (completeness = incomplete).';
COMMENT ON TABLE reconciliation_provider_facts IS
  'External provider report facts ingested before reconciliation. One row per provider transaction.';
COMMENT ON TABLE reconciliation_bank_facts IS
  'Bank / safeguarding account facts: settlements, payout debits, returns, safeguarded balance snapshots.';
COMMENT ON TABLE reconciliation_breaks IS
  'Break cases from the three-way FULL OUTER JOIN across provider, internal and bank planes.';
COMMENT ON TABLE safeguarding_daily_checks IS
  'FCA PS25/12 daily safeguarding check: liabilities vs safeguarded balance.';
