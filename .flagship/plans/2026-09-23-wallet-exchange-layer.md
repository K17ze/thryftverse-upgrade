# Plan — Wallet Exchange Layer (WEL) v1

Date: 2026-09-23 · Campaign: `.flagship/campaign-fx-wallet-2026-09-23.md`

## Objective

Give ThryftVerse the foundations of a Wise/Revolut/Niyo-class wallet exchange
layer: multi-currency balances, live-ish FX rates with freshness contract,
fiat↔fiat conversion through guaranteed quotes, beneficiary + transfer
scaffolding for cross-border sends — while fixing the P0 money-path bugs the
audit proved.

## Non-negotiables (global constraints)

- BigInt minor-unit math only for amounts (reuse `lib/money.ts`
  `convertMoneyByDecimalRate`); NO float arithmetic on money paths.
- Every money mutation: row locks in deterministic order, negative-balance
  guard, append-only ledger legs, idempotency via claim-before-mutate.
- Follow existing patterns: `walletMoneyPath.ts` primitives,
  `wallet_idempotency_keys`, `registerXRoutes` extraction (like
  `routes/security.ts`), `createApiError`, `toJsonString`, `createRuntimeId`.
- New tables get down-migrations (`*_down.sql` pairs like 336/337/338).
- No new external dependencies. Validation must be pure-function (IBAN MOD-97
  etc. in-house — deterministic, free).
- Legacy behavior unchanged: 1ZE at-par pricing, convert-1ze-to-fiat,
  buy-1ze, withdrawals, seller payout ledger all keep working.
- Typecheck must pass (`npm run typecheck` in backend/api).
- Migration numbering: next free numbers start at 340.

## Schema contract (migration `340_wallet_exchange_foundation.sql`)

```sql
-- A. multi-currency pockets
wallet_currency_balances (
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  currency CHAR(3),
  balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  version BIGINT NOT NULL DEFAULT 0,
  created_at, updated_at,
  PRIMARY KEY (wallet_id, currency)
)

-- B. wallet_ledger gets currency + new kinds
ALTER wallet_ledger ADD currency CHAR(3);
  backfill: asset='1ZE' → '1ZE'; asset='FIAT' → wallets.fiat_currency; NOT NULL.
kind CHECK widened with:
  'CONVERT_FROM_1ZE' (fixes latent 23514),
  'FX_CONVERT_DEBIT', 'FX_CONVERT_CREDIT', 'FX_FEE'

-- C. ledger_accounts CHECK += 'revenue_fx' (fixes latent 23514), 'fx_clearing'
-- D. ledger_entries source_type CHECK += 'fx_conversion'

-- E. fx_quotes — guaranteed-rate quote entity (60s TTL for in-wallet convert)
fx_quotes (
  id TEXT PK, user_id, wallet_id REFERENCES wallets,
  source_currency CHAR(3), target_currency CHAR(3),
  fixed_side TEXT CHECK (fixed_side IN ('source','target')),
  source_amount_minor BIGINT > 0, target_amount_minor BIGINT > 0,
  mid_rate NUMERIC(20,10), customer_rate NUMERIC(20,10),
  spread_bps INT, fee_minor BIGINT, fee_currency CHAR(3),
  rate_source TEXT, rate_observed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'open' CHECK (status IN
    ('open','executed','expired','cancelled')),
  idempotency_key TEXT, tx_id TEXT,
  expires_at TIMESTAMPTZ, executed_at TIMESTAMPTZ, created_at,
  UNIQUE (user_id, idempotency_key)
)

-- F. beneficiaries — validated per-corridor recipient model
beneficiaries (
  id TEXT PK, user_id REFERENCES users ON DELETE CASCADE,
  display_name TEXT, legal_name TEXT,
  country_code CHAR(2), currency CHAR(3),
  account_type TEXT CHECK (account_type IN
    ('iban','sort_code','aba','ifsc','swift_code','local_account')),
  fields JSONB, validation JSONB,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at, updated_at
)

-- G. transfers — Wise-style remittance state machine (schema + internal legs)
transfers (
  id TEXT PK, user_id, wallet_id REFERENCES wallets,
  fx_quote_id TEXT REFERENCES fx_quotes,
  beneficiary_id TEXT REFERENCES beneficiaries,
  source_currency CHAR(3), source_amount_minor BIGINT,
  target_currency CHAR(3), target_amount_minor BIGINT,
  state TEXT DEFAULT 'QUOTE' CHECK (state IN
    ('QUOTE','AWAITING_FUNDS','FUNDED','PROCESSING','CONVERTED',
     'PAID_OUT','DELIVERED','BOUNCED','REFUNDED','CANCELLED','FAILED')),
  rail TEXT, rail_ref TEXT, uetr TEXT,
  failure_code TEXT, failure_message TEXT,
  idempotency_key TEXT, tx_id TEXT,
  funded_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  created_at, updated_at,
  UNIQUE (user_id, idempotency_key)
)

-- H. activate fx_rates (exists, dead since 015): sync writes ticks here.
```

## Tasks

| # | Task | Files | Model |
|---|------|-------|-------|
| T1 | Migration 340 + down | new migrations | std |
| T2 | `lib/fxEngine.ts` — rate resolution (direct/inverse/USD-cross) + staleness + quote math (BigInt) + multi-ccy balance primitives + quote create/execute | new lib | capable |
| T3 | `lib/beneficiaries.ts` — IBAN MOD-97, BIC, IFSC, ABA validation + corridor schemas | new lib | std |
| T4 | `routes/fxWallet.ts` + register in index.ts: GET /fx/rates, POST/GET /wallet/fx/quotes, POST execute, GET /wallets/:id/currency-balances, beneficiary CRUD, POST/GET /transfers | routes + index.ts | capable |
| T5 | FX sync upgrade: all registry currencies, tick persistence to fx_rates, freshness metadata | index.ts + config.ts | std |
| T6 | P0 fixes: ensureWallet currency guard; CONVERT_FROM_1ZE/revenue_fx CHECKs (in T1); withdrawal double-fee fix | index.ts | std |
| T7 | walletMoneyPath: applyWalletLedgerDelta gains optional `currency` (FIAT legs), writes wallet_currency_balances + mirrors legacy columns when currency=fiat_currency | lib/walletMoneyPath.ts | capable |
| T8 | Frontend: multi-ccy balances on WalletScreen; FxConvert surface (pair picker, live rate, server-TTL countdown, fee transparency); walletApi additions; nav registration | frontend | capable |
| T9 | Unit tests: fxEngine math, beneficiary validation, quote lifecycle | backend tests | std |

## Execution waves

- Wave 1 (parallel): T1 migration · T2 fxEngine · T3 beneficiaries · T7 walletMoneyPath
- Wave 2 (sequential, index.ts ownership): T4+T5+T6
- Wave 3: T8 frontend · T9 tests (parallel)
- Wave 4: adversarial review of whole diff + re-audit
