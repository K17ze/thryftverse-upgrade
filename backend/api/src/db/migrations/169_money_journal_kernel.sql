-- =============================================================================
-- 169_money_journal_kernel.sql
-- Money Journal Kernel — fixes PAY-05 and PAY-17 from the payments analysis report.
--
-- PAY-05: ledger_entries is a flat table with no journal header, no DB-enforced
--         debit=credit invariant, and no unique posting key. Entries are appended
--         individually and paired only by convention.
--         -> Replaced with a journal-header + journal-lines model where every
--            journal has a unique posting_key and a DB trigger enforces that
--            debits = credits per currency for each journal.
--
-- PAY-17: Amounts are NUMERIC(12,2) — float-adjacent, not integer minor units.
--         Rounding errors accumulate.
--         -> All money amounts in this kernel use BIGINT minor units (integer),
--            never NUMERIC(12,2).
--
-- This migration is ADDITIVE: it creates new tables alongside the existing
-- ledger_entries / ledger_accounts from migration 005. Existing tables are not
-- dropped or altered.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. money_accounts
--    Chart of accounts for the double-entry journal kernel. Each account is
--    owned by a platform, user, or provider entity and has a normal_side
--    (debit for assets/expenses, credit for liabilities/revenue/equity).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS money_accounts (
  id BIGSERIAL PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('platform','user','provider')),
  owner_id TEXT NOT NULL,
  account_code TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  normal_side TEXT NOT NULL CHECK (normal_side IN ('debit','credit')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_type, owner_id, account_code, currency)
);

COMMENT ON TABLE money_accounts IS
  'Double-entry chart of accounts. Replaces the flat ledger_accounts for new postings. '
  'normal_side encodes the accounting normal balance (debit=asset/expense, credit=liability/revenue/equity).';

CREATE INDEX IF NOT EXISTS money_accounts_owner_idx
  ON money_accounts (owner_type, owner_id, status);

CREATE INDEX IF NOT EXISTS money_accounts_code_idx
  ON money_accounts (account_code, currency);

-- Seed platform accounts with correct normal_side.
-- Liabilities -> credit, assets -> debit, revenue -> credit, expense -> debit.
INSERT INTO money_accounts (owner_type, owner_id, account_code, currency, normal_side)
VALUES
  -- Assets (debit)
  ('platform', 'platform', 'provider_cash_pending',     'GBP', 'debit'),
  ('platform', 'platform', 'provider_cash_available',   'GBP', 'debit'),
  ('platform', 'platform', 'platform_operating',        'GBP', 'debit'),
  -- Liabilities (credit)
  ('platform', 'platform', 'provider_cash_refund_payable', 'GBP', 'credit'),
  ('platform', 'platform', 'buyer_order_liability',     'GBP', 'credit'),
  ('platform', 'platform', 'seller_reserve_liability',  'GBP', 'credit'),
  ('platform', 'platform', 'shipping_payable',          'GBP', 'credit'),
  ('platform', 'platform', 'seller_payable',            'GBP', 'credit'),
  ('platform', 'platform', 'payout_pending_liability',  'GBP', 'credit'),
  -- Revenue (credit)
  ('platform', 'platform', 'platform_commission_revenue', 'GBP', 'credit'),
  -- Expense (debit)
  ('platform', 'platform', 'processor_fee_expense',     'GBP', 'debit')
ON CONFLICT (owner_type, owner_id, account_code, currency) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. money_journals
--    Journal header. Each journal is a single balanced posting event with a
--    unique posting_key (tenant/domain/event/version) that makes every journal
--    idempotent and replay-safe. Posted journals are immutable; correction is
--    done by reversal + replacement only.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS money_journals (
  id BIGSERIAL PRIMARY KEY,
  posting_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1,
  effective_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  reversal_of_id BIGINT REFERENCES money_journals(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  principal TEXT
);

COMMENT ON TABLE money_journals IS
  'Journal header for the double-entry kernel. posting_key is globally unique and '
  'idempotent. Posted journals are immutable (see prevent_journal_mutation trigger). '
  'Correction is only via reversal + replacement.';

CREATE INDEX IF NOT EXISTS money_journals_event_idx
  ON money_journals (event_type, event_id, event_version);

CREATE INDEX IF NOT EXISTS money_journals_effective_idx
  ON money_journals (effective_at DESC);

CREATE INDEX IF NOT EXISTS money_journals_reversal_idx
  ON money_journals (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. money_journal_lines
--    Individual debit/credit lines that belong to a journal. Amounts are
--    BIGINT minor units (integer) — never NUMERIC. The enforce_journal_balanced
--    trigger guarantees debits = credits per currency per journal.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS money_journal_lines (
  id BIGSERIAL PRIMARY KEY,
  journal_id BIGINT NOT NULL REFERENCES money_journals(id) ON DELETE RESTRICT,
  account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
  side TEXT NOT NULL CHECK (side IN ('debit','credit')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL,
  line_code TEXT NOT NULL,
  external_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN money_journal_lines.amount_minor IS
  'Integer minor units (e.g. pence). Never float / NUMERIC. PAY-17 fix.';
COMMENT ON COLUMN money_journal_lines.external_hash IS
  'Optional hash of the external source object this line was derived from, for dedup.';

CREATE INDEX IF NOT EXISTS money_journal_lines_journal_idx
  ON money_journal_lines (journal_id);

CREATE INDEX IF NOT EXISTS money_journal_lines_account_idx
  ON money_journal_lines (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS money_journal_lines_external_hash_idx
  ON money_journal_lines (external_hash)
  WHERE external_hash IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. enforce_journal_balanced() — DB-enforced debit = credit invariant (PAY-05)
--    Fires AFTER INSERT OR UPDATE on money_journal_lines. For each affected
--    journal, verifies that total debits = total credits per currency. Raises
--    an exception if unbalanced, aborting the transaction.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_journal_balanced()
RETURNS TRIGGER AS $$
DECLARE
  unbalanced RECORD;
BEGIN
  FOR unbalanced IN
    SELECT
      j.id        AS journal_id,
      agg.currency,
      agg.total_debit,
      agg.total_credit,
      (agg.total_debit - agg.total_credit) AS diff
    FROM (
      SELECT
        journal_id,
        currency,
        SUM(CASE WHEN side = 'debit'  THEN amount_minor ELSE 0 END) AS total_debit,
        SUM(CASE WHEN side = 'credit' THEN amount_minor ELSE 0 END) AS total_credit
      FROM money_journal_lines
      WHERE journal_id IN (
        SELECT DISTINCT journal_id
        FROM (SELECT journal_id FROM NEW UNION SELECT journal_id FROM OLD) s
      )
      GROUP BY journal_id, currency
    ) agg
    JOIN money_journals j ON j.id = agg.journal_id
    WHERE agg.total_debit <> agg.total_credit
  LOOP
    RAISE EXCEPTION
      'Journal % is not balanced for currency %: debit=%, credit=%, diff=%',
      unbalanced.journal_id, unbalanced.currency,
      unbalanced.total_debit, unbalanced.total_credit, unbalanced.diff
      USING ERRCODE = 'R001';
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS money_journal_lines_balanced_trg ON money_journal_lines;
CREATE TRIGGER money_journal_lines_balanced_trg
  AFTER INSERT OR UPDATE ON money_journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION enforce_journal_balanced();

COMMENT ON FUNCTION enforce_journal_balanced() IS
  'PAY-05 fix: DB-enforced invariant that every journal has debits = credits per currency.';

-- -----------------------------------------------------------------------------
-- 5. prevent_journal_mutation() — immutable posted journals
--    Prevents UPDATE or DELETE on money_journals rows whose status = 'posted'.
--    The only correction path is reversal (status -> reversed) + a replacement
--    journal. Reversal is allowed because it flips status away from 'posted'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_journal_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- Block UPDATE of a posted journal unless it is being reversed.
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.status = 'posted' AND NEW.status = 'posted') THEN
      RAISE EXCEPTION
        'Journal % is posted and immutable. Use reversal + replacement to correct it.',
        OLD.id
        USING ERRCODE = 'R002';
    END IF;
    RETURN NEW;
  END IF;

  -- Block DELETE of a posted journal entirely.
  IF (TG_OP = 'DELETE') THEN
    IF (OLD.status = 'posted') THEN
      RAISE EXCEPTION
        'Cannot delete posted journal %. Use reversal + replacement to correct it.',
        OLD.id
        USING ERRCODE = 'R002';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS money_journals_immutable_trg ON money_journals;
CREATE TRIGGER money_journals_immutable_trg
  BEFORE UPDATE OR DELETE ON money_journals
  FOR EACH ROW
  EXECUTE FUNCTION prevent_journal_mutation();

COMMENT ON FUNCTION prevent_journal_mutation() IS
  'Makes posted journals immutable. Correction only via reversal + replacement.';

-- -----------------------------------------------------------------------------
-- 6. money_operations
--    State-aware record of every money operation (capture, refund, payout, ...).
--    Scoped idempotency key + hash make retries safe and detect conflicting
--    re-submissions. The unknown_outcome state captures provider timeouts.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS money_operations (
  id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL CHECK (operation_type IN (
    'create_intent','confirm','capture','refund','payout','transfer','dispute','adjustment'
  )),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  scoped_idempotency_key TEXT NOT NULL,
  scoped_idempotency_hash BYTEA,
  state TEXT NOT NULL CHECK (state IN (
    'created','submitted','succeeded','failed','unknown_outcome','reversed'
  )),
  unknown_since TIMESTAMPTZ,
  provider TEXT,
  provider_object_id TEXT,
  provider_object_type TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aggregate_type, aggregate_id, scoped_idempotency_key)
);

COMMENT ON TABLE money_operations IS
  'State-aware money operations with scoped idempotency. unknown_outcome captures '
  'provider timeouts that must be reconciled, not blindly retried.';

CREATE INDEX IF NOT EXISTS money_operations_state_idx
  ON money_operations (state, updated_at DESC);

CREATE INDEX IF NOT EXISTS money_operations_aggregate_idx
  ON money_operations (aggregate_type, aggregate_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS money_operations_provider_idx
  ON money_operations (provider, provider_object_id)
  WHERE provider_object_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 7. balance_projections
--    Per-account, per-currency running totals derived from money_journal_lines.
--    balance_minor is a STORED generated column (debit - credit). Maintained by
--    application code (or a future trigger) as journals post.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS balance_projections (
  account_id BIGINT NOT NULL REFERENCES money_accounts(id),
  currency CHAR(3) NOT NULL,
  total_debit_minor BIGINT NOT NULL DEFAULT 0,
  total_credit_minor BIGINT NOT NULL DEFAULT 0,
  balance_minor BIGINT GENERATED ALWAYS AS (total_debit_minor - total_credit_minor) STORED,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, currency)
);

COMMENT ON TABLE balance_projections IS
  'Per-account, per-currency running totals. balance_minor is a stored generated '
  'column (debit - credit). Maintained as journals post.';

CREATE INDEX IF NOT EXISTS balance_projections_balance_idx
  ON balance_projections (currency, balance_minor DESC);

-- -----------------------------------------------------------------------------
-- 8. webhook_inbox — durable, state-aware webhook inbox
--    Stores raw encrypted webhook bodies with original headers for signature
--    verification. A lease + retry model supports safe concurrent processing and
--    dead-lettering. UNIQUE (provider, provider_event_id) deduplicates.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_inbox (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  raw_body BYTEA NOT NULL,
  raw_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  body_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received','leased','normalizing','applying','succeeded','retry_wait','dead_letter'
  )),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  normalized_object JSONB,
  journal_id BIGINT REFERENCES money_journals(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id)
);

COMMENT ON TABLE webhook_inbox IS
  'Durable state-aware webhook inbox. raw_body is the encrypted original body; '
  'raw_headers preserved for signature verification. Lease + retry model with '
  'dead-lettering. Deduped by (provider, provider_event_id).';

-- Retry sweep: find due rows in retry_wait / received status.
CREATE INDEX IF NOT EXISTS webhook_inbox_retry_sweep_idx
  ON webhook_inbox (status, next_attempt_at)
  WHERE status IN ('received','retry_wait');

-- Dedup lookup (in addition to the unique constraint, for fast equality probes).
CREATE INDEX IF NOT EXISTS webhook_inbox_dedup_idx
  ON webhook_inbox (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS webhook_inbox_lease_idx
  ON webhook_inbox (lease_owner, lease_expires_at)
  WHERE lease_owner IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 9. reconciliation_provider_facts — immutable provider reports
--    Normalized, immutable facts sourced from provider reports (Stripe, Wise, ...).
--    Used to reconcile internal journals against provider truth. Deduped by
--    (provider, provider_object_id).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_provider_facts (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  provider_object_id TEXT NOT NULL,
  provider_object_type TEXT NOT NULL,
  raw_object JSONB NOT NULL,
  object_hash TEXT NOT NULL,
  normalized_row JSONB NOT NULL,
  currency CHAR(3) NOT NULL,
  gross_minor BIGINT NOT NULL,
  fee_minor BIGINT NOT NULL DEFAULT 0,
  net_minor BIGINT NOT NULL,
  available_on DATE,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_reported_at TIMESTAMPTZ,
  correction_journal_id BIGINT REFERENCES money_journals(id),
  UNIQUE (provider, provider_object_id)
);

COMMENT ON TABLE reconciliation_provider_facts IS
  'Immutable normalized provider report facts for reconciliation. All amounts in '
  'integer minor units. Deduped by (provider, provider_object_id).';

CREATE INDEX IF NOT EXISTS reconciliation_provider_facts_available_idx
  ON reconciliation_provider_facts (provider, available_on DESC);

CREATE INDEX IF NOT EXISTS reconciliation_provider_facts_unmatched_idx
  ON reconciliation_provider_facts (provider, currency, available_on)
  WHERE correction_journal_id IS NULL;

-- -----------------------------------------------------------------------------
-- 10. reconciliation_bank_facts — bank / safeguarding account facts
--     Signed amounts: positive = inflow, negative = outflow. Deduped by
--     (source, reference).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_bank_facts (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  reference TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  currency CHAR(3) NOT NULL,
  amount_minor BIGINT NOT NULL,
  description TEXT,
  raw_row JSONB,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_provider_object_id TEXT,
  matched_journal_id BIGINT REFERENCES money_journals(id),
  UNIQUE (source, reference)
);

COMMENT ON TABLE reconciliation_bank_facts IS
  'Bank statement / safeguarding account facts. amount_minor is signed: positive = '
  'inflow, negative = outflow. Deduped by (source, reference).';

CREATE INDEX IF NOT EXISTS reconciliation_bank_facts_date_idx
  ON reconciliation_bank_facts (source, transaction_date DESC);

CREATE INDEX IF NOT EXISTS reconciliation_bank_facts_unmatched_idx
  ON reconciliation_bank_facts (source, transaction_date)
  WHERE matched_journal_id IS NULL;

-- -----------------------------------------------------------------------------
-- 11. reconciliation_breaks — break cases raised by reconciliation runs
--     Each break records the delta between provider and internal truth and is
--     worked to resolution (possibly via a correction journal).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_breaks (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL,
  break_type TEXT NOT NULL CHECK (break_type IN (
    'missing_internal','missing_provider','amount_mismatch','currency_mismatch',
    'status_mismatch','fee_mismatch','duplicate_internal','duplicate_provider',
    'timing_expected','payout_batch_mismatch','bank_missing',
    'safeguarding_shortfall','stale_unknown'
  )),
  provider TEXT,
  provider_object_id TEXT,
  internal_entity_type TEXT,
  internal_entity_id TEXT,
  currency CHAR(3),
  provider_amount_minor BIGINT,
  internal_amount_minor BIGINT,
  difference_minor BIGINT,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','investigating','resolved','wont_fix'
  )),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution_journal_id BIGINT REFERENCES money_journals(id),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

COMMENT ON TABLE reconciliation_breaks IS
  'Reconciliation break cases. Worked from open -> investigating -> resolved/wont_fix. '
  'Resolution may post a correction journal.';

CREATE INDEX IF NOT EXISTS reconciliation_breaks_run_idx
  ON reconciliation_breaks (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reconciliation_breaks_status_idx
  ON reconciliation_breaks (status, severity, due_at)
  WHERE status IN ('open','investigating');

CREATE INDEX IF NOT EXISTS reconciliation_breaks_provider_idx
  ON reconciliation_breaks (provider, provider_object_id)
  WHERE provider_object_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 12. safeguarding_daily_checks — FCA PS25/12 daily safeguarding checks
--     Records the daily comparison of internal safeguarding liability against
--     the safeguarded balance held at the bank / EMI.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS safeguarding_daily_checks (
  id BIGSERIAL PRIMARY KEY,
  check_date DATE NOT NULL UNIQUE,
  internal_liability_minor BIGINT NOT NULL,
  safeguarded_balance_minor BIGINT NOT NULL,
  difference_minor BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('balanced','shortfall','surplus','incomplete')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE safeguarding_daily_checks IS
  'FCA PS25/12 daily safeguarding checks. Compares internal liability to safeguarded '
  'balance. shortfall requires immediate action.';

CREATE INDEX IF NOT EXISTS safeguarding_daily_checks_status_idx
  ON safeguarding_daily_checks (status, check_date DESC)
  WHERE status <> 'balanced';
