# Prompt — Marketplace Checkout, Wallet Funding and Split Tender

You are rebuilding checkout as an atomic server-owned funding workflow.

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

## Objective

Support card/payment-method checkout, wallet-only checkout and wallet-plus-provider split tender without duplicate orders, underpayment, overspend or stranded reservations.

## Required workflow

1. Server creates immutable order pricing from listing, fees, tax and shipping quote.
2. Server creates a funding plan with exact totals and currency.
3. Wallet amount is reserved atomically.
4. Remaining provider amount creates a PaymentIntent with order/funding-plan idempotency and metadata.
5. Frontend presents PaymentSheet and handles user action only.
6. Provider webhook confirms payment; one orchestration transaction captures wallet reservation and posts order settlement.
7. If provider payment fails/cancels/expires, wallet reservation releases.
8. If wallet capture fails after provider success, place the order in `funding_exception`, freeze fulfilment and run automated repair/refund—not silent success.
9. Delayed methods remain pending until provider settlement.
10. Order creation and payment retry use stable idempotency keys and request hashes.

## Remove unsafe behaviour

- Do not use `position.balances.userFiatValue` as available funds.
- Do not accept `platformChargeGbp`, shipping amount or wallet debit from the client as authoritative.
- Do not navigate to success from client confirmation alone.
- Do not create shipment until the funding state permits fulfilment.

## State machine

`draft -> priced -> funding_reserved -> provider_action_required -> funding_pending -> funded -> fulfilment_ready`

with `failed`, `cancelled`, `expired`, `funding_exception`, `refunding` and `refunded` paths.

## Tests

Cover card decline, SCA abandon, wallet balance changing between quote and reserve, duplicate tap, app kill, webhook delay, provider success plus DB outage, partial wallet, full wallet, delayed method and cancellation. Prove exactly one funded order and exact release/refund behaviour.
