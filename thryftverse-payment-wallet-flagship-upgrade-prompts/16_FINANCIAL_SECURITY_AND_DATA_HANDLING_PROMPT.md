# Prompt — Financial Security, PCI Boundary and Data Handling

You are defining the security boundary for payment and wallet infrastructure.

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

## Required work

1. Document the cardholder-data environment and prove raw card data bypasses Thryftverse systems through provider SDK/tokenisation.
2. Remove PAN/CVV fields from source, analytics, crash reporting, logs, screenshots, session replay and support tooling.
3. Add structured redaction for provider secrets, client secrets, bank details, identity documents and webhook payloads.
4. Store secrets in a managed secret service with rotation, least privilege and environment separation.
5. Separate platform, connected-account and admin credentials.
6. Apply strong authentication and maker-checker control to refunds, payout approval, manual adjustments, reconciliation closure and feature activation.
7. Derive customer identity from auth claims; remove normal reliance on client-supplied `userId`.
8. Add object-level authorisation tests for every financial endpoint.
9. Use mTLS/private networking/service authentication for key and financial workers where deployed.
10. Encrypt sensitive bank/identity data with envelope encryption and auditable key rotation.
11. Add dependency/SAST/secret scanning and SBOM release gates.
12. Add tamper-evident financial audit events with actor, reason, correlation id and before/after state.
13. Define retention/deletion exceptions for financial and regulatory records.
14. Commission PCI QSA/acquirer guidance before launch; do not self-declare compliance.

## Abuse tests

IDOR across wallets/payment intents/payouts, forged provider IDs, replayed client secrets, admin token leakage, webhook spoofing, log leakage, request smuggling, race-based overspend and privilege escalation.
