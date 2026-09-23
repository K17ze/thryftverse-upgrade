-- 340: wallet exchange foundation — multi-currency wallet balances, FX
--      quotes, saved beneficiaries, and outbound transfers.
--
-- wallet_currency_balances — one row per (wallet, currency). `version` is
--      the optimistic-concurrency counter, mirroring wallets.version.
-- wallet_ledger.currency — the ledger stays the source of truth for
--      movements; stamping a currency on each leg lets one wallet hold
--      '1ZE' plus any number of fiat currencies without widening `asset`.
-- fx_quotes     — rate-lock records. A quote fixes exactly one side of the
--      conversion ('source' or 'target') and expires if not executed.
-- beneficiaries — saved payout destinations; `fields`/`validation` carry
--      the per-account_type details and last validation result.
-- transfers     — the outbound payment lifecycle:
--      QUOTE → AWAITING_FUNDS → FUNDED → PROCESSING → CONVERTED →
--      PAID_OUT → DELIVERED, with BOUNCED/REFUNDED/CANCELLED/FAILED exits.
--
-- fx_rates (015) remains the raw tick store — unchanged by this migration.

CREATE TABLE IF NOT EXISTS wallet_currency_balances (
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  currency CHAR(3) NOT NULL,
  balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (wallet_id, currency)
);

-- Stamp the currency on every existing ledger leg before tightening to
-- NOT NULL: '1ZE' legs are the token; 'FIAT' legs take the owning
-- wallet's fiat_currency.
ALTER TABLE wallet_ledger
  ADD COLUMN IF NOT EXISTS currency CHAR(3);

UPDATE wallet_ledger wl
   SET currency = '1ZE'
 WHERE wl.asset = '1ZE'
   AND wl.currency IS NULL;

UPDATE wallet_ledger wl
   SET currency = w.fiat_currency
  FROM wallets w
 WHERE wl.wallet_id = w.id
   AND wl.asset = 'FIAT'
   AND wl.currency IS NULL;

ALTER TABLE wallet_ledger
  ALTER COLUMN currency SET NOT NULL;

-- wallet_ledger.kind — widen for the exchange write paths. Full 324 list
-- plus:
--   * 'CONVERT_FROM_1ZE'   1ZE → fiat leg of a conversion
--   * 'FX_CONVERT_DEBIT'   source-currency debit of an FX conversion
--   * 'FX_CONVERT_CREDIT'  target-currency credit of an FX conversion
--   * 'FX_FEE'             conversion fee leg
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
      'CREATOR_EARNING_PAYOUT',
      'CONVERT_FROM_1ZE',
      'FX_CONVERT_DEBIT',
      'FX_CONVERT_CREDIT',
      'FX_FEE'
    )
  );

-- ledger_accounts.account_code — full 170 list plus the FX pair:
--   * 'revenue_fx'   spread/fee revenue earned on conversions
--   * 'fx_clearing'  in-flight conversion funds between debit and payout
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
      'provider_cash_clearing',
      'revenue_fx',
      'fx_clearing'
    )
  );

-- ledger_entries.source_type — 'fx_conversion' joins the live list. The
-- pre-340 shape is the migration-301 list (preserved verbatim), not the
-- narrower 005 baseline — 024/301 added 'order_delivery', 'mint', 'burn',
-- 'coOwn_trade', 'buyout', 'reserve_reconcile', 'transfer', 'promotion'.
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
      'promotion',
      'fx_conversion'
    )
  );

CREATE TABLE IF NOT EXISTS fx_quotes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  source_currency CHAR(3) NOT NULL,
  target_currency CHAR(3) NOT NULL,
  fixed_side TEXT NOT NULL CHECK (fixed_side IN ('source', 'target')),
  source_amount_minor BIGINT NOT NULL CHECK (source_amount_minor > 0),
  target_amount_minor BIGINT NOT NULL CHECK (target_amount_minor > 0),
  mid_rate NUMERIC(20, 10) NOT NULL CHECK (mid_rate > 0),
  customer_rate NUMERIC(20, 10) NOT NULL CHECK (customer_rate > 0),
  spread_bps INT NOT NULL CHECK (spread_bps >= 0),
  fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  fee_currency CHAR(3),
  rate_source TEXT NOT NULL,
  rate_observed_at TIMESTAMPTZ NOT NULL,
  -- true when the resolved rate was past its freshness window at quote time
  -- (only persisted when the FX_ALLOW_STALE_QUOTES escape hatch is on —
  -- stale-rate quotes are otherwise rejected before insert).
  rate_stale BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'executed', 'expired', 'cancelled')),
  idempotency_key TEXT,
  -- SHA-256 of the canonical request payload — an idempotency-key replay is
  -- only served for a byte-identical request (walletMoneyPath convention).
  request_hash CHAR(64),
  tx_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS fx_quotes_user_created_idx
  ON fx_quotes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fx_quotes_open_expiry_idx
  ON fx_quotes (status, expires_at)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS beneficiaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  legal_name TEXT,
  country_code CHAR(2) NOT NULL,
  currency CHAR(3) NOT NULL,
  account_type TEXT NOT NULL CHECK (
    account_type IN ('iban', 'sort_code', 'aba', 'ifsc', 'swift_code', 'local_account')
  ),
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS beneficiaries_user_created_idx
  ON beneficiaries (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  fx_quote_id TEXT REFERENCES fx_quotes(id) ON DELETE SET NULL,
  beneficiary_id TEXT REFERENCES beneficiaries(id) ON DELETE SET NULL,
  source_currency CHAR(3) NOT NULL,
  source_amount_minor BIGINT NOT NULL CHECK (source_amount_minor > 0),
  target_currency CHAR(3) NOT NULL,
  target_amount_minor BIGINT NOT NULL CHECK (target_amount_minor > 0),
  state TEXT NOT NULL DEFAULT 'QUOTE' CHECK (
    state IN (
      'QUOTE',
      'AWAITING_FUNDS',
      'FUNDED',
      'PROCESSING',
      'CONVERTED',
      'PAID_OUT',
      'DELIVERED',
      'BOUNCED',
      'REFUNDED',
      'CANCELLED',
      'FAILED'
    )
  ),
  rail TEXT,
  rail_ref TEXT,
  uetr TEXT,
  failure_code TEXT,
  failure_message TEXT,
  idempotency_key TEXT,
  -- SHA-256 of the canonical request payload — see fx_quotes.request_hash.
  request_hash CHAR(64),
  tx_id TEXT,
  funded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS transfers_user_created_idx
  ON transfers (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS transfers_state_created_idx
  ON transfers (state, created_at DESC);
