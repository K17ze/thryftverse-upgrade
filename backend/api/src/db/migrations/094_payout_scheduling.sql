-- 094_payout_scheduling.sql
-- Payout scheduling, minimums, and rolling reserve for new sellers.
-- Matches Etsy (weekly deposit schedule + reserve %) and Depop (batched).

ALTER TABLE payout_accounts
  ADD COLUMN IF NOT EXISTS payout_schedule TEXT NOT NULL DEFAULT 'on_demand'
    CHECK (payout_schedule IN ('on_demand', 'weekly', 'biweekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS payout_minimum_gbp NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_day_of_week SMALLINT
    CHECK (payout_day_of_week IS NULL OR (payout_day_of_week >= 0 AND payout_day_of_week <= 6)),
  ADD COLUMN IF NOT EXISTS reserve_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0
    CHECK (reserve_percentage >= 0 AND reserve_percentage <= 100),
  ADD COLUMN IF NOT EXISTS reserve_release_after_days INT NOT NULL DEFAULT 0
    CHECK (reserve_release_after_days >= 0),
  ADD COLUMN IF NOT EXISTS next_scheduled_payout_at TIMESTAMPTZ;

-- Track per-order reserve holds so we can release them after the holding period.
CREATE TABLE IF NOT EXISTS payout_reserve_holds (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payout_account_id BIGINT NOT NULL REFERENCES payout_accounts(id) ON DELETE CASCADE,
  held_amount_gbp NUMERIC(12, 2) NOT NULL CHECK (held_amount_gbp > 0),
  reserve_percentage NUMERIC(5, 2) NOT NULL,
  released_at TIMESTAMPTZ,
  release_eligible_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS payout_reserve_holds_user_idx
  ON payout_reserve_holds (user_id, released_at, release_eligible_at);

CREATE INDEX IF NOT EXISTS payout_reserve_holds_release_due_idx
  ON payout_reserve_holds (release_eligible_at)
  WHERE released_at IS NULL;
