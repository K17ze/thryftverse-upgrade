# Prompt — Wallet Balances, Holds and Atomic Reservations

You are building wallet integrity on top of the canonical journal.

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

Expose truthful balances and prevent overspending across checkout, auction bids, Co-Own orders, transfers and payouts.

## Balance model

For each asset expose:

- `ledgerBalance` — all committed postings;
- `pendingInbound`;
- `pendingOutbound`;
- `reserved`;
- `availableToSpend`;
- `sellerPendingRelease`;
- `sellerAvailableForPayout`;
- `withdrawalPending`;
- `disputedOrFrozen`;
- `displayValuation` separately, never as spendable funds.

## Required work

1. Build `holds`/`reservations` with amount, asset, purpose, owner, expiry, state and idempotency.
2. Reserve in the same serialisable transaction that validates available balance.
3. Add state transitions: `created`, `active`, `captured`, `released`, `expired`, `cancelled`.
4. Use database row/advisory locking or serialisable retry policy per wallet/account.
5. Expiry workers must be idempotent and journal-backed.
6. Checkout, bids and Co-Own orders must call a server funding/reservation API; never compare client balance.
7. Payout request creation moves seller payable to payout pending atomically.
8. Failed payout/rejected order releases the exact reservation through a reversal journal.
9. Define whether top-up funds are spendable before provider settlement. Default to no for delayed methods.
10. Remove runtime mock balances from production and test builds that can connect to shared environments.

## APIs

- `GET /v2/wallet/balances`
- `POST /v2/wallet/reservations`
- `POST /v2/wallet/reservations/:id/capture`
- `POST /v2/wallet/reservations/:id/release`
- business-specific endpoints should encapsulate these rather than exposing arbitrary movement to clients.

## Tests

Run 100+ concurrent attempts against one balance, process crashes between reserve/capture, duplicate expiry jobs, cancellation during provider callback, and simultaneous payout plus purchase. Assert no overspend, no stranded hold and exact journal reconstruction.
