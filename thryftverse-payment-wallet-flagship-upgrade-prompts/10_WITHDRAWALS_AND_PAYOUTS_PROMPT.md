# Prompt — Seller Withdrawals and Bank Payouts

You are implementing a truthful, idempotent payout state machine.

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

## Product boundary

First separate three concepts:

1. seller proceeds payout;
2. withdrawal of a fiat wallet balance, if legally/product-supported;
3. redemption of 1ZE, currently disabled in closed-loop mode.

Do not merge these into one “withdraw” button or promise.

## Required state machine

`requested -> risk_review -> reserved -> approved -> provider_transfer_created -> payout_created -> payout_paid`

with `rejected`, `provider_failed`, `payout_failed`, `reversed`, `cancelled`, `returned`, `manual_reconciliation`.

## Required work

1. Authoritative eligibility: KYC/KYB, country, payout account ownership, available seller payable, limits, sanctions/risk and reconciliation health.
2. Reserve funds atomically at request time.
3. Use exact provider operation naming and references. A Connect Transfer ID cannot serve as bank Payout ID.
4. Mark user-visible “paid to bank” only after `payout.paid` or equivalent authoritative provider event.
5. Handle external account disabled, bank return, payout failure, provider timeout and response loss.
6. Idempotency must survive process crash and provider success with missing local response.
7. Add cooldowns, velocity/amount limits, step-up authentication and beneficiary-change delay.
8. Encrypt bank/payout destination details, minimise storage and expose only masked display data.
9. Fees and FX are quoted and journaled separately; no hidden deductions.
10. Create operational queues for pending too long, failed, returned and reconciliation breaks.

## 1ZE rule

Keep 1ZE redemption endpoints disabled until product classification, liquidity/safeguarding model, provider rail and legal approval are complete. UI must show closed-loop restrictions plainly.

## Tests

Payout success, connected transfer success but bank payout pending, payout failed, bank account disabled, duplicate approval, provider timeout, name mismatch, limit breach, reconciliation pause and admin reversal. Prove funds cannot be spent twice while pending.
