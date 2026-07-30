# Prompt — Financial Migration, Shadow Ledger and Controlled Rollout

You are migrating live-like financial data without rewriting history or losing traceability.

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

Move from legacy payment methods, multiple ledgers and ambiguous balances to the canonical system through reversible, observed stages.

## Required plan

1. Inventory all legacy tables/routes/jobs/screens and classify: migrate, bridge, read-only archive or remove.
2. Add new schema with no behavioural activation.
3. Backfill canonical provider references and journals; quarantine unverifiable records.
4. Run shadow posting for every new event.
5. Compare legacy and canonical balances continuously; zero unexplained principal variance.
6. Disable raw-card and fake-payment-method creation immediately, even before full migration.
7. Switch reads to canonical projections behind a flag.
8. Enable one internal/test cohort, then sandbox staff, then tiny live canary only after approval.
9. Enable GB/GBP/card first; add methods/countries separately.
10. Cut legacy writes, preserve immutable archive and remove fallback mocks.
11. Maintain independent kill switches and rollback to read-only-safe mode—not to unsafe legacy writes.
12. Publish user migration UX for payment methods that must be re-added.

## Migration artefacts

- row-count and amount-control totals;
- per-user discrepancy report;
- journal backfill manifest and hash;
- rollback SQL/procedure;
- feature flag matrix;
- canary cohort and success thresholds;
- incident owner and go/no-go record.

## Go/no-go

No live rollout with unresolved P0 finding, unbalanced journal, unverified webhook, nonzero unexplained reconciliation break, incomplete provider failure drill or misleading customer copy.
