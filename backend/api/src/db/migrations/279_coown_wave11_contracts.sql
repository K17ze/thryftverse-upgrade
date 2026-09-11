-- 279_coown_wave11_contracts.sql
-- Wave 11: Backend contracts for lockup, fee schedule, corporate-action
-- governance fields, and scheduled distributions.
--
-- Closes the contract gaps identified in the Wave 10 audit:
--   - coOwn_assets lacks lockup_end_date / lockup_months
--   - coOwn_assets lacks management_fee_pct / performance_fee_pct / platform_fee_pct / sourcing_fee_gbp
--   - coown_corporate_actions lacks quorum_units / pass_threshold_pct / voting_deadline
--   - coown_distributions lacks projected_at / scheduled_at for upcoming payouts
--   - coown_distributions.status lacks CHECK constraint (convention-only values)
--
-- All additions are nullable so existing assets/actions remain valid without
-- backfill. The frontend fails closed when the fields are absent.

-- ── Lockup / holding period ────────────────────────────────────────────
ALTER TABLE coOwn_assets
  ADD COLUMN IF NOT EXISTS lockup_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lockup_months INTEGER
    CHECK (lockup_months IS NULL OR lockup_months >= 0);

COMMENT ON COLUMN coOwn_assets.lockup_end_date IS
  'Date after which secondary-market resale is permitted. NULL means no lockup.';
COMMENT ON COLUMN coOwn_assets.lockup_months IS
  'Lockup duration in months from listing. NULL means no lockup. Used for display when lockup_end_date is null.';

-- ── Fee schedule ──────────────────────────────────────────────────────
-- Stored as percentages (NUMERIC(6,3)) so 1.5% = 1.500. NULL means
-- "not disclosed" — the frontend shows "No fees disclosed" rather than
-- fabricating a value.
ALTER TABLE coOwn_assets
  ADD COLUMN IF NOT EXISTS management_fee_pct NUMERIC(6,3)
    CHECK (management_fee_pct IS NULL OR management_fee_pct >= 0),
  ADD COLUMN IF NOT EXISTS performance_fee_pct NUMERIC(6,3)
    CHECK (performance_fee_pct IS NULL OR performance_fee_pct >= 0),
  ADD COLUMN IF NOT EXISTS platform_fee_pct NUMERIC(6,3)
    CHECK (platform_fee_pct IS NULL OR platform_fee_pct >= 0),
  ADD COLUMN IF NOT EXISTS sourcing_fee_gbp NUMERIC(12,2)
    CHECK (sourcing_fee_gbp IS NULL OR sourcing_fee_gbp >= 0);

COMMENT ON COLUMN coOwn_assets.management_fee_pct IS
  'Annual management fee as a percentage of NAV (e.g. 1.500 = 1.5%). NULL = not disclosed.';
COMMENT ON COLUMN coOwn_assets.performance_fee_pct IS
  'Performance fee on exit proceeds (e.g. 20.000 = 20%). NULL = not disclosed.';
COMMENT ON COLUMN coOwn_assets.platform_fee_pct IS
  'Platform/transaction fee percentage. NULL = not disclosed.';
COMMENT ON COLUMN coOwn_assets.sourcing_fee_gbp IS
  'One-time sourcing/acquisition fee in GBP. NULL = not disclosed.';

-- ── Corporate-action governance fields ────────────────────────────────
ALTER TABLE coown_corporate_actions
  ADD COLUMN IF NOT EXISTS quorum_units BIGINT
    CHECK (quorum_units IS NULL OR quorum_units >= 0),
  ADD COLUMN IF NOT EXISTS pass_threshold_pct NUMERIC(6,3)
    CHECK (pass_threshold_pct IS NULL OR pass_threshold_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS voting_deadline TIMESTAMPTZ;

COMMENT ON COLUMN coown_corporate_actions.quorum_units IS
  'Minimum units that must vote for the action to be valid. NULL = no quorum requirement.';
COMMENT ON COLUMN coown_corporate_actions.pass_threshold_pct IS
  'Percentage of voted units required to pass (e.g. 50.000 = simple majority). NULL = not specified.';
COMMENT ON COLUMN coown_corporate_actions.voting_deadline IS
  'Deadline for casting votes. NULL = no deadline (manual close).';

-- ── Scheduled / projected distributions ───────────────────────────────
-- Allows the distribution calendar to show upcoming (scheduled) payouts
-- before they are settled. A scheduled row has status='scheduled' and
-- projected_payable_date set; when it settles, status becomes 'settled'
-- and settled_at is set.
ALTER TABLE coown_distributions
  ADD COLUMN IF NOT EXISTS projected_payable_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS record_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ex_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN coown_distributions.projected_payable_date IS
  'Projected payable date for scheduled (not yet settled) distributions. NULL for settled rows.';
COMMENT ON COLUMN coown_distributions.record_date IS
  'Record date for the distribution (who is entitled). NULL when not applicable.';
COMMENT ON COLUMN coown_distributions.ex_date IS
  'Ex-distribution date. NULL when not applicable.';
COMMENT ON COLUMN coown_distributions.updated_at IS
  'Last update timestamp — used for audit/observability of status transitions.';

-- Backfill updated_at for existing rows so the column is non-null.
UPDATE coown_distributions SET updated_at = COALESCE(settled_at, created_at) WHERE updated_at IS NULL;

-- ── Distribution status CHECK constraint ──────────────────────────────
-- The DRIP worker writes 'reinvested', 'reinvest_failed', and
-- 'retained_cash'. Make these states explicit so invalid values are
-- rejected at the database layer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coown_distributions_status_check'
  ) THEN
    ALTER TABLE coown_distributions
      ADD CONSTRAINT coown_distributions_status_check
      CHECK (status IN (
        'scheduled',
        'pending',
        'settled',
        'reversed',
        'reinvested',
        'reinvest_failed',
        'retained_cash'
      ));
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_coown_distributions_status
  ON coown_distributions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coown_corporate_actions_deadline
  ON coown_corporate_actions (voting_deadline)
  WHERE voting_deadline IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coown_assets_lockup
  ON coOwn_assets (lockup_end_date)
  WHERE lockup_end_date IS NOT NULL;
