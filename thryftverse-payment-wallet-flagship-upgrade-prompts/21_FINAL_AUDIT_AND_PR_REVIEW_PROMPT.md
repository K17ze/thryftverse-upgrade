# Final Prompt — Independent Payment and Wallet Release Audit

You are an independent principal reviewer. You did not implement the changes. Audit the latest branch against this entire prompt pack and reject unsupported claims.

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

## Review method

1. Record latest branch/SHA and compare against the audited baseline.
2. Read every changed migration, payment route, provider adapter, journal function, wallet/payout flow and mobile payment component.
3. Trace these scenarios end to end:
   - save Visa/Mastercard/Amex payment method;
   - Apple Pay/Google Pay where enabled;
   - card purchase;
   - wallet top-up;
   - wallet-only and split-tender purchase;
   - delivery release;
   - seller payout to bank;
   - partial refund;
   - dispute lost after payout;
   - payout failure/return;
   - auction settlement;
   - Co-Own partial fill.
4. Verify code, schema, provider sandbox artefacts and reconciliation evidence independently.
5. Run all tests and add adversarial tests where coverage is weak.
6. Search for raw card fields, floats, mutable balances, fake provider ids, mocks, fail-open verification, user-controlled amounts/userIds, unsafe admin routes and misleading copy.
7. Recalculate journal balance and provider reconciliation from exported evidence.
8. Score every row in `20_ACCEPTANCE_MATRIX.md` as PASS/FAIL/UNPROVEN/N/A.

## Mandatory rejection conditions

Reject release if any P0 criterion fails, provider credentials/capabilities are merely configured rather than proven, transfer is called bank payout, partial refunds reverse full amounts, general wallet withdrawal is advertised while disabled, or live proof is substituted with mocks/unit tests.

## Output

Create `docs/payments-flagship-reconstruction/INDEPENDENT_RELEASE_AUDIT.md` containing:

- executive verdict and score;
- critical/high/medium findings with exact path and evidence;
- acceptance matrix;
- tested command results;
- provider evidence reviewed;
- reconciliation control totals;
- required fixes in priority order;
- explicit `RELEASE APPROVED` or `RELEASE BLOCKED` statement with scope/corridors.
