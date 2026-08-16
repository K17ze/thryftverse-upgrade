# Prompt — Canonical Double-Entry Ledger

You are replacing multiple ledger-like stores with one auditable financial source of truth.

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

Implement a journal whose postings are immutable, atomically balanced by asset/currency and sufficient to reconstruct every wallet, escrow/payable, revenue, reserve, refund and payout balance.

## Required schema

Create forward migrations for:

- `financial_accounts` — account id, owner, account type, asset, normal side, status;
- `financial_journals` — immutable business event, operation type, idempotency key, request hash, effective time, correlation/causation ids, reversal-of id;
- `financial_postings` — journal id, account id, signed integer base-unit amount, posting role, metadata hash;
- `balance_projections` — derived available/pending/reserved balances with projection sequence;
- optional `journal_outbox` and `journal_audit_hashes`.

## Invariants

1. Sum of postings for each journal and asset equals zero.
2. At least two postings per financial journal.
3. No update/delete of committed journals or postings.
4. Corrections use reversing and replacement journals.
5. A business idempotency key maps to exactly one request hash and journal result.
6. Accounts cannot mix currencies/assets.
7. No negative available balance unless an explicitly approved credit/negative-balance account permits it.
8. Every materialised balance equals the posting sum at its sequence.
9. Database constraints/triggers or a deferred commit check enforce balance; application tests alone are insufficient.

## Chart of accounts

Define normal sides and ownership for at least:

- provider clearing cash;
- safeguarded/customer funds asset, where legally applicable;
- buyer wallet liability;
- wallet top-up pending;
- buyer order reservation;
- marketplace funds held pending delivery;
- seller payable;
- seller payout pending;
- platform fee revenue;
- payment provider fee expense;
- refunds payable/receivable;
- disputes/chargeback reserve;
- provider transfer clearing;
- bank payout clearing;
- 1ZE outstanding liability and closed-loop wallet liability.

Do not reuse “escrow” unless legal counsel and provider funds-flow support that term. Use precise internal account names such as `marketplace_funds_pending_delivery`.

## Migration from current models

- Inventory `ledger_entries`, `wallet_ledger`, `wallets`, `wallet_ize_operations` and balance snapshots.
- Produce a mapping and discrepancy report.
- Backfill journals deterministically; quarantine unbalanced history.
- Run a shadow ledger and compare after every event.
- Freeze legacy writes before cutover.
- Keep legacy tables read-only for audit retention until approved deletion.

## Tests

- property tests generate random valid event sequences and assert zero-sum journals;
- concurrent spend/payout never creates negative available balance;
- reversal restores the exact prior economic position;
- projection rebuild from genesis equals stored projection;
- corruption tests prove the database rejects unbalanced or mutable entries;
- multi-asset journals are split into independently balanced asset groups.

## Acceptance gate

Provide a machine-generated journal proof for a complete order: top-up/card charge, reservation, payment, delivery release, platform fee, seller payout, partial refund and chargeback.
