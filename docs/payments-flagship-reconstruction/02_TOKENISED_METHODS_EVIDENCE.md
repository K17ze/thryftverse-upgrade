# Phase 02: tokenised methods implementation evidence

## Implemented

- Expo-compatible `@stripe/stripe-react-native` dependency and native config
  plugin.
- Stripe Customer binding keyed by authenticated Thryftverse user.
- CustomerSession and SetupIntent creation with idempotency.
- Provider-owned add-card PaymentSheet.
- Provider-synchronised card projection containing Stripe references and
  display-safe metadata.
- Provider detach and default-method operations.
- Stripe-customer-bound order PaymentIntents and native checkout PaymentSheet.
- explicit SCA/deep-link return URL.
- default-deny Apple Pay and Google Pay configuration.
- quarantine of legacy display-only payment methods.
- removal of device persistence for payment-method selection.
- source boundary test for raw card-number and security-code identifiers.

## Migration

Forward migration: `078_tokenised_payment_methods.sql`.

The migration creates `stripe_payment_customers`, extends
`user_payment_methods` with provider-bound fields, marks existing rows
`requires_recollection`, and adds uniqueness plus active-row constraints.

Rollback is operational, not destructive:

1. disable tokenised payment creation through the payment kill switch;
2. roll the application back while leaving migration 078 applied;
3. do not re-enable legacy payment-method writes;
4. retain projection rows and Customer bindings for a corrected forward
   release.

Dropping the new schema is not an approved rollback because it would destroy
provider linkage and audit evidence.

## Proof classification

- Static correctness: implemented; build and focused tests recorded in the
  phase handoff.
- Provider sandbox: pending credentials, signed events, proxy capture, and
  device execution.
- Live production: not proven and must not be claimed.

## Intentionally disabled

- legacy card and bank-account display-record creation;
- legacy update/delete routes;
- device-persisted saved payment methods;
- Apple Pay without an Apple merchant identifier;
- Google Pay unless server and native-build flags are both enabled.
