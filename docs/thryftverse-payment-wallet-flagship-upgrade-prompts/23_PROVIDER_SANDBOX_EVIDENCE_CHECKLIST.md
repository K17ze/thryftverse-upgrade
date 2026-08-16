# Provider Sandbox and Device Evidence Checklist

Complete this checklist per provider account, country, currency and application build. A documentation link or configured secret is not evidence of execution.

## Environment identity

- provider;
- provider account/legal entity;
- test or live mode;
- API version;
- mobile build SHA/version;
- backend SHA;
- country and currency;
- enabled payment method configuration id;
- webhook endpoint id and signing-key version;
- connected-account id/type where relevant;
- tester, timestamp and evidence location.

## Card and wallet methods

For each enabled method, capture PaymentIntent, method type/brand, client outcome, webhook event ids, internal journal id and reconciliation result.

- Visa success;
- Visa decline;
- Mastercard success;
- Mastercard decline;
- Amex success;
- Amex decline;
- 3DS/SCA success;
- 3DS/SCA failure;
- 3DS/SCA abandonment;
- Apple Pay on supported iOS device/region;
- Google Pay on supported Android device/region;
- Link where enabled;
- saved method via SetupIntent;
- saved method removal/default change;
- expired/invalid payment method;
- delayed payment method only where explicitly enabled.

## Payment lifecycle

- create with idempotency key;
- same key/same request replay;
- same key/different request conflict;
- duplicate button tap;
- client disconnect after provider creation;
- provider timeout before response;
- webhook before API response;
- duplicate webhook;
- out-of-order webhook;
- payment success and exact order funding;
- payment failed/cancelled and reservation release;
- provider fee/balance transaction ingestion.

## Refunds and disputes

- full refund;
- partial refund;
- multiple partial refunds to exact captured total;
- refund failure/pending state;
- duplicate refund webhook;
- dispute opened;
- dispute evidence deadline/evidence upload;
- dispute won;
- dispute lost;
- chargeback fee;
- transfer reversal success/failure;
- seller negative-balance recovery.

## Stripe Connect and seller funds

- connected account onboarding;
- requirements due;
- charges/payouts capability enabled;
- account disabled/restricted webhook;
- seller release after delivery policy;
- transfer created and linked to source charge/transfer group;
- transfer failure and retry;
- connected balance availability;
- external payout created;
- external payout paid;
- external payout failed;
- external bank account disabled;
- payout return/reversal where supported;
- platform and connected webhook streams both observed.

## Wallet and split tender

- top-up quote and exact amount;
- top-up provider success -> pending/available policy;
- top-up failure/refund/chargeback;
- wallet-only purchase;
- wallet + card split tender;
- insufficient balance;
- 100 concurrent reservations;
- expired hold release;
- provider success with wallet capture failure repair;
- reconciliation halt prevents unsafe movement;
- 1ZE redemption remains unavailable unless separately approved and proven.

## Reconciliation proof

For every scenario attach:

- provider object and balance transaction ids;
- canonical internal journal and postings;
- expected and actual provider settlement amount;
- fee, FX, refund, transfer and payout components;
- reconciliation run id;
- zero unexplained principal difference;
- break/resolution evidence for intentional failure cases.

## Sign-off

- engineering owner;
- payments/finance owner;
- security owner;
- risk/compliance owner;
- legal/regulatory review where applicable;
- exact feature/corridor approved;
- exact feature/corridor still disabled;
- rollback and kill-switch confirmation.
