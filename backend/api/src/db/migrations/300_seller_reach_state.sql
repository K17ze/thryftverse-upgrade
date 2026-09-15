-- Migration 300: Seller reach state — the distribution half of enforcement
--
-- The safety case graph (migration 172) records decisions and enforcement
-- actions as a write-only ledger: executeEnforcement flipped ledger state
-- but nothing reduced a flagged seller's distribution. This migration adds
-- the durable reach state that the visibility_restriction executor now
-- writes and the serving layer (search/feed) reads.
--
--   reach_state    — 'normal' | 'limited' | 'suspended'
--                    normal     — full distribution (default)
--                    limited    — down-ranked (rank multiplier 0.3); applied
--                                 automatically on severity>=3 safety signals
--                                 pending operator review (appeal-reversible)
--                    suspended  — excluded from distribution entirely;
--                                 operator-set harder state
--   reach_reason   — human/audit-readable reason the state was set
--   reach_set_at   — when the current state was applied
--
-- Separate from account_risk_state (migration 155): that column is the ATO
-- state machine (account compromise lifecycle), this one is the
-- trust-and-safety distribution state. Conflating them would let an ATO
-- transition silently clear a T&S restriction.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reach_state TEXT NOT NULL DEFAULT 'normal'
    CHECK (reach_state IN ('normal', 'limited', 'suspended'));
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reach_reason TEXT;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reach_set_at TIMESTAMPTZ;

-- Serving queries only ever filter/join on the restricted minority, so a
-- partial index keeps the write path cheap on the normal-state majority.
CREATE INDEX IF NOT EXISTS idx_users_reach_state
  ON users (reach_state)
  WHERE reach_state <> 'normal';
