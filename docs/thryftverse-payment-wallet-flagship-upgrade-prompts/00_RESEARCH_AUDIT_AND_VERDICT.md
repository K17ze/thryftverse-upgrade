# Payment and Wallet Research Audit

## Scope and limitations

This is a static code audit of `K17ze/thryftverse-upgrade` at `ec41383dacafe88ed443dd27fefe772c85d2a587`. It covers backend payment providers, payment intents, webhooks, saved payment methods, wallet/1ZE, ledger structures, payout requests, Stripe Connect, checkout and reconciliation code. It does **not** prove that live funds can be loaded or withdrawn. Proof requires provider test/live credentials, signed webhook deliveries, connected bank accounts, settlement reports, database snapshots and end-to-end execution.

## Executive conclusion

**Overall flagship readiness: 3/10. Production financial readiness: blocked.**

The system is beyond a mock-only prototype, but several P0 issues can create misleading UX, incorrect money movement or unverifiable balances. The architecture should be treated as a set of partial foundations rather than a coherent money platform.

## Evidence-based findings

### P0 — raw card capture and false saved-card semantics

`frontend/src/components/checkout/AddCardSheet.tsx` holds full card number, expiry and CVV in React state. On save, it extracts the last four digits, hard-codes the brand as Visa and posts only a label/details record. `backend/api/src/index.ts` stores that display metadata in `user_payment_methods`; it does not bind the record to a Stripe Customer, SetupIntent or provider PaymentMethod.

Impact:

- the app handles sensitive card data without a provider tokenisation component;
- a saved “card” cannot authorise a real payment;
- Visa/Mastercard/Amex support is not proven by this saved-card flow;
- the “encrypted and secure” UI copy is not supported by the implementation.

Required closure: use the official React Native PaymentSheet/Payment Element and SetupIntent/CustomerSession flow; the app and API must never receive raw PAN or CVV.

### P0 — money unit and currency corruption risk

`POST /payments/intents` accepts `amountGbp` and a separately supplied `amountCurrency`. `createGatewayPaymentIntent` multiplies `amountGbp` by 100 for Stripe and Razorpay while sending the separately selected currency. This can charge the numeric GBP value as INR, USD or another currency. Provider webhook amounts also have inconsistent semantics: Stripe and Razorpay commonly emit integer minor units, while other adapters may emit decimal major units.

Required closure: introduce a canonical `Money` value (`currency`, integer `minorAmount`, exponent) and provider-specific converters. Never infer units from a generic number.

### P0 — simulated and manually finalised payment paths

`POST /payments/intents/:intentId/confirm` accepts `simulateStatus`. Production blocks non-admin terminal simulation, but the route still exists in the primary API and can manually transition to processing. Test simulation must be compiled/routed separately and unavailable in production binaries and route tables.

### P0 — refund authority and accounting

A normal authenticated owner of a succeeded payment intent can call the refund endpoint. Refund approval should be governed by order cancellation/dispute policy and privileged workflows, not ownership of the original PaymentIntent alone. Only Stripe has a live refund call; other gateways can create a local pending refund without dispatching a provider operation. On refund webhook success, the code can reverse the full order ledger using the full intent amount even when the refund event is partial.

### P0 — Connect transfer is not a bank payout

`stripePayouts.ts` creates `stripe.transfers.create`. The admin approval flow then marks the payout request `paid`. A transfer moves funds from the platform balance to a connected Stripe balance; an external payout to the seller’s bank has a separate asynchronous lifecycle and webhook events. The internal state machine must distinguish:

`requested -> reserved -> approved -> provider_transfer_created -> connected_balance_available -> payout_created -> payout_paid`

and failure/reversal variants.

### P0/P1 — no enforced double-entry journal

`ledger_entries` stores individual debit/credit rows with a counterparty reference, but there is no immutable journal header and no database constraint ensuring every journal balances by asset/currency. `appendLedgerEntry` can default an omitted amount to zero. 1ZE minting writes credits to both the user wallet and platform outstanding account. A second `wallet_ledger` and mutable `wallets` balances coexist, creating multiple candidate sources of truth.

Required closure: one append-only journal with atomic postings, integer asset units, journal idempotency and deferred balance enforcement.

### P1 — spendability and reservation are not authoritative

Checkout fetches `userFiatValue` and uses it to decide whether wallet balance covers an order. A valuation is not an available balance. The server must atomically reserve funds and return a funding plan. Concurrent checkout, payout and trade attempts must not overspend the wallet.

### P1 — general wallet withdrawal is not available

The backend README explicitly states that 1ZE burn and legacy 1ZE withdrawal endpoints are disabled in closed-loop mode. Seller sale proceeds can use payout requests, but a user cannot generally redeem arbitrary wallet 1ZE to fiat. UI and product requirements must make that distinction explicit.

### P1 — provider capability truth is incomplete

The database lists Stripe, Razorpay, Mollie, Flutterwave and Tap, while payout corridors also mention Wise. Production readiness requires only one complete provider credential set. That does not prove every enabled country, currency, payment method, refund, dispute and payout combination is operational. Each capability must be runtime-derived from a versioned provider registry with `configured`, `contracted`, `tested`, `live_enabled` and `degraded` states.

### P1 — webhook adapters need specification revalidation

The system has a valuable webhook inbox and duplicate-event key. However:

- Mollie can continue when no webhook secret is present and provider lookup fails;
- Flutterwave signature comparison is not timing-safe;
- Wise verification must be rebuilt against the current public-key/key-id model rather than API-key equivalence;
- refund/dispute association and amount normalisation need provider-specific tests;
- out-of-order terminal and reversal events need explicit transition policy.

### P1 — external reconciliation remains unproven

There are reconciliation tables, an admin report and payout pausing. Flagship reconciliation must compare the internal journal against provider balance transactions, charges, refunds, transfers, payouts and bank/safeguarding account statements, with break ownership, ageing and repair workflows.

## Positive foundations worth preserving

- PostgreSQL transactions and `FOR UPDATE` are used in important payment and payout paths.
- payment webhook events have a provider event uniqueness constraint.
- payment intents and payout requests support idempotency concepts.
- country capability and compliance abstractions already exist.
- Stripe automatic payment methods and Connect account onboarding scaffolding exist.
- payout pause, velocity limits, manual review metadata and reconciliation concepts exist.
- queue workers and operational metrics are present.

## Flagship target architecture

1. **Provider boundary:** PaymentSheet/hosted SDK -> provider token/payment method -> PaymentIntent/SetupIntent.
2. **Payment orchestration:** provider-neutral intent and attempt state machines with strict idempotency.
3. **Financial core:** balanced immutable journal and materialised balance projections.
4. **Holds:** authorisation, wallet reservation, seller escrow/payable, payout pending and dispute reserve.
5. **Settlement:** order/trade events post journals; delivery or policy events release funds.
6. **Payout:** seller payable reserved, transferred/payout initiated, bank outcome confirmed by webhook.
7. **Reconciliation:** internal journal = provider sub-ledger = bank/safeguarding resources.
8. **Risk:** KYC/KYB, sanctions/PEP/vendor results, transaction monitoring, limits and case management.
9. **Operations:** replayable inbox/outbox, dashboards, break queues, immutable audit and incident runbooks.

## Release statement

Until all P0 gates in `20_ACCEPTANCE_MATRIX.md` pass, disable live card saving, wallet top-up, split tender and customer-facing withdrawal claims outside controlled test environments.
