# Prompt — Payment Provider and Country Capability Registry

You are replacing aspirational gateway configuration with runtime truth.

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

For every country, currency, channel and method, expose whether the capability is contracted, configured, tested and enabled. Do not infer full card-network or payout coverage from the presence of one Stripe secret key.

## Required work

1. Define provider adapters for create/retrieve/cancel/capture payment, setup method, refund, dispute retrieval, transfer, payout, balance transaction and reconciliation export.
2. Each unsupported operation throws a typed `CAPABILITY_NOT_IMPLEMENTED`; it must not create a local fake reference.
3. Build versioned tables/config for:
   - provider account/legal entity;
   - countries and settlement regions;
   - presentment and settlement currencies;
   - card brands and payment methods;
   - channels: commerce, wallet top-up, auction, Co-Own, seller payout;
   - refunds, partial refunds, disputes, transfers, external payouts;
   - minimum/maximum amounts and delayed-settlement behaviour;
   - `contracted`, `credentials_valid`, `sandbox_proven`, `live_enabled`, `degraded`.
4. Health checks must test provider authentication without moving funds.
5. Production startup validates every `live_enabled` capability, not merely one provider set.
6. Country policy returns only capabilities that pass all required gates.
7. Provider metadata must identify live/test mode and connected/platform account.
8. Establish a primary-provider and fallback strategy without attempting unsafe cross-provider continuation of one financial operation.

## Initial rollout

Prove one corridor completely before global expansion—recommended GB/GBP with Stripe Payments and Connect. Keep Razorpay, Mollie, Flutterwave, Tap and Wise disabled for money movement until each passes its own sandbox and legal/contract checklist.

## Evidence matrix

For Visa, Mastercard, Amex, Apple Pay, Google Pay, Link and every local method, provide provider dashboard configuration, test case, device/region result, refund result and dispute/payout applicability. Do not claim method support based only on documentation.
