# Prompt — Refunds, Disputes, Chargebacks and Negative Balances

You are completing the loss and reversal side of the payment lifecycle.

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

## Confirmed defects to close

- the payment owner can directly request a refund without an order-policy workflow;
- only Stripe dispatches a live refund while other providers can create local pending records;
- webhook processing can reverse the full order ledger for a partial refund;
- transfer/payout reversal and seller recovery are incomplete.

## Required work

1. Refund requests originate from cancellation, return, support/dispute case or privileged operations—not direct PaymentIntent ownership.
2. Implement provider adapter `createRefund`, `retrieveRefund` and webhook mapping or mark capability unavailable.
3. Track cumulative refundable amount and enforce `sum(successful + pending refunds) <= captured amount` in canonical units.
4. Journal each partial refund exactly; never reverse full order economics unless full refund.
5. Allocate refund across seller payable/paid proceeds, platform fees, shipping and provider fees according to documented policy.
6. If seller funds were transferred, reverse transfer where possible; otherwise create seller negative balance/receivable and reserve future proceeds.
7. Disputes need lifecycle, evidence deadline, evidence artefacts, owner, risk action and journaled provisional/lost/won effects.
8. Freeze affected seller amounts while dispute is open according to risk policy.
9. Handle chargeback fees separately.
10. Build customer and seller notifications with truthful status.
11. Add no-double-refund and duplicate-webhook invariants.
12. Provide operational dashboards for due evidence, lost disputes and unrecovered seller balances.

## Tests

- two partial refunds then final remainder;
- refund races with payout;
- dispute opens after delivery release;
- dispute won and lost;
- transfer reversal succeeds/fails;
- provider refund accepted then later fails;
- duplicate refund webhook;
- different-currency refund with exact provider conversion.
