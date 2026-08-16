# Prompt — Payment Observability, Admin Operations and Incidents

You are building the operating system required to safely run money movement.

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

## Required telemetry

- intent/attempt counts and latency by provider/status/country/method;
- webhook verification failures, lag, retries and dead letters;
- journal commit failures and invariant violations;
- hold ageing and stranded reservations;
- settlement/reconciliation breaks by amount and age;
- refund/dispute exposure and evidence deadlines;
- seller payable, payout pending, payout failure/return;
- provider balance and liquidity thresholds;
- risk-review queues and SLA;
- feature-kill-switch state.

## Admin requirements

1. Read-only financial timeline joining business event, journal, provider objects, webhooks and reconciliation.
2. No arbitrary balance edit. Adjustments require a balanced journal, reason, ticket and two-person approval.
3. Safe actions: retry processing, replay event, retrieve provider state, release expired hold, approve/reject reviewed payout, initiate policy refund.
4. Every action is idempotent and audited.
5. Role separation: support, risk, finance, engineering and super-admin.
6. Mask sensitive data by role.

## Incident runbooks

Create runbooks for provider outage, webhook backlog, duplicate settlement, suspected balance drift, leaked key, payout failure spike, safeguarding shortfall, chargeback surge, compromised account and reconciliation mismatch. Include kill switches, customer impact, evidence preservation, communications and recovery validation.

## SLOs

Define measurable availability and processing-lag SLOs. Money correctness takes precedence over speed; degraded mode must stop unsafe writes while preserving reads and inbound webhook durability.
