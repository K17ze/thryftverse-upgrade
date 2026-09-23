-- Rollback for 340_wallet_exchange_foundation.
--
-- WARNING: ONE-WAY BOUNDARY — this down-migration is DESTRUCTIVE and LOSSY:
--   * Dropping wallet_currency_balances destroys every non-default currency
--     pocket balance irrecoverably; the legacy wallets.fiat_balance_minor
--     bucket cannot reconstruct them.
--   * FX wallet_ledger kinds (FX_CONVERT_DEBIT/FX_CONVERT_CREDIT/FX_FEE/
--     CONVERT_FROM_1ZE) are remapped onto pre-340 kinds — semantics are
--     lost by necessity, the legs only remain representable.
--   * fx_conversion ledger_entries are remapped to source_type 'adjustment'
--     for the same reason.
-- Only run this before 340 has served live traffic, or after manually
-- reconciling and archiving the affected rows.

-- transfers references fx_quotes and beneficiaries, so it must go first.
DROP TABLE IF EXISTS transfers;
DROP TABLE IF EXISTS beneficiaries;
DROP TABLE IF EXISTS fx_quotes;
DROP TABLE IF EXISTS wallet_currency_balances;

-- Re-map rows written under the widened CHECKs before restoring the
-- tighter pre-340 constraints (same pattern as 324_down — the down
-- migration must not fail on rows written while 340 was applied).
UPDATE wallet_ledger
   SET kind = 'CONVERT_TO_FIAT'
 WHERE kind IN ('CONVERT_FROM_1ZE', 'FX_CONVERT_DEBIT', 'FX_CONVERT_CREDIT');

UPDATE wallet_ledger
   SET kind = 'FEE'
 WHERE kind = 'FX_FEE';

UPDATE ledger_entries
   SET source_type = 'adjustment'
 WHERE source_type = 'fx_conversion';

-- FX accounts can only exist post-340. Skip any account that live
-- ledger_entries still reference (either FK direction is RESTRICT) so a
-- post-live rollback doesn't hard-fail — reconcile those accounts manually.
DELETE FROM ledger_accounts
 WHERE account_code IN ('revenue_fx', 'fx_clearing')
   AND NOT EXISTS (
     SELECT 1
       FROM ledger_entries le
      WHERE le.account_id = ledger_accounts.id
         OR le.counterparty_account_id = ledger_accounts.id
   );

-- Restore the pre-340 wallet_ledger kind CHECK (migration-324 shape).
ALTER TABLE wallet_ledger
  DROP CONSTRAINT IF EXISTS wallet_ledger_kind_check;

ALTER TABLE wallet_ledger
  ADD CONSTRAINT wallet_ledger_kind_check
  CHECK (
    kind IN (
      'CREDIT',
      'DEBIT',
      'TRANSFER_SEND',
      'TRANSFER_RECEIVE',
      'MINT',
      'BURN',
      'WITHDRAWAL_RESERVED',
      'WITHDRAWAL_SETTLED',
      'WITHDRAWAL_REVERSED',
      'WITHDRAWAL_FEE',
      'SALE',
      'PURCHASE',
      'CO_OWN_TRADE',
      'CO_OWN_DRIP',
      'FEE',
      'REDEMPTION',
      'ONEZE_REFUND',
      'CONVERT_TO_FIAT',
      'CREATOR_EARNING_PAYOUT'
    )
  );

-- Restore the pre-340 ledger_accounts CHECK (migration-170 shape).
ALTER TABLE ledger_accounts
  DROP CONSTRAINT IF EXISTS ledger_accounts_account_code_check;

ALTER TABLE ledger_accounts
  ADD CONSTRAINT ledger_accounts_account_code_check CHECK (
    account_code IN (
      'escrow_liability',
      'platform_revenue',
      'platform_operating',
      'seller_payable',
      'buyer_spend',
      'withdrawable_balance',
      'withdrawal_pending',
      'ize_wallet',
      'ize_pending_redemption',
      'ize_outstanding',
      'ize_fiat_received',
      'reserve_hold',
      'provider_cash_clearing'
    )
  );

-- Restore the pre-340 ledger_entries source_type CHECK (migration-301
-- shape — the live list before 340, not the narrower 005 baseline).
ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_source_type_check CHECK (
    source_type IN (
      'order_payment',
      'order_delivery',
      'payout',
      'refund',
      'adjustment',
      'mint',
      'burn',
      'coOwn_trade',
      'buyout',
      'reserve_reconcile',
      'transfer',
      'promotion'
    )
  );

ALTER TABLE wallet_ledger
  DROP COLUMN IF EXISTS currency;
