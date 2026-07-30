# Research Sources and Audit Evidence

## Repository evidence — `K17ze/thryftverse-upgrade` at `ec41383dacafe88ed443dd27fefe772c85d2a587`

Review these paths at the audited SHA and then re-check them on the latest branch before implementation:

- `frontend/src/components/checkout/AddCardSheet.tsx`
- `frontend/src/screens/CheckoutScreen.tsx`
- `frontend/src/services/commerceApi.ts`
- `frontend/src/services/walletApi.ts`
- `backend/api/src/index.ts`
- `backend/api/src/lib/paymentProviders.ts`
- `backend/api/src/lib/stripePayouts.ts`
- `backend/api/src/lib/productionReadiness.ts`
- `backend/api/src/lib/reconciliation.ts`
- `backend/api/src/lib/payoutAccounting.ts`
- `backend/api/src/lib/payoutTransitionPolicy.ts`
- `backend/api/src/db/migrations/005_payments_settlement_foundation.sql`
- `backend/api/src/db/migrations/007_money_layer_hardening.sql`
- `backend/api/src/db/migrations/015_oneze_wallet_architecture.sql`
- `backend/api/src/db/migrations/021_oneze_closed_loop_hardening.sql`
- `backend/api/src/db/migrations/027_payment_intents_schema_backfill.sql`
- `backend/api/src/db/migrations/028_stripe_connect_accounts.sql`
- `backend/README.md`

## Official payment and security research

- Stripe React Native SDK: <https://docs.stripe.com/sdks/react-native?locale=en-GB>
- Stripe in-app payments and SetupIntent/PaymentSheet: <https://docs.stripe.com/payments/mobile/accept-payment?locale=en-GB&platform=react-native&type=setup>
- Stripe PaymentSheet: <https://docs.stripe.com/payments/mobile/payment-sheet>
- Stripe card-brand filtering: <https://docs.stripe.com/payments/mobile/filter-card-brands?locale=en-GB&platform=react-native>
- Stripe integration security and PCI guidance: <https://docs.stripe.com/security/guide?locale=en-GB>
- Stripe idempotent requests: <https://docs.stripe.com/api/idempotent_requests>
- Stripe webhook handling: <https://docs.stripe.com/webhooks>
- Stripe Connect webhooks: <https://docs.stripe.com/connect/webhooks?locale=en-GB>
- Stripe separate charges and transfers: <https://docs.stripe.com/connect/separate-charges-and-transfers?locale=en-GB>
- Stripe payouts to connected accounts: <https://docs.stripe.com/connect/payouts-connected-accounts?locale=en-GB>
- PCI SSC document library, PCI DSS v4.0.1: <https://www.pcisecuritystandards.org/document_library/>
- PCI SSC FAQ on consumer-device payment software: <https://www.pcisecuritystandards.org/faqs/1283/>
- PCI SSC FAQ prohibiting stored card verification codes: <https://www.pcisecuritystandards.org/faqs/1574/>

## UK regulatory research

Applicability depends on Thryftverse’s final legal and funds-flow model. Obtain qualified counsel.

- FCA safeguarding requirements for payment/e-money firms, updated 7 May 2026: <https://www.fca.org.uk/firms/emi-payment-institutions-safeguarding-requirements>
- FCA CASS 15 relevant-funds rules: <https://handbook.fca.org.uk/handbook/cass15>
- FCA CASS 15.8 records and reconciliations: <https://handbook.fca.org.uk/handbook/cass15/cass15s8>
- FCA PS25/12 safeguarding regime: <https://www.fca.org.uk/publications/policy-statements/ps25-12-changes-safeguarding-regime-payments-and-e-money-firms>

## Research interpretation rules

- Provider documentation states technical capability, not approval for Thryftverse’s account, business model or country.
- A provider dashboard toggle is not production proof.
- A test-mode success does not prove live settlement or regulatory compliance.
- Legal terms such as safeguarding, e-money and escrow must be validated against the actual contractual and legal structure.
