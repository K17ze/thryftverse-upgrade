-- Add provider_cash_clearing and reserve_hold to the ledger_accounts
-- CHECK constraint so that payout settlement (PAY-07) and reserve holds
-- (PAY-06) can post to the correct accounts.

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
