# P0 Prompt — Tokenised Card Capture and Real Saved Payment Methods

You are fixing the most urgent payment-security and integrity defect in Thryftverse.

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

## Confirmed defect

The current `AddCardSheet.tsx` stores full card number, expiry and CVV in React state, hard-codes the resulting brand as Visa and persists only label/details metadata. The backend `user_payment_methods` endpoint has no provider customer/payment-method reference. This is not a real saved-card flow.

## Objective

Replace all raw card entry and display-only payment-method persistence with provider-hosted/tokenised payment collection. For the first production corridor, use the official Stripe React Native SDK PaymentSheet/Payment Element, Stripe Customer, CustomerSession and SetupIntent or payment-time save flow.

## Required work

1. Remove every `TextInput` and state variable that receives PAN, CVV or expiry from Thryftverse-owned components.
2. Add the official supported React Native Stripe package and initialise it with publishable key, merchant identifier and return URL.
3. Add authenticated backend endpoints to:
   - get/create the user’s Stripe Customer;
   - create a SetupIntent and CustomerSession for saved methods;
   - create PaymentSheet configuration for an order PaymentIntent;
   - list normalised provider payment methods from Stripe;
   - detach a payment method;
   - set a default payment method through provider and local projection.
4. Replace `user_payment_methods` display records with a provider-bound projection containing provider, provider customer ref, provider payment method ref, type, brand, last4, expiry, billing-country fingerprint/hash as permitted, status and redisplay consent.
5. Never accept brand, last4, expiry or “verified” state from the client.
6. Add Apple Pay and Google Pay through Stripe’s SDK only after environment and merchant-domain/configuration checks pass. Link and other methods must come from provider capabilities, not hard-coded UI.
7. Ensure Visa, Mastercard and Amex are displayed from actual provider data. Never hard-code Visa.
8. Replace security copy with precise statements; do not say encrypted/saved unless provider tokenisation succeeded.
9. Add deep-link return handling for SCA/redirect methods.
10. Remove stale local-store payment methods and migrate users to “add payment method again”.

## API contracts

Create versioned endpoints such as:

- `POST /v2/payments/customers/session`
- `POST /v2/payments/setup-intents`
- `GET /v2/payments/methods`
- `DELETE /v2/payments/methods/:providerMethodId`
- `PATCH /v2/payments/methods/:providerMethodId/default`
- `POST /v2/payments/orders/:orderId/sheet`

All endpoints derive `userId` from authentication, not body or path for normal customer calls.

## Tests

- source scan fails if PAN/CVV-style fields are introduced outside approved SDK wrappers;
- no request body contains raw card fields;
- SetupIntent success, cancellation, SCA failure and network retry;
- saved method belongs to authenticated provider customer;
- detach/default operations are idempotent;
- Visa, Mastercard and Amex test methods render from provider data;
- Apple Pay/Google Pay only appear when provider and device capability allow;
- production build contains no legacy add-card form.

## Acceptance gate

A proxy capture of a full add/save/pay flow must show that Thryftverse servers receive only Stripe identifiers/client secrets and non-sensitive display metadata—never PAN or CVV.
