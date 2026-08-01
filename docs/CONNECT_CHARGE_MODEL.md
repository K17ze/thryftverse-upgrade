# Stripe Connect Charge Model Decision

## Decision: Platform Account (Destination Charges via Platform)

**Status:** Formalized
**Date:** 2025-01-08
**Decision Owner:** ThryftVerse Engineering

## Overview

ThryftVerse uses the **Platform Account** charge model (also known as
"destination charges via platform") rather than the **Direct Charges**
or **Separate Charges and Transfers** models.

This is the same model used by Vinted and Depop for their marketplace
payments.

## Why Platform Account

### Rationale

1. **Full control over the buyer experience.** The platform owns the
   payment intent, controls refunds, and handles disputes. This is
   critical for a marketplace where the platform provides buyer
   protection.

2. **Simplified seller onboarding.** Sellers do not need to create
   their own Stripe accounts. They onboard via Stripe Connect Express,
   which is embedded in the ThryftVerse onboarding flow.

3. **Centralized fraud and risk management.** The platform can apply
   Stripe Radar fraud scoring, 3DS/SCA, and velocity checks at the
   intent level, before the seller is paid.

4. **Escrow and buyer protection.** Funds are held on the platform
   account until the buyer-protection hold window expires and no
   disputes are open. This enables the buyer-protection hold window
   (P0.3) and rolling reserve (P1.2).

5. **Simplified reconciliation.** All funds flow through the platform
   account, making per-intent reconciliation (P1.1) straightforward.

### Trade-offs

| Factor | Platform Account | Direct Charges | Separate Charges |
|--------|-----------------|----------------|------------------|
| Buyer experience | ✅ Platform-controlled | ❌ Seller-controlled | ✅ Platform-controlled |
| Seller onboarding | ✅ Express (simple) | ❌ Standard (complex) | ✅ Express (simple) |
| Dispute handling | ✅ Platform handles | ❌ Seller handles | ✅ Platform handles |
| Refunds | ✅ Platform initiates | ❌ Seller initiates | ✅ Platform initiates |
| Escrow / hold | ✅ Platform holds | ❌ Seller holds | ✅ Platform holds |
| Fee collection | ✅ Via metadata | ❌ Via application_fee | ✅ Via application_fee |
| KYC | ✅ Express | ❌ Standard | ✅ Express |
| Payouts | ✅ Platform transfers | ❌ Stripe direct | ✅ Platform transfers |

## Implementation

### Charge flow

1. Buyer pays via Stripe Payment Intent on the **platform account**.
2. The Payment Intent includes metadata linking it to the order and seller.
3. Funds are held on the platform account (escrow).
4. When the buyer-protection hold expires and no disputes are open:
   - The escrow release sweep transfers funds to the seller's
     Stripe Connect Express account via `stripe.transfers.create`.
   - A rolling reserve may be applied for new sellers (P1.2).
5. The seller withdraws from their Connect Express account to their
   bank account via Stripe payouts.

### Fee model

- The platform fee (buyer protection fee) is tracked in the ledger and
  in the Payment Intent metadata. It is **not** collected via Stripe's
  `application_fee_amount` because the platform owns the charge.
- The platform fee is retained on the platform account when the seller
  is paid via `stripe.transfers.create` (only the seller's net is
  transferred).

### Refund flow

- Refunds are initiated by the platform via `stripe.refunds.create`
  on the original Payment Intent.
- For provider-backed refunds (P0.1), the refund is dispatched to the
  appropriate provider (Stripe, Razorpay, Mollie, Flutterwave, Tap).

### Dispute flow

- Disputes are received via webhook and tracked in `payment_disputes`.
- The platform handles dispute evidence submission (P0.2).
- Lost disputes result in a ledger reversal from the seller's payable.

## Future Considerations

- If ThryftVerse expands to support sellers who want to use their own
  Stripe accounts (e.g., large brands), the **Separate Charges and
  Transfers** model can be added as an alternative.
- If ThryftVerse expands to support direct seller-initiated refunds,
  the **Direct Charges** model can be added for eligible sellers.

## References

- Stripe Connect documentation: https://stripe.com/docs/connect
- Charge models: https://stripe.com/docs/connect/charges
