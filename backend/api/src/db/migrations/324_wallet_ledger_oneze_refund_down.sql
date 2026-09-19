-- 324 down: restore the pre-324 kind CHECK.
-- NOTE: wallet_ledger rows written with any of the three new kinds while
-- 324 was applied violate the restored constraint — re-map them before
-- tightening so the down migration cannot fail.

UPDATE wallet_ledger SET kind = 'REDEMPTION'
 WHERE kind IN ('ONEZE_REFUND', 'CONVERT_TO_FIAT', 'CREATOR_EARNING_PAYOUT', 'CO_OWN_DRIP');

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
      'FEE',
      'REDEMPTION'
    )
  );
