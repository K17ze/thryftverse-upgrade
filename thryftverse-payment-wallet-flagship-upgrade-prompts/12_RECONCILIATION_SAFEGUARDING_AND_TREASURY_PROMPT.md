# Prompt — Reconciliation, Safeguarding and Treasury Control

You are turning reconciliation scaffolding into a complete operational control system.

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

## Regulatory caution

Determine with qualified UK payments counsel whether Thryftverse receives/holds “relevant funds”, issues e-money or operates under a regulated partner model. FCA safeguarding obligations apply based on legal/business structure, not database labels. Build controls capable of supporting the applicable model without claiming authorisation.

## Required reconciliation layers

1. **Internal journal:** every journal balances and projections rebuild exactly.
2. **Provider sub-ledger:** charges, refunds, disputes, balance transactions, transfers, reversals, payouts and fees match internal records.
3. **Bank/safeguarding resources:** provider/bank statement balances match customer liability and clearing positions.
4. **1ZE closed-loop supply:** user liabilities, outstanding supply and allowed backing/liquidity policy reconcile by base units.

## Required work

- ingest provider balance transactions and reports with immutable source-file hashes;
- map provider objects to internal journals by durable references;
- calculate expected vs actual by currency/account/day;
- create reconciliation runs, line-level breaks, owner, severity, ageing and resolution journals;
- never “fix” a mismatch by editing historical ledger rows;
- auto-pause affected capabilities on material breaks;
- add maker-checker approval for manual adjustments;
- preserve evidence and retention policies;
- generate daily reconciliation and monthly governance reports;
- build resolution-pack exports if the regulated model requires them;
- monitor provider receivables, settlement timing, reserves and liquidity.

## Tolerances

Financial principal tolerances are zero base units. Timing differences are classified—not netted away—and must clear within stated SLAs. Fee/FX differences use explicit expected models and approved thresholds.

## Tests

Synthetic provider report with missing charge, duplicate payout, partial refund, fee mismatch, delayed settlement, wrong currency and bank return. Prove auto-pause, break creation, repair journal and complete audit evidence.
