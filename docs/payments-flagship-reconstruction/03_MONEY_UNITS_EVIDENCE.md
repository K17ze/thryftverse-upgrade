# Prompt 03 — money-unit safety evidence

## Implemented

- Versioned ISO exponent registry shared by quotes, provider creation, and
  webhook normalization.
- Exact decimal-string and integer conversion without floating-point provider
  arithmetic.
- Launch currencies GBP, EUR, USD, INR, AED, and NGN plus zero- and
  three-decimal boundary currencies.
- Provider conversion traces on payment intents and webhook/refund/dispute
  records.
- Provider webhook amount equality enforcement before settlement.
- Server-derived order amounts and server-quoted wallet top-up money.
- Quote hashes binding source money, fee allocation, target 1ZE mg units, rate,
  and expiry to the PaymentIntent.
- Stripe PaymentSheet execution for the server-created wallet top-up intent;
  the mobile app does not mint from a client-declared success.
- Canonical payout amounts beside the temporary GBP valuation.
- 1ZE integer mg base units.
- Overflow, precision, zero, negative, unsupported-currency, mixed-input, and
  application transaction-limit rejection.
- Parallel database backfill with explicit quarantine for ambiguous
  `amount_gbp`/currency rows.
- Canonical base-unit shadow writes for ledger entries during the migration
  window.

## Verification commands

```text
cd backend/api
npm.cmd run build
node --import tsx --test src/lib/money.test.ts

cd frontend
npm.cmd run typecheck
```

Provider sandbox execution is intentionally deferred until sandbox credentials
and webhook endpoints are available. The conversion contract itself is covered
by deterministic unit tests and persisted runtime equality traces.

Latest local result: focused money tests `9 passed, 0 failed`; full backend
suite `173 passed, 0 failed, 9 skipped`; focused mobile payment-boundary tests
`3 passed, 0 failed`. PostgreSQL migration execution is pending because the
local Docker engine is unavailable.
