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
-- NOTE: This table is already created by 169_money_journal_kernel.sql with a
-- different schema (BIGSERIAL id, provider/provider_object_id columns, minor
-- units). Do NOT recreate or add conflicting indexes here. The indexes below
-- were designed for a schema that was superseded by the money journal kernel.
-- Reconciliation provider facts are managed by the money journal kernel tables.

-- ── 3. reconciliation_bank_facts ────────────────────────────────────────
-- NOTE: Already created by 169_money_journal_kernel.sql with transaction_date
-- instead of run_date. Do NOT recreate or add conflicting indexes here.

-- ── 4. reconciliation_breaks ────────────────────────────────────────────
-- NOTE: Already created by 169_money_journal_kernel.sql with a different schema
-- (BIGSERIAL id, provider_amount_minor/internal_amount_minor columns). Do NOT
-- recreate or add conflicting indexes here. The existing indexes from the
-- money journal kernel are sufficient.

-- ── 5. safeguarding_daily_checks ────────────────────────────────────────
-- NOTE: Already created by 169_money_journal_kernel.sql with check_date
-- instead of run_date. Do NOT recreate or add conflicting indexes here.

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
