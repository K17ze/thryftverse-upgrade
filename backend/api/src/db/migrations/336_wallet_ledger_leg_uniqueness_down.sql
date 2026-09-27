-- Rollback for 336_wallet_ledger_leg_uniqueness.
DROP INDEX IF EXISTS wallet_ledger_wallet_tx_asset_kind_uidx;
