# Prompt — Unified Commerce, Auction and Co-Own Settlement

You are eliminating separate economic truths across marketplace departments.

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

All commerce, auction and Co-Own financial events must use the same journal, holds, provider orchestration, risk controls and reconciliation framework while retaining domain-specific state machines.

## Commerce

- reserve listing inventory and buyer funding atomically;
- payment success moves funds to pending-delivery liability;
- verified delivery/collection plus dispute window releases seller payable;
- cancellation/return/refund posts exact reversals;
- seller payout uses the common payout engine.

## Auction

- bid placement requires a payment-method validity/risk strategy or wallet hold according to policy;
- prevent bid amounts exceeding verified/reservable capacity where required;
- winner settlement is idempotent and handles payment failure/retry/runner-up policy;
- seller release follows fulfilment policy;
- auction fees are separate postings.

## Co-Own

- order placement reserves cash or units;
- matching atomically transfers units and consideration in one journal/settlement transaction;
- partial fills adjust only the filled reservation and leave/release remainder correctly;
- no short sale or negative units unless explicitly designed;
- cancellation releases outstanding reservation;
- buyout acceptance and settlement are unit-conserving and cash-balanced;
- ownership ledger and money journal reconcile per trade.

## Global invariants

- no listing can settle twice;
- no asset units are created/destroyed outside authorised issuance/burn events;
- cash and unit reservations survive concurrency;
- fees cannot exceed consideration;
- every domain event has correlation to journal, payment/provider and fulfilment evidence.

## Tests

High-contention auction close, Co-Own partial fills, simultaneous cancel/fill, delivery webhook duplication, payment success with inventory conflict, refund after payout and buyout conservation proofs.
