# P0 Prompt — Webhook Integrity, Idempotency and Simulation Containment

You are hardening every asynchronous financial entry point.

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

Build a fail-closed webhook inbox and ensure no test simulation can transition production money states.

## Required work

1. Move manual/simulated payment and payout routes into a test-only plugin that is not registered or bundled in production.
2. Reject provider webhooks when required verification material is absent. Never fall back to accepting an unverified payload after provider lookup failure.
3. Reimplement every provider verifier from the current official specification:
   - Stripe raw-body signature and timestamp tolerance;
   - Razorpay HMAC with timing-safe comparison;
   - Mollie recommended authenticity/retrieve workflow;
   - Flutterwave current signature scheme with timing-safe comparison;
   - Tap current hash/signature canonicalisation;
   - Wise public signing key/key-id verification and key rotation.
4. Persist an immutable webhook inbox record before business processing with provider account, livemode, event id, object id, API version, received timestamp, raw body hash, verification key id and processing status.
5. Acknowledge rapidly after durable persistence. Process through a queue with retries, exponential backoff and dead-letter state.
6. Support duplicate and out-of-order events. State transitions must compare provider object version/timestamp and retrieve authoritative provider state when necessary.
7. Store processing attempts and last error separately; never mutate/delete the original event.
8. Add idempotency request hashes. Reusing a key with different parameters must return a conflict, not an old unrelated response.
9. Introduce an outbox so notifications, shipment creation and provider side effects are not lost after a database commit.
10. Redact raw payloads in logs and set retention/access policy.

## Specific regression cases

- duplicate `payment_intent.succeeded`;
- `succeeded` before `processing`;
- refund before payment event lookup;
- partial refund followed by another partial refund;
- dispute lost after seller release;
- transfer created but response lost;
- payout failed after transfer succeeds;
- webhook secret missing;
- stale replay outside timestamp tolerance;
- same idempotency key with changed amount/order.

## Acceptance gate

Run provider CLI/sandbox webhook replay suites and demonstrate exactly-once financial effects under at-least-once event delivery. “Exactly once” applies to journal impact, not receipt count.
