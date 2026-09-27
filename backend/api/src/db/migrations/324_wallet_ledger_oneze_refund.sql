-- 324: wallet_ledger.kind — admit the kinds written by money paths that
--      the CHECK introduced by 015 never covered.
--
-- Four live write paths raise 23514 on a real database:
--
--   * 'ONEZE_REFUND'            refundOnezeInternalWalletDebit
--                               (lib/walletMoneyPath.ts) — internal-rail
--                               purchase refunds
--   * 'CONVERT_TO_FIAT'         1ZE → fiat conversion route (index.ts)
--   * 'CREATOR_EARNING_PAYOUT'  creator earnings → wallet payout
--                               (routes/creatorAnalytics.ts)
--   * 'CO_OWN_DRIP'             DRIP reinvestment debits/credits
--                               (workers/handlers/coOwnDripExecutionHandler.ts)
--
-- Widening the constraint restores the documented behavior for all four.

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
