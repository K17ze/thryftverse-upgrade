-- Wallet-ledger idempotency backstop.
--
-- tx_id alone is NOT unique: multi-leg transactions intentionally write
-- several rows under one tx_id (sender debit + receiver credit; 1ZE burn +
-- FIAT fee for the same wallet). The idempotent unit is therefore the
-- (wallet_id, tx_id, asset, kind) tuple — two byte-identical legs for the
-- same wallet in one transaction are always a replay artifact, never a
-- legitimate double entry.
--
-- This constraint is deliberately fail-loud: if historical data already
-- contains duplicates the index build aborts and the duplication must be
-- reconciled rather than silently tolerated.

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_wallet_tx_asset_kind_uidx
  ON wallet_ledger (wallet_id, tx_id, asset, kind);
