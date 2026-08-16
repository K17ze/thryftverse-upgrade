# Prompt — Financial Testing, Chaos and Provider Replay

You are proving correctness, not merely increasing test count.

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

## Test pyramid

1. Pure domain tests for money, fees, FX and transitions.
2. Database invariant/integration tests against real PostgreSQL.
3. Concurrency/property tests.
4. Provider adapter contract tests with recorded/synthetic official fixtures.
5. Stripe CLI/provider sandbox end-to-end tests.
6. Mobile PaymentSheet/device tests.
7. Reconciliation and operational drills.

## Mandatory scenarios

- duplicate requests with same/different request hash;
- duplicate and out-of-order webhook events;
- app/server crash at every boundary;
- provider timeout before/after provider success;
- database deadlock and serialisation retry;
- 100 concurrent spends/payouts on one balance;
- SCA success/failure/abandon;
- delayed payment settlement;
- partial/multiple refunds;
- dispute open/won/lost after seller release;
- transfer reversal;
- external payout failed/returned;
- stale FX quote;
- provider report mismatch;
- queue loss/replay;
- reconciliation pause and recovery.

## Fault injection

Add controllable fault points after provider call, before DB commit, after DB commit, before outbox publish and during webhook processing. Each fault must have a deterministic recovery assertion.

## Test data rules

Never use real card/bank data. Use provider test tokens/accounts. Redact fixtures. Keep test and live provider objects impossible to mix.

## Release evidence

Generate a machine-readable report mapping test id to invariant, provider, environment, result, journal ids and reconciliation status. A green unit suite alone cannot approve launch.
