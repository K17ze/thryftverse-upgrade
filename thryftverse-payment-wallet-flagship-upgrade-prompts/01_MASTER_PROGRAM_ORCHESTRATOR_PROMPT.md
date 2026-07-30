# Master Prompt — Payment and Wallet Flagship Reconstruction

You are the principal payments architect, staff backend engineer, financial-ledger engineer, security engineer and release owner for Thryftverse. Execute a staged reconstruction of the payment, wallet, seller settlement and payout departments. Do not perform a cosmetic patch. Build a coherent financial system whose claims are proven by code, database invariants and provider-sandbox evidence.

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

## Mission

Transform the current partial payment stack into a production-candidate marketplace money platform. The system must support tokenised card and wallet methods, wallet top-up, atomic checkout funding, seller proceeds, delivery-based release, refunds, disputes and verified bank payout without balance drift or ambiguous states.

## Programme rules

- Create a dedicated programme branch from the latest intended integration branch.
- Implement one numbered prompt per focused commit series.
- Before every phase, rerun the preceding phase’s invariant tests.
- Do not activate a country/provider combination merely because credentials exist.
- Use feature flags with default deny for every new money movement.
- Run schema changes through forward-only migrations; never edit already-applied migrations.
- Add a kill switch for payment creation, top-ups, wallet spending, transfers and payouts independently.
- Use an outbox for provider/queue side effects that must occur after a database commit.

## Required phase order

1. Remove raw card capture and fake saved cards.
2. Replace generic floating amounts with canonical Money/base-unit types.
3. isolate test simulation and harden webhooks.
4. Introduce the canonical journal and balance projections.
5. Build reservations/holds and authoritative available balances.
6. Rebuild provider capabilities and payment-method orchestration.
7. Rebuild checkout and split tender.
8. Define Stripe Connect charge/transfer/payout ownership.
9. Rebuild withdrawals/payouts.
10. Complete refunds/disputes/negative balances.
11. Reconcile against providers and safeguarding resources.
12. Complete KYC/AML/fraud/limits.
13. Integrate commerce, auction and Co-Own settlement.
14. Add operations, chaos tests, migration and release gates.

## Architecture decision records required

Create ADRs covering:

- merchant of record and charge type;
- legal owner of funds at every state;
- whether 1ZE is closed-loop value, e-money, loyalty value or another product classification pending counsel;
- canonical ledger and account normal-balance conventions;
- seller release policy;
- provider and regional strategy;
- payout lifecycle;
- safeguarding and reconciliation boundary;
- data retention and PCI scope.

## Stop conditions

Stop activation—not development—when any of these is unresolved:

- merchant-of-record or regulatory classification;
- provider contract does not permit the proposed marketplace/top-up flow;
- journal cannot prove balanced postings;
- card data can touch app state outside an approved provider SDK component;
- provider sandbox cannot prove refund and payout failure paths;
- reconciliation mismatch exceeds zero tolerance for synthetic tests;
- no rollback/kill switch exists.

## Final programme output

Create `docs/payments-flagship-reconstruction/FINAL_REPORT.md` mapping every acceptance criterion in `20_ACCEPTANCE_MATRIX.md` to evidence. Do not mark a criterion complete using only a unit test where provider-sandbox or operational evidence is required.
