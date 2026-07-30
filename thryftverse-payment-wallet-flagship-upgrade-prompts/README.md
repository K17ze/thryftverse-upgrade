# Thryftverse Payment, Wallet and Settlement Flagship Upgrade Prompt Pack

**Repository audited:** `K17ze/thryftverse-upgrade`  
**Static audit reference:** default branch `main` at `ec41383dacafe88ed443dd27fefe772c85d2a587`  
**Research date:** 29 July 2026  
**Primary locale and accounting presentation:** `en-GB`, GBP shown as pounds sterling, provider amounts represented in integer minor units.

## Purpose

This folder is an implementation programme, not a claim that payments already work in production. It converts the current code audit and current official payment-platform guidance into ordered, evidence-driven prompts for upgrading:

- tokenised card and wallet payment collection;
- payment provider adapters and country capability policy;
- a canonical double-entry financial ledger;
- wallet top-ups, reservations, split tender and seller proceeds;
- Stripe Connect seller onboarding, transfers and bank payouts;
- refunds, disputes, chargebacks and negative balances;
- reconciliation, safeguarding, treasury and operations;
- KYC, AML, fraud, limits and compliance controls;
- commerce, auction and Co-Own settlement;
- testing, chaos, migration and release evidence.

## Current verdict

The codebase has meaningful foundations: provider abstractions, signed webhook handling, payment-intent persistence, payout requests, Stripe Connect account records, reconciliation jobs, compliance scaffolding and ledger-like tables. It is **not yet equivalent to a flagship marketplace or regulated wallet**, and it must not be treated as production-ready.

The highest-risk blockers are:

1. The mobile app directly captures card number, expiry and CVV in React Native state and stores only display metadata rather than a provider token/payment-method reference.
2. The backend and frontend contain multiple, contradictory money models (`ledger_entries`, `wallet_ledger`, mutable wallet balances and legacy 1ZE operations).
3. There is no database-enforced balanced journal invariant.
4. currency and unit semantics are unsafe: values named `amountGbp` can be sent to providers using a different `amountCurrency`, and provider webhook amounts are not normalised consistently between minor and major units.
5. A Stripe Connect **transfer** is currently treated as a completed payout, even though the external bank payout has its own asynchronous lifecycle.
6. Partial refund and dispute accounting is not sufficiently granular; the webhook path can reverse the full order ledger for a partial refund.
7. 1ZE redemption/withdrawal routes are deliberately disabled in closed-loop mode, so the app cannot truthfully promise general wallet cash-out.
8. Checkout derives spendability from a displayed fiat valuation instead of a server-side reservation against an authoritative available balance.
9. Some regional provider adapters and webhook verification paths need fail-closed revalidation against current provider specifications.
10. Live execution has not been proven because this audit did not have production credentials, provider dashboards, bank accounts, webhook delivery logs, staging database evidence or real settlement files.

## Execution order

Run the prompts in this sequence:

- **Emergency closure:** `02`, `03`, `04`
- **Canonical financial core:** `05`, `06`, `07`
- **Marketplace money movement:** `08`, `09`, `10`, `11`
- **Risk, regional and market settlement:** `12`, `13`, `14`, `15`
- **Operations and proof:** `16`, `17`, `18`, `19`, `20`, `21`

Do not parallelise prompts that alter the financial schema unless the master prompt explicitly permits it. Each phase must leave the repository buildable and provide rollback-safe migrations.

## Non-negotiable release rule

No screen, README, API response or marketing copy may claim that funds are “secure”, “safeguarded”, “escrowed”, “withdrawable”, “instant”, “verified” or “production-ready” unless the exact technical and legal preconditions are proven by the acceptance matrix in `20_ACCEPTANCE_MATRIX.md`.

## Files

- `00_RESEARCH_AUDIT_AND_VERDICT.md` — grounded current-state study.
- `01_MASTER_PROGRAM_ORCHESTRATOR_PROMPT.md` — controls the full programme.
- `02_P0_TOKENISED_CARD_CAPTURE_PROMPT.md` — removes the raw PAN/CVV and fake saved-card flow.
- `03_P0_MONEY_UNITS_AND_PROVIDER_AMOUNT_SAFETY_PROMPT.md` — fixes currency/minor-unit defects.
- `04_P0_WEBHOOK_AND_SIMULATION_CONTAINMENT_PROMPT.md` — closes fail-open and simulation paths.
- `05_CANONICAL_DOUBLE_ENTRY_LEDGER_PROMPT.md` — builds the financial source of truth.
- `06_WALLET_BALANCES_HOLDS_AND_RESERVATIONS_PROMPT.md` — creates spendable/reserved/pending semantics.
- `07_PAYMENT_PROVIDER_CAPABILITY_REGISTRY_PROMPT.md` — proves what each region/provider really supports.
- `08_MARKETPLACE_CHECKOUT_AND_SPLIT_TENDER_PROMPT.md` — atomic order funding.
- `09_STRIPE_CONNECT_FUNDS_FLOW_PROMPT.md` — seller onboarding, transfer and payout lifecycle.
- `10_WITHDRAWALS_AND_PAYOUTS_PROMPT.md` — bank payout state machine and reversals.
- `11_REFUNDS_DISPUTES_AND_NEGATIVE_BALANCES_PROMPT.md` — complete post-payment loss handling.
- `12_RECONCILIATION_SAFEGUARDING_AND_TREASURY_PROMPT.md` — internal/external reconciliation.
- `13_KYC_AML_FRAUD_AND_LIMITS_PROMPT.md` — operational financial-crime controls.
- `14_MULTI_CURRENCY_FX_AND_LOCAL_METHODS_PROMPT.md` — safe global expansion.
- `15_COMMERCE_AUCTION_COOWN_SETTLEMENT_PROMPT.md` — unified market settlement.
- `16_FINANCIAL_SECURITY_AND_DATA_HANDLING_PROMPT.md` — secrets, PCI boundary and access controls.
- `17_OBSERVABILITY_ADMIN_AND_INCIDENTS_PROMPT.md` — operations and incident readiness.
- `18_TESTING_CHAOS_AND_PROVIDER_REPLAY_PROMPT.md` — proof under failure and concurrency.
- `19_MIGRATION_AND_ROLLOUT_PROMPT.md` — shadow ledger, backfill and rollback.
- `20_ACCEPTANCE_MATRIX.md` — objective flagship gates.
- `21_FINAL_AUDIT_AND_PR_REVIEW_PROMPT.md` — final independent review.
- `22_IMPLEMENTATION_ROADMAP.md` — dependency-ordered delivery waves.
- `23_PROVIDER_SANDBOX_EVIDENCE_CHECKLIST.md` — method, refund, Connect, payout and reconciliation proof.
- `SOURCES.md` — official research sources and repository evidence.
