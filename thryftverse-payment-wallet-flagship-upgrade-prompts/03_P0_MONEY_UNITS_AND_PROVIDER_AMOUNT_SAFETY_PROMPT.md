# P0 Prompt — Canonical Money Units and Provider Amount Safety

You are eliminating currency and amount ambiguity before further payment work.

## Repository operating context

- Repository: `K17ze/thryftverse-upgrade`
- Begin by fetching the latest remote state and recording branch name plus starting SHA.
- The audited reference was `main` at `ec41383dacafe88ed443dd27fefe772c85d2a587`; do not assume it remains current.
- Read `README.md`, `backend/README.md`, all payment/wallet migrations, `backend/api/src/index.ts`, provider libraries, checkout/wallet services and existing tests before editing.
- Do not trust comments, route names or UI labels as proof of behaviour. Trace every flow to provider call, database transaction, webhook and ledger posting.

## Global financial constraints

- Never store, log, transmit or expose raw PAN, CVV/CVC or magnetic-stripe data.
- Use integer minor units for fiat and integer base units for 1ZE; never use JavaScript floating point as the accounting source of truth.
- Never mutate a balance without an immutable journal event in the same database transaction.
- Every financial write requires a request hash and idempotency key.
- Every provider event must be signature-verified from the exact raw body, persisted before processing, replayable and safe under duplicates/out-of-order delivery.
- Frontend success is never authoritative; provider webhook plus reconciliation determines final settlement.
- Do not call a transfer a payout, a liability an escrow, or a displayed valuation an available balance.
- No mock, simulation, fallback balance or fabricated provider reference may execute when `NODE_ENV=production`.
- Preserve backwards compatibility only when it does not preserve unsafe money semantics. Prefer explicit versioned endpoints and migration adapters.

## Mandatory delivery evidence

Return:

1. starting and final SHA;
2. exact changed files;
3. schema and state-machine diagrams;
4. tests added and exact pass/fail counts;
5. commands run;
6. provider test artefacts with secrets redacted;
7. migration and rollback procedure;
8. unresolved risks and intentionally disabled capabilities;
9. a final statement distinguishing static correctness, provider-sandbox proof and live-production proof.

## Confirmed defect

The API accepts a numeric `amountGbp` and a separate `amountCurrency`. Provider adapters can multiply that number by 100 and send it in the selected currency. This permits catastrophic denomination errors. Webhook payloads also mix provider minor-unit integers and decimal major-unit values.

## Objective

Make it impossible to create, settle, refund or pay out an amount whose currency, exponent or source valuation is ambiguous.

## Required work

1. Introduce a shared `Money` domain type:
   - `currency: ISO-4217 code`;
   - `minorAmount: bigint/string integer`;
   - `exponent` resolved from a versioned currency registry;
   - no binary float in persistence or financial calculations.
2. Introduce `AssetAmount` for 1ZE using integer base units and explicit scale.
3. Rename/remove every API field that combines a GBP name with arbitrary currency.
4. For commerce orders, the server derives the charge amount and currency from immutable order pricing. The client cannot override either.
5. For wallet top-up, create a quote with source currency, target 1ZE base units, fees, FX rate, expiry and quote hash; PaymentIntent must reference the quote.
6. Add provider converters:
   - Stripe/Razorpay integer minor units;
   - Mollie decimal string with currency exponent;
   - Flutterwave/Tap provider-specific decimal rules;
   - Wise quote/transfer units per official contract.
7. Normalise webhook amounts at the provider boundary and persist both raw and canonical values.
8. Add database checks ensuring currency matches account asset and all amounts are integers in canonical columns.
9. Retire `NUMERIC(18,6)` as the universal amount model; use integer base units plus explicit asset/currency.
10. Add overflow and maximum transaction limits.

## Migration

- Add canonical columns alongside legacy columns.
- Backfill with explicit currency and deterministic rounding reports.
- Compare old/new amounts for every historical record.
- Quarantine rows where currency or units cannot be proven.
- Dual-read for a limited shadow period, then remove legacy write paths.

## Tests

Use property-based cases for GBP, EUR, USD, INR, AED, NGN and zero/three-decimal currencies. Prove round-trip conversion, fee allocation, partial refund and FX quote calculations. Add regression tests proving that `£10.00` cannot become `10 INR`, `1,000 INR` or `£1,000` through adapter conversion.

## Acceptance gate

Every provider request and webhook record must expose a trace containing canonical amount, provider amount, conversion function/version and exact equality proof.
