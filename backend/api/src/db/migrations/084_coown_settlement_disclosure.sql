-- 084_coown_settlement_disclosure.sql
-- Settlement & escrow disclosure for Co-Own.
--
-- Closes research gaps #3 (settlement explanation) and #7 (escrow
-- information). Assets now carry escrow partner/terms and a settlement
-- ETA. Trades now carry failure_reason and recovery_action so the
-- frontend can explain why a settlement failed and what happens next,
-- rather than showing a bare 'failed'/'reversed' state.

ALTER TABLE coOwn_assets
  ADD COLUMN IF NOT EXISTS escrow_partner TEXT,
  ADD COLUMN IF NOT EXISTS escrow_terms_url TEXT,
  ADD COLUMN IF NOT EXISTS settlement_eta_hours INTEGER CHECK (settlement_eta_hours IS NULL OR settlement_eta_hours > 0);

ALTER TABLE coOwn_trades
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS recovery_action TEXT;
