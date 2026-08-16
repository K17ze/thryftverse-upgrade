# Prompt — KYC/KYB, AML, Fraud, Limits and Financial Risk

You are converting compliance scaffolding into enforceable, reviewable controls.

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

Prevent payment, wallet and payout activation unless identity, jurisdiction and risk requirements for the exact product are satisfied.

## Required work

1. Define capability-specific eligibility policies for buy, top-up, wallet spend, P2P/market transfer, sell, payout and high-risk review.
2. Integrate signed KYC/KYB provider results; local status is a projection, not manually trusted.
3. Add sanctions/PEP/adverse-media provider strategy where legally required, with rescreening cadence.
4. Build transaction-monitoring rules across cards, accounts, devices, beneficiaries, velocity, rapid top-up-and-cash-out, collusion, auction manipulation and Co-Own wash trading.
5. Integrate provider fraud signals such as Stripe Radar outcomes without assuming they cover internal wallet transfers.
6. Create risk decisions: allow, step-up, hold, manual review, reject, suspend.
7. Enforce limits atomically in the same transaction as reservation/movement.
8. Add beneficiary ownership verification and change cooldown.
9. Add device/session risk, account takeover controls and step-up authentication for sensitive changes.
10. Build case management with immutable evidence, reviewer, decision reason and SAR/escalation fields where applicable.
11. Separate fraud loss, credit loss, dispute reserve and operational adjustment accounts.
12. Ensure no sensitive compliance data leaks to normal logs or clients.

## Tests

Rule boundary tests, concurrent velocity attempts, KYC status changes mid-flow, sanctions hit, payout beneficiary change, device takeover, rapid top-up/payout, linked-account abuse and false-positive review release.
