-- Rollback for 333_wallet_ize_transfers_context_single_use.
-- Drops the single-use guard on privileged transfer contexts.
DROP INDEX IF EXISTS wallet_ize_transfers_context_uidx;
