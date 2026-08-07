# Prompt — Multi-Currency, FX and Local Payment Methods

You are preventing global feature claims from outrunning provider, currency and regulatory truth.

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

Expand only after GB/GBP is fully proven. Every new currency/method must have exact amount semantics, provider support, settlement ownership, refund/dispute behaviour and reconciliation.

## Required work

1. Maintain ISO currency exponent registry and provider overrides.
2. Distinguish presentment, settlement, ledger and payout currencies.
3. Build signed/versioned FX quotes with source, bid/ask, spread, fees, expiry and rounding policy.
4. Never use a gold/XAU cross rate as a generic payout FX mechanism unless that is the approved product design and provider execution genuinely follows it.
5. Add local method capability data: synchronous/delayed, reversible, chargebackable, mandate requirements, refund SLA and customer action.
6. Provider adapter must preserve exact local method status.
7. Wallet credit waits for final/approved settlement policy, especially for delayed or reversible methods.
8. Reconciliation runs per currency; no silent conversion to GBP for accounting.
9. Country rollout requires provider contract, legal review, sandbox evidence, live canary and support runbook.
10. Disable hard-coded corridors that are not live-proven.

## Rollout dossiers

Create one dossier each for GB/GBP Stripe, India/INR Razorpay, EEA/EUR provider, Gulf/AED Tap, Africa corridors/Flutterwave and Wise payout use. A dossier must include legal entity, supported methods, fees, settlement, refunds, disputes, payout rail, webhooks, limits and failure drills.
