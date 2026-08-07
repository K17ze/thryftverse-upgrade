# Prompt — Stripe Connect Marketplace Funds Flow

You are defining the real seller money lifecycle. Do not equate Stripe transfers with external bank payouts.

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

Choose and implement one documented Connect charge model for the GB launch, with explicit merchant-of-record, fee, refund, dispute, negative-balance and cross-border responsibilities.

## Required decisions

Create an ADR comparing:

- separate charges and transfers;
- destination charges;
- direct charges.

Record who is merchant of record, whose statement descriptor appears, who pays Stripe fees, who owns refunds/chargebacks, and which countries/currencies are supported. Obtain business/legal sign-off before live activation.

## Required work

1. Rebuild connected-account onboarding using current account links/sessions and webhook-driven capability status.
2. Store provider account state as a projection; retrieve live state for sensitive actions.
3. Set payout schedule deliberately. If funds must remain unavailable until delivery, do not transfer them early unless the provider product and account configuration enforce the desired hold.
4. Link transfers to the originating charge using transfer group/source transaction where the chosen architecture requires it.
5. Record distinct internal/provider states:
   - platform charge pending/available;
   - internal seller amount pending delivery;
   - seller payable released;
   - Connect transfer created/failed/reversed;
   - connected balance available;
   - external payout created/paid/failed/cancelled.
6. Subscribe to both platform and connected-account webhook streams.
7. Implement transfer reversal for refunds/disputes where permitted and track unrecoverable negative balance.
8. Remove hard-coded GB/GBP defaults from schema; derive from verified account data.
9. Do not call Stripe Connect balance segregation “escrow” unless the actual provider product/legal arrangement supports that term.
10. Reconcile every charge, balance transaction, transfer, reversal and payout.

## Acceptance gate

Provide Stripe test-mode evidence for onboarding, payment, delayed seller release, transfer, external payout, payout failure, partial refund after transfer, dispute loss and transfer reversal. The internal journal must match Stripe balance transactions for each scenario.
