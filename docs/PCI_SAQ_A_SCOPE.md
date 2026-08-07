# PCI DSS SAQ-A Scope Documentation

## Overview

ThryftVerse is classified as a **SAQ-A** (Self-Assessment Questionnaire A)
merchant under the PCI DSS (Payment Card Industry Data Security Standard).

SAQ-A applies to merchants who **fully outsource all cardholder data
functions** to third-party PCI DSS-compliant service providers and who
**do not store, process, or transmit any cardholder data** on their own
systems.

## Scope

### What ThryftVerse does NOT do

- Does not collect, store, or transmit cardholder data (PAN, CVV, expiry)
- Does not host payment pages on its own infrastructure
- Does not handle card data in any backend service
- Does not store card data in any database

### What ThryftVerse does

- Uses **Stripe** as the primary payment processor (PCI DSS Level 1 certified)
- Uses **Razorpay**, **Mollie**, **Flutterwave**, **Tap** for regional payments
- Uses **Stripe Mobile Payment Element** (MPE) for native card entry
- Uses **Apple Pay** and **Google Pay** for wallet payments
- Uses **Stripe Connect** for seller payouts
- Uses **PayPal** for alternative payments

### Payment flow

1. The mobile app uses Stripe's Mobile Payment Element (MPE) to collect
   card data directly to Stripe's servers. Card data never touches
   ThryftVerse's infrastructure.

2. The backend creates a Stripe Payment Intent and returns the client
   secret to the app. The app confirms the payment via Stripe's SDK.

3. Stripe sends a webhook to the backend to confirm payment status.
   The webhook contains only the payment intent ID and status — no
   cardholder data.

4. For seller payouts, Stripe Connect transfers are initiated from the
   backend using the Stripe API. No card data is involved.

### Stored payment method data

- The backend stores **payment method references** (Stripe payment method IDs,
  brand, last4, expiry) for display purposes. These are **not** cardholder
   data under PCI DSS — they are tokens issued by Stripe.

- The backend does **not** store PAN, CVV, or any sensitive cardholder data.

## SAQ-A Eligibility Requirements

To maintain SAQ-A eligibility, the following must be true:

1. **No cardholder data on ThryftVerse systems.** All card data is
   collected, processed, and stored by Stripe and other PCI-compliant
   payment processors.

2. **No payment pages hosted by ThryftVerse.** The mobile app uses
   Stripe's native SDK (MPE) for card entry, which is hosted by Stripe.

3. **No direct POST to payment processor from ThryftVerse-controlled
   pages.** The Stripe SDK handles the POST directly to Stripe's API.

4. **No cardholder data in webhooks.** Webhook payloads contain only
   payment intent IDs, status, and metadata — no cardholder data.

5. **No cardholder data in logs.** The backend does not log cardholder
   data. Stripe payment method references (pm_xxx) are logged, but these
   are tokens, not cardholder data.

## Third-Party PCI Compliance

| Provider | PCI DSS Level | Scope |
|----------|---------------|-------|
| Stripe | Level 1 | Card processing, tokenization, 3DS |
| Razorpay | Level 1 | Card processing (India) |
| Mollie | Level 1 | Card processing (EU) |
| Flutterwave | Level 1 | Card processing (Africa) |
| Tap | Level 1 | Card processing (Gulf) |
| PayPal | Level 1 | PayPal wallet |

## Annual Validation

- Complete the SAQ-A self-assessment questionnaire annually
- Submit Attestation of Compliance (AOC) to the acquiring bank
- Ensure all third-party providers maintain their PCI compliance
- Review this document annually and after any payment architecture change

## Change Control

Any change to the payment architecture that introduces cardholder data
handling on ThryftVerse systems will change the SAQ level. Such changes
must be reviewed by the security team before implementation.

## References

- PCI DSS v4.0
- SAQ-A v4.0
- Stripe PCI documentation: https://stripe.com/docs/security
