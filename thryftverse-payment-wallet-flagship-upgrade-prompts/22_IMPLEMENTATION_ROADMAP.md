# Payment and Wallet Flagship Implementation Roadmap

This roadmap turns the prompt pack into controlled delivery waves. It is ordered by financial risk, not visual priority.

## Wave 0 — Freeze unsafe claims and flows

**Branch:** `payments/w0-safety-freeze`

- hide/disable the legacy add-card form;
- disable production simulation/manual terminal payment routes;
- remove misleading “encrypted”, “escrow”, “withdrawable” and “instant” claims where unproven;
- make wallet top-up, wallet spending and payouts independently kill-switchable;
- publish a current capability status document.

**Exit:** no customer can enter raw card data into a Thryftverse-owned field; no production route can fabricate settlement.

## Wave 1 — Tokenised payment collection

**Branch:** `payments/w1-tokenised-methods`

Run prompt `02`. Implement Stripe React Native PaymentSheet/Payment Element, Customer, CustomerSession and SetupIntent. Replace display-only payment method records with provider-bound projections.

**Exit:** Visa, Mastercard and Amex test methods are added through Stripe SDK and no PAN/CVV touches Thryftverse application code or API traffic.

## Wave 2 — Canonical money type

**Branch:** `payments/w2-money-units`

Run prompt `03`. Introduce integer minor/base-unit types, currency registry and provider converters. Version APIs that currently accept `amountGbp` plus an arbitrary currency.

**Exit:** provider request/response traces prove exact unit conversion for every enabled currency.

## Wave 3 — Webhook inbox and side-effect isolation

**Branch:** `payments/w3-webhook-inbox`

Run prompt `04`. Revalidate provider signatures, persist before process, queue work, add outbox and request-hash idempotency.

**Exit:** duplicate/out-of-order replay causes exactly one financial effect and production contains no simulation plugin.

## Wave 4 — Canonical journal

**Branch:** `payments/w4-canonical-journal`

Run prompt `05`. Introduce immutable balanced journals/postings and shadow-post current events.

**Exit:** database rejects unbalanced journals and all shadow balances reconcile to known legacy balances or quarantined differences.

## Wave 5 — Holds and authoritative balances

**Branch:** `payments/w5-holds-reservations`

Run prompt `06`. Add available/pending/reserved/frozen semantics and atomic reservation.

**Exit:** high-concurrency tests prove no overspend or double payout.

## Wave 6 — Provider capability truth

**Branch:** `payments/w6-provider-registry`

Run prompt `07`. Build the contracted/configured/tested/live capability registry. Start with GB/GBP Stripe only.

**Exit:** the API never advertises a method or payout corridor that lacks evidence.

## Wave 7 — Checkout and marketplace funding

**Branch:** `payments/w7-checkout-funding`

Run prompt `08`. Server-owned pricing/funding plan, wallet reservation and provider PaymentSheet orchestration.

**Exit:** card-only, wallet-only and split-tender sandbox scenarios pass all crash/retry cases.

## Wave 8 — Seller release and Connect

**Branch:** `payments/w8-connect-settlement`

Run prompt `09`. Approve merchant-of-record/charge model ADR, delayed seller release, transfer and connected webhook architecture.

**Exit:** transfer is linked to charge and distinct from bank payout; refunds/disputes can recover seller funds according to policy.

## Wave 9 — Bank payouts and post-payment loss

**Branches:** `payments/w9-bank-payouts`, `payments/w9-refunds-disputes`

Run prompts `10` and `11` sequentially against the same canonical journal.

**Exit:** external `payout.paid` controls “paid to bank”; partial refunds and disputes post exact, reversible economics.

## Wave 10 — Reconciliation, risk and regional dossiers

**Branches:** `payments/w10-reconciliation`, `payments/w10-risk`, `payments/w10-regions`

Run prompts `12`, `13` and `14`. These may be developed separately only after the journal/API contracts are frozen.

**Exit:** daily internal/provider reconciliation is zero-break for sandbox cases; risk gates are transactional; unproven regions remain disabled.

## Wave 11 — Commerce, auction and Co-Own convergence

**Branch:** `payments/w11-market-settlement`

Run prompt `15` and migrate every marketplace department to the common journal/hold engine.

**Exit:** cash and units conserve under partial fills, auction contention, refunds and payout races.

## Wave 12 — Security, operations and release proof

**Branches:** `payments/w12-security-ops`, `payments/w12-chaos-release`

Run prompts `16`–`21`. Execute migration/canary plan and independent final audit.

**Exit:** every applicable row of `20_ACCEPTANCE_MATRIX.md` has linked evidence and the independent reviewer explicitly approves the exact corridor/features being released.

## Commit discipline

Each wave should use focused commits:

1. migration/domain types;
2. backend orchestration;
3. provider adapter;
4. frontend integration;
5. tests/fixtures;
6. operations/docs;
7. acceptance evidence.

Never mix visual polish with financial state changes in the same commit. Never squash away migration or incident evidence required for review.
